# -*- coding: utf-8 -*-
"""Student rules kept as separate files, for schools without one 學生手冊 PDF.

嘉女 publishes each rule on its own (請假規定、服裝儀容規定、學生獎懲規定、在校作息時間
相關規定…), linked from the 學務處／教務處 pages, mostly as Google Drive files. 問校務 looks
for rules first, so each rule file becomes one chapter in the same shape as the 嘉中
handbook chapters (school_handbook.py):

* public metadata in the school-info index (rule name, official link);
* a protected detail record with the rule text (member-only, synced by the existing
  member-content pipeline and removed from public output).

The links come from pages already collected by school_info.py; nothing new is crawled.
Each file is downloaded again only every ``CHECK_DAYS`` or when its link changes.
"""
from __future__ import annotations

import hashlib
import re
import sys
import time
from datetime import datetime, timedelta
from urllib.parse import urlsplit

from school_handbook import index_keywords, now_iso, normalize_radicals, write_details

CHECK_DAYS = 30
MAX_FILES_PER_RUN = 40
MAX_BYTES = 12 * 1024 * 1024
MAX_CHARS = 100_000

RULES = {
    "cygsh": {
        # Pages whose links are rules for students (not 教職員, 會議紀錄 or forms).
        "pages": re.compile(r"學務處|教務處|生活輔導|註冊組|教學組|訓育組|衛生組|體育組|圖書館|輔導室|新生"),
        "origin": "https://www.cygsh.cy.edu.tw",
    },
}

RULE_NAME = re.compile(r"規定|辦法|要點|規範|須知|守則|公約|章程|細則|準則|原則|注意事項|實施計畫|管理")
NOT_RULE = re.compile(r"報名表|申請表|表單|會議紀錄|記錄表|名單|簡報|海報|範例|範本|徵稿|成果|"
                      r"教師|教職員|職員|工友|約用|人事|職業衛生|操作手冊|資料夾|行事曆")
DRIVE_FILE = re.compile(r"^https://drive\.google\.com/(?:file/d/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{20,})")
DOCS_FILE = re.compile(r"^https://docs\.google\.com/(document|spreadsheets|presentation)/d/([\w-]{20,})")


def download_url(url: str, origin: str) -> tuple[str, str] | None:
    """(direct download URL, expected extension) for a rule link, or None (folders, other sites)."""
    url = url.strip()
    if url.startswith("//"):
        url = "https:" + url
    match = DRIVE_FILE.match(url)
    if match:
        return f"https://drive.google.com/uc?export=download&id={match.group(1)}", ""
    match = DOCS_FILE.match(url)
    if match:
        kind, doc_id = match.groups()
        if kind == "document":
            return f"https://docs.google.com/document/d/{doc_id}/export?format=docx", "docx"
        return None
    parts = urlsplit(url)
    if f"{parts.scheme}://{parts.netloc}" == origin and re.search(r"\.(pdf|docx)$", parts.path, re.I):
        return url, parts.path.rsplit(".", 1)[-1].lower()
    return None


def candidates(index: dict, school_id: str) -> list[dict]:
    """Rule links found on the school's collected pages, one per file."""
    config = RULES.get(school_id)
    if not config:
        return []
    out, seen = [], set()
    pages = sorted(index.get("pages", {}).values(), key=lambda entry: int(entry.get("page_id") or 0))
    for entry in pages:
        path = " › ".join(entry.get("path") or [])
        if entry.get("status") != "ok" or not config["pages"].search(path):
            continue
        for link in list(entry.get("doc_links") or []) + list(entry.get("attachments") or []):
            name = re.sub(r"\s+", " ", str(link.get("name") or "")).strip()
            name = re.sub(r"\s*[（(](?:PDF|pdf|另開新視窗|Google Drive)[)）]\s*$", "", name).strip()
            name = re.sub(r"\.(?:pdf|docx?|odt)$", "", name, flags=re.I).strip()
            if len(name) < 4 or not RULE_NAME.search(name) or NOT_RULE.search(name):
                continue
            target = download_url(str(link.get("url") or ""), config["origin"])
            if not target or target[0] in seen:
                continue
            seen.add(target[0])
            # 「本校補充規定」「申請須知」 say nothing alone: add the page they sit on.
            if re.match(r"^(?:本校|校內)?(?:補充)?(?:規定|辦法|要點|須知|注意事項|申請須知)$", name.replace("本校補充", "補充")):
                section = re.sub(r"[○●★☆]+", "", (entry.get("path") or [""])[-1]).strip()
                if section and section not in name:
                    name = f"{section}{name}"
            out.append({"name": name, "url": str(link["url"]).strip(), "download": target[0],
                        "extension": target[1], "page": path})
    return out


def detect_extension(data: bytes, hint: str, content_type: str = "") -> str:
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"PK"):
        return "docx"
    return hint or ("pdf" if "pdf" in content_type else "")


def fetch_file(session, url: str) -> tuple[bytes, str]:
    response = session.get(url, timeout=60, allow_redirects=True)
    response.raise_for_status()
    data = response.content
    content_type = response.headers.get("content-type", "")
    # Large Drive files answer with a "can't scan for viruses" page first; follow its confirm link.
    if b"<html" in data[:2000].lower() and b"confirm=" in data:
        match = re.search(rb'href="(/uc\?export=download[^"]+confirm=[^"]+)"', data) or \
            re.search(rb'action="([^"]+)"', data)
        if match:
            follow = match.group(1).decode("utf-8", "replace").replace("&amp;", "&")
            if follow.startswith("/"):
                follow = "https://drive.google.com" + follow
            response = session.get(follow, timeout=60)
            response.raise_for_status()
            data, content_type = response.content, response.headers.get("content-type", "")
    if len(data) > MAX_BYTES:
        raise ValueError("too_large")
    return data, content_type


def rule_text(data: bytes, extension: str) -> tuple[str, str]:
    """(text, status) using the shared attachment parser, with local OCR for scanned PDFs."""
    from attachment_parser import extract_embedded_text

    result = extract_embedded_text(data, extension, max_chars=MAX_CHARS, enable_ocr=True)
    text = normalize_radicals(str(result.get("text") or "")).strip()
    return text, str(result.get("parse_status") or ("parsed" if text else "unparsed"))


def records_for(school_id: str, short: str, doc: dict, text: str, published: str = "") -> tuple[dict, dict]:
    digest = hashlib.sha1(doc["url"].encode("utf-8")).hexdigest()[:10]
    item_id = f"{school_id}-rule-{digest}"
    source_hash = hashlib.sha256((doc["name"] + "\n" + text).encode("utf-8")).hexdigest()
    title = f"學生規定 › {doc['name']}"
    detail = {
        "announcement_id": item_id,
        "school_id": school_id,
        "title": title,
        "source_url": doc["url"],
        "blocks": [],
        "attachments": [{
            "provenance": "official_attachment",
            "filename": doc["name"],
            "url": doc["url"],
            "extension": doc.get("extension") or "pdf",
            "parse_status": "parsed",
            "embedded_text": text,
            "text_length": len(text),
            "evidence_confidence": "high",
        }],
        "source_hash": source_hash,
        "parser_version": "rules-v1",
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
        "url": doc["url"],
        "category": "校園資訊",
        "date": published,
        "source_page": doc.get("page", ""),
        "keywords": index_keywords(doc["name"] + " " + text),
        "detail_ref": f"data/details/{school_id}/{item_id}.json",
        "detail_revision": source_hash,
        "detail_status": "parsed",
    }
    return item, detail


def update(index: dict, school_id: str, short: str, session, *, delay: float, now: datetime,
           force: bool = False, limit: int = MAX_FILES_PER_RUN) -> str:
    """Refresh ``index['rules']``. Returns a short status line."""
    if school_id not in RULES:
        return "unsupported"
    state = index.setdefault("rules", {})
    files = state.setdefault("files", {})
    docs = candidates(index, school_id)
    wanted = {doc["download"] for doc in docs}
    for key in list(files):
        if key not in wanted:
            del files[key]  # the school took the link down
    stale = (now - timedelta(days=CHECK_DAYS)).isoformat(timespec="seconds")
    todo = [doc for doc in docs if force or (files.get(doc["download"]) or {}).get("checked_at", "") < stale][:limit]
    counts = {"parsed": 0, "empty": 0, "failed": 0}
    for doc in todo:
        entry = files.setdefault(doc["download"], {})
        entry.update(name=doc["name"], url=doc["url"], page=doc["page"])
        try:
            data, content_type = fetch_file(session, doc["download"])
            extension = detect_extension(data, doc["extension"], content_type)
            if extension not in ("pdf", "docx"):
                raise ValueError("not_a_document")
            text, status = rule_text(data, extension)
        except Exception as exc:  # keep the previous text; try again next time
            entry["error"] = str(exc)[:120]
            counts["failed"] += 1
            print(f"[warn] 學生規定 {school_id} {doc['name']}: {exc}", file=sys.stderr)
            time.sleep(delay)
            continue
        entry.pop("error", None)
        entry["checked_at"] = now.isoformat(timespec="seconds")  # a failed download is retried next run
        if len(text) < 40:
            entry.update(status=status if status != "parsed" else "empty", item=None)
            counts["empty"] += 1
        else:
            item, detail = records_for(school_id, short, dict(doc, extension=extension), text)
            write_details(school_id, [(item, detail)])
            entry.update(status="parsed", item=item, chars=len(text))
            counts["parsed"] += 1
        time.sleep(delay)
    state["checked_at"] = now.isoformat(timespec="seconds")
    state["items"] = [entry["item"] for entry in files.values() if entry.get("item")]
    return (f"{len(docs)} 份規定，本次讀 {len(todo)} 份：成功 {counts['parsed']}、無文字 {counts['empty']}、"
            f"失敗 {counts['failed']}；目前收錄 {len(state['items'])} 份")
