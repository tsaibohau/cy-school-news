# -*- coding: utf-8 -*-
"""Split the official student handbook PDF into chapters for 問校務.

嘉中 publishes one 「學生手冊完整版」 PDF (130+ pages) each school year. It holds
the rules students ask about: 請假、獎懲、服儀、作息時間、圖書館借書、自修室、
補考… One 134-page attachment is too large for the normal attachment pipeline
and ranks badly as a single document, so each chapter becomes its own entry:

* public metadata in the school-info index (chapter title, official link);
* a protected detail record with that chapter's text (member-only, synced by the
  existing member-content pipeline and removed from public output).

The handbook list is checked every ``CHECK_DAYS``; the PDF is downloaded again
only when the article or file name changes (a new school year or a revision).
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from html import unescape
from pathlib import Path
from urllib.parse import urljoin

TW_TZ = timezone(timedelta(hours=8))
CHECK_DAYS = 14
MAX_PDF_BYTES = 12 * 1024 * 1024
MAX_PAGES = 220
MAX_CHAPTER_CHARS = 100_000
ROOT = Path(__file__).resolve().parent.parent
DETAIL_ROOT = ROOT / "docs" / "data" / "details"

HANDBOOKS = {
    "cysh": {
        "list_url": "https://www.cysh.cy.edu.tw/p/403-1008-1125-1.php",
        "origin": "https://www.cysh.cy.edu.tw",
        "unit": "1008",
    },
}

TOC_LINE = re.compile(r"^\s*(?P<title>\S.*?\S)\s*(?:[.．…‧·]{2,}\s*|\s+)(?P<page>\d{1,3})\s*$")
SCHOOL_PREFIX = re.compile(r"^(?:國立嘉義高級中等學校|國立嘉義高級中學|國立嘉義高中|嘉義高中)\s*")


def index_keywords(text: str) -> list[str]:
    from school_info import index_keywords as shared

    return shared(text)


def now_iso() -> str:
    return datetime.now(TW_TZ).isoformat(timespec="seconds")


def clean_title(title: str) -> str:
    title = re.sub(r"\s+", " ", title).strip(" 「」")
    title = SCHOOL_PREFIX.sub("", title).strip()
    return title.replace("「", "").replace("」", "") or "學生手冊"


def latest_handbook(list_html: str, list_url: str, unit: str) -> dict | None:
    """Newest 「學生手冊」 article on the handbook list page."""
    pattern = re.compile(rf'<a[^>]+href="([^"]*406-{unit}-(\d+),r\d+\.php[^"]*)"[^>]*>(.*?)</a>', re.S)
    best = None
    for href, art_id, label in pattern.findall(list_html):
        text = re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", label))).strip()
        if "學生手冊" not in text:
            continue
        candidate = {"article_id": int(art_id), "title": text, "url": urljoin(list_url, unescape(href)).split("?")[0]}
        if best is None or candidate["article_id"] > best["article_id"]:
            best = candidate
    return best


def handbook_attachment(article_html: str, article_url: str) -> dict | None:
    match = re.search(r'<a[^>]+href="([^"]*(?:Action=downloadfile|/var/file/)[^"]*)"[^>]*>(.*?)</a>', article_html, re.S)
    if not match:
        return None
    name = re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", match.group(2)))).strip()
    if not re.search(r"\.pdf$", name, re.I) and "pdf" not in match.group(1).lower():
        return None
    published = re.search(r"發[佈布]日期\s*[:：]\s*(?:<[^>]+>\s*)*(20\d{2}-\d{2}-\d{2})", article_html)
    return {"name": name, "url": urljoin(article_url, unescape(match.group(1))),
            "published": published.group(1) if published else ""}


def table_of_contents(pages: list[str]) -> list[dict]:
    """Chapter titles and printed page numbers from the first pages."""
    rows, seen = [], set()
    for text in pages[:8]:
        if "目錄" not in text and not rows:
            continue
        for line in text.splitlines():
            match = TOC_LINE.match(line)
            if not match:
                continue
            title = re.sub(r"[.．…‧·]+$", "", match.group("title")).strip()
            page = int(match.group("page"))
            if len(title) < 4 or title in seen or re.fullmatch(r"[\d\s]+", title):
                continue
            seen.add(title)
            rows.append({"title": title, "page": page})
    rows = [row for row in rows if 0 < row["page"] < len(pages)]
    # Page numbers must increase; drop stray lines that break the order.
    ordered = []
    for row in rows:
        if not ordered or row["page"] >= ordered[-1]["page"]:
            ordered.append(row)
    return ordered


def _compact(text: str) -> str:
    return re.sub(r"\s+", "", text)


def _start_index(pages: list[str], title: str, printed: int) -> int:
    """PDF page index where a chapter starts: near the printed number, title on the page."""
    key = _compact(clean_title(title))[:10]
    for offset in (0, 1, -1, 2, -2, 3):
        index = printed + offset
        if 0 <= index < len(pages) and key and key in _compact(pages[index])[:400]:
            return index
    return min(max(printed, 0), len(pages) - 1)


def split_chapters(pages: list[str]) -> list[dict]:
    toc = table_of_contents(pages)
    starts = [(_start_index(pages, row["title"], row["page"]), row["title"]) for row in toc]
    chapters = []
    for number, (start, title) in enumerate(starts):
        end = starts[number + 1][0] if number + 1 < len(starts) else len(pages)
        end = max(end, start + 1)
        body = "\n".join(re.sub(r"^\s*\d{1,3}\s*\n", "", pages[i]).strip() for i in range(start, end))
        body = re.sub(r"[ \t]+\n", "\n", body)
        body = re.sub(r"\n{3,}", "\n\n", body).strip()[:MAX_CHAPTER_CHARS]
        if len(body) < 40:
            continue
        chapters.append({"number": number + 1, "title": clean_title(title), "first_page": start + 1,
                         "last_page": end, "text": body})
    return chapters


# Radicals-supplement characters have no NFKC mapping; these appear in school PDFs.
RADICAL_MAP = {"⻑": "長", "⻝": "食", "⻘": "青", "⻄": "西", "⻩": "黃", "⺠": "民", "⻣": "骨", "⻔": "門"}


def normalize_radicals(text: str) -> str:
    """Map only look-alike blocks (CJK radicals U+2E80–U+2FDF, compatibility ideographs
    U+F900–U+FAFF), so 「，」「：」 stay full-width."""
    return "".join(RADICAL_MAP.get(ch) or (unicodedata.normalize("NFKC", ch)
                   if 0x2E80 <= ord(ch) <= 0x2FDF or 0xF900 <= ord(ch) <= 0xFAFF else ch) for ch in text)


def pdf_pages(data: bytes) -> list[str]:
    from pypdf import PdfReader

    if not data.startswith(b"%PDF-") or len(data) > MAX_PDF_BYTES:
        raise ValueError("invalid_pdf")
    reader = PdfReader(io.BytesIO(data))
    if len(reader.pages) > MAX_PAGES:
        raise ValueError("too_many_pages")
    return [normalize_radicals(page.extract_text() or "") for page in reader.pages]


def chapter_records(school_id: str, short: str, handbook: dict, attachment: dict,
                    chapters: list[dict]) -> list[tuple[dict, dict]]:
    """(public item, protected detail) for each chapter."""
    year = re.search(r"(1\d{2})\s*學年度", handbook["title"])
    tag = year.group(1) if year else str(handbook["article_id"])
    out = []
    for chapter in chapters:
        item_id = f"{school_id}-handbook-{tag}-{chapter['number']:02d}"
        source_hash = hashlib.sha256((attachment["name"] + "\n" + chapter["text"]).encode("utf-8")).hexdigest()
        title = f"學生手冊 › {chapter['title']}"
        detail = {
            "announcement_id": item_id,
            "school_id": school_id,
            "title": title,
            "source_url": handbook["url"],
            "blocks": [],
            "attachments": [{
                "provenance": "official_attachment",
                "filename": attachment["name"],
                "url": attachment["url"],
                "extension": "pdf",
                "parse_status": "parsed",
                "embedded_text": chapter["text"],
                "text_length": len(chapter["text"]),
                "page_range": [chapter["first_page"], chapter["last_page"]],
                "evidence_confidence": "high",
            }],
            "source_hash": source_hash,
            "parser_version": "handbook-v1",
            "fetched_at": now_iso(),
            "parse_status": "parsed",
            "provenance": "official_article",
        }
        item = {
            "id": item_id,
            "kind": "school_handbook",
            "title": title,
            "school": school_id,
            "school_name": short,
            "url": handbook["url"],
            "category": "校園資訊",
            "date": attachment.get("published") or "",
            "page_range": [chapter["first_page"], chapter["last_page"]],
            "keywords": index_keywords(chapter["title"] + " " + chapter["text"]),
            "detail_ref": f"data/details/{school_id}/{item_id}.json",
            "detail_revision": source_hash,
            "detail_status": "parsed",
        }
        out.append((item, detail))
    return out


def write_details(school_id: str, records: list[tuple[dict, dict]]) -> None:
    target = DETAIL_ROOT / school_id
    target.mkdir(parents=True, exist_ok=True)
    for item, detail in records:
        (target / f"{item['id']}.json").write_text(json.dumps(detail, ensure_ascii=False, indent=1) + "\n",
                                                  encoding="utf-8")


def update(index: dict, school_id: str, short: str, session, fetch, *, delay: float, now: datetime,
           force: bool = False) -> str:
    """Refresh the handbook chapters stored in ``index['handbook']``. Returns a status word."""
    import time

    config = HANDBOOKS.get(school_id)
    if not config:
        return "unsupported"
    state = index.setdefault("handbook", {})
    checked = state.get("checked_at") or ""
    if not force and checked and checked > (now - timedelta(days=CHECK_DAYS)).isoformat(timespec="seconds"):
        return "fresh"
    state["checked_at"] = now.isoformat(timespec="seconds")
    handbook = latest_handbook(fetch(session, config["list_url"]), config["list_url"], config["unit"])
    time.sleep(delay)
    if not handbook:
        return "not_found"
    article_html = fetch(session, handbook["url"])
    time.sleep(delay)
    attachment = handbook_attachment(article_html, handbook["url"])
    if not attachment:
        return "no_attachment"
    revision = f"{handbook['article_id']}:{attachment['name']}"
    if not force and state.get("revision") == revision and state.get("items"):
        return "unchanged"
    response = session.get(attachment["url"], timeout=60)
    response.raise_for_status()
    pages = pdf_pages(response.content)
    records = chapter_records(school_id, short, handbook, attachment, split_chapters(pages))
    if not records:
        return "no_chapters"
    write_details(school_id, records)
    state.update(revision=revision, title=handbook["title"], url=handbook["url"],
                 file=attachment["name"], published=attachment.get("published", ""),
                 items=[item for item, _ in records])
    return "updated"


def update_from_files(index: dict, school_id: str, short: str, list_html: str, article_html: str,
                      pdf_bytes: bytes) -> str:
    """Same as ``update`` from already downloaded files (tests, one-time seeding)."""
    config = HANDBOOKS[school_id]
    handbook = latest_handbook(list_html, config["list_url"], config["unit"])
    attachment = handbook_attachment(article_html, handbook["url"]) if handbook else None
    if not attachment:
        return "not_found"
    records = chapter_records(school_id, short, handbook, attachment, split_chapters(pdf_pages(pdf_bytes)))
    write_details(school_id, records)
    index.setdefault("handbook", {}).update(
        checked_at=now_iso(), revision=f"{handbook['article_id']}:{attachment['name']}", title=handbook["title"],
        url=handbook["url"], file=attachment["name"], published=attachment.get("published", ""),
        items=[item for item, _ in records])
    return "updated"
