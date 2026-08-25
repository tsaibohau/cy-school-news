"""Deterministic extraction for embedded attachment text.

Only formats with a reliable text layer are parsed. Image-only PDFs and
unsupported office formats remain explicitly unparsed; no OCR or guessing.
"""

import hashlib
import time
from datetime import datetime, timezone
from io import BytesIO
from urllib.parse import urlparse


DEFAULT_MAX_PAGES = 80
DEFAULT_MAX_CHARS = 120_000
DEFAULT_MAX_BYTES = 8 * 1024 * 1024
PARSER_VERSION = "attachment-pdf-v1"


def extract_embedded_text(data: bytes, extension: str, *, max_pages: int = DEFAULT_MAX_PAGES,
                          max_chars: int = DEFAULT_MAX_CHARS) -> dict:
    ext = (extension or "").lower().lstrip(".")
    if ext != "pdf":
        return {"text": "", "parse_status": "unparsed", "provenance": "official_attachment",
                "parser_version": PARSER_VERSION}
    if not data.startswith(b"%PDF-"):
        return {"text": "", "parse_status": "unsupported", "provenance": "official_attachment",
                "parser_version": PARSER_VERSION, "reason": "invalid_pdf"}
    try:
        from pypdf import PdfReader
        reader = PdfReader(BytesIO(data))
        if len(reader.pages) > max_pages:
            return {"text": "", "parse_status": "unsupported", "provenance": "official_attachment",
                    "parser_version": PARSER_VERSION, "page_count": len(reader.pages),
                    "reason": "page_limit"}
        pages = [(page.extract_text() or "").strip() for page in reader.pages]
        text = "\n\n".join(page for page in pages if page)[:max_chars]
        return {
            "text": text,
            "parse_status": "parsed" if text else "unparsed",
            "provenance": "official_attachment",
            "page_count": len(reader.pages),
            "text_length": len(text),
            "content_sha256": hashlib.sha256(data).hexdigest(),
            "parser_version": PARSER_VERSION,
            "parsed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
    except Exception:
        return {"text": "", "parse_status": "unparsed", "provenance": "official_attachment",
                "parser_version": PARSER_VERSION}


def enrich_pdf_attachments(record: dict, session, budget: dict, *, timeout_sec: float,
                           request_delay_sec: float, max_bytes: int = DEFAULT_MAX_BYTES) -> dict:
    """Boundedly download same-site PDFs and attach deterministic embedded text.

    The budget is shared by a whole scrape run. Redirects are checked again so
    an official page cannot turn the GitHub runner into an unrestricted fetcher.
    """
    source_host = (urlparse(str(record.get("source_url") or "")).hostname or "").lower()
    for attachment in record.get("attachments") or []:
        if budget.get("remaining", 0) <= 0:
            break
        if str(attachment.get("extension") or "").lower() != ".pdf":
            continue
        url = str(attachment.get("url") or "")
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or not source_host or host != source_host:
            attachment["parse_status"] = "unsupported"
            attachment["parse_reason"] = "remote_host"
            continue
        budget["remaining"] -= 1
        attachment["parse_attempts"] = int(attachment.get("parse_attempts") or 0) + 1
        try:
            response = session.get(url, timeout=timeout_sec, stream=True)
            response.raise_for_status()
            final = urlparse(response.url)
            if final.scheme != "https" or (final.hostname or "").lower() != source_host:
                attachment["parse_status"] = "unsupported"
                attachment["parse_reason"] = "redirect_host"
                continue
            declared = int(response.headers.get("content-length") or 0)
            if declared > max_bytes:
                attachment["parse_status"] = "unsupported"
                attachment["parse_reason"] = "size_limit"
                attachment["size"] = declared
                continue
            chunks, size = [], 0
            for chunk in response.iter_content(64 * 1024):
                if not chunk:
                    continue
                size += len(chunk)
                if size > max_bytes:
                    raise ValueError("attachment_size_limit")
                chunks.append(chunk)
            attachment["size"] = size
            extracted = extract_embedded_text(b"".join(chunks), ".pdf")
            attachment.update({
                "embedded_text": extracted.pop("text", ""),
                **extracted,
            })
        except ValueError:
            attachment["parse_status"] = "unsupported"
            attachment["parse_reason"] = "size_limit"
        except Exception:
            attachment["parse_status"] = "temporary_error"
        finally:
            time.sleep(max(1.5, float(request_delay_sec)))
    return record

