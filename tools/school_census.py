# -*- coding: utf-8 -*-
"""一次性校網系統普查（雲嘉地區起步）。不放進排程。

用法:
  python tools/school_census.py --targets tools/census/targets_yunchia.json \
      --out-json reports/census/yunchia.json --out-md reports/census/yunchia_report.md

流程（全部是固定規則，不呼叫任何 AI 模型）:
1. 學校清單：先下載教育部「高級中等學校名錄」(data.gov.tw 資料集 6089) 篩出目標縣市，
   再併入種子清單；兩邊都有時以教育部網址為準。名錄抓不到就只用種子清單。
2. 每校最多 MAX_REQUESTS_PER_SCHOOL 個請求，請求之間間隔 DELAY 秒：
   - 首頁（必要時跟一次 meta refresh / frameset）
   - 從首頁找到的公告列表頁，用 scrape.py 既有解析器實測能否抓到公告
3. 依網址樣式、HTML 特徵、meta generator 判斷系統類型，產出 JSON 與 Markdown 報告。
"""
import argparse
import csv
import io
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

DELAY = 3.0
TIMEOUT = 20
MAX_REQUESTS_PER_SCHOOL = 3
UA = ("Mozilla/5.0 (compatible; cy-school-news-census/1.0; "
      "+https://github.com/tsaibohau/cy-school-news ; one-time low-rate survey)")
TW = timezone(timedelta(hours=8))

DIRECTORY_DATASET_API = "https://data.gov.tw/api/v2/rest/dataset/6089"
DIRECTORY_FALLBACKS = [
    "https://stats.moe.gov.tw/files/school/115/high.csv",
    "https://stats.moe.gov.tw/files/school/114/high.csv",
]
SCHOOL_HOST_RE = re.compile(r"(?:^|\.)([a-z0-9-]+)\.(cy|cyc|ylc)\.edu\.tw$")

# ---- 系統辨識規則（依序比對，先命中先採用） ----
NEW_CLASSIC_RE = re.compile(r"/p/(?:403|404|406|412)-(\d+)-\d+")
OLD_CLASSIC_RE = re.compile(r"/files/(?:11|13|14|15|16)-(\d+)-\d+")
ISCHOOL_UID_RE = re.compile(r"site_news/main2\.php\?[^\"'<>]*?uid=(WID_[0-9A-Za-z_]+)")
ISCHOOL_JSON_PATH = "/ischool/widget/site_news/news_query_json.php"
ISCHOOL_NEWS_RE = re.compile(r"/ischool/widget/site_news/main2\.php\?[^\"'\s<>]+")
ANNOUNCE_TEXT_RE = re.compile(r"最新消息|公告|校園訊息|校園公佈|消息|news", re.I)
CALENDAR_TEXT_RE = re.compile(r"行事曆")

SYSTEM_RULES = [
    # (系統代碼, 說明, 判斷函式(html, final_url, generator) -> bool)
    ("new-classic-cms", "銳鼎 RulingDigital 新版（/p/403-、/p/412-、/p/406-）",
     lambda h, u, g: len(NEW_CLASSIC_RE.findall(h)) >= 2),
    ("ischool", "iSchool（/ischool/ widget）",
     lambda h, u, g: "/ischool/" in h),
    ("old-classic-cms", "銳鼎舊版（/files/11-、/files/14-）",
     lambda h, u, g: len(OLD_CLASSIC_RE.findall(h)) >= 2),
    ("wordpress", "WordPress",
     lambda h, u, g: "wp-content/" in h or "wordpress" in g),
    ("xoops", "XOOPS / Tad 系列模組",
     lambda h, u, g: "modules/tadnews" in h or "xoops" in g or "/modules/system/" in h),
    ("joomla", "Joomla",
     lambda h, u, g: "joomla" in g or "option=com_" in h),
    ("drupal", "Drupal",
     lambda h, u, g: "drupal" in g or "/sites/default/files/" in h or "Drupal.settings" in h),
    ("nuweb", "NUWeb / nss",
     lambda h, u, g: "/nss/" in h or "nuweb" in h.lower()),
    ("google-sites", "Google 協作平台",
     lambda h, u, g: "sites.google.com" in u or "google sites" in g),
    ("aspnet", "ASP.NET 自建",
     lambda h, u, g: "__VIEWSTATE" in h or re.search(r"\.aspx\b", h) is not None),
]
ADAPTER_FOR_SYSTEM = {"new-classic-cms": "new-classic-cms", "ischool": "ischool-site-news"}


def now_tw():
    return datetime.now(TW).strftime("%Y-%m-%d %H:%M")


def school_key(url):
    """把網址轉成學校代碼，例如 https://rpage.fjsh.cy.edu.tw → fjsh。"""
    host = (urlsplit(url if "://" in url else "https://" + url).hostname or "").lower()
    m = SCHOOL_HOST_RE.search(host)
    if not m:
        return host
    label = m.group(1)
    return label


def normalize_url(url):
    url = (url or "").strip()
    if not url:
        return ""
    if "://" not in url:
        url = "https://" + url
    return url if url.endswith("/") or urlsplit(url).path else url + "/"


# ---- 學校清單 ----
def parse_directory_csv(text, counties):
    """解析教育部名錄 CSV，欄位名稱以關鍵字比對，避免各年度欄名小差異。"""
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return []
    header = [h.strip() for h in rows[0]]

    def col(*keys):
        for i, h in enumerate(header):
            if any(k in h for k in keys):
                return i
        return -1

    i_name, i_county, i_url = col("學校名稱", "名稱"), col("縣市"), col("網址")
    i_code, i_own = col("代碼"), col("公/私", "公私")
    if min(i_name, i_county, i_url) < 0:
        return []
    out = []
    for row in rows[1:]:
        if len(row) <= max(i_name, i_county, i_url):
            continue
        county = row[i_county]
        hit = next((c for c in counties if c in county.replace("台", "臺") or c in county), "")
        if not hit:
            continue
        out.append({
            "name": row[i_name].strip(),
            "county": hit,
            "url": normalize_url(row[i_url]),
            "code": row[i_code].strip() if i_code >= 0 else "",
            "ownership": row[i_own].strip() if i_own >= 0 else "",
        })
    return out


def decode_bytes(raw):
    for enc in ("utf-8-sig", "cp950", "big5"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def csv_links_from_dataset(payload):
    """從 data.gov.tw 資料集 JSON 裡找出 CSV 下載網址，依學年度新到舊排序。"""
    links = []

    def walk(node):
        if isinstance(node, dict):
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
        elif isinstance(node, str) and node.startswith("http") and ".csv" in node.lower():
            links.append(node)

    walk(payload)

    def year(u):
        nums = [int(n) for n in re.findall(r"(?<!\d)(1\d{2})(?!\d)", u)]
        return max(nums) if nums else 0

    return sorted(dict.fromkeys(links), key=year, reverse=True)


def load_directory(session, counties, log):
    candidates = []
    try:
        r = session.get(DIRECTORY_DATASET_API, timeout=TIMEOUT)
        if r.ok:
            candidates = csv_links_from_dataset(r.json())
        log.append(f"data.gov.tw 6089: HTTP {r.status_code}, CSV {len(candidates)} 個")
    except Exception as exc:  # pragma: no cover - network dependent
        log.append(f"data.gov.tw 6089 失敗: {type(exc).__name__}")
    for url in candidates[:2] + DIRECTORY_FALLBACKS:
        try:
            r = session.get(url, timeout=TIMEOUT)
            if not r.ok:
                log.append(f"名錄 {url}: HTTP {r.status_code}")
                continue
            rows = parse_directory_csv(decode_bytes(r.content), counties)
            log.append(f"名錄 {url}: 目標縣市 {len(rows)} 校")
            if rows:
                return rows, url
        except Exception as exc:  # pragma: no cover - network dependent
            log.append(f"名錄 {url} 失敗: {type(exc).__name__}")
    return [], ""


def merge_targets(seed, directory):
    """種子清單 + 教育部名錄。同一校以網域代碼對應；網址以教育部為準。"""
    merged = {}
    for s in seed:
        key = s.get("id") or school_key(s["url"])
        merged[key] = dict(s, id=key, url=normalize_url(s["url"]), url_source="seed",
                           seed_url=normalize_url(s["url"]))
    by_name = {s["name"]: k for k, s in merged.items()}
    for d in directory:
        if not d["url"]:
            key = by_name.get(d["name"]) or d["name"]
        else:
            key = school_key(d["url"])
            if key not in merged and d["name"] in by_name:
                key = by_name[d["name"]]
        row = merged.get(key, {"id": key, "seed_url": ""})
        row.update({
            "name": d["name"] or row.get("name", ""),
            "county": d["county"],
            "code": d.get("code", ""),
            "ownership": d.get("ownership", ""),
        })
        if d["url"]:
            row["url"] = d["url"]
            row["url_source"] = "moe" if not row.get("seed_url") else "moe+seed"
        else:
            row.setdefault("url", "")
            row["url_source"] = row.get("url_source", "moe-no-url")
        merged[key] = row
    county_order = {"嘉義市": 0, "嘉義縣": 1, "雲林縣": 2}
    return sorted(merged.values(), key=lambda r: (county_order.get(r.get("county"), 9), r["id"]))


# ---- 單校探測 ----
def meta_generator(soup):
    tag = soup.find("meta", attrs={"name": re.compile("^generator$", re.I)})
    return (tag.get("content") or "").strip() if tag else ""


def fingerprint(html, final_url):
    """回傳 (系統代碼, 說明, 證據清單)。純規則，可離線測試。"""
    soup = BeautifulSoup(html or "", "html.parser")
    generator = meta_generator(soup)
    g = generator.lower()
    evidence = []
    if generator:
        evidence.append(f"generator={generator}")
    for code, label, rule in SYSTEM_RULES:
        if rule(html or "", final_url or "", g):
            if code == "new-classic-cms":
                units = sorted(set(NEW_CLASSIC_RE.findall(html)))
                evidence.append("unit=" + ",".join(units[:3]))
                if "rpage." in (final_url or ""):
                    evidence.append("rpage 子網域")
            return code, label, evidence
    if soup.find("frameset") or soup.find("frame"):
        return "frameset", "frameset 外框", evidence
    return "unknown", "未辨識", evidence


def find_redirect(html, base):
    """meta refresh、frameset、或整頁只有一個 iframe 時，回傳要跟進的網址。"""
    soup = BeautifulSoup(html or "", "html.parser")
    meta = soup.find("meta", attrs={"http-equiv": re.compile("^refresh$", re.I)})
    if meta:
        m = re.search(r"url\s*=\s*['\"]?([^'\";]+)", meta.get("content") or "", re.I)
        if m:
            return safe_join(base, m.group(1).strip())
    frame = soup.find("frame", src=True)
    if frame:
        return safe_join(base, frame["src"])
    if len(soup.find_all("a", href=True)) < 3:
        iframe = soup.find("iframe", src=True)
        if iframe:
            return safe_join(base, iframe["src"])
    m = re.search(r"location(?:\.href)?\s*=\s*['\"]([^'\"]+)['\"]", html or "")
    if m and len(soup.find_all("a", href=True)) < 3:
        return safe_join(base, m.group(1))
    return ""


def unit_of(html):
    units = re.findall(r"/p/406-(\d+)-\d+", html or "") or NEW_CLASSIC_RE.findall(html or "")
    if not units:
        return ""
    return max(set(units), key=units.count)


def safe_join(base, href):
    """解析不了、或含空白／非 http 的 href 一律略過（校網偶有把整段文字塞進 href）。"""
    href = (href or "").strip()
    if not href or len(href) > 300 or re.search(r"\s", href):
        return ""
    try:
        url = urljoin(base, href)
        parts = urlsplit(url)
    except ValueError:
        return ""
    return url if parts.scheme in ("http", "https") and parts.hostname else ""


def find_links(html, base, system):
    """從首頁找公告列表與行事曆候選連結。"""
    soup = BeautifulSoup(html or "", "html.parser")
    announce, calendar = [], []
    for a in soup.find_all("a", href=True):
        text = re.sub(r"\s+", " ", a.get_text(" ", strip=True)).strip()
        href = safe_join(base, a["href"])
        if not href:
            continue
        title = a.get("title") or ""
        if CALENDAR_TEXT_RE.search(text) or CALENDAR_TEXT_RE.search(title):
            calendar.append({"text": text[:30] or title[:30], "url": href})
        elif ANNOUNCE_TEXT_RE.search(text) and len(text) <= 12:
            if href.split("#")[0].rstrip("/") == base.split("#")[0].rstrip("/"):
                continue  # 只是頁內錨點（頁籤），不是列表頁
            announce.append({"text": text, "url": href})
    if system == "new-classic-cms":
        announce.sort(key=lambda x: 0 if "/p/403-" in x["url"] else 1 if "/p/412-" in x["url"] else 2)
    if system == "ischool":
        for m in ISCHOOL_NEWS_RE.finditer(html or ""):
            announce.insert(0, {"text": "site_news widget",
                                "url": urljoin(base, m.group(0).replace("&amp;", "&"))})
    dedup = lambda rows: list({r["url"]: r for r in rows}.values())
    return dedup(announce)[:5], dedup(calendar)[:5]


def classify_calendar(links):
    if not links:
        return "首頁找不到"
    u = links[0]["url"].lower()
    if "calendar.google" in u or "google.com/calendar" in u:
        return "Google 日曆"
    if u.endswith(".pdf") or "/var/file/" in u:
        return "PDF"
    if "/p/412-" in u or "/p/403-" in u or "/p/406-" in u:
        return "校網頁面（new-classic-cms）"
    return "校網連結"


def evaluate_items(items):
    dated = sum(1 for it in items if it.get("date"))
    return {"count": len(items), "dated": dated,
            "sample": items[0]["title"][:40] if items else ""}


def parse_with_existing(system, html, base, school_id, source_url):
    """用 scrape.py 既有解析器實測。只有已知系統才會呼叫。"""
    from scrape import extract_ischool_items, extract_rulingdigital_items
    root = "{0.scheme}://{0.netloc}".format(urlsplit(base))
    if system == "new-classic-cms":
        unit = unit_of(html)
        if not unit:
            return {"count": 0, "dated": 0, "sample": ""}
        school = {"id": school_id, "short": school_id, "base": root, "unit": unit}
        return evaluate_items(extract_rulingdigital_items(html, school, source_url))
    if system == "ischool":
        school = {"id": school_id, "short": school_id, "base": root}
        return evaluate_items(extract_ischool_items(html, school, source_url))
    return {"count": 0, "dated": 0, "sample": ""}


def ischool_json_probe(prober, root, uid):
    """iSchool 公告由 JS 向 news_query_json.php POST 取得（同北港做法），實測第一頁 10 筆。"""
    from pksh_snapshot import _api_date
    body = {"field": "time", "order": "DESC", "pageNum": "0", "maxRows": "10", "keyword": "",
            "uid": uid, "tf": "2", "auth_type": "user", "use_cache": "1"}
    resp = prober.post(root + ISCHOOL_JSON_PATH, body)
    if not resp.ok:
        return {"count": 0, "dated": 0, "sample": "", "error": f"http_{resp.status_code}"}
    try:
        records = json.loads(resp.content.decode("utf-8-sig"))
    except ValueError:
        return {"count": 0, "dated": 0, "sample": "", "error": "not_json"}
    rows = [r for r in records if isinstance(r, dict) and r.get("newsId") and r.get("title")] \
        if isinstance(records, list) else []
    total = next((r.get("total") for r in records if isinstance(r, dict) and "total" in r), "") \
        if isinstance(records, list) else ""
    return {"count": len(rows), "dated": sum(1 for r in rows if _api_date(r.get("time"), "2026")),
            "sample": str(rows[0]["title"])[:40] if rows else "", "total": total, "json": True}


def verdict(row):
    if row.get("error") and not row.get("system"):
        return "連不上"
    adapter = ADAPTER_FOR_SYSTEM.get(row.get("system"))
    test = row.get("list_test") or {}
    if adapter and test.get("count", 0) >= 3 and test.get("dated", 0) * 2 >= test["count"]:
        return "可直接套用"
    if adapter:
        return "同系統，需調整"
    return "需新 adapter"


def error_class(exc):
    if isinstance(exc, requests.exceptions.SSLError):
        return "tls_error"
    if isinstance(exc, requests.exceptions.Timeout):
        return "timeout"
    if isinstance(exc, requests.exceptions.ConnectionError):
        msg = str(exc)
        if "Name or service not known" in msg or "NameResolution" in msg or "getaddrinfo" in msg:
            return "dns_error"
        return "connection_error"
    return type(exc).__name__


class Prober:
    def __init__(self, session, delay=DELAY):
        self.session = session
        self.delay = delay
        self.count = 0
        self._last = 0.0

    verify = True

    def _wait(self):
        if self.count >= MAX_REQUESTS_PER_SCHOOL:
            raise RuntimeError("request budget exhausted")
        wait = self.delay - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self.count += 1

    def get(self, url, verify=None):
        self._wait()
        try:
            kw = {} if (verify if verify is not None else self.verify) is True else \
                {"verify": verify if verify is not None else self.verify}
            return self.session.get(url, timeout=TIMEOUT, allow_redirects=True, **kw)
        finally:
            self._last = time.monotonic()

    def post(self, url, data):
        self._wait()
        try:
            kw = {} if self.verify is True else {"verify": self.verify}
            return self.session.post(url, data=data, timeout=TIMEOUT, **kw)
        finally:
            self._last = time.monotonic()


def system_ca():
    from scrape import system_ca_bundle
    return system_ca_bundle()


def decode_response(resp):
    from scrape import decode_response as _decode
    return _decode(resp)


def probe_school(session, target, delay=DELAY):
    row = {k: target.get(k, "") for k in ("id", "name", "county", "code", "ownership", "url", "url_source")}
    row.update({"system": "", "system_label": "", "evidence": [], "error": "", "requests": 0})
    if not target.get("url"):
        row["error"] = "名錄無網址"
        row["verdict"] = "連不上"
        return row
    prober = Prober(session, delay)
    url = target["url"]
    try:
        resp = prober.get(url)
    except Exception as exc:
        row["error"] = error_class(exc)
        ca = system_ca() if row["error"] == "tls_error" else ""
        resp = None
        if ca:
            # 先用作業系統 CA 重新驗證（scrape.py 的 tls_verify_fallback 同一做法）
            try:
                resp = prober.get(url, verify=ca)
                prober.verify = ca
                row["evidence"].append("certifi 驗證失敗，系統 CA 驗證通過")
                row["error"] = ""
            except Exception:
                resp = None
        if resp is None and row["error"] == "tls_error" and url.startswith("https://"):
            # 憑證鏈不完整的校網很常見（北港高中即是），改用 http 只做系統辨識
            row["evidence"].append("https 憑證驗證失敗，改以 http 辨識")
            url = "http://" + url[len("https://"):]
            try:
                resp = prober.get(url)
            except Exception as exc2:
                row["error"] += "+" + error_class(exc2)
                resp = None
    if resp is None:
        row["requests"] = prober.count
        row["verdict"] = verdict(row)
        return row
    row["http_status"] = resp.status_code
    row["final_url"] = resp.url
    row["server"] = resp.headers.get("Server", "")[:40]
    html = decode_response(resp)
    if resp.status_code >= 400:
        row["error"] = f"http_{resp.status_code}"
    nxt = find_redirect(html, resp.url)
    if nxt and nxt != resp.url and prober.count < MAX_REQUESTS_PER_SCHOOL:
        try:
            r2 = prober.get(nxt)
            if r2.ok:
                row["evidence"].append(f"跟進轉址 {r2.url[:60]}")
                resp, html = r2, decode_response(r2)
                row["final_url"] = r2.url
        except Exception as exc:
            row["evidence"].append(f"轉址失敗 {error_class(exc)}")
    system, label, ev = fingerprint(html, row.get("final_url", ""))
    row.update({"system": system, "system_label": label})
    row["evidence"] += ev
    announce, calendar = find_links(html, row["final_url"], system)
    row["announce_candidates"] = announce
    row["calendar_candidates"] = calendar
    row["calendar_type"] = classify_calendar(calendar)
    row["homepage_test"] = parse_with_existing(system, html, row["final_url"], row["id"], row["final_url"])
    list_url = announce[0]["url"] if announce else ""
    uid_match = ISCHOOL_UID_RE.search((html or "").replace("&amp;", "&"))
    if system == "ischool" and uid_match and prober.count < MAX_REQUESTS_PER_SCHOOL:
        root = "{0.scheme}://{0.netloc}".format(urlsplit(row["final_url"]))
        row["ischool_uid"] = uid_match.group(1)
        row["list_url"] = root + ISCHOOL_JSON_PATH
        try:
            row["list_test"] = ischool_json_probe(prober, root, uid_match.group(1))
        except Exception as exc:
            row["list_error"] = error_class(exc)
    elif list_url and system in ADAPTER_FOR_SYSTEM and prober.count < MAX_REQUESTS_PER_SCHOOL:
        try:
            r3 = prober.get(list_url)
            if r3.ok:
                row["list_url"] = r3.url
                row["list_test"] = parse_with_existing(system, decode_response(r3), row["final_url"],
                                                       row["id"], r3.url)
            else:
                row["list_url"] = list_url
                row["list_error"] = f"http_{r3.status_code}"
        except Exception as exc:
            row["list_url"] = list_url
            row["list_error"] = error_class(exc)
    elif list_url:
        row["list_url"] = list_url
    home = row["homepage_test"]
    if home["count"] and home["count"] > (row.get("list_test") or {}).get("count", 0):
        row["list_test"] = dict(home, from_homepage=True)
    row["requests"] = prober.count
    row["verdict"] = verdict(row)
    return row


# ---- 系統家族（同家族可共用一個 adapter）----
FAMILY_RULES = [
    # (家族代碼, 說明, 現有 adapter 或建議做法, 判斷函式(row, 所有網址合併字串))
    ("new-classic-cms", "銳鼎新版", "現有 new-classic-cms",
     lambda r, u: r.get("system") == "new-classic-cms"),
    ("ischool", "數位果子 iSchool", "北港 JSON 做法泛化為 ischool-site-news",
     lambda r, u: r.get("system") == "ischool"),
    ("ylc-county-cms", "雲林縣網站平台（News.aspx?n=&sms=）", "新 adapter，一次涵蓋多校",
     lambda r, u: re.search(r"(?:News2?|cl|News_Content)\.aspx\?n=\d+", u) is not None
     or (r.get("system") == "aspnet" and ".ylc.edu.tw" in (r.get("final_url") or "")
         and "Microsoft-IIS" in (r.get("server") or ""))),
    ("asp-latestevent", "ASP 校網（latestevent/index.asp?Parser=）", "新 adapter",
     lambda r, u: "latestevent/index.as" in u.lower()),
    ("xoops-tadnews", "XOOPS + tadnews", "新 adapter（tadnews 列表頁或 RSS）",
     lambda r, u: r.get("system") == "xoops"),
    ("wordpress", "WordPress", "新 adapter（WordPress RSS／REST，分類各校不同）",
     lambda r, u: r.get("system") == "wordpress"),
]


def family(row):
    urls = " ".join([row.get("final_url") or "", row.get("list_url") or ""] +
                    [c["url"] for c in row.get("announce_candidates") or []] +
                    [c["url"] for c in row.get("calendar_candidates") or []])
    for code, label, plan, rule in FAMILY_RULES:
        if rule(row, urls):
            return code, label, plan
    if not row.get("system"):
        return "unreachable", "連不上", "需換來源或請校方協助"
    return "custom", "單校自建", "個別評估"


# ---- 報告 ----
def md_escape(text):
    return str(text or "").replace("|", "／").replace("\n", " ")


def render_markdown(rows, meta):
    lines = ["# 雲嘉地區校網系統普查", "",
             f"- 產生時間：{meta['generated_at']}（台灣時間）",
             f"- 學校清單：{meta['directory_source'] or '僅種子清單（教育部名錄未取得）'}",
             f"- 規則：每校最多 {MAX_REQUESTS_PER_SCHOOL} 個請求、間隔 {DELAY:g} 秒；系統辨識全用固定規則。",
             f"- 總請求數：{meta['total_requests']}", ""]
    summary = {}
    for r in rows:
        summary[r["verdict"]] = summary.get(r["verdict"], 0) + 1
    systems = {}
    for r in rows:
        systems[r.get("system") or "（連不上）"] = systems.get(r.get("system") or "（連不上）", 0) + 1
    lines += ["## 摘要", "",
              "- 判定：" + "、".join(f"{k} {v} 校" for k, v in sorted(summary.items())),
              "- 系統：" + "、".join(f"{k} {v}" for k, v in sorted(systems.items(), key=lambda x: -x[1])), ""]
    fams = {}
    for r in rows:
        code, label, plan = family(r)
        fams.setdefault((code, label, plan), []).append(r["id"])
    lines += ["## 系統家族（同家族可共用一個 adapter）", "",
              "| 家族 | 校數 | 做法 | 學校 |", "|---|---|---|---|"]
    for (code, label, plan), ids in sorted(fams.items(), key=lambda x: -len(x[1])):
        lines.append(f"| {label} | {len(ids)} | {plan} | {'、'.join(ids)} |")
    lines.append("")
    for county in ("嘉義市", "嘉義縣", "雲林縣"):
        group = [r for r in rows if r.get("county") == county]
        if not group:
            continue
        lines += [f"## {county}", "",
                  "| 代碼 | 學校 | 系統 | 判定 | 公告列表 | 實測 | 行事曆 | 備註 |",
                  "|---|---|---|---|---|---|---|---|"]
        for r in group:
            test = r.get("list_test") or {}
            tested = f"{test.get('count', 0)} 則／{test.get('dated', 0)} 有日期" if test else ""
            if test.get("from_homepage"):
                tested += "（首頁）"
            note = "；".join(filter(None, [r.get("error"), r.get("list_error"),
                                            "網址來源:" + r.get("url_source", "")] + r.get("evidence", [])[:3]))
            lines.append("| {id} | {name} | {sys} | {v} | {lst} | {t} | {cal} | {note} |".format(
                id=r["id"], name=md_escape(r.get("name")), sys=r.get("system") or "—",
                v=r["verdict"], lst=md_escape(r.get("list_url", "")), t=tested,
                cal=md_escape(r.get("calendar_type", "")), note=md_escape(note)[:160]))
        lines.append("")
    lines += ["## 名錄取得紀錄", ""] + [f"- {x}" for x in meta["log"]] + [""]
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", default=str(ROOT / "tools/census/targets_yunchia.json"))
    ap.add_argument("--out-json", default=str(ROOT / "reports/census/yunchia.json"))
    ap.add_argument("--out-md", default=str(ROOT / "reports/census/yunchia_report.md"))
    ap.add_argument("--no-directory", action="store_true")
    ap.add_argument("--rerender", action="store_true", help="只用既有 JSON 重算報告，不連網")
    args = ap.parse_args(argv)
    if args.rerender:
        data = json.loads(Path(args.out_json).read_text(encoding="utf-8"))
        for r in data["schools"]:
            r["family"] = family(r)[0]
        Path(args.out_json).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        Path(args.out_md).write_text(render_markdown(data["schools"], data["meta"]), encoding="utf-8")
        return 0

    spec = json.loads(Path(args.targets).read_text(encoding="utf-8"))
    session = requests.Session()
    session.headers["User-Agent"] = UA
    log, directory, source = [], [], ""
    if not args.no_directory:
        directory, source = load_directory(session, spec["counties"], log)
    targets = merge_targets(spec["schools"], directory)
    print(f"targets: {len(targets)} (directory {len(directory)})", flush=True)

    rows = []
    for t in targets:
        try:
            row = probe_school(session, t)
        except Exception as exc:  # 單校出錯不影響整批；不印例外內容以免帶出頁面文字
            row = {k: t.get(k, "") for k in ("id", "name", "county", "url", "url_source")}
            row.update({"system": "", "evidence": [], "requests": MAX_REQUESTS_PER_SCHOOL,
                        "error": "probe_error:" + type(exc).__name__, "verdict": "連不上"})
        rows.append(row)
        print(f"{row['id']:8} {row.get('system') or '-':16} {row['verdict']:10} "
              f"req={row['requests']} {row.get('error', '')}", flush=True)

    for r in rows:
        r["family"] = family(r)[0]
    meta = {"generated_at": now_tw(), "directory_source": source, "log": log,
            "total_requests": sum(r["requests"] for r in rows)}
    Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out_json).write_text(json.dumps({"meta": meta, "schools": rows},
                                              ensure_ascii=False, indent=1), encoding="utf-8")
    Path(args.out_md).write_text(render_markdown(rows, meta), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
