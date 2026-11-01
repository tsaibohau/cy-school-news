# -*- coding: utf-8 -*-
"""一次性：台南市、高雄市高級中等學校的校網普查＋候選來源實測（不放進排程、不寫正式資料）。

流程（全部是固定規則，不呼叫任何 AI 模型）：
1. 學校清單：教育部「高級中等學校名錄」篩出臺南市、高雄市（沿用 tools/school_census.py）。
2. 每校：抓首頁（必要時跟一次 meta refresh／frame），用固定規則辨識校網系統。
3. 依系統產生候選公告來源，用正式爬蟲的 adapter 實跑（fetch_page＋extract）：
   - iSchool：首頁上的 WID_0_2_ uid → news_query_json.php?uid=
   - 銳鼎新版：/p/403-{unit}-{id}-1.php 公告列表（首頁連結），加首頁本身
   - WordPress：/feed/；XOOPS tadnews：/modules/tadnews/rss.php
   - 縣市 CCMS（News.aspx?n=&sms=）：首頁；ASP Parser：latestevent/index.asp?Parser=
4. 通過條件：≥3 則、至少一半有日期、最新一則在 120 天內。通過的學校產生 config.json 建議設定。
每校最多 MAX_PER_SCHOOL 個請求、間隔 DELAY 秒。

輸出：reports/census/south.json、south_report.md、south_proposed_config.json
"""
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scraper"))
sys.path.insert(0, str(ROOT / "tools"))
import requests  # noqa: E402
import scrape  # noqa: E402
import adapters  # noqa: E402
import school_census as census  # noqa: E402

COUNTIES = ["臺南市", "高雄市"]
DELAY = 3.0
MAX_PER_SCHOOL = 6
TW = timezone(timedelta(hours=8))
OUT = ROOT / "reports" / "census"
FRESH_DAYS = 120

ISCHOOL_UID = re.compile(r"WID_0_2_[0-9a-f]{40}")
P403 = re.compile(r"/p/403-(\d+)-(\d+)-1\.php")
CCMS_LIST = re.compile(r'href="([^"]*News2?\.aspx\?n=\d+&(?:amp;)?sms=\d+)"', re.I)
PARSER_LIST = re.compile(r'href="([^"]*latestevent/index\.asp\?Parser=[0-9,]+)"', re.I)
ANNOUNCE_TEXT = re.compile(r"最新消息|公告|校園訊息|消息")


def now():
    return datetime.now(TW)


class Budget:
    def __init__(self, session, school):
        self.session, self.school, self.used, self._last = session, school, 0, 0.0

    def get(self, url, method="GET", data=None):
        if self.used >= MAX_PER_SCHOOL:
            raise RuntimeError("budget")
        wait = DELAY - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self.used += 1
        try:
            return scrape.fetch(self.session, url, self.school, method=method, data=data)
        finally:
            self._last = time.monotonic()


def system_of(html, url):
    """銳鼎新版／iSchool／WordPress／XOOPS／CCMS／ASP Parser／其他。"""
    code, _label, _ev = census.fingerprint(html, url)
    if CCMS_LIST.search(html) or "News_Content.aspx" in html:
        return "ccms"
    if PARSER_LIST.search(html) or "latestevent/index.as" in html.lower():
        return "asp-parser"
    return code


def candidates(system, html, home):
    """(adapter, 來源網址清單, 額外設定)。"""
    root = "{0.scheme}://{0.netloc}".format(urlsplit(home))
    if system == "ischool":
        uids = list(dict.fromkeys(ISCHOOL_UID.findall(html)))[:3]
        return "ischool-json", [root + census.ISCHOOL_JSON_PATH + "?uid=" + uid for uid in uids], {}
    if system == "new-classic-cms":
        unit = census.unit_of(html)
        lists = []
        soup_links = re.findall(r'<a[^>]+href="([^"]*/p/403-\d+-\d+-1\.php)"[^>]*>(.*?)</a>', html, re.S | re.I)
        for href, text in soup_links:
            text = re.sub(r"<[^>]+>|\s+", "", text)
            if ANNOUNCE_TEXT.search(text):
                lists.append(urljoin(home, href))
        lists = list(dict.fromkeys(lists))[:3]
        return "new-classic-cms", [home] + lists, {"unit": unit}
    if system == "wordpress":
        return "wordpress", [root + "/feed/"], {}
    if system == "xoops":
        return "xoops-tadnews", [root + "/modules/tadnews/rss.php"], {}
    if system == "ccms":
        lists = [urljoin(home, h.replace("&amp;", "&")) for h in CCMS_LIST.findall(html)][:2]
        return "ylc-ccms", [home] + lists, {}
    if system == "asp-parser":
        lists = [urljoin(home, h) for h in PARSER_LIST.findall(html)][:3]
        return "asp-parser-cms", lists, {}
    return "", [], {}


def test_source(budget, adapter, school, url):
    payload = adapter.fetch_page(budget.session, url, school, lambda s, u, sc, method="GET", data=None: budget.get(u, method, data))
    items = adapter.extract(payload, school, url)
    dated = [i["date"] for i in items if i.get("date")]
    return {"url": url, "count": len(items), "dated": len(dated), "newest": max(dated, default=""),
            "samples": [[i.get("date", ""), i["title"][:30]] for i in items[:3]]}


def passes(test, today):
    if not test or test.get("count", 0) < 3 or test.get("dated", 0) * 2 < test["count"]:
        return False
    newest = test.get("newest") or ""
    return bool(newest) and newest >= (today - timedelta(days=FRESH_DAYS)).strftime("%Y-%m-%d")


def short_name(name):
    return re.sub(r"^(?:國立|市立|私立|縣立|高雄市立|臺南市立|高雄市私立|臺南市私立)", "", name).strip()


def probe(session, target, today):
    sid = target["id"]
    row = {k: target.get(k, "") for k in ("id", "name", "county", "code", "ownership", "url", "url_source")}
    row.update({"system": "", "adapter": "", "sources": [], "error": "", "requests": 0})
    if not target.get("url"):
        row["error"] = "名錄無網址"
        return row
    school = {"id": sid, "short": short_name(target.get("name", sid)), "tls_verify_fallback": "bundled-intermediates"}
    budget = Budget(session, school)
    try:
        home = target["url"]
        html = budget.get(home)
        nxt = census.find_redirect(html, home)
        if nxt and nxt != home:
            html = budget.get(nxt)
            home = nxt
    except Exception as exc:
        row["error"] = census.error_class(exc)
        row["requests"] = budget.used
        return row
    row["final_url"] = home
    row["system"] = system_of(html, home)
    adapter_name, urls, extra = candidates(row["system"], html, home)
    row["adapter"] = adapter_name
    row["calendar_candidates"] = census.find_links(html, home, row["system"])[1][:2]
    if adapter_name:
        adapter = adapters.get_adapter(adapter_name)
        school.update({"base": "{0.scheme}://{0.netloc}".format(urlsplit(home))}, **extra)
        for url in urls:
            if budget.used >= MAX_PER_SCHOOL:
                break
            try:
                row["sources"].append(test_source(budget, adapter, school, url))
            except Exception as exc:
                row["sources"].append({"url": url, "error": census.error_class(exc)})
        row["unit"] = extra.get("unit", "")
    row["requests"] = budget.used
    good = [s for s in row["sources"] if passes(s, today)]
    row["verdict"] = "可上架" if good else ("同系統，需調整" if adapter_name else "需新 adapter")
    if good:
        row["proposed"] = proposal(row, good, today)
    return row


def proposal(row, good, today):
    base = "{0.scheme}://{0.netloc}".format(urlsplit(row["final_url"]))
    entry = {"id": row["id"], "name": row["name"], "short": short_name(row["name"]), "county": row["county"],
             "base": base, "adapter": row["adapter"], "tls_verify_fallback": "bundled-intermediates",
             "notify_since": (today + timedelta(days=1)).strftime("%Y-%m-%d"), "fetch_content_max": 5}
    if row["adapter"] == "new-classic-cms":
        entry["unit"] = row.get("unit", "")
        homes = [s["url"] for s in good if s["url"].rstrip("/") == row["final_url"].rstrip("/")]
        entry["scan_pages"] = homes
        entry["list_pages"] = [{"url": s["url"], "tier": "hot"} for s in good if s["url"] not in homes]
    else:
        best = sorted(good, key=lambda s: (-s["count"], s["url"]))
        entry["scan_pages"] = []
        entry["list_pages"] = [{"url": s["url"], "tier": "hot" if i == 0 else "cold"} for i, s in enumerate(best)]
    return entry


def render(rows, meta):
    lines = ["# 台南市、高雄市校網普查與來源實測", "",
             f"- 產生時間：{meta['generated_at']}（台灣時間）",
             f"- 學校清單：{meta['directory_source'] or '未取得教育部名錄'}",
             f"- 規則：每校最多 {MAX_PER_SCHOOL} 個請求、間隔 {DELAY:g} 秒；系統辨識與判定全用固定規則。",
             f"- 總請求數：{meta['total_requests']}", ""]
    verdicts, systems = {}, {}
    for r in rows:
        v = r.get("verdict") or "連不上"
        verdicts[v] = verdicts.get(v, 0) + 1
        k = r.get("system") or "（連不上）"
        systems[k] = systems.get(k, 0) + 1
    lines += ["## 摘要", "", "- 判定：" + "、".join(f"{k} {v} 校" for k, v in sorted(verdicts.items())),
              "- 系統：" + "、".join(f"{k} {v}" for k, v in sorted(systems.items(), key=lambda x: -x[1])), ""]
    for county in COUNTIES:
        group = [r for r in rows if r.get("county") == county]
        lines += [f"## {county}（{len(group)} 校）", "", "| 代碼 | 學校 | 系統 | 判定 | 最佳來源 | 實測 | 備註 |", "|---|---|---|---|---|---|---|"]
        for r in group:
            best = max(r.get("sources") or [{}], key=lambda s: s.get("count", 0))
            test = f"{best.get('count', 0)} 則／{best.get('dated', 0)} 有日期／最新 {best.get('newest', '')}" if best.get("url") else ""
            note = r.get("error") or best.get("error", "")
            lines.append(f"| {r['id']} | {census.md_escape(r.get('name'))} | {r.get('system') or '—'} | {r.get('verdict') or '連不上'} | "
                         f"{census.md_escape(best.get('url', ''))[:90]} | {test} | {census.md_escape(note)} |")
        lines.append("")
    lines += ["## 名錄取得紀錄", ""] + [f"- {x}" for x in meta["log"]] + [""]
    return "\n".join(lines)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": census.UA, "Accept-Language": "zh-TW,zh;q=0.9"})
    log = []
    directory, source = census.load_directory(session, COUNTIES, log)
    seed = json.loads((ROOT / "tools/census/targets_south.json").read_text(encoding="utf-8")).get("schools", [])
    targets = census.merge_targets(seed, directory)
    existing = {s["id"] for s in json.loads((ROOT / "scraper/config.json").read_text(encoding="utf-8"))["schools"]}
    targets = [t for t in targets if t.get("county") in COUNTIES and t["id"] not in existing]
    print(f"targets: {len(targets)} (directory {len(directory)})", flush=True)
    today = now().date()
    rows = []
    for t in targets:
        try:
            row = probe(session, t, now())
        except Exception as exc:  # one school never stops the batch
            row = {k: t.get(k, "") for k in ("id", "name", "county", "url")}
            row.update({"error": "probe_error:" + type(exc).__name__, "requests": MAX_PER_SCHOOL, "sources": []})
        row.setdefault("verdict", "連不上" if row.get("error") and not row.get("system") else row.get("verdict"))
        rows.append(row)
        best = max(row.get("sources") or [{}], key=lambda s: s.get("count", 0))
        print(f"{row['id']:10} {row.get('system') or '-':16} {row.get('verdict') or '-':8} {best.get('count', '')}/{best.get('dated', '')} {row.get('error', '')}", flush=True)
    meta = {"generated_at": now().strftime("%Y-%m-%d %H:%M"), "directory_source": source, "log": log,
            "total_requests": sum(r.get("requests", 0) for r in rows), "today": str(today)}
    (OUT / "south.json").write_text(json.dumps({"meta": meta, "schools": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "south_report.md").write_text(render(rows, meta), encoding="utf-8")
    proposed = [r["proposed"] for r in rows if r.get("proposed")]
    (OUT / "south_proposed_config.json").write_text(json.dumps({"schools": proposed}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"done: {len(rows)} schools, {len(proposed)} ready", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
