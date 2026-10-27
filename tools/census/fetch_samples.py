# -*- coding: utf-8 -*-
"""一次性樣本抓取（只在 claude/site-samples 分支執行，不合併）。

- 依 sample_plan.json 抓取各校少量頁面，存到 samples/<id>/，供離線撰寫 adapter。
- TLS 憑證鏈：對 tls_chain 主機記錄 openssl s_client 結果，並從憑證的 AIA 欄位
  向「憑證機構」下載缺少的中繼憑證；驗證一律保持開啟（不關閉 TLS 檢查）。
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import certifi
import requests

ROOT = Path(__file__).resolve().parents[2]
PLAN = json.loads((ROOT / "tools/census/sample_plan.json").read_text(encoding="utf-8"))
OUT = ROOT / "samples"
DELAY = 3.0
TIMEOUT = 25
MAX_PER_SITE = 4
UA = ("Mozilla/5.0 (compatible; cy-school-news-census/1.0; "
      "+https://github.com/tsaibohau/cy-school-news ; one-time low-rate sample)")


def run(cmd, stdin=b""):
    p = subprocess.run(cmd, input=stdin, capture_output=True, timeout=40)
    return p.returncode, p.stdout, p.stderr


def tls_chain(host, session):
    """記錄伺服器送出的憑證鏈，並從 AIA 下載中繼憑證（來源是 CA，不是學校）。"""
    d = OUT / "tls" / host
    d.mkdir(parents=True, exist_ok=True)
    rc, out, err = run(["openssl", "s_client", "-connect", f"{host}:443", "-servername", host,
                        "-showcerts"], b"")
    (d / "s_client.txt").write_bytes(out + b"\n--- stderr ---\n" + err)
    pems = re.findall(rb"-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----", out, re.S)
    info = {"host": host, "server_sent_certs": len(pems), "aia": [], "intermediates": []}
    m = re.search(rb"Verify return code: (\d+) \(([^)]*)\)", out)
    info["verify_return"] = m.group(0).decode() if m else ""
    if not pems:
        return info, []
    (d / "leaf.pem").write_bytes(pems[0] + b"\n")
    rc, txt, _ = run(["openssl", "x509", "-in", str(d / "leaf.pem"), "-noout", "-subject", "-issuer",
                      "-dates", "-ext", "authorityInfoAccess,subjectAltName"])
    (d / "leaf.txt").write_bytes(txt)
    fetched = []
    # 依序沿 AIA 往上抓，最多 3 層
    current = d / "leaf.pem"
    for level in range(3):
        rc, txt, _ = run(["openssl", "x509", "-in", str(current), "-noout", "-ext", "authorityInfoAccess"])
        urls = re.findall(rb"CA Issuers - URI:(\S+)", txt)
        if not urls:
            break
        url = urls[0].decode()
        info["aia"].append(url)
        time.sleep(1)
        try:
            r = session.get(url, timeout=TIMEOUT)
            r.raise_for_status()
        except Exception as exc:
            info["aia_error"] = f"{type(exc).__name__}"
            break
        raw = d / f"issuer{level}.bin"
        raw.write_bytes(r.content)
        pem = d / f"issuer{level}.pem"
        fmt = "PEM" if b"BEGIN CERTIFICATE" in r.content else "DER"
        rc, _, _ = run(["openssl", "x509", "-inform", fmt, "-in", str(raw), "-out", str(pem)])
        if rc != 0:
            # 可能是 PKCS#7
            rc, _, _ = run(["openssl", "pkcs7", "-inform", fmt, "-in", str(raw), "-print_certs",
                            "-out", str(pem)])
        if rc != 0:
            info["aia_error"] = "unparseable_issuer"
            break
        rc, subj, _ = run(["openssl", "x509", "-in", str(pem), "-noout", "-subject", "-issuer", "-dates"])
        info["intermediates"].append(subj.decode(errors="replace").strip())
        fetched.append(pem)
        if b"subject=" in subj and subj.split(b"subject=")[1].split(b"\n")[0].strip() == \
                subj.split(b"issuer=")[1].split(b"\n")[0].strip():
            break  # 自簽根憑證
        current = pem
    return info, fetched


def build_bundle(intermediates):
    bundle = OUT / "tls" / "certifi-plus-intermediates.pem"
    parts = [Path(certifi.where()).read_bytes()]
    for p in intermediates:
        parts.append(p.read_bytes())
    bundle.write_bytes(b"\n".join(parts))
    return str(bundle)


def fetch_site(session, site, bundle):
    d = OUT / site["id"]
    d.mkdir(parents=True, exist_ok=True)
    rows = []
    for i, req in enumerate(site["requests"][:MAX_PER_SITE]):
        time.sleep(DELAY)
        url = req["url"]
        row = {"n": i, "url": url}
        kwargs = {"timeout": TIMEOUT}
        method = "GET"
        if req.get("ischool_uid"):
            method = "POST"
            kwargs["data"] = {"field": "time", "order": "DESC", "pageNum": "0", "maxRows": "20",
                              "keyword": "", "uid": req["ischool_uid"], "tf": "2",
                              "auth_type": "user", "use_cache": "1"}
        resp = None
        for verify_mode in ("certifi", "intermediate"):
            try:
                if verify_mode == "intermediate":
                    if not bundle:
                        break
                    kwargs["verify"] = bundle
                    time.sleep(DELAY)
                resp = session.request(method, url, **kwargs)
                row["verify"] = verify_mode
                break
            except requests.exceptions.SSLError as exc:
                row.setdefault("errors", []).append(f"{verify_mode}:SSLError:{str(exc)[:160]}")
            except Exception as exc:
                row.setdefault("errors", []).append(f"{verify_mode}:{type(exc).__name__}")
                break
        if resp is not None:
            ctype = resp.headers.get("Content-Type", "")
            ext = "json" if "json" in ctype else "xml" if ("xml" in ctype or "rss" in ctype) else "html"
            name = f"{i}.{ext}"
            (d / name).write_bytes(resp.content)
            row.update({"status": resp.status_code, "final_url": resp.url, "content_type": ctype,
                        "bytes": len(resp.content), "file": f"{site['id']}/{name}"})
        rows.append(row)
        print(site["id"], i, row.get("status"), row.get("verify"), row.get("errors", ""), flush=True)
    return rows


def main():
    OUT.mkdir(exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = UA
    tls_report, inter = [], []
    for host in PLAN["tls_chain"]:
        info, pems = tls_chain(host, session)
        tls_report.append(info)
        inter += pems
        print("tls", json.dumps(info, ensure_ascii=False), flush=True)
    bundle = build_bundle(inter) if inter else ""
    index = {"tls": tls_report, "sites": {}}
    for site in PLAN["sites"]:
        index["sites"][site["id"]] = fetch_site(session, site, bundle)
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
