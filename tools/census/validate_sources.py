# -*- coding: utf-8 -*-
"""一次性：用正式爬蟲的 fetch＋adapter 實跑候選學校的來源，只回報結果、不寫任何資料。

- 每個來源 1 個請求、間隔 3 秒；每校最多 6 個請求。
- discover：抓首頁（跟一次 meta refresh），存檔並列出 CCMS／iSchool 的候選列表連結。
輸出 samples/validate/report.json 與各校首頁 HTML。
"""
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scraper"))
import requests  # noqa: E402
import scrape  # noqa: E402
import adapters  # noqa: E402

PLAN = json.loads((ROOT / "tools/census/yunlin_candidates.json").read_text(encoding="utf-8"))
OUT = ROOT / "samples" / "validate"
DELAY = 3.0
MAX_PER_SCHOOL = 6


def links(html, base):
    out = {"ccms_lists": [], "ischool_uids": [], "feeds": []}
    for m in re.finditer(r'<a[^>]+href="([^"]*News2?\.aspx\?n=\d+&(?:amp;)?sms=\d+)"[^>]*>(.*?)</a>', html, re.S | re.I):
        text = re.sub(r"<[^>]+>|\s+", " ", m.group(2)).strip()[:20]
        out["ccms_lists"].append([urljoin(base, m.group(1).replace("&amp;", "&")), text])
    out["ischool_uids"] = list(dict.fromkeys(re.findall(r"WID_0_2_[0-9a-f]{40}", html)))
    out["feeds"] = list(dict.fromkeys(re.findall(r'href="([^"]+/feed/?)"', html)))[:5]
    out["ccms_lists"] = list({u: [u, t] for u, t in out["ccms_lists"]}.values())[:40]
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": scrape.UA, "Accept-Language": "zh-TW,zh;q=0.9"})
    report = {}
    for school in PLAN["schools"]:
        sid = school["id"]
        row = {"sources": [], "discover": None}
        budget = MAX_PER_SCHOOL
        if school.get("discover"):
            time.sleep(DELAY)
            budget -= 1
            try:
                html = scrape.fetch(session, school["discover"], school)
                m = re.search(r"http-equiv=[\"']?refresh[^>]*url=([^\"'>]+)", html, re.I)
                final = school["discover"]
                if m and budget > 0:
                    final = urljoin(final, m.group(1).strip())
                    time.sleep(DELAY)
                    budget -= 1
                    html = scrape.fetch(session, final, school)
                (OUT / f"{sid}_home.html").write_text(html, encoding="utf-8")
                info = links(html, final)
                info["final_url"] = final
                info["generator"] = (re.findall(r'name="generator"\s+content="([^"]+)"', html, re.I) or [""])[0]
                info["markers"] = [k for k in ("/ischool/", "wp-content/", "News_Content.aspx", "/p/406-",
                                               "modules/tadnews", "latestevent", "__VIEWSTATE") if k in html]
                row["discover"] = info
            except Exception as exc:
                row["discover"] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
        adapter = adapters.get_adapter(school.get("adapter", "new-classic-cms"))
        for url in school.get("sources", [])[:max(0, budget)]:
            time.sleep(DELAY)
            entry = {"url": url}
            try:
                payload = adapter.fetch_page(session, url, school, scrape.fetch)
                items = adapter.extract(payload, school, url)
                entry.update({"count": len(items), "dated": sum(1 for i in items if i["date"]),
                              "newest": max((i["date"] for i in items if i["date"]), default=""),
                              "samples": [[i["id"], i["date"], i["title"][:30]] for i in items[:3]]})
                if adapter.name == "ischool-json":
                    head = json.loads(payload)[0] if payload.strip().startswith("[") else {}
                    entry["totalRows"] = head.get("totalRows") or head.get("totalPages")
            except Exception as exc:
                entry["error"] = f"{type(exc).__name__}: {str(exc)[:160]}"
            row["sources"].append(entry)
            print(sid, entry.get("count"), entry.get("dated"), entry.get("error", ""), url[-60:], flush=True)
        report[sid] = row
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
