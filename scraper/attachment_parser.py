"""Deterministic text extraction for official announcement attachments.

Only text that can be extracted locally and reproducibly is promoted into the
protected member-content pipeline. Nothing here calls an AI/LLM service.
Legacy binary Office files fail closed. Image and scan OCR is optional,
bounded, and confidence-gated. The caller is responsible for keeping
``embedded_text`` out of the public metadata projection.
"""

from __future__ import annotations

import hashlib
import re
import time
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

DEFAULT_MAX_PAGES = 80
DEFAULT_MAX_CHARS = 120_000
DEFAULT_MAX_BYTES = 8 * 1024 * 1024
DEFAULT_MAX_UNCOMPRESSED_BYTES = 24 * 1024 * 1024
PARSER_VERSION = "attachment-text-v2"
SUPPORTED_TEXT_EXTENSIONS = {"pdf", "docx", "xlsx", "pptx"}
OCR_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}


def _base_result(data: bytes) -> dict:
    return {
        "provenance": "official_attachment",
        "content_sha256": hashlib.sha256(data).hexdigest(),
        "parser_version": PARSER_VERSION,
    }


def _clean_lines(lines, max_chars: int) -> str:
    output = []
    size = 0
    for value in lines:
        text = re.sub(r"[ \t\r\f\v]+", " ", str(value or "")).strip()
        if not text:
            continue
        remaining = max_chars - size
        if remaining <= 0:
            break
        text = text[:remaining]
        output.append(text)
        size += len(text) + 1
    return "\n".join(output)[:max_chars]


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _safe_zip(data: bytes) -> zipfile.ZipFile:
    archive = zipfile.ZipFile(BytesIO(data))
    total = sum(max(0, info.file_size) for info in archive.infolist())
    if total > DEFAULT_MAX_UNCOMPRESSED_BYTES:
        archive.close()
        raise ValueError("expanded_size_limit")
    return archive


def _extract_docx(data: bytes, max_chars: int) -> str:
    with _safe_zip(data) as archive:
        if "word/document.xml" not in archive.namelist():
            return ""
        root = ET.fromstring(archive.read("word/document.xml"))
        lines = []
        for paragraph in root.iter():
            if _local_name(paragraph.tag) != "p":
                continue
            line = "".join(node.text or "" for node in paragraph.iter()
                           if _local_name(node.tag) in {"t", "tab", "br"})
            if line.strip():
                lines.append(line)
        return _clean_lines(lines, max_chars)


def _xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values = []
    for item in root.iter():
        if _local_name(item.tag) != "si":
            continue
        values.append("".join(node.text or "" for node in item.iter()
                              if _local_name(node.tag) == "t"))
    return values


def _xlsx_sheet_map(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    if "xl/workbook.xml" not in archive.namelist():
        return []
    rels = {}
    rel_path = "xl/_rels/workbook.xml.rels"
    if rel_path in archive.namelist():
        rel_root = ET.fromstring(archive.read(rel_path))
        for relation in rel_root.iter():
            if _local_name(relation.tag) != "Relationship":
                continue
            rel_id = relation.attrib.get("Id", "")
            target = relation.attrib.get("Target", "")
            if rel_id and target:
                target = target.lstrip("/")
                rels[rel_id] = target if target.startswith("xl/") else "xl/" + target
    root = ET.fromstring(archive.read("xl/workbook.xml"))
    sheets = []
    for node in root.iter():
        if _local_name(node.tag) != "sheet":
            continue
        rel_id = next((value for key, value in node.attrib.items()
                       if _local_name(key) == "id"), "")
        target = rels.get(rel_id, "")
        if target in archive.namelist():
            sheets.append((node.attrib.get("name", "工作表"), target))
    return sheets


def _xlsx_cell_value(cell, shared: list[str]) -> str:
    cell_type = cell.attrib.get("t", "")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iter()
                       if _local_name(node.tag) == "t")
    value = next((node.text or "" for node in cell.iter()
                  if _local_name(node.tag) == "v"), "")
    if cell_type == "s":
        try:
            index = int(value)
            return shared[index] if 0 <= index < len(shared) else ""
        except (TypeError, ValueError):
            return ""
    if cell_type == "b":
        return "是" if value == "1" else "否" if value == "0" else value
    return value


def _extract_xlsx(data: bytes, max_chars: int) -> str:
    with _safe_zip(data) as archive:
        shared = _xlsx_shared_strings(archive)
        lines = []
        for sheet_name, path in _xlsx_sheet_map(archive):
            lines.append(f"[工作表：{sheet_name}]")
            root = ET.fromstring(archive.read(path))
            for row in root.iter():
                if _local_name(row.tag) != "row":
                    continue
                values = [_xlsx_cell_value(cell, shared) for cell in row
                          if _local_name(cell.tag) == "c"]
                if any(str(value).strip() for value in values):
                    lines.append(" | ".join(str(value).strip() for value in values))
                if sum(len(line) + 1 for line in lines) >= max_chars:
                    break
        return _clean_lines(lines, max_chars)


def _slide_sort_key(name: str):
    match = re.search(r"slide(\d+)\.xml$", name)
    return int(match.group(1)) if match else 10**9


def _extract_pptx(data: bytes, max_chars: int) -> str:
    with _safe_zip(data) as archive:
        slides = sorted((name for name in archive.namelist()
                         if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
                        key=_slide_sort_key)
        lines = []
        for index, path in enumerate(slides, 1):
            root = ET.fromstring(archive.read(path))
            text = " ".join(node.text or "" for node in root.iter()
                            if _local_name(node.tag) == "t" and node.text)
            if text.strip():
                lines.append(f"[投影片 {index}] {text}")
            if sum(len(line) + 1 for line in lines) >= max_chars:
                break
        return _clean_lines(lines, max_chars)


def _extract_pdf(data: bytes, max_pages: int, max_chars: int) -> tuple[str, int]:
    if not data.startswith(b"%PDF-"):
        raise ValueError("invalid_pdf")
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(data))
    if len(reader.pages) > max_pages:
        raise OverflowError(str(len(reader.pages)))
    pages = [(page.extract_text() or "").strip() for page in reader.pages]
    return _clean_lines(pages, max_chars), len(reader.pages)


def _apply_ocr(result: dict, data: bytes, extension: str, *, max_chars: int) -> dict:
    from local_ocr import OCR_VERSION, extract_ocr_text

    ocr = extract_ocr_text(data, extension, max_chars=max_chars)
    text = ocr.pop("text", "")
    result.update(ocr)
    result["parser_version"] = f"{PARSER_VERSION}+{OCR_VERSION}"
    if text and result.get("parse_status") == "parsed":
        result["text"] = text
        result["text_length"] = len(text)
        result["parsed_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    else:
        result["text"] = ""
        result["text_length"] = 0
    return result


def extract_embedded_text(data: bytes, extension: str, *, max_pages: int = DEFAULT_MAX_PAGES,
                          max_chars: int = DEFAULT_MAX_CHARS, enable_ocr: bool = False) -> dict:
    """Extract deterministic text, optionally falling back to local OCR."""
    ext = (extension or "").lower().lstrip(".")
    result = _base_result(data)
    try:
        page_count = None
        if ext == "pdf":
            text, page_count = _extract_pdf(data, max_pages, max_chars)
            if not text and enable_ocr:
                result["page_count"] = page_count
                return _apply_ocr(result, data, ".pdf", max_chars=max_chars)
        elif ext == "docx":
            text = _extract_docx(data, max_chars)
        elif ext == "xlsx":
            text = _extract_xlsx(data, max_chars)
        elif ext == "pptx":
            text = _extract_pptx(data, max_chars)
        elif ext in OCR_EXTENSIONS:
            if enable_ocr:
                return _apply_ocr(result, data, "." + ext, max_chars=max_chars)
            return dict(result, text="", parse_status="needs_ocr", reason="ocr_required")
        else:
            return dict(result, text="", parse_status="unparsed", reason="unsupported_format")
        result.update({
            "text": text,
            "parse_status": "parsed" if text else ("needs_ocr" if ext == "pdf" else "unparsed"),
            "text_length": len(text),
            "parsed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })
        if page_count is not None:
            result["page_count"] = page_count
        if not text:
            result["reason"] = "ocr_required" if ext == "pdf" else "empty_text_layer"
        return result
    except OverflowError as exc:
        return dict(result, text="", parse_status="unsupported", reason="page_limit",
                    page_count=int(str(exc) or 0))
    except ValueError as exc:
        return dict(result, text="", parse_status="unsupported", reason=str(exc) or "invalid_file")
    except (zipfile.BadZipFile, ET.ParseError, KeyError):
        return dict(result, text="", parse_status="unparsed", reason="invalid_office_file")
    except Exception:
        return dict(result, text="", parse_status="unparsed", reason="parser_error")


def _finalize_record_revision(record: dict) -> None:
    """Make cache revision sensitive to successfully fetched attachment bytes/parser."""
    attachments = record.get("attachments") or []
    revisions = []
    for attachment in sorted(attachments, key=lambda row: str(row.get("url") or "")):
        digest = str(attachment.get("content_sha256") or "")
        if digest:
            revisions.append("|".join([
                str(attachment.get("url") or ""), digest,
                str(attachment.get("parse_status") or ""),
                str(attachment.get("parser_version") or ""),
            ]))
    if not revisions:
        return
    article_hash = str(record.get("article_source_hash") or record.get("source_hash") or "")
    record["article_source_hash"] = article_hash
    record["source_hash"] = hashlib.sha256(
        (article_hash + "\n" + "\n".join(revisions)).encode("utf-8")
    ).hexdigest()
    for row in record.get("verified_dates") or []:
        row["source_revision"] = record["source_hash"]


def enrich_pdf_attachments(record: dict, session, budget: dict, *, timeout_sec: float,
                           request_delay_sec: float, max_bytes: int = DEFAULT_MAX_BYTES) -> dict:
    """Boundedly fetch same-origin attachments and retain protected text.

    ``budget['remaining']`` bounds school attachment requests. Optional local
    OCR is enabled only when ``budget['ocr_enabled']`` is true and
    ``budget['ocr_remaining']`` is positive. OCR never adds another school
    request because it runs on bytes already downloaded by this function.
    """
    source_host = (urlparse(str(record.get("source_url") or "")).hostname or "").lower()
    ocr_enabled = bool(budget.get("ocr_enabled"))
    for attachment in record.get("attachments") or []:
        ext = str(attachment.get("extension") or "").lower().lstrip(".")
        if ext in OCR_EXTENSIONS and not ocr_enabled:
            attachment["parse_status"] = "needs_ocr"
            attachment["parse_reason"] = "ocr_required"
            continue
        if ext not in SUPPORTED_TEXT_EXTENSIONS and ext not in OCR_EXTENSIONS:
            attachment["parse_status"] = "unparsed"
            attachment["parse_reason"] = "unsupported_format"
            continue
        if ext in OCR_EXTENSIONS and int(budget.get("ocr_remaining") or 0) <= 0:
            attachment["parse_status"] = "needs_ocr"
            attachment["parse_reason"] = "ocr_budget_exhausted"
            continue
        if budget.get("remaining", 0) <= 0:
            break
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
            data = b"".join(chunks)
            attachment["size"] = size
            allow_ocr = ocr_enabled and int(budget.get("ocr_remaining") or 0) > 0
            extracted = extract_embedded_text(data, "." + ext, enable_ocr=allow_ocr)
            text = extracted.pop("text", "")
            ocr_attempted = bool(extracted.pop("ocr_attempted", False))
            if ocr_attempted:
                budget["ocr_remaining"] = max(0, int(budget.get("ocr_remaining") or 0) - 1)
            attachment.pop("embedded_text", None)
            attachment.update(extracted)
            if text and attachment.get("parse_status") == "parsed":
                attachment["embedded_text"] = text
            reason = attachment.pop("reason", "")
            if reason:
                attachment["parse_reason"] = reason
        except ValueError:
            attachment["parse_status"] = "unsupported"
            attachment["parse_reason"] = "size_limit"
            attachment.pop("embedded_text", None)
        except Exception:
            attachment["parse_status"] = "temporary_error"
            attachment["parse_reason"] = "attachment_fetch_or_parse_error"
            attachment.pop("embedded_text", None)
        finally:
            time.sleep(max(1.5, float(request_delay_sec)))
    _finalize_record_revision(record)
    return record
