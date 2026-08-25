"""Deterministic article-detail and attachment normalization.

The parser returns structured blocks instead of raw HTML. It intentionally
does not promote arbitrary body dates to publication dates or deadlines.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import parse_qs, unquote, urljoin, urlparse

from bs4 import BeautifulSoup


NOISE_SELECTORS = [
    "script", "style", "nav", "header", "footer", "form",
    ".mnav", ".mfooter", ".share", ".social", ".breadcrumb",
    ".site-header", ".site-footer", ".cookie", ".tracking",
]
BODY_SELECTORS = ["div.mpgdetail", "div.meditor", "div#Dyn_2_2", "article"]
ATTACHMENT_SELECTORS = ["ul.mptattach", ".mattachment", ".mfile"]
EXTENSION_TYPES = {
    ".pdf": "application/pdf", ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp",
}
FULL_DATE = re.compile(
    r"(?:(?P<roc>1\d{2})\s*[年./-]\s*|(?P<gregorian>20\d{2})\s*[年./-]\s*)"
    r"(?P<month>\d{1,2})\s*[月./-]\s*(?P<day>\d{1,2})\s*日?"
)
PUBLICATION_LABELS = ("發布日期", "發佈日期", "刊登日期", "最後更新日期", "公告日期")
DEADLINE_LABELS = ("截止", "期限", "報名", "申請", "繳交", "繳費")
EVENT_LABELS = ("活動日期", "辦理日期", "舉行日期", "比賽日期", "測驗日期", "報到日期")


def _text(node) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def _safe_https_url(value: str, source_url: str) -> str:
    resolved = urljoin(source_url, str(value or "").strip())
    parsed = urlparse(resolved)
    return resolved if parsed.scheme == "https" and bool(parsed.netloc) else ""


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
    href = _safe_https_url(node.get("href", ""), source_url)
    return {"text": _text(node) or href, "url": href} if href else {"text": _text(node), "url": ""}


def _attachments(roots, source_url: str, announcement_id: str) -> list[dict]:
    result = []
    seen = set()
    anchors = []
    for root in roots if isinstance(roots, (list, tuple)) else [roots]:
        anchors.extend(root.select("a[href]"))
    for anchor in anchors:
        url = _safe_https_url(anchor.get("href", ""), source_url)
        if not url or url in seen:
            continue
        parsed = urlparse(url)
        path_filename = unquote(parsed.path.rsplit("/", 1)[-1]).strip()
        query = parse_qs(parsed.query)
        query_filename = ""
        for key in ("filename", "file_name", "file", "name", "download"):
            for value in query.get(key, []):
                candidate = unquote(value).strip().rsplit("/", 1)[-1]
                suffix = "." + candidate.rsplit(".", 1)[-1].lower() if "." in candidate else ""
                if suffix in EXTENSION_TYPES:
                    query_filename = candidate
                    break
            if query_filename:
                break
        text = _text(anchor)
        text_ext = "." + text.rsplit(".", 1)[-1].lower() if "." in text else ""
        file_candidate = query_filename or path_filename
        path_ext = "." + file_candidate.rsplit(".", 1)[-1].lower() if "." in file_candidate else ""
        ext = text_ext if text_ext in EXTENSION_TYPES else path_ext
        lower_url = url.lower()
        looks_like_file = ext in EXTENSION_TYPES or any(token in lower_url for token in ("download", "attachment", "file"))
        if not looks_like_file:
            continue
        seen.add(url)
        generic_labels = {"附件", "下載", "download", "檔案", "開啟", "附件下載"}
        filename = file_candidate if (not text or text.lower() in generic_labels) and file_candidate else text
        filename = (filename or file_candidate or "官方附件")[:300]
        result.append({
            "filename": filename,
            "url": url,
            "extension": ext,
            "mime_type": EXTENSION_TYPES.get(ext, ""),
            "size": None,
            "announcement_id": announcement_id,
            "provenance": "official_attachment",
            "parse_status": "pending",
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
            header_rows = []
            for tr in node.select("tr"):
                cell_nodes = tr.find_all(["th", "td"], recursive=False)
                cells = [_text(cell) for cell in cell_nodes]
                if cells:
                    if cell_nodes and all(cell.name == "th" for cell in cell_nodes):
                        header_rows.append(len(rows))
                    rows.append(cells)
            if rows:
                blocks.append({"type": "table", "rows": rows, "header_rows": header_rows})
    if not blocks:
        text = _text(body)
        if text:
            blocks.append({"type": "paragraph", "text": text, "links": []})
    return blocks


def _explicit_date(match) -> str:
    year = int(match.group("gregorian") or match.group("roc"))
    if match.group("roc"):
        year += 1911
    try:
        return datetime(year, int(match.group("month")), int(match.group("day"))).date().isoformat()
    except ValueError:
        return ""


def _verified_dates(body, *, title: str, source_hash: str) -> list[dict]:
    """Extract only explicitly labelled, full-year deadline/event dates.

    Bare M/D values, publication metadata and arbitrary prose dates fail closed.
    No year inference, OCR or semantic guessing is performed.
    """
    rows = []
    seen = set()
    nodes = body.find_all(["p", "li", "tr", "h2", "h3", "h4"], recursive=True)
    for node in nodes:
        text = _text(node)
        if not text or any(label in text for label in PUBLICATION_LABELS):
            continue
        match = FULL_DATE.search(text)
        if not match:
            continue
        date = _explicit_date(match)
        if not date:
            continue
        kind = None
        provenance = None
        if any(label in text for label in EVENT_LABELS):
            kind, provenance = "event", "verified_announcement_event"
        elif any(label in text for label in DEADLINE_LABELS) and any(marker in text for marker in ("前", "止", "截止", "期限")):
            kind, provenance = "deadline", "verified_announcement_deadline"
        if not kind or (kind, date) in seen:
            continue
        seen.add((kind, date))
        rows.append({
            "kind": kind,
            "date": date,
            "title": title,
            "provenance": provenance,
            "source": "official_article",
            "source_revision": source_hash,
            "verification": "explicit_full_date_with_label",
        })
    return rows


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
                    "source_hash": raw_hash, "parser_version": "detail-v2",
                    "fetched_at": fetched, "parse_status": "empty",
                    "provenance": "official_article"}
        verified_dates = _verified_dates(body, title=title, source_hash=raw_hash)
        attachment_roots = [body] + [node for selector in ATTACHMENT_SELECTORS for node in soup.select(selector)]
        return {
            "announcement_id": announcement_id,
            "school_id": school_id,
            "title": title,
            "source_url": source_url,
            "blocks": _blocks(body, source_url),
            "attachments": _attachments(attachment_roots, source_url, announcement_id),
            "source_hash": raw_hash,
            "parser_version": "detail-v2",
            "fetched_at": fetched,
            "parse_status": "parsed" if _text(body) else "empty",
            "provenance": "official_article",
            "verified_dates": verified_dates,
        }
    except Exception as exc:
        return {"announcement_id": announcement_id, "school_id": school_id, "title": title,
                "source_url": source_url, "blocks": [], "attachments": [],
                "source_hash": raw_hash, "parser_version": "detail-v2",
                "fetched_at": fetched, "parse_status": "permanent_error",
                "parse_error_class": type(exc).__name__, "provenance": "official_article"}

