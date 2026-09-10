"""Bounded local OCR for official announcement attachments.

This module intentionally has no network access and no AI/LLM dependency. OCR
output is promoted only when the Traditional-Chinese language pack is present
and Tesseract reports enough high-confidence text. Otherwise callers receive a
fail-closed status and no searchable text.
"""

from __future__ import annotations

import csv
import io
import re
import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

OCR_VERSION = "local-ocr-v1"
DEFAULT_LANGUAGES = "chi_tra+eng"
DEFAULT_MIN_CONFIDENCE = 55.0
DEFAULT_MIN_CHARS = 8
DEFAULT_MAX_PDF_PAGES = 8
DEFAULT_MAX_CHARS = 120_000
DEFAULT_MAX_IMAGE_PIXELS = 40_000_000
DEFAULT_PAGE_SCALE = 2.0
DEFAULT_PAGE_TIMEOUT_SEC = 30


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


def installed_languages(timeout_sec: int = 5) -> set[str]:
    binary = shutil.which("tesseract")
    if not binary:
        return set()
    try:
        proc = subprocess.run(
            [binary, "--list-langs"], capture_output=True, text=True,
            timeout=max(1, timeout_sec), check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return set()
    values = set()
    for line in (proc.stdout + "\n" + proc.stderr).splitlines():
        value = line.strip()
        if re.fullmatch(r"[A-Za-z0-9_]+", value):
            values.add(value)
    return values


def languages_ready(languages: str = DEFAULT_LANGUAGES) -> bool:
    required = {part.strip() for part in str(languages or "").split("+") if part.strip()}
    return bool(required) and required.issubset(installed_languages())


def _parse_tsv(raw: str) -> tuple[str, float, int]:
    reader = csv.DictReader(io.StringIO(raw), delimiter="\t")
    lines: dict[tuple[str, str, str, str], list[str]] = {}
    weighted_confidence = 0.0
    confidence_weight = 0
    candidate_chars = 0
    for row in reader:
        text = str(row.get("text") or "").strip()
        if not text:
            continue
        try:
            confidence = float(row.get("conf") or -1)
        except (TypeError, ValueError):
            confidence = -1
        if confidence < 0:
            continue
        compact_chars = len(re.sub(r"\s+", "", text))
        if compact_chars <= 0:
            continue
        candidate_chars += compact_chars
        weighted_confidence += confidence * compact_chars
        confidence_weight += compact_chars
        if confidence >= 30:
            key = (
                str(row.get("page_num") or "0"),
                str(row.get("block_num") or "0"),
                str(row.get("par_num") or "0"),
                str(row.get("line_num") or "0"),
            )
            lines.setdefault(key, []).append(text)
    text = "\n".join(" ".join(words) for words in lines.values() if words)
    confidence = weighted_confidence / confidence_weight if confidence_weight else 0.0
    return text, confidence, candidate_chars


def _ocr_png(path: Path, *, languages: str, timeout_sec: int) -> tuple[str, float, int]:
    binary = shutil.which("tesseract")
    if not binary:
        return "", 0.0, 0
    proc = subprocess.run(
        [binary, str(path), "stdout", "-l", languages, "--psm", "6", "tsv"],
        capture_output=True, text=True, timeout=max(5, timeout_sec), check=False,
    )
    if proc.returncode != 0:
        return "", 0.0, 0
    return _parse_tsv(proc.stdout)


def _quality_result(text: str, confidence: float, candidate_chars: int, *,
                    max_chars: int, min_confidence: float, min_chars: int,
                    page_count: int | None = None) -> dict:
    cleaned = _clean_lines(text.splitlines(), max_chars)
    searchable_chars = len(re.sub(r"\s+", "", cleaned))
    common = {
        "ocr_version": OCR_VERSION,
        "ocr_engine": "tesseract",
        "ocr_languages": DEFAULT_LANGUAGES,
        "ocr_confidence": round(float(confidence), 2),
        "ocr_candidate_chars": int(candidate_chars),
        "ocr_searchable_chars": searchable_chars,
        "ocr_attempted": True,
    }
    if page_count is not None:
        common["page_count"] = page_count
    if searchable_chars < min_chars:
        return dict(common, text="", parse_status="needs_ocr", reason="ocr_too_little_text")
    if confidence < min_confidence:
        return dict(common, text="", parse_status="needs_ocr", reason="ocr_low_confidence")
    return dict(common, text=cleaned, parse_status="parsed", reason="")


def _ocr_image(data: bytes, *, languages: str, max_chars: int,
               min_confidence: float, min_chars: int, timeout_sec: int) -> dict:
    from PIL import Image, ImageOps, UnidentifiedImageError

    Image.MAX_IMAGE_PIXELS = DEFAULT_MAX_IMAGE_PIXELS
    try:
        with Image.open(BytesIO(data)) as source:
            width, height = source.size
            if width <= 0 or height <= 0 or width * height > DEFAULT_MAX_IMAGE_PIXELS:
                return {"text": "", "parse_status": "unsupported", "reason": "ocr_image_size_limit",
                        "ocr_version": OCR_VERSION, "ocr_attempted": False}
            image = ImageOps.exif_transpose(source).convert("L")
            image = ImageOps.autocontrast(image)
            with tempfile.TemporaryDirectory(prefix="cynews-ocr-") as directory:
                path = Path(directory) / "page.png"
                image.save(path, format="PNG", optimize=True)
                text, confidence, chars = _ocr_png(path, languages=languages, timeout_sec=timeout_sec)
    except (UnidentifiedImageError, OSError, ValueError):
        return {"text": "", "parse_status": "unsupported", "reason": "ocr_invalid_image",
                "ocr_version": OCR_VERSION, "ocr_attempted": False}
    except subprocess.TimeoutExpired:
        return {"text": "", "parse_status": "temporary_error", "reason": "ocr_timeout",
                "ocr_version": OCR_VERSION, "ocr_attempted": True}
    return _quality_result(text, confidence, chars, max_chars=max_chars,
                           min_confidence=min_confidence, min_chars=min_chars, page_count=1)


def _ocr_pdf(data: bytes, *, languages: str, max_chars: int, max_pdf_pages: int,
             min_confidence: float, min_chars: int, timeout_sec: int) -> dict:
    import pymupdf

    try:
        document = pymupdf.open(stream=data, filetype="pdf")
    except Exception:
        return {"text": "", "parse_status": "unsupported", "reason": "ocr_invalid_pdf",
                "ocr_version": OCR_VERSION, "ocr_attempted": False}
    try:
        page_count = len(document)
        if page_count <= 0:
            return {"text": "", "parse_status": "needs_ocr", "reason": "ocr_empty_pdf",
                    "ocr_version": OCR_VERSION, "ocr_attempted": False, "page_count": 0}
        if page_count > max_pdf_pages:
            return {"text": "", "parse_status": "unsupported", "reason": "ocr_page_limit",
                    "ocr_version": OCR_VERSION, "ocr_attempted": False, "page_count": page_count}
        texts = []
        weighted = 0.0
        total_chars = 0
        attempted = False
        with tempfile.TemporaryDirectory(prefix="cynews-ocr-") as directory:
            for index in range(page_count):
                page = document.load_page(index)
                pixmap = page.get_pixmap(matrix=pymupdf.Matrix(DEFAULT_PAGE_SCALE, DEFAULT_PAGE_SCALE), alpha=False)
                if pixmap.width * pixmap.height > DEFAULT_MAX_IMAGE_PIXELS:
                    return {"text": "", "parse_status": "unsupported", "reason": "ocr_image_size_limit",
                            "ocr_version": OCR_VERSION, "ocr_attempted": attempted,
                            "page_count": page_count}
                path = Path(directory) / f"page-{index + 1}.png"
                pixmap.save(path)
                attempted = True
                try:
                    text, confidence, chars = _ocr_png(path, languages=languages, timeout_sec=timeout_sec)
                except subprocess.TimeoutExpired:
                    return {"text": "", "parse_status": "temporary_error", "reason": "ocr_timeout",
                            "ocr_version": OCR_VERSION, "ocr_attempted": True,
                            "page_count": page_count}
                if text:
                    texts.append(f"[OCR 第 {index + 1} 頁]\n{text}")
                weighted += confidence * chars
                total_chars += chars
                if sum(len(value) + 1 for value in texts) >= max_chars:
                    break
        confidence = weighted / total_chars if total_chars else 0.0
        return _quality_result("\n".join(texts), confidence, total_chars,
                               max_chars=max_chars, min_confidence=min_confidence,
                               min_chars=min_chars, page_count=page_count)
    finally:
        document.close()


def extract_ocr_text(data: bytes, extension: str, *, languages: str = DEFAULT_LANGUAGES,
                     max_chars: int = DEFAULT_MAX_CHARS,
                     max_pdf_pages: int = DEFAULT_MAX_PDF_PAGES,
                     min_confidence: float = DEFAULT_MIN_CONFIDENCE,
                     min_chars: int = DEFAULT_MIN_CHARS,
                     timeout_sec: int = DEFAULT_PAGE_TIMEOUT_SEC) -> dict:
    """OCR one already-downloaded attachment and return only trusted text."""
    ext = str(extension or "").lower().lstrip(".")
    if not languages_ready(languages):
        return {"text": "", "parse_status": "needs_ocr", "reason": "ocr_language_unavailable",
                "ocr_version": OCR_VERSION, "ocr_engine": "tesseract",
                "ocr_languages": languages, "ocr_attempted": False}
    if ext == "pdf":
        result = _ocr_pdf(data, languages=languages, max_chars=max_chars,
                          max_pdf_pages=max_pdf_pages, min_confidence=min_confidence,
                          min_chars=min_chars, timeout_sec=timeout_sec)
    elif ext in {"jpg", "jpeg", "png", "gif", "webp"}:
        result = _ocr_image(data, languages=languages, max_chars=max_chars,
                            min_confidence=min_confidence, min_chars=min_chars,
                            timeout_sec=timeout_sec)
    else:
        return {"text": "", "parse_status": "unparsed", "reason": "ocr_unsupported_format",
                "ocr_version": OCR_VERSION, "ocr_attempted": False}
    result["ocr_languages"] = languages
    result.setdefault("ocr_engine", "tesseract")
    return result
