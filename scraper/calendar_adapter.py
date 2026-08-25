# -*- coding: utf-8 -*-
"""Deterministic PDF/HTML official calendar adapter.

The parser consumes text extracted from official HTML/PDF sources.  It never
uses OCR, an LLM, publication dates, or guessed year promotion.
"""
import hashlib
import io
import re
from datetime import datetime, timezone
from html import unescape
from urllib.parse import urljoin, urlparse

from calendar_schema import normalize_event, validate_events, source_status

ROC = re.compile(r"(?<!\d)(?P<year>1\d{2})\s*[./年-]\s*(?P<month>\d{1,2})\s*[./月-]\s*(?P<day>\d{1,2})")
GREGORIAN = re.compile(r"(?<!\d)(?P<year>20\d{2})\s*[./-]\s*(?P<month>\d{1,2})\s*[./-]\s*(?P<day>\d{1,2})")
MD = re.compile(r"(?<!\d)(?P<month>\d{1,2})\s*/\s*(?P<day>\d{1,2})(?!\d)")
RANGE = re.compile(r"(?P<m1>\d{1,2})\s*/\s*(?P<d1>\d{1,2})\s*[–—~-]\s*(?:(?P<m2>\d{1,2})\s*/\s*)?(?P<d2>\d{1,2})")


def source_revision(content):
    return hashlib.sha256(content).hexdigest()


def extract_pdf_text(content):
    """Extract text from a PDF without OCR; fail closed if no extractor exists."""
    reader = None
    error = None
    for module_name in ("pypdf", "PyPDF2"):
        try:
            module = __import__(module_name)
            reader = module.PdfReader(io.BytesIO(content))
            break
        except Exception as exc:  # pragma: no cover - depends on runner image
            error = exc
    if reader is None:
        raise RuntimeError("PDF text extractor unavailable") from error
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def fetch_source(url, *, timeout=20, session=None):
    """Fetch an official source and return bytes plus a deterministic revision."""
    client = session
    if client is None:
        import requests
        client = requests
    response = client.get(url, timeout=timeout)
    response.raise_for_status()
    content = response.content
    return content, source_revision(content), response.headers.get("content-type", "")


def roc_to_gregorian(year, month, day):
    year = int(year)
    if year < 1 or year > 200:
        raise ValueError("ROC year out of supported range")
    return datetime(year + 1911, int(month), int(day)).date().isoformat()


def parse_explicit_date(value, *, default_year=None):
    text = unescape(str(value or "")).strip()
    match = GREGORIAN.search(text)
    if match:
        return datetime(int(match["year"]), int(match["month"]), int(match["day"])).date().isoformat()
    match = ROC.search(text)
    if match:
        return roc_to_gregorian(match["year"], match["month"], match["day"])
    match = MD.search(text)
    if match and default_year:
        return datetime(int(default_year), int(match["month"]), int(match["day"])).date().isoformat()
    return None


def _year_from_context(text, academic_year):
    # Academic year 115 starts in Gregorian 2026.  This is only a context for
    # an explicit M/D in a calendar row, never a promotion from body text.
    for line in str(text).splitlines():
        if parse_explicit_date(line):
            return parse_explicit_date(line)[:4]
    return str(int(academic_year) + 1911)


def parse_calendar_text(text, *, school_id, academic_year, semester, source_url,
                        source_document, source_revision_value="", fetched_at=None):
    """Parse table-like official calendar text into one event per source row.

    Supported fixture shapes include the CYSH/CYGSH PDF extraction pattern:
    ``月 日 ... 預定重要工作`` followed by one or more explicit date labels.
    A line must contain an explicit date and a non-empty title; arbitrary
    announcement prose is ignored.
    """
    text = unescape(str(text or "")).replace("\r", "")
    default_year = int(academic_year) + 1911 + (1 if int(semester) == 2 else 0)
    rows = []
    for index, raw in enumerate(text.splitlines()):
        line = " ".join(raw.split()).strip()
        if not line or "預定重要工作" in line and not (MD.search(line) or GREGORIAN.search(line) or ROC.search(line)):
            continue
        explicit = parse_explicit_date(line, default_year=default_year)
        if not explicit:
            continue
        span = RANGE.search(line)
        date_match = span or GREGORIAN.search(line) or ROC.search(line) or MD.search(line)
        title = line[date_match.end():] if date_match else line
        title = re.sub(r"^[-|:：、。\s]+", "", title).strip()
        if not title or title in {"星期", "None"}:
            continue
        start = explicit
        end = start
        if span:
            end_month = int(span["m2"] or span["m1"])
            end = datetime(int(start[:4]), end_month, int(span["d2"])).date().isoformat()
        event_id = f"official-calendar:{school_id}:{academic_year}-{semester}:{start}:{index}:{hashlib.sha1(title.encode()).hexdigest()[:10]}"
        rows.append(normalize_event(
            event_id=event_id, school_id=school_id, title=title,
            start_date=start, end_date=end, event_type="school_activity",
            source_url=source_url, source_document=source_document,
            source_revision=source_revision_value, fetched_at=fetched_at or "",
            parser_provenance={"adapter": "new-classic-cms-pdf", "parser_version": "1"},
        ))
    return validate_events(rows, school_id=school_id)


def discover_calendar_attachments(html, *, base_url, academic_year, semester,
                                  allowed_origin=None):
    """Return only official-domain links matching calendar title metadata."""
    html = unescape(str(html or ""))
    candidates = []
    for href, label in re.findall(r"href\s*=\s*[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", html, re.I | re.S):
        label = " ".join(re.sub(r"<[^>]+>", " ", label).split())
        haystack = f"{label} {href}"
        if "行事曆" not in haystack or str(academic_year) not in haystack:
            continue
        if "暑假" in haystack or "寒假" in haystack:
            continue
        semester_markers = ("第一學期", "第1學期", f"{academic_year}-1", f"{academic_year}上")
        if semester == 1 and not any(marker in haystack for marker in semester_markers):
            continue
        if semester == 2 and not any(marker in haystack for marker in ("第二學期", "第2學期", f"{academic_year}-2", f"{academic_year}下")):
            continue
        url = urljoin(base_url, href)
        parsed = urlparse(url)
        allowed = urlparse(allowed_origin or base_url)
        if parsed.scheme != "https" or parsed.hostname != allowed.hostname:
            continue
        candidates.append({"url": url, "label": label, "source_type": "attachment"})
    return candidates


def build_status(*, school_id, academic_year, semester, source_url, checked_at,
                 events=None, document=None, error=""):
    events = events or []
    status = "official_complete" if events else "awaiting_official_source"
    if error:
        status = "validation_failed" if events else "parse_failed"
    elif document and events:
        status = "partial_official" if document.get("partial") else "official_complete"
    return source_status(school_id=school_id, academic_year=academic_year,
                         semester=semester, status=status, source_url=source_url,
                         last_checked_at=checked_at,
                         last_verified_document=document, event_count=len(events), error=error)
