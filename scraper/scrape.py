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
import os
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

# 深度回補(環境變數 DEEP_CRAWL=1):對每個 403 分類頁往後翻頁的一次性模式,
# 由維護者在本機執行,不進排程——新公告永遠出現在第一頁,日常抓第一頁即可。
DEEP_CRAWL_MAX_PAGES = 15
DEEP_CRAWL_CUTOFF = "2024-08-01"  # 回溯到現任高三入學
UA = ("Mozilla/5.0 (compatible; cy-school-news/1.0; "
      "+https://github.com/ ; personal non-commercial announcement reader)")

# 依序比對,先命中先分類
CATEGORY_RULES = [
    ("段考考試", ["段考", "期中考", "期末考", "定期考", "補考", "考試範圍", "考試訊息", "模擬考",
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

# Date provenance is persisted explicitly when it is known.  Older records
# without this field are treated as reliable persisted observations, never as
# weak list-page observations.
DATE_SOURCE_RANK = {
    "first_seen": 0,
    "list": 1,
    "persisted": 2,
    "article_meta": 3,
    "publication": 4,
}

MOJIBAKE_TOKEN_RE = re.compile(
    r"(?:[ÃÂ][\x80-\xBF]|â[\x80-\xBF]{2}|[äæ][\x80-\xBF][^\s]|"
    r"[å][\x80-\xBF][^\s])"
)


def is_mojibake(text: str) -> bool:
    """Conservative detector for known UTF-8-as-Latin-1 corruption."""
    if not isinstance(text, str) or not text:
        return False
    if "\ufffd" in text or any(ord(c) < 32 and c not in "\t\r\n" for c in text):
        return True
    return len(MOJIBAKE_TOKEN_RE.findall(text)) >= 1


def _category_rank(source_url: str):
    """Stable source priority derived from the configured source URL."""
    normalized = normalize_url(source_url or "")
    configured = []
    for school in CONFIG.get("schools", []):
        configured.extend(list_page_urls(school))
    configured = [normalize_url(u) for u in configured]
    if normalized in configured:
        return (0, configured.index(normalized), normalized)
    match = re.search(r"/p/403-\d+-(\d+)-\d+\.php", normalized)
    return (1, int(match.group(1)) if match else 10**9, normalized)


def choose_date(existing: dict, candidate: dict) -> dict:
    """Merge a date candidate without allowing weaker provenance to regress."""
    if not candidate or not candidate.get("date"):
        return existing
    old_source = existing.get("date_source") or ("persisted" if existing.get("date") else "first_seen")
    new_source = candidate.get("date_source") or "list"
    old_rank = DATE_SOURCE_RANK.get(old_source, DATE_SOURCE_RANK["persisted"])
    new_rank = DATE_SOURCE_RANK.get(new_source, DATE_SOURCE_RANK["list"])
    if not existing.get("date") or new_rank > old_rank:
        existing["date"] = candidate["date"]
        existing["date_source"] = new_source
    return existing


def merge_title(existing: dict, candidate_title: str, authoritative: bool = False) -> None:
    """Keep clean persisted titles; only authoritative clean detail titles repair damage."""
    old = existing.get("title", "")
    if not candidate_title:
        return
    if is_mojibake(candidate_title) and not is_mojibake(old):
        return
    if authoritative and not is_mojibake(candidate_title):
        existing["title"] = candidate_title
    elif not old:
        existing["title"] = candidate_title


def merge_collected_item(collected: dict, item: dict) -> None:
    """Merge one list-page candidate using the real source URL rank."""
    prev = collected.get(item["id"])
    if prev is None:
        collected[item["id"]] = item
    elif _category_rank(item.get("_source_url", "")) < _category_rank(prev.get("_source_url", "")):
        choose_date(item, prev)
        collected[item["id"]] = item
    else:
        choose_date(prev, item)
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


def _fmt_valid_date(y: int, mo: int, d: int) -> str:
    """組出日期字串;無效、或晚於台灣時間「明天」的一律回空字串。

    發佈日期不可能在未來——頁面上晚於明天的日期必然是活動/報名日期,
    不能當成公告日期(留一天餘裕吸收時區與預先排版)。
    """
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        return ""
    s = f"{y:04d}-{mo:02d}-{d:02d}"
    tomorrow = (datetime.now(TW_TZ) + timedelta(days=1)).strftime("%Y-%m-%d")
    return "" if s > tomorrow else s


def parse_date_near(node) -> str:
    """從連結節點往上找最近容器內的日期字串(未來日期視為活動日期,略過)。"""
    cur = node
    for _ in range(4):
        if cur is None:
            break
        m = DATE_RE.search(cur.get_text(" ", strip=True) or "")
        if m:
            s = _fmt_valid_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            if s:
                return s
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
            "date_source": "list" if date else "",
            # 文章網址裡的 ,rXXX 分類編號,供覆蓋率哨兵比對用
            "cat_ref": m.group(2) or "",
            "source_category": src_cat if "403-" in source_url else "",
            "_source_url": source_url,
        })
    return items


def list_page_urls(school: dict) -> list:
    """list_pages 的項目可為網址字串或 {"url", "tier"} 物件,一律取出網址。"""
    return [p if isinstance(p, str) else p["url"]
            for p in school.get("list_pages", [])]


def page_entries(school: dict) -> list:
    """回傳 [(網址, tier)]。tier 僅 hot / cold,未標示者為 cold。"""
    out = []
    for p in school.get("list_pages", []):
        if isinstance(p, str):
            out.append((p, "cold"))
        else:
            out.append((p["url"], p.get("tier", "cold")))
    return out


def _hours_since(iso: str) -> float:
    """距離 ISO 時間戳的小時數;無法解析(含空字串)視為無限久。"""
    try:
        then = datetime.fromisoformat(iso)
        return (datetime.now(TW_TZ) - then).total_seconds() / 3600
    except (TypeError, ValueError):
        return float("inf")


def should_fetch(url: str, tier: str, fetch_state: dict,
                 fetch_all: bool = False, cold_hours: float = 20) -> bool:
    """來源分級:hot 每輪都抓;cold 距上次成功抓取超過 cold_hours 才抓。

    fetch_all(手動觸發 workflow)時一律全抓。時間紀錄以成功抓取為準,
    失敗不更新,下一輪自然重試。
    """
    if tier == "hot" or fetch_all:
        return True
    return _hours_since(fetch_state.get(url, "")) >= cold_hours


def list_page_with_number(url: str, page_no: int) -> str:
    """把 /p/403-{unit}-{cat}-1.php 換成第 page_no 頁的網址。"""
    return re.sub(r"-1\.php$", f"-{page_no}.php", url)


def deep_stop_reason(page_items, known_ids: set) -> str:
    """深度爬取是否應停止翻頁。

    - 無公告:到底了。
    - 整頁重複:頁碼超出範圍時 RulingDigital 可能回傳同一頁,靠這條跳出。
    - 早於截止日:整頁最新的日期都早於 DEEP_CRAWL_CUTOFF(該頁仍會被收錄,
      只是不再往後翻);整頁都沒日期時無從判斷,繼續翻。
    """
    if not page_items:
        return "無公告"
    if all(it["id"] in known_ids for it in page_items):
        return "整頁重複"
    dates = [it["date"] for it in page_items if it.get("date")]
    if dates and max(dates) < DEEP_CRAWL_CUTOFF:
        return "早於截止日"
    return ""


def split_recent(items, cutoff: str):
    """依 display_date 把項目分成近期(>= cutoff)與封存兩份,順序不變。"""
    recent = [it for it in items if display_date(it) >= cutoff]
    archived = [it for it in items if display_date(it) < cutoff]
    return recent, archived


def validate_snapshot_items(items, label="snapshot", allow_empty=False):
    """Fail closed before a generated snapshot can discard or corrupt history."""
    if not isinstance(items, list) or (not items and not allow_empty):
        raise RuntimeError(f"{label}: empty or invalid items")
    ids = [it.get("id") for it in items if isinstance(it, dict)]
    if len(ids) != len(items) or any(not isinstance(i, str) or not i for i in ids):
        raise RuntimeError(f"{label}: invalid Stable ID")
    if len(set(ids)) != len(ids):
        raise RuntimeError(f"{label}: duplicate Stable ID")
    if any(is_mojibake(it.get("title", "")) for it in items):
        raise RuntimeError(f"{label}: corrupted title candidate")
    return set(ids)


def atomic_write_text(path: Path, text: str) -> None:
    """Replace a generated file atomically after validation has completed."""
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def validate_history_capacity(items, max_items: int) -> None:
    """Reject a cap that would silently erase any historical Stable ID."""
    validate_snapshot_items(items, "merged corpus")
    if len(items) > max_items:
        raise RuntimeError(
            f"max_items={max_items} would discard {len(items) - max_items} historical announcements"
        )


def configured_categories(school: dict) -> set:
    """該校 config 裡已納入的 403 分類編號。"""
    ids = set()
    for url in list_page_urls(school):
        m = re.search(r"/p/403-%s-(\d+)-\d+\.php" % re.escape(school["unit"]), url)
        if m:
            ids.add(m.group(1))
    return ids


def coverage_gaps(items, configured: set, ignore=()) -> list:
    """找出「文章屬於某分類,但該分類的列表頁不在 config」的缺口。

    這是防止未來漏抓的哨兵:學校新增分類、或把公告移到沒收錄的分類時,
    首頁掃描仍會看到那則文章,其 ,rXXX 編號就會在這裡浮出來。
    """
    ignore = {str(i) for i in ignore}
    gaps = {}
    for it in items:
        ref = it.get("cat_ref") or ""
        if not ref or ref in configured or ref in ignore:
            continue
        gap = gaps.setdefault(ref, {"cat_ref": ref, "school": it.get("school", ""),
                                    "count": 0, "example_title": "",
                                    "example_url": ""})
        gap["count"] += 1
        if not gap["example_title"]:
            gap["example_title"] = it.get("title", "")
            gap["example_url"] = it.get("url", "")
    return sorted(gaps.values(), key=lambda g: (-g["count"], g["cat_ref"]))


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
        return text[:1000]
    except Exception:
        return ""


def extract_article_title(html: str) -> str:
    """Read a clean title only from authoritative article-page markup."""
    try:
        soup = BeautifulSoup(html, "html.parser")
        node = soup.find("meta", attrs={"property": "og:title"})
        title = node.get("content", "") if node else ""
        if not title:
            node = soup.find("h1")
            title = node.get_text(" ", strip=True) if node else ""
        return re.sub(r"\s+", " ", title).strip()
    except Exception:
        return ""


def extract_article_date_result(html: str) -> dict:
    """Return an article date with evidence, never promoting body dates."""
    try:
        soup = BeautifulSoup(html, "html.parser")
        matches = [PUB_DATE_RE.search(soup.get_text(" ", strip=True) or "")]
        node = soup.find(class_=re.compile("mdate"))
        if node is not None:
            matches.append((DATE_RE.search(node.get_text(" ", strip=True) or ""), "article_meta"))
        for index, m in enumerate(matches):
            if isinstance(m, tuple):
                m, source = m
            else:
                source = "publication" if index == 0 else "article_meta"
            if m:
                s = _fmt_valid_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                if s:
                    return {"date": s, "date_source": source}
        return {"date": "", "date_source": ""}
    except Exception:
        return {"date": "", "date_source": ""}


def extract_article_date(html: str) -> str:
    """Compatibility wrapper returning only the validated date."""
    return extract_article_date_result(html).get("date", "")


def decode_response(response) -> str:
    """Decode HTTP bytes using the scraper's validated requests fallback."""
    response.encoding = response.apparent_encoding or "utf-8"
    return response.text


def fetch(session: requests.Session, url: str) -> str:
    resp = session.get(url, timeout=CONFIG["timeout_sec"])
    resp.raise_for_status()
    return decode_response(resp)


def load_existing_items(data_path: Path, archive_path: Path) -> dict:
    """讀回既有資料(封存 + 近期)合併成 by_id;檔案缺失或壞損視為空。

    兩個檔都必須讀:若只讀 announcements.json,封存項目不會進 by_id,
    輸出時就從資料集中永久消失,而仍掛在分類頁第一頁的舊公告則會被
    誤判為「新公告」重新推播(2026-08-13 實際發生過)。
    """
    by_id = {}
    for p in (archive_path, data_path):  # data_path 較新,後讀覆蓋同 id
        if not p.exists():
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        for it in data.get("items", []):
            by_id[it["id"]] = it
    return by_id


def main() -> int:
    data_path = ROOT / CONFIG["data_path"]
    archive_path = ROOT / CONFIG.get("archive_path", "docs/data/archive.json")
    new_items_path = ROOT / CONFIG["new_items_path"]
    delay = CONFIG["request_delay_sec"]

    by_id = load_existing_items(data_path, archive_path)
    known_ids = set(by_id)

    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9"})

    now_iso = datetime.now(TW_TZ).isoformat(timespec="seconds")
    all_new = []
    fetched_this_run = set()
    all_gaps = []

    # 來源分級:cold 頁的上次抓取時間記在 fetch_state.json(由 Actions 一起提交)
    fetch_all = bool(os.environ.get("FETCH_ALL", "").strip())
    cold_hours = CONFIG.get("cold_interval_hours", 20)
    state_path = ROOT / CONFIG.get("fetch_state_path", "scraper/fetch_state.json")
    fetch_state = {}
    if state_path.exists():
        try:
            fetch_state = json.loads(state_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    if fetch_all:
        print("[info] 手動觸發:忽略分級,抓取全部來源")
    deep_crawl = bool(os.environ.get("DEEP_CRAWL", "").strip())
    if deep_crawl:
        fetch_all = True
        print(f"[info] 深度回補模式:每個分類最多翻 {DEEP_CRAWL_MAX_PAGES} 頁,"
              f"截止日 {DEEP_CRAWL_CUTOFF};忽略分級抓取全部來源")

    for school in CONFIG["schools"]:
        collected = {}
        scan_pages = list(school.get("scan_pages", []))
        entries = [(u, "hot") for u in scan_pages] + page_entries(school)
        scanned_items = []
        skipped_cold = 0
        for page_url, tier in entries:
            if not should_fetch(page_url, tier, fetch_state, fetch_all, cold_hours):
                skipped_cold += 1
                continue
            try:
                html = fetch(session, page_url)
            except Exception as e:
                print(f"[warn] 略過 {page_url}: {e}", file=sys.stderr)
                time.sleep(delay)
                continue
            fetch_state[page_url] = now_iso
            page_items = extract_items(html, school, page_url)
            if page_url in scan_pages:
                scanned_items += page_items
            for it in page_items:
                # 同一篇文章可能出現在多個來源頁；以 config/url 推導的
                # 穩定 rank 選 canonical source，與 traversal 順序無關。
                merge_collected_item(collected, it)
            time.sleep(delay)

            # 深度回補:對 403 分類頁繼續抓第 2、3…頁
            if deep_crawl and "/p/403-" in page_url:
                for page_no in range(2, DEEP_CRAWL_MAX_PAGES + 1):
                    deep_url = list_page_with_number(page_url, page_no)
                    try:
                        deep_html = fetch(session, deep_url)
                    except Exception as e:
                        print(f"[warn] 深度頁略過 {deep_url}: {e}", file=sys.stderr)
                        time.sleep(delay)
                        break
                    time.sleep(delay)
                    deep_items = extract_items(deep_html, school, deep_url)
                    reason = deep_stop_reason(deep_items, set(collected))
                    if reason in ("無公告", "整頁重複"):
                        break
                    for it in deep_items:
                        collected.setdefault(it["id"], it)
                    if reason == "早於截止日":
                        break

        new_for_school = [it for iid, it in collected.items() if iid not in known_ids]
        new_for_school.sort(key=lambda x: x.get("date") or "", reverse=True)

        # 只對「新」項目補抓內文摘要,並設上限;順便從文章頁補回缺漏的日期
        cap = CONFIG["fetch_content_max_per_school"]
        snippet_targets = new_for_school[:cap]
        if deep_crawl:
            # 回補的舊公告若沒日期,會被誤排成「今天」,一律補抓文章頁取得日期
            snippet_targets = snippet_targets + [
                it for it in new_for_school[cap:] if not it.get("date")]
        for it in snippet_targets:
            try:
                html = fetch(session, it["url"])
                detail_title = extract_article_title(html)
                if detail_title and not is_mojibake(detail_title):
                    it["title"] = detail_title
                it["snippet"] = extract_article_snippet(html, it["title"])
                if not it["snippet"]:
                    it["snippet_tried"] = True
                article_date = extract_article_date_result(html)
                choose_date(it, article_date)
                if not it.get("date"):
                    if not article_date.get("date"):
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
                merge_title(old, it.get("title", ""))
                if not old.get("source_category") and it.get("source_category"):
                    old["source_category"] = it["source_category"]
                choose_date(old, it)
                old["category"] = classify(old["title"] + " " + old.get("source_category", ""))
            else:
                it["category"] = classify(base_text)
                it["first_seen"] = now_iso
                it.setdefault("snippet", "")
                by_id[it["id"]] = it
                all_new.append(it)

        # 覆蓋率哨兵:首頁出現的文章,其分類若不在 config 就記下來
        gaps = coverage_gaps(scanned_items, configured_categories(school),
                             CONFIG.get("coverage_ignore", {}).get(school["id"], []))
        for g in gaps:
            g["school_name"] = school["short"]
            g["list_page"] = (f'{school["base"]}/p/403-{school["unit"]}'
                              f'-{g["cat_ref"]}-1.php')
            print(f"[warn] 覆蓋率缺口 {school['short']} 分類 r{g['cat_ref']}:"
                  f"首頁有 {g['count']} 則未收錄,例:{g['example_title'][:30]} "
                  f"→ 可加入 {g['list_page']}", file=sys.stderr)
        all_gaps += gaps

        print(f"[info] {school['short']}: 抓取 {len(entries) - skipped_cold}/{len(entries)} 頁"
              f"(略過 cold {skipped_cold} 頁),共 {len(collected)} 筆,"
              f"其中新項目 {len(new_for_school)} 筆")

    # 逐步補齊舊資料:每次最多挑幾筆缺日期或缺摘要的既有項目,抓文章頁補齊。
    # 排程改成每小時後,補齊只在少數班次執行,避免每小時都多打幾十個請求。
    backfill_cap = CONFIG.get("backfill_max_per_run", 10)
    backfill_hours = set(CONFIG.get("backfill_hours", [7, 11, 15, 19]))
    run_backfill = fetch_all or datetime.now(TW_TZ).hour in backfill_hours

    def needs_date(it):
        return not it.get("date") and not it.get("date_tried")

    def needs_snippet(it):
        return not it.get("snippet") and not it.get("snippet_tried")

    def needs_title(it):
        return is_mojibake(it.get("title", ""))

    if not run_backfill:
        print(f"[info] 本輪不執行補齊(補齊班次:台灣時間 {sorted(backfill_hours)} 點)")
    pending = [it for it in by_id.values()
               if it["id"] not in fetched_this_run
               and (needs_date(it) or needs_snippet(it) or needs_title(it))] if run_backfill else []
    pending.sort(key=lambda x: x.get("first_seen") or "", reverse=True)
    filled_dates = filled_snippets = 0
    repaired_titles = 0
    for it in pending[:backfill_cap]:
        try:
            html = fetch(session, it["url"])
        except Exception as e:
            print(f"[warn] 補抓失敗 {it['url']}: {e}", file=sys.stderr)
            time.sleep(delay)
            continue
        if needs_date(it):
            date_result = extract_article_date_result(html)
            if date_result.get("date"):
                choose_date(it, date_result)
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
        if needs_title(it):
            detail_title = extract_article_title(html)
            before = it.get("title", "")
            merge_title(it, detail_title, authoritative=True)
            if it.get("title", "") != before:
                repaired_titles += 1
        time.sleep(delay)
    if pending:
        done = min(len(pending), backfill_cap)
        print(f"[info] 補齊:本次處理 {done} 筆,補日期 {filled_dates} 筆、"
              f"補摘要 {filled_snippets} 筆、修復標題 {repaired_titles} 筆,"
              f"剩餘 {len(pending) - done} 筆待補")

    items = list(by_id.values())
    items.sort(key=lambda x: (display_date(x), x.get("first_seen") or ""),
               reverse=True)
    all_ids_before_cap = validate_snapshot_items(items, "merged corpus")
    validate_history_capacity(items, CONFIG["max_items"])
    for it in items:
        it.pop("_source_url", None)

    # 資料分層:近一年的放 announcements.json(開站即載),其餘放 archive.json
    # (前端搜尋時才背景載入),兩檔合起來仍是完整資料。
    hot_cutoff = (datetime.now(TW_TZ)
                  - timedelta(days=CONFIG.get("hot_days", 365))).strftime("%Y-%m-%d")
    recent, archived = split_recent(items, hot_cutoff)
    recent_ids = validate_snapshot_items(recent, "recent snapshot") if recent else set()
    archived_ids = validate_snapshot_items(archived, "archive snapshot", allow_empty=True)
    if recent_ids | archived_ids != all_ids_before_cap:
        raise RuntimeError("recent/archive partition would lose announcement IDs")

    out = {
        "generated_at": now_iso,
        "schools": [{"id": s["id"], "name": s["name"], "short": s["short"], "base": s["base"]}
                    for s in CONFIG["schools"]],
        "categories": [c for c, _ in CATEGORY_RULES] + ["一般"],
        "category_slugs": CATEGORY_SLUGS,
        "items": recent,
    }
    data_path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(data_path, json.dumps(out, ensure_ascii=False, indent=1))

    atomic_write_text(archive_path, json.dumps(
        {"generated_at": now_iso, "hot_cutoff": hot_cutoff, "items": archived},
        ensure_ascii=False, indent=1))

    all_new.sort(key=lambda x: x.get("date") or "", reverse=True)
    new_items_path.write_text(json.dumps(all_new, ensure_ascii=False, indent=1),
                              encoding="utf-8")

    # 注意:這裡刻意不寫入時間戳。這個檔案由 Actions 一起提交,
    # 若每輪內容都變動,就會每天產生 4 個沒有實質差異的 commit。
    gaps_path = ROOT / CONFIG.get("coverage_gaps_path", "scraper/coverage_gaps.json")
    gaps_path.write_text(json.dumps(
        {"note": "首頁出現、但所屬分類的列表頁不在 config 的公告。"
                 "把 list_page 加進 config.json 即可收錄;"
                 "確定不要的分類請加進 config.json 的 coverage_ignore。"
                 "檢查時間見本檔的 git 提交紀錄。",
         "gaps": all_gaps}, ensure_ascii=False, indent=1), encoding="utf-8")
    if all_gaps:
        print(f"[warn] 發現 {len(all_gaps)} 個未收錄分類,詳見 {gaps_path}",
              file=sys.stderr)

    state_path.write_text(json.dumps(fetch_state, ensure_ascii=False, indent=1),
                          encoding="utf-8")

    print(f"[info] 輸出 {len(recent)} 筆近期 + {len(archived)} 筆封存"
          f"(共 {len(items)} 筆,新增 {len(all_new)} 筆)→ {data_path.parent}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
