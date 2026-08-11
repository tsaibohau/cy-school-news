# -*- coding: utf-8 -*-
"""嘉校快訊爬蟲
抓取嘉義高中(cysh)與嘉義女中(cygsh)官網公告(RulingDigital 校園系統),
合併去重後輸出 docs/data/announcements.json,並將本次新增項目寫入
scraper/new_items.json 供推播使用。

設計原則:
- 低頻率、低請求量,對學校伺服器友善(每次請求間隔 delay)。
- 只憑 URL 樣式解析(/p/406-{unit}-{id},r{cat}.php),不依賴 CSS class,
  網站小改版也不易壞。
- 任一頁面抓取失敗只會略過該頁,不影響整體。
"""
import json
import re
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "scraper" / "config.json").read_text(encoding="utf-8"))

TW_TZ = timezone(timedelta(hours=8))
DATE_RE = re.compile(r"(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})")
# RulingDigital 文章頁的「發佈日期 : YYYY-MM-DD」欄位(嘉中文章頁固定會有)
PUB_DATE_RE = re.compile(r"發[佈布]日期\s*[::]\s*(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})")
UA = ("Mozilla/5.0 (compatible; cy-school-news/1.0; "
      "+https://github.com/ ; personal non-commercial announcement reader)")

# 依序比對,先命中先分類
CATEGORY_RULES = [
    ("段考考試", ["段考", "期中考", "期末考", "定期考", "補考", "考試範圍", "模擬考",
                  "學測", "分科測驗", "會考", "英聽", "試場", "考程", "准考證", "重補修"]),
    ("升學",     ["升學", "繁星", "申請入學", "分發", "特殊選才", "學習歷程", "志願",
                  "大學營", "科系", "面試", "選填", "四技二專"]),
    ("獎助學金", ["獎學", "獎助", "助學", "就學貸款", "學雜費減免", "補助金", "工讀"]),
    ("榮譽榜",   ["榮獲", "恭賀", "恭喜", "得獎名單", "佳績", "獲獎", "金牌", "銀牌",
                  "銅牌", "特優", "冠軍", "亞軍", "季軍", "入選"]),
    ("競賽",     ["競賽", "比賽", "初賽", "決賽", "複賽", "奧林匹亞", "科展", "徵文",
                  "徵稿", "盃", "語文競賽", "辯論"]),
    ("社團",     ["社團", "社課", "社博", "成果發表", "班聯會", "熱音", "熱舞", "校隊",
                  "迎新", "社慶"]),
    ("研習活動", ["研習", "講座", "營隊", "工作坊", "參訪", "體驗", "博覽會", "宣導",
                  "演講", "活動"]),
    ("招生編班", ["招生", "簡章", "甄選入學", "編班", "新生", "轉學", "報到", "入學"]),
    ("行政公告", ["招標", "採購", "徵才", "代理教師", "教師甄選", "場地", "停車",
                  "系統維護", "停電", "施工", "問卷"]),
]
CATEGORY_SLUGS = {
    "段考考試": "exam", "升學": "admission", "獎助學金": "scholarship",
    "榮譽榜": "honor", "競賽": "contest", "社團": "club",
    "研習活動": "event", "招生編班": "enroll", "行政公告": "admin", "一般": "general",
}


def classify(text: str) -> str:
    for cat, keywords in CATEGORY_RULES:
        if any(k in text for k in keywords):
            return cat
    return "一般"


def normalize_url(url: str) -> str:
    """去除 query string 與 fragment,作為去重的 key。"""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def display_date(item: dict) -> str:
    """排序與顯示共用的日期鍵:公告日期缺漏時,以首次發現日期(first_seen 前 10 碼)代替。"""
    return item.get("date") or (item.get("first_seen") or "")[:10]


def parse_date_near(node) -> str:
    """從連結節點往上找最近容器內的日期字串。"""
    cur = node
    for _ in range(4):
        if cur is None:
            break
        m = DATE_RE.search(cur.get_text(" ", strip=True) or "")
        if m:
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            try:
                return f"{y:04d}-{mo:02d}-{d:02d}"
            except ValueError:
                pass
        cur = cur.parent
    return ""


def page_category_name(soup: BeautifulSoup) -> str:
    title = (soup.title.get_text(strip=True) if soup.title else "") or ""
    # Ruling 頁面標題常見「行政單位>總務處>庶務組>公告事項」,取最後一段
    if ">" in title:
        title = title.split(">")[-1]
    return title.strip()


def extract_items(html: str, school: dict, source_url: str):
    """從任一頁面(列表頁或首頁)萃取公告項目。"""
    soup = BeautifulSoup(html, "html.parser")
    unit = school["unit"]
    item_re = re.compile(r"/p/406-%s-(\d+)(?:,r(\d+))?\.php" % re.escape(unit))
    src_cat = page_category_name(soup)
    items, seen = [], set()
    for a in soup.find_all("a", href=True):
        m = item_re.search(a["href"])
        if not m:
            continue
        art_id = m.group(1)
        if art_id in seen:
            continue
        title = a.get_text(" ", strip=True)
        # 官網 HTML 偶有 \x0b 等隱形空白字元,一律壓成單一空格
        title = re.sub(r"\s+", " ", title).strip()
        if not title or len(title) < 4 or title in ("MORE", "更多"):
            continue
        seen.add(art_id)
        url = normalize_url(urljoin(school["base"], a["href"]))
        date = parse_date_near(a)
        items.append({
            "id": f'{school["id"]}-{art_id}',
            "school": school["id"],
            "school_name": school["short"],
            "title": title,
            "url": url,
            "date": date,
            "source_category": src_cat if "403-" in source_url else "",
        })
    return items


def _article_body(soup: BeautifulSoup):
    """去除雜訊後,找出 406 文章頁的內文節點(摘要與日期補齊共用)。"""
    for tag in soup(["script", "style", "nav", "header", "footer"]):
        tag.decompose()
    candidates = []
    for sel in ["div.mpgdetail", "div.meditor", "div#Dyn_2_2", "article"]:
        candidates += soup.select(sel)
    if not candidates:
        # 後備方案:找含最多文字的 div
        divs = sorted(soup.find_all("div"),
                      key=lambda d: len(d.get_text(strip=True)), reverse=True)
        candidates = divs[:1]
    return candidates[0] if candidates else None


def extract_article_snippet(html: str, title: str) -> str:
    """從 406 文章頁抽出內文摘要(盡力而為,失敗回空字串)。"""
    try:
        soup = BeautifulSoup(html, "html.parser")
        body = _article_body(soup)
        if body is None:
            return ""
        text = body.get_text(" ", strip=True)
        text = re.sub(r"\s+", " ", text)
        if title and text.startswith(title):
            text = text[len(title):].strip()
        return text[:600]
    except Exception:
        return ""


def extract_article_date(html: str) -> str:
    """從 406 文章頁抽出公告日期,依優先序:
    1.「發佈日期 : YYYY-MM-DD」標籤  2. class 含 mdate 的元素  3. 內文第一個日期
    """
    try:
        soup = BeautifulSoup(html, "html.parser")
        matches = [PUB_DATE_RE.search(soup.get_text(" ", strip=True) or "")]
        node = soup.find(class_=re.compile("mdate"))
        if node is not None:
            matches.append(DATE_RE.search(node.get_text(" ", strip=True) or ""))
        body = _article_body(soup)
        if body is not None:
            matches.append(DATE_RE.search(body.get_text(" ", strip=True) or ""))
        for m in matches:
            if m:
                y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
                if 1 <= mo <= 12 and 1 <= d <= 31:
                    return f"{y:04d}-{mo:02d}-{d:02d}"
        return ""
    except Exception:
        return ""


def fetch(session: requests.Session, url: str) -> str:
    resp = session.get(url, timeout=CONFIG["timeout_sec"])
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text


def main() -> int:
    data_path = ROOT / CONFIG["data_path"]
    new_items_path = ROOT / CONFIG["new_items_path"]
    delay = CONFIG["request_delay_sec"]

    existing = {"items": []}
    if data_path.exists():
        try:
            existing = json.loads(data_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    by_id = {it["id"]: it for it in existing.get("items", [])}
    known_ids = set(by_id)

    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9"})

    now_iso = datetime.now(TW_TZ).isoformat(timespec="seconds")
    all_new = []
    fetched_this_run = set()

    for school in CONFIG["schools"]:
        collected = {}
        pages = list(school.get("scan_pages", [])) + list(school.get("list_pages", []))
        for page_url in pages:
            try:
                html = fetch(session, page_url)
            except Exception as e:
                print(f"[warn] 略過 {page_url}: {e}", file=sys.stderr)
                time.sleep(delay)
                continue
            for it in extract_items(html, school, page_url):
                prev = collected.get(it["id"])
                # 列表頁的 source_category 優先於首頁掃描
                if prev is None or (not prev.get("source_category") and it.get("source_category")):
                    if prev and prev.get("date") and not it.get("date"):
                        it["date"] = prev["date"]
                    collected[it["id"]] = it
            time.sleep(delay)

        new_for_school = [it for iid, it in collected.items() if iid not in known_ids]
        new_for_school.sort(key=lambda x: x.get("date") or "", reverse=True)

        # 只對「新」項目補抓內文摘要,並設上限;順便從文章頁補回缺漏的日期
        cap = CONFIG["fetch_content_max_per_school"]
        for it in new_for_school[:cap]:
            try:
                html = fetch(session, it["url"])
                it["snippet"] = extract_article_snippet(html, it["title"])
                if not it["snippet"]:
                    it["snippet_tried"] = True
                if not it.get("date"):
                    it["date"] = extract_article_date(html)
                    if not it["date"]:
                        it["date_tried"] = True
                fetched_this_run.add(it["id"])
            except Exception as e:
                print(f"[warn] 內文抓取失敗 {it['url']}: {e}", file=sys.stderr)
                it["snippet"] = ""
            time.sleep(delay)

        for it in collected.values():
            base_text = it["title"] + " " + it.get("source_category", "")
            if it["id"] in known_ids:
                old = by_id[it["id"]]
                # 保留舊資料的 first_seen / snippet,更新可能修訂過的標題與分類來源
                old["title"] = it["title"]
                if it.get("source_category"):
                    old["source_category"] = it["source_category"]
                if it.get("date"):
                    old["date"] = it["date"]
                old["category"] = classify(old["title"] + " " + old.get("source_category", ""))
            else:
                it["category"] = classify(base_text)
                it["first_seen"] = now_iso
                it.setdefault("snippet", "")
                by_id[it["id"]] = it
                all_new.append(it)

        print(f"[info] {school['short']}: 共 {len(collected)} 筆,其中新項目 {len(new_for_school)} 筆")

    # 逐步補齊舊資料:每次最多挑幾筆缺日期或缺摘要的既有項目,抓文章頁補齊
    backfill_cap = CONFIG.get("backfill_max_per_run", 10)

    def needs_date(it):
        return not it.get("date") and not it.get("date_tried")

    def needs_snippet(it):
        return not it.get("snippet") and not it.get("snippet_tried")

    pending = [it for it in by_id.values()
               if it["id"] not in fetched_this_run
               and (needs_date(it) or needs_snippet(it))]
    pending.sort(key=lambda x: x.get("first_seen") or "", reverse=True)
    filled_dates = filled_snippets = 0
    for it in pending[:backfill_cap]:
        try:
            html = fetch(session, it["url"])
        except Exception as e:
            print(f"[warn] 補抓失敗 {it['url']}: {e}", file=sys.stderr)
            time.sleep(delay)
            continue
        if needs_date(it):
            date = extract_article_date(html)
            if date:
                it["date"] = date
                filled_dates += 1
            else:
                # 文章頁也沒有日期,標記後不再重複嘗試
                it["date_tried"] = True
        if needs_snippet(it):
            snippet = extract_article_snippet(html, it["title"])
            if snippet:
                it["snippet"] = snippet
                filled_snippets += 1
            else:
                it["snippet_tried"] = True
        time.sleep(delay)
    if pending:
        done = min(len(pending), backfill_cap)
        print(f"[info] 補齊:本次處理 {done} 筆,補日期 {filled_dates} 筆、"
              f"補摘要 {filled_snippets} 筆,剩餘 {len(pending) - done} 筆待補")

    items = list(by_id.values())
    items.sort(key=lambda x: (display_date(x), x.get("first_seen") or ""),
               reverse=True)
    items = items[: CONFIG["max_items"]]

    out = {
        "generated_at": now_iso,
        "schools": [{"id": s["id"], "name": s["name"], "short": s["short"], "base": s["base"]}
                    for s in CONFIG["schools"]],
        "categories": [c for c, _ in CATEGORY_RULES] + ["一般"],
        "category_slugs": CATEGORY_SLUGS,
        "items": items,
    }
    data_path.parent.mkdir(parents=True, exist_ok=True)
    data_path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    all_new.sort(key=lambda x: x.get("date") or "", reverse=True)
    new_items_path.write_text(json.dumps(all_new, ensure_ascii=False, indent=1),
                              encoding="utf-8")
    print(f"[info] 輸出 {len(items)} 筆(新增 {len(all_new)} 筆)→ {data_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
