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
import tempfile
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

# A title is considered damaged only when there is positive evidence of a
# decoding problem.  Plain ASCII/English is deliberately not rejected.
MOJIBAKE_MARKER_RE = re.compile(
    r"(?:[ÃÂâð][\x80-\xBF]|(?:[æåçèé][\x80-\xBF]){2,})"
)
CONTROL_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]")

DATE_SOURCE_RANK = {
    "": 0,
    "first_seen": 1,
    "list": 2,
    "persisted": 3,
    "publication": 4,
}

TITLE_SOURCE_RANK = {"": 0, "list": 1, "persisted": 2, "article": 3}

SOURCE_CATEGORY_ALIASES = {
    "考試訊息": "段考考試",
    "考試": "段考考試",
    "升學資訊": "升學",
    "獎助": "獎助學金",
    "活動訊息": "研習活動",
}


class DataIntegrityError(RuntimeError):
    """Raised when a scraper run would replace a valid snapshot with bad data."""


def normalize_title(title: str) -> str:
    """Normalize display whitespace without repairing or guessing characters."""
    return re.sub(r"\s+", " ", title or "").strip()


def title_integrity(title: str) -> int:
    """Return 1 for a title with no deterministic corruption evidence, else 0."""
    title = title or ""
    if not title or "\ufffd" in title or CONTROL_RE.search(title):
        return 0
    return 0 if MOJIBAKE_MARKER_RE.search(title) else 1


def _title_candidate_is_better(candidate: dict, current: dict) -> bool:
    c_title, p_title = candidate.get("title", ""), current.get("title", "")
    c_clean, p_clean = title_integrity(c_title), title_integrity(p_title)
    if c_clean != p_clean:
        return c_clean > p_clean
    c_rank = TITLE_SOURCE_RANK.get(candidate.get("title_source", ""), 0)
    p_rank = TITLE_SOURCE_RANK.get(current.get("title_source", ""), 0)
    if c_rank != p_rank:
        return c_rank > p_rank
    return candidate.get("title", "") < current.get("title", "")


def _category_rank(school: dict, source_url: str) -> int:
    """Return a stable, explainable source priority independent of crawl order."""
    pages = list_page_urls(school)
    normalized = normalize_url(source_url)
    for index, page in enumerate(pages):
        if normalize_url(page) == normalized:
            return index
    match = re.search(r"/p/403-[^-]+-(\d+)-\d+\.php", source_url or "")
    return 100000 + int(match.group(1)) if match else 1000000


def _source_candidate_is_better(candidate: dict, current: dict) -> bool:
    c = candidate.get("source_category", "")
    p = current.get("source_category", "")
    if not c:
        return False
    if not p:
        return True
    cr = candidate.get("source_category_rank", 1000000)
    pr = current.get("source_category_rank", 1000000)
    return (cr, c) < (pr, p)


def _date_source(item: dict, default: str = "") -> str:
    source = item.get("date_source") or default
    if not source and item.get("date"):
        # Old snapshots have no provenance.  Treating their date as persisted
        # is the safe compatibility behavior requested for Phase 1.5.
        return "persisted"
    return source


def _date_candidate_is_better(candidate: dict, current: dict) -> bool:
    c_date, p_date = candidate.get("date", ""), current.get("date", "")
    if not c_date:
        return False
    c_source = _date_source(candidate)
    p_source = _date_source(current)
    cr, pr = DATE_SOURCE_RANK.get(c_source, 0), DATE_SOURCE_RANK.get(p_source, 0)
    if cr != pr:
        return cr > pr
    if c_source == "list" and p_source == "list":
        return c_date > p_date
    return False


def classify(text: str, source_category: str = "") -> str:
    """Classify deterministically, using a confirmed source category first."""
    source_category = (source_category or "").strip()
    source_alias = SOURCE_CATEGORY_ALIASES.get(source_category, source_category)
    if source_alias in CATEGORY_SLUGS and source_alias != "一般":
        return source_alias
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
        title = normalize_title(a.get_text(" ", strip=True))
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
            "source_category_rank": (_category_rank(school, source_url)
                                      if src_cat and "403-" in source_url else 1000000),
            "title_source": "list",
        })
    return items


def merge_item_candidates(candidates: list, existing: dict = None) -> dict:
    """Merge same-ID list candidates without depending on traversal order.

    ``existing`` is optional and is used only as a persisted baseline.  The
    returned records are newly assembled dictionaries so callers can validate
    them before mutating or writing any snapshot.
    """
    merged = {}
    for candidate in candidates:
        if not candidate or not candidate.get("id"):
            continue
        current = merged.get(candidate["id"])
        if current is None:
            merged[candidate["id"]] = dict(candidate)
            continue
        if _title_candidate_is_better(candidate, current):
            current["title"] = candidate.get("title", "")
            current["title_source"] = candidate.get("title_source", "list")
        if _source_candidate_is_better(candidate, current):
            current["source_category"] = candidate.get("source_category", "")
            current["source_category_rank"] = candidate.get("source_category_rank", 1000000)
        if _date_candidate_is_better(candidate, current):
            current["date"] = candidate.get("date", "")
            current["date_source"] = candidate.get("date_source", "list")

    if existing:
        for item_id, old in existing.items():
            if item_id in merged:
                merged[item_id] = merge_item_record(old, merged[item_id])
    return merged


def merge_item_record(old: dict, candidate: dict) -> dict:
    """Merge a current candidate into persisted data using provenance ranks."""
    result = dict(old)
    old_title = {"title": result.get("title", ""),
                 "title_source": result.get("title_source", "persisted")}
    new_title = {"title": candidate.get("title", ""),
                 "title_source": candidate.get("title_source", "list")}
    if _title_candidate_is_better(new_title, old_title):
        result["title"] = new_title["title"]
        result["title_source"] = new_title["title_source"]
    elif "title_source" not in result and result.get("title"):
        result["title_source"] = "persisted"

    old_source = {"source_category": result.get("source_category", ""),
                  "source_category_rank": result.get("source_category_rank", 1000000)}
    if _source_candidate_is_better(candidate, old_source):
        result["source_category"] = candidate["source_category"]
        result["source_category_rank"] = candidate.get("source_category_rank", 1000000)

    old_date = {"date": result.get("date", ""),
                "date_source": _date_source(result)}
    if _date_candidate_is_better(candidate, old_date):
        result["date"] = candidate["date"]
        result["date_source"] = _date_source(candidate)
    elif result.get("date") and "date_source" not in result:
        result["date_source"] = "persisted"
    return result


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
    """Extract a title only from explicit article-title metadata/elements."""
    try:
        soup = BeautifulSoup(html, "html.parser")
        candidates = []
        meta = soup.find("meta", attrs={"property": "og:title"})
        if meta and meta.get("content"):
            candidates.append(meta["content"])
        for selector in ("h1", ".mpgtitle", ".mtitle"):
            node = soup.select_one(selector)
            if node:
                candidates.append(node.get_text(" ", strip=True))
        for value in candidates:
            value = normalize_title(value)
            if value and value.lower() not in {"test", "home", "首頁"}:
                return value
    except Exception:
        pass
    return ""


def extract_labeled_publication_date(text: str) -> str:
    """Extract only an explicitly labelled publication date from persisted text."""
    m = PUB_DATE_RE.search(text or "")
    if not m:
        return ""
    return _fmt_valid_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))


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
                s = _fmt_valid_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                if s:
                    return s
        return ""
    except Exception:
        return ""


def decode_response(response) -> str:
    """Decode response bytes using a validated HTTP charset declaration."""
    content_type = response.headers.get("Content-Type", "")
    match = re.search(r"charset\s*=\s*[\"']?([\w.-]+)", content_type, re.I)
    candidates = []
    if match:
        candidates.append(match.group(1).lower())
    candidates.extend(["utf-8", "big5", "cp950", "gb18030"])
    seen = set()
    for encoding in candidates:
        if encoding in seen:
            continue
        seen.add(encoding)
        try:
            decoded = response.content.decode(encoding, errors="strict")
        except (LookupError, UnicodeDecodeError):
            continue
        if "\ufffd" not in decoded:
            return decoded
    return response.content.decode("utf-8", errors="replace")


def fetch(session: requests.Session, url: str) -> str:
    resp = session.get(url, timeout=CONFIG["timeout_sec"])
    resp.raise_for_status()
    return decode_response(resp)


def validate_snapshot_items(items: list, previous_ids: set, max_items: int):
    """Fail closed before a snapshot can lose IDs or become malformed."""
    if not isinstance(items, list) or not items:
        raise DataIntegrityError("拒絕寫入空公告快照")
    ids = [it.get("id") for it in items if isinstance(it, dict)]
    if len(ids) != len(items) or any(not item_id for item_id in ids):
        raise DataIntegrityError("拒絕寫入含無效公告 ID 的快照")
    if len(set(ids)) != len(ids):
        raise DataIntegrityError("拒絕寫入含重複 Stable ID 的快照")
    if len(items) > max_items:
        raise DataIntegrityError(
            f"公告總數 {len(items)} 超過 max_items={max_items}，為避免靜默遺失歷史資料而中止")
    missing = set(previous_ids) - set(ids)
    if missing:
        raise DataIntegrityError(
            f"公告快照將遺失 {len(missing)} 個既有 Stable ID，拒絕覆寫")


def validate_split_items(recent: list, archived: list, previous_ids: set,
                         max_items: int):
    all_items = list(recent) + list(archived)
    validate_snapshot_items(all_items, previous_ids, max_items)


def atomic_write_json(path: Path, payload):
    """Write a validated JSON payload without exposing a partial file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp",
                                     dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=1)
            handle.write("\n")
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


def load_existing_items(data_path: Path, archive_path: Path) -> dict:
    """讀回既有資料(封存 + 近期)合併成 by_id;壞損檔案直接 fail closed。

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
        except Exception as exc:
            raise DataIntegrityError(f"既有資料檔無法解析，拒絕覆寫: {p}: {exc}") from exc
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            raise DataIntegrityError(f"既有資料檔結構無效，拒絕覆寫: {p}")
        for it in data["items"]:
            if not isinstance(it, dict) or not it.get("id"):
                raise DataIntegrityError(f"既有資料檔含無效公告，拒絕覆寫: {p}")
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
        candidate_lists = {}
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
                candidate_lists.setdefault(it["id"], []).append(it)
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
                    reason = deep_stop_reason(deep_items, set(candidate_lists))
                    if reason in ("無公告", "整頁重複"):
                        break
                    for it in deep_items:
                        candidate_lists.setdefault(it["id"], []).append(it)
                    if reason == "早於截止日":
                        break

        collected = merge_item_candidates(
            [it for candidates in candidate_lists.values() for it in candidates])
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
                article_title = extract_article_title(html)
                if article_title and title_integrity(article_title):
                    it["title"] = article_title
                    it["title_source"] = "article"
                it["snippet"] = extract_article_snippet(html, it["title"])
                if not it["snippet"]:
                    it["snippet_tried"] = True
                article_date = extract_article_date(html)
                if article_date:
                    it["date"] = article_date
                    it["date_source"] = "publication"
                elif not it.get("date"):
                    it["date_tried"] = True
                fetched_this_run.add(it["id"])
            except Exception as e:
                print(f"[warn] 內文抓取失敗 {it['url']}: {e}", file=sys.stderr)
                it["snippet"] = ""
            time.sleep(delay)

        for it in collected.values():
            if it["id"] in known_ids:
                old = by_id[it["id"]]
                published = extract_labeled_publication_date(old.get("snippet", ""))
                if published:
                    it = dict(it)
                    it["date"] = published
                    it["date_source"] = "publication"
                merged = merge_item_record(old, it)
                if it.get("snippet") and not old.get("snippet"):
                    merged["snippet"] = it["snippet"]
                merged["category"] = classify(
                    merged.get("title", "") + " " + merged.get("source_category", ""),
                    merged.get("source_category", ""))
                by_id[it["id"]] = merged
            else:
                it["category"] = classify(
                    it["title"] + " " + it.get("source_category", ""),
                    it.get("source_category", ""))
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

    if not run_backfill:
        print(f"[info] 本輪不執行補齊(補齊班次:台灣時間 {sorted(backfill_hours)} 點)")
    pending = [it for it in by_id.values()
               if it["id"] not in fetched_this_run
               and (needs_date(it) or needs_snippet(it))] if run_backfill else []
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
    validate_snapshot_items(items, known_ids, CONFIG["max_items"])

    # 資料分層:近一年的放 announcements.json(開站即載),其餘放 archive.json
    # (前端搜尋時才背景載入),兩檔合起來仍是完整資料。
    hot_cutoff = (datetime.now(TW_TZ)
                  - timedelta(days=CONFIG.get("hot_days", 365))).strftime("%Y-%m-%d")
    recent, archived = split_recent(items, hot_cutoff)

    out = {
        "generated_at": now_iso,
        "schools": [{"id": s["id"], "name": s["name"], "short": s["short"], "base": s["base"]}
                    for s in CONFIG["schools"]],
        "categories": [c for c, _ in CATEGORY_RULES] + ["一般"],
        "category_slugs": CATEGORY_SLUGS,
        "items": recent,
    }
    archive_out = {"generated_at": now_iso, "hot_cutoff": hot_cutoff,
                   "items": archived}
    validate_split_items(recent, archived, known_ids, CONFIG["max_items"])
    atomic_write_json(data_path, out)
    atomic_write_json(archive_path, archive_out)

    all_new.sort(key=lambda x: x.get("date") or "", reverse=True)
    atomic_write_json(new_items_path, all_new)

    # 注意:這裡刻意不寫入時間戳。這個檔案由 Actions 一起提交,
    # 若每輪內容都變動,就會每天產生 4 個沒有實質差異的 commit。
    gaps_path = ROOT / CONFIG.get("coverage_gaps_path", "scraper/coverage_gaps.json")
    atomic_write_json(gaps_path, {
        "note": "首頁出現、但所屬分類的列表頁不在 config 的公告。"
                "把 list_page 加進 config.json 即可收錄;"
                "確定不要的分類請加進 config.json 的 coverage_ignore。"
                "檢查時間見本檔的 git 提交紀錄。",
        "gaps": all_gaps})
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
