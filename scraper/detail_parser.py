"""Deterministic article-detail and attachment normalization.

The parser returns structured blocks instead of raw HTML. It intentionally
does not promote arbitrary body dates to publication dates or deadlines.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import urljoin

from bs4 import BeautifulSoup


NOISE_SELECTORS = [
    "script", "style", "nav", "header", "footer", "form",
    ".mnav", ".mfooter", ".share", ".social", ".breadcrumb",
    ".site-header", ".site-footer", ".cookie", ".tracking",
]
BODY_SELECTORS = ["div.mpgdetail", "div.meditor", "div#Dyn_2_2", "article"]
EXTENSION_TYPES = {
    ".pdf": "application/pdf", ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def _text(node) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def _body(soup: BeautifulSoup):
    for selector in NOISE_SELECTORS:
        for node in soup.select(selector):
            node.decompose()
    candidates = []
    for selector in BODY_SELECTORS:
        candidates.extend(soup.select(selector))
    if not candidates:
        candidates = sorted(soup.find_all("div"), key=lambda n: len(_text(n)), reverse=True)[:1]
    return candidates[0] if candidates else None


def _link(node, source_url: str) -> dict:
    href = urljoin(source_url, node.get("href", "").strip())
    return {"text": _text(node) or href, "url": href} if href else {"text": _text(node), "url": ""}


def _attachments(body, source_url: str, announcement_id: str) -> list[dict]:
    result = []
    seen = set()
    for anchor in body.select("a[href]"):
        url = urljoin(source_url, anchor.get("href", "").strip())
        if not url or url in seen:
            continue
        lower = url.split("?", 1)[0].lower()
        ext = "." + lower.rsplit(".", 1)[-1] if "." in lower.rsplit("/", 1)[-1] else ""
        text = _text(anchor)
        looks_like_file = ext in EXTENSION_TYPES or any(token in lower for token in ("download", "attachment", "file"))
        if not looks_like_file:
            continue
        seen.add(url)
        filename = text or lower.rsplit("/", 1)[-1] or "官方附件"
        result.append({
            "filename": filename,
            "url": url,
            "extension": ext,
            "mime_type": EXTENSION_TYPES.get(ext, ""),
            "size": None,
            "announcement_id": announcement_id,
            "provenance": "official_attachment",
            "parse_status": "unparsed",
        })
    return result


def _blocks(body, source_url: str) -> list[dict]:
    blocks = []
    for node in body.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "table"], recursive=True):
        if node.find_parent(["ul", "ol", "table"]) is not None and node.name in {"p", "ul", "ol", "table"}:
            continue
        if node.name.startswith("h"):
            text = _text(node)
            if text:
                blocks.append({"type": "heading", "level": int(node.name[1]), "text": text})
        elif node.name == "p":
            text = _text(node)
            links = [_link(a, source_url) for a in node.select("a[href]")]
            if text:
                blocks.append({"type": "paragraph", "text": text, "links": links})
        elif node.name in {"ul", "ol"}:
            items = [_text(li) for li in node.find_all("li", recursive=False) if _text(li)]
            if items:
                blocks.append({"type": "list", "ordered": node.name == "ol", "items": items})
        elif node.name == "table":
            rows = []
            for tr in node.select("tr"):
                cells = [_text(cell) for cell in tr.find_all(["th", "td"], recursive=False)]
                if cells:
                    rows.append(cells)
            if rows:
                blocks.append({"type": "table", "rows": rows})
    if not blocks:
        text = _text(body)
        if text:
            blocks.append({"type": "paragraph", "text": text, "links": []})
    return blocks


def parse_article_detail(html: str, *, announcement_id: str, school_id: str,
                         title: str, source_url: str, fetched_at: str | None = None) -> dict:
    raw_hash = hashlib.sha256(html.encode("utf-8", errors="replace")).hexdigest()
    fetched = fetched_at or datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        soup = BeautifulSoup(html, "html.parser")
        body = _body(soup)
        if body is None:
            return {"announcement_id": announcement_id, "school_id": school_id, "title": title,
                    "source_url": source_url, "blocks": [], "attachments": [],
                    "source_hash": raw_hash, "parser_version": "detail-v1",
                    "fetched_at": fetched, "parse_status": "empty",
                    "provenance": "official_article"}
        return {
            "announcement_id": announcement_id,
            "school_id": school_id,
            "title": title,
            "source_url": source_url,
            "blocks": _blocks(body, source_url),
            "attachments": _attachments(body, source_url, announcement_id),
            "source_hash": raw_hash,
            "parser_version": "detail-v1",
            "fetched_at": fetched,
            "parse_status": "parsed" if _text(body) else "empty",
            "provenance": "official_article",
            "verified_dates": [],
        }
    except Exception as exc:
        return {"announcement_id": announcement_id, "school_id": school_id, "title": title,
                "source_url": source_url, "blocks": [], "attachments": [],
                "source_hash": raw_hash, "parser_version": "detail-v1",
                "fetched_at": fetched, "parse_status": "failed",
                "parse_error_class": type(exc).__name__, "provenance": "official_article"}

