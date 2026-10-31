# -*- coding: utf-8 -*-
"""Collect a school's public, non-announcement pages for 問校務.

Rules, regulations, office pages, contact numbers and PDFs such as 學生請假要點
live on the school's menu pages (RulingDigital ``/p/412-{unit}-{id}.php``), not
in the announcement lists. This module walks those menu pages slowly and keeps:

* a public index (``docs/data/school-info/<school>.json``): menu path, official
  link and attachment names only, never page text;
* protected detail records (``docs/data/details/<school>/info-<id>.json``) in the
  same format as announcement details, so the existing member-content sync and
  public projection handle them without new rules.

Each run fetches at most ``SCHOOL_INFO_PAGE_CAP`` pages (new pages first, then
pages not checked for ``REFRESH_DAYS``), so a semester change is picked up within
weeks while the school server only sees a handful of requests per run.

Excluded: login pages, staff-only sections (人事、主計、資安), photo albums, exam
papers, honour rolls and any page that looks like a list of people.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from html import unescape
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parent.parent
INDEX_ROOT = ROOT / "docs" / "data" / "school-info"
TW_TZ = timezone(timedelta(hours=8))
SCHEMA_VERSION = 1
REFRESH_DAYS = 30
MAX_PAGES = 600

SCHOOLS = {
    "cysh": {
        "name": "國立嘉義高中",
        "short": "嘉中",
        "origin": "https://www.cysh.cy.edu.tw",
        "unit": "1008",
        # Menu roots from the site navigation (網站導覽). Children are discovered.
        "roots": [86, 94, 97, 184, 194, 195, 196, 199, 206, 117, 132, 151, 3951],
    },
    "cygsh": {
        "name": "國立嘉義女中",
        "short": "嘉女",
        "origin": "https://www.cygsh.cy.edu.tw",
        "unit": "1013",
        # 認識嘉女、行政單位、教學單位、學校夥伴、招生資訊、升學資訊、新生專區、處室分機.
        "roots": [1592, 1591, 1674, 1675, 1727, 3258, 2082, 1752],
    },
}

# Sections that are for staff, contain people or are not text information.
EXCLUDED_PATH = re.compile(
    r"人事室|主計室|教師會|網路管理|資通安全|資安|校務基金|請購|榮譽榜|榜單|剪影|相簿|照片|影音|"
    r"歷屆試題|試題|考古題|名單|錄取|得獎|美術比賽|作品集|教師專區|教職員|會議紀錄"
)
# Pages that only embed an announcement list: announcements are collected elsewhere.
NEWS_TITLE = re.compile(r"^(?:最新消息|公告事項|公告訊息|訊息公告|重要訊息|活動訊息|校園焦點|資安訊息)$")
LOGIN = re.compile(r'type=["\']password["\']|請先登入|登入後(?:才|方)可', re.I)
# 「101 王小明」「三年五班 陳大文」: many class+name pairs mean a list of people.
PERSON_ROW = re.compile(r"(?:\b[1-3]\d{2}\b|[一二三]年[一二三四五六七八九十]+班)\s*([一-鿿]{2,3})(?=\s|、|，|$)")
# Office names next to a number are a phone list, not people.
NOT_A_NAME = re.compile(r"[處室組科館心會部校班隊社]$")
PATH_MODULE = re.compile(r'module-path.*?</ol>', re.S)
TAG = re.compile(r"<[^>]+>")


_TAXONOMY_TERMS: list[str] | None = None


def taxonomy_terms() -> list[str]:
    """Search vocabulary shared with the site (docs/search-taxonomy.js)."""
    global _TAXONOMY_TERMS
    if _TAXONOMY_TERMS is None:
        source = (ROOT / "docs" / "search-taxonomy.js").read_text(encoding="utf-8")
        data = json.loads(re.search(r"var taxonomy = (\{.*\});\n", source).group(1))
        terms = [t for row in data.get("topics", []) + data.get("actions", []) for t in row.get("terms", [])]
        _TAXONOMY_TERMS = sorted(set(terms), key=lambda t: (-len(t), t))
    return _TAXONOMY_TERMS


def index_keywords(text: str, limit: int = 40) -> list[str]:
    """Index words found in a page (public). Only vocabulary words, never sentences."""
    compact = re.sub(r"\s+", "", text or "")
    counts = [(compact.count(term), term) for term in taxonomy_terms() if term in compact]
    counts.sort(key=lambda row: (-row[0], row[1]))
    return [term for _, term in counts[:limit]]


def now_iso() -> str:
    return datetime.now(TW_TZ).isoformat(timespec="seconds")


def page_url(school: dict, page_id: int) -> str:
    return f"{school['origin']}/p/412-{school['unit']}-{page_id}.php"


def page_id_of(school: dict, url: str) -> int | None:
    match = re.search(rf"/p/412-{school['unit']}-(\d+)\.php", url)
    if not match:
        return None
    parts = urlsplit(url)
    if parts.netloc and parts.netloc != urlsplit(school["origin"]).netloc:
        return None
    return int(match.group(1))


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", unescape(TAG.sub(" ", fragment))).strip()


def menu_path(html: str) -> list[str]:
    """Breadcrumb without 首頁, e.g. ['行政單位', '學務處', '生輔組']."""
    block = PATH_MODULE.search(html)
    if not block:
        return []
    names = [_text(item) for item in re.findall(r"<a[^>]*>(.*?)</a>", block.group(0), re.S)]
    return [name for name in names if name and name not in ("首頁", ":::")][:8]


DOC_HOST = re.compile(r"^https://(?:drive|docs)\.google\.com/")


def doc_links(html: str, base_url: str) -> list[dict]:
    """Rules some schools keep on Google Drive: 「學籍管理辦法」 etc. Names and links only."""
    out, seen = [], set()
    body = html[html.find("module-path"):] if "module-path" in html else html
    for href, label in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', body, re.S):
        url = urljoin(base_url, unescape(href).strip())
        name = _text(label)
        if DOC_HOST.match(url) and name and len(name) >= 4 and url not in seen and not EXCLUDED_PATH.search(name):
            seen.add(url)
            out.append({"name": name[:60], "url": url})
    return out[:20]


BLOCK_END = re.compile(r"<br\s*/?>|</(?:p|div|li|tr|h[1-6]|section|article|td|th)>", re.I)


def page_text_lines(html: str) -> list[str]:
    """Visible text of the page body, one line per block. Used when a school page is built
    from custom <div> layouts that the announcement parser does not read."""
    start = html.find('class="mpgdetail"')
    if start == -1:
        return []
    start = html.find(">", start) + 1
    end = html.find(":::", start)
    body = html[start:end if end != -1 else start + 200000]
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", body, flags=re.S | re.I)
    body = BLOCK_END.sub("\n", body)
    text = unescape(TAG.sub(" ", body))
    lines = [re.sub(r"[ \t\u00a0\u200b]+", " ", line).strip() for line in text.split("\n")]
    return [line for line in lines if line][:2000]


def child_pages(school: dict, html: str, base_url: str) -> list[int]:
    out = []
    for href in re.findall(r'href="([^"]+)"', html):
        pid = page_id_of(school, urljoin(base_url, unescape(href)))
        if pid is not None and pid not in out:
            out.append(pid)
    return out


def classify_page(path: list[str], html: str, body_text: str) -> str:
    """Return 'ok' or the reason the page is left out."""
    joined = " ".join(path)
    if LOGIN.search(html):
        return "login"
    if EXCLUDED_PATH.search(joined):
        return "excluded_section"
    # A staff member's own introduction page (name, e-mail, 教育理念).
    if path and re.search(r"(?:主任|組長|秘書|校長介紹)$", path[-1]):
        return "staff_profile"
    if path and NEWS_TITLE.match(path[-1]):
        return "announcement_list"
    names = [name for name in PERSON_ROW.findall(body_text) if not NOT_A_NAME.search(name)]
    if len(names) >= 5:
        return "personal_data"
    return "ok"


def load_index(school_id: str) -> dict:
    path = INDEX_ROOT / f"{school_id}.json"
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("schema_version") == SCHEMA_VERSION:
                return data
        except (OSError, ValueError):
            pass
    return {"schema_version": SCHEMA_VERSION, "school": school_id, "pages": {}}


def pick_pages(index: dict, school: dict, cap: int, now: datetime) -> list[int]:
    pages = index["pages"]
    for root in school["roots"]:
        pages.setdefault(str(root), {"page_id": root, "status": "pending"})
    stale_before = (now - timedelta(days=REFRESH_DAYS)).isoformat(timespec="seconds")
    pending = [int(k) for k, v in pages.items() if v.get("status") == "pending"]
    retry_before = (now - timedelta(days=1)).isoformat(timespec="seconds")
    stale = sorted((v.get("checked_at") or "", int(k)) for k, v in pages.items()
                   if v.get("status") != "pending" and ((v.get("checked_at") or "") < stale_before or
                   (v.get("attachments_pending") and (v.get("checked_at") or "") < retry_before)))
    pending.sort(key=lambda pid: (pid not in school["roots"], pid))
    return (pending + [pid for _, pid in stale])[:cap]


def public_item(school_id: str, school: dict, entry: dict) -> dict:
    """Announcement-shaped public metadata that 問校務 can rank by title."""
    path = entry.get("path") or []
    title = " › ".join(path[-3:]) if path else entry.get("title", "")
    item = {
        "id": f"{school_id}-info-{entry['page_id']}",
        "kind": "school_info",
        "title": title,
        "school": school_id,
        "school_name": school["short"],
        "url": page_url(school, entry["page_id"]),
        "category": "校園資訊",
        # Menu pages carry no publication date; the check time is not one.
        "date": "",
        "updated_at": (entry.get("changed_at") or "")[:10],
        "attachment_names": ([a["name"] for a in entry.get("attachments", [])] +
                             [d["name"] for d in entry.get("doc_links", [])])[:30],
        "keywords": list(entry.get("keywords") or [])[:40],
        # Official documents on this page (school PDFs and Google Drive links): names and links only.
        "documents": ([{"name": a["name"], "url": a["url"]} for a in entry.get("attachments", []) if a.get("url")] +
                      list(entry.get("doc_links") or []))[:30],
    }
    for key in ("detail_ref", "detail_revision", "detail_status"):
        if entry.get(key):
            item[key] = entry[key]
    return item


def write_public(school_id: str, school: dict, index: dict) -> Path:
    items = [public_item(school_id, school, v) for _, v in sorted(index["pages"].items(), key=lambda kv: int(kv[0]))
             if v.get("status") == "ok"]
    items += list((index.get("handbook") or {}).get("items") or [])
    import school_services
    items += school_services.public_items(school_id, school["short"], (index.get("services") or {}).get("systems") or [])
    out = {
        "schema_version": SCHEMA_VERSION,
        "school": school_id,
        "generated_at": now_iso(),
        "content_access": "approved-account-required",
        "pages": index["pages"],
        "handbook": index.get("handbook") or {},
        "services": index.get("services") or {},
        "items": items,
    }
    INDEX_ROOT.mkdir(parents=True, exist_ok=True)
    target = INDEX_ROOT / f"{school_id}.json"
    target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return target


def process_page(school_id: str, school: dict, index: dict, page_id: int, html: str,
                 *, session=None, attachment_budget=None, delay: float = 1.5) -> dict:
    """Update one index entry from a fetched page and write its protected detail."""
    import scrape  # heavy import; only needed when pages are processed

    pages = index["pages"]
    entry = pages.setdefault(str(page_id), {"page_id": page_id})
    entry["checked_at"] = now_iso()
    path = menu_path(html)
    entry["path"] = path
    record_url = page_url(school, page_id)
    for child in child_pages(school, html, record_url):
        if len(pages) >= MAX_PAGES:
            break
        pages.setdefault(str(child), {"page_id": child, "status": "pending"})
    item = {"id": f"{school_id}-info-{page_id}", "school": school_id,
            "title": " › ".join(path[-3:]) or f"頁面 {page_id}", "url": record_url, "date": ""}
    from detail_parser import parse_article_detail
    preview = parse_article_detail(html, announcement_id=item["id"], school_id=school_id,
                                   title=item["title"], source_url=record_url)
    body_text = " ".join(str(b.get("text") or " ".join(" ".join(r) for r in b.get("rows") or []))
                         for b in preview.get("blocks", []))
    status = classify_page(path, html, body_text)
    entry["status"] = status
    if status != "ok":
        for key in ("detail_ref", "detail_revision", "detail_status", "attachments"):
            entry.pop(key, None)
        return entry
    record = scrape.write_detail_record(item, html, entry["checked_at"], session=session,
                                        attachment_budget=attachment_budget, request_delay_sec=delay)
    # Custom-layout pages: the parser saw far less text than the page shows.
    lines = page_text_lines(html)
    visible = sum(len(line) for line in lines)
    if visible > 2 * len(body_text) + 120:
        record["blocks"] = [{"type": "paragraph", "text": line} for line in lines]
        record["parse_status"] = "parsed"
        body_text = "\n".join(lines)
        target = ROOT / "docs" / item["detail_ref"]
        target.write_text(json.dumps(record, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        item["detail_status"] = "parsed"
    new_revision = record.get("source_hash", "")
    if entry.get("content_hash") != hashlib.sha256(body_text.encode("utf-8")).hexdigest():
        entry["changed_at"] = entry["checked_at"]
        entry["content_hash"] = hashlib.sha256(body_text.encode("utf-8")).hexdigest()
    entry["doc_links"] = doc_links(html, record_url)
    entry["keywords"] = index_keywords(body_text + " " + " ".join(link["name"] for link in entry["doc_links"]) + " " + " ".join(
        str(a.get("embedded_text") or "") for a in record.get("attachments", [])))
    unread = [a for a in record.get("attachments", []) if str(a.get("extension") or "").lower().lstrip(".") in ("pdf", "docx")
              and a.get("parse_status") not in ("parsed", "unsupported", "unparsed", "needs_ocr")]
    entry["attachments_pending"] = bool(unread)
    entry["detail_ref"] = item["detail_ref"]
    entry["detail_revision"] = new_revision
    entry["detail_status"] = item["detail_status"]
    entry["attachments"] = [{"name": str(a.get("filename") or a.get("label") or "附件")[:80],
                             "url": a.get("url", "")}
                            for a in record.get("attachments", []) if a.get("url")][:20]
    return entry


def discover(school_id: str = "cysh", cap: int | None = None) -> dict:
    import requests
    import scrape

    school = SCHOOLS[school_id]
    cap = cap if cap is not None else int(os.environ.get("SCHOOL_INFO_PAGE_CAP", "8"))
    index = load_index(school_id)
    todo = pick_pages(index, school, max(0, cap), datetime.now(TW_TZ))
    session = requests.Session()
    session.headers.update({"User-Agent": scrape.UA, "Accept-Language": "zh-TW,zh;q=0.9"})
    budget = {"remaining": min(4, max(0, int(os.environ.get("SCHOOL_INFO_PDF_CAP", "2"))))}
    delay = float(scrape.CONFIG.get("request_delay_sec", 1.5))
    config_school = next((s for s in scrape.CONFIG["schools"] if s["id"] == school_id), None)
    summary = {"fetched": 0, "failed": 0, "gone": 0}
    for page_id in todo:
        url = page_url(school, page_id)
        try:
            html = scrape.fetch(session, url, config_school)
        except Exception as exc:  # network trouble: try again next run
            status = scrape.http_status(exc) if hasattr(scrape, "http_status") else None
            entry = index["pages"].setdefault(str(page_id), {"page_id": page_id})
            if status in (404, 410):
                entry.update(status="gone", checked_at=now_iso())
                summary["gone"] += 1
            else:
                summary["failed"] += 1
            print(f"[warn] 校園資訊 {url}: {exc}", file=sys.stderr)
            time.sleep(delay)
            continue
        process_page(school_id, school, index, page_id, html, session=session,
                     attachment_budget=budget, delay=delay)
        summary["fetched"] += 1
        time.sleep(delay)
    try:
        import school_handbook
        status = school_handbook.update(index, school_id, school["short"], session,
                                        lambda sess, url: scrape.fetch(sess, url, config_school),
                                        delay=delay, now=datetime.now(TW_TZ))
        print(f"[info] 學生手冊 {school_id}: {status}")
    except Exception as exc:  # keep the previous chapters; try again next run
        print(f"[warn] 學生手冊 {school_id}: {exc}", file=sys.stderr)
    try:
        import school_services
        status = school_services.update(index, school_id, session,
                                        lambda sess, url: scrape.fetch(sess, url, config_school),
                                        delay=delay, now=datetime.now(TW_TZ))
        print(f"[info] 網路服務入口 {school_id}: {status}")
    except Exception as exc:
        print(f"[warn] 網路服務入口 {school_id}: {exc}", file=sys.stderr)
    write_public(school_id, school, index)
    ok = sum(1 for v in index["pages"].values() if v.get("status") == "ok")
    pending = sum(1 for v in index["pages"].values() if v.get("status") == "pending")
    print(f"[info] 校園資訊 {school_id}: 本次 {summary['fetched']} 頁，收錄 {ok} 頁，待抓 {pending} 頁")
    return summary


def build_from_cache(school_id: str, cache_dir: str) -> dict:
    """Seed the index from pages saved by a one-time survey (no network)."""
    school = SCHOOLS[school_id]
    index = load_index(school_id)
    for name in sorted(os.listdir(cache_dir)):
        match = re.fullmatch(r"(\d+)\.html", name)
        if not match:
            continue
        html = Path(cache_dir, name).read_text(encoding="utf-8")
        process_page(school_id, school, index, int(match.group(1)), html)
    write_public(school_id, school, index)
    return index


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "discover"
    if command == "discover":
        for school_id in SCHOOLS:
            try:
                discover(school_id)
            except Exception as exc:  # never block the hourly announcement update
                print(f"[warn] 校園資訊 {school_id} 更新失敗: {exc}", file=sys.stderr)
    elif command == "seed" and len(sys.argv) > 3:
        build_from_cache(sys.argv[2], sys.argv[3])
    else:
        sys.exit("usage: school_info.py discover | seed <school-id> <cache-dir>")
