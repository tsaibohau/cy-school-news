"""Bounded local OCR for official announcement attachments.

This module intentionally has no network access and no AI/LLM dependency. OCR
output is always labeled with its evidence quality. High-confidence text may be
used as normal evidence; low-confidence text is retained only as visibly marked
"evidence insufficient" material so users can inspect it without mistaking it
for a verified fact.
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

OCR_VERSION = "local-ocr-v2"
DEFAULT_LANGUAGES = "chi_tra+eng"
DEFAULT_MIN_CONFIDENCE = 55.0
DEFAULT_MIN_CHARS = 8
DEFAULT_MAX_PDF_PAGES = 8
DEFAULT_MAX_CHARS = 120_000
DEFAULT_MAX_IMAGE_PIXELS = 40_000_000
DEFAULT_PAGE_SCALE = 2.0
DEFAULT_PAGE_TIMEOUT_SEC = 30
# A second, cleaner pass (2x upscale + median filter) runs only when the first pass is unsure;
# blurry or low-resolution scans gain the most. Vertical posters get a chi_tra_vert pass.
RETRY_BELOW_CONFIDENCE = 80.0
VERTICAL_BELOW_CONFIDENCE = 70.0
MAX_UPSCALE_PIXELS = 24_000_000
# Optional directory with better free models (tessdata_best); see the OCR workflows.
TESSDATA_DIR_ENV = "OCR_TESSDATA_DIR"


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


def _mark_insufficient_evidence(text: str, confidence: float, max_chars: int) -> str:
    """Prefix every OCR sentence/line so any extracted snippet carries the warning."""
    marker = f"【證據不足：OCR 辨識信心 {round(float(confidence), 1)}%，請核對官方原附件】"
    parts = re.split(r"(?<=[。！？!?；;])|\n+", str(text or ""))
    marked = [marker + part.strip() for part in parts if part.strip()]
    return "\n".join(marked)[:max_chars]


def _tessdata_args() -> list[str]:
    """Use OCR_TESSDATA_DIR (e.g. tessdata_best) when it has the Chinese model."""
    import os
    directory = os.environ.get(TESSDATA_DIR_ENV, "").strip()
    if directory and (Path(directory) / "chi_tra.traineddata").is_file():
        return ["--tessdata-dir", directory]
    return []


def installed_languages(timeout_sec: int = 5) -> set[str]:
    binary = shutil.which("tesseract")
    if not binary:
        return set()
    try:
        proc = subprocess.run(
            [binary, *_tessdata_args(), "--list-langs"], capture_output=True, text=True,
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
            lines.setdefault(key, []).append((text, confidence))
    text = "\n".join(_join_words(words) for words in lines.values() if words)
    confidence = weighted_confidence / confidence_weight if confidence_weight else 0.0
    return text, confidence, candidate_chars


_CJK = r"\u3400-\u9fff\uf900-\ufaff"
_CJK_RE = re.compile(f"[{_CJK}]")
_LATIN_JUNK = re.compile(r"^[A-Za-z|\\/_~^`'\".,:;!?()\[\]{}<>*#@$%&+=-]{1,5}$")


def _join_words(words: list[tuple[str, float]]) -> str:
    """Tesseract splits Chinese into one word per character or two; join them without spaces.

    Low-confidence Latin fragments inside a Chinese line ("OMAP", "RS") are usually noise
    from stamps, lines or texture and are dropped. English words in English lines are kept.
    """
    cjk_chars = sum(len(_CJK_RE.findall(text)) for text, _ in words)
    total_chars = sum(len(text) for text, _ in words) or 1
    chinese_line = cjk_chars / total_chars >= 0.5
    kept = [text for text, conf in words
            if not (chinese_line and conf < 60 and _LATIN_JUNK.match(text) and not _CJK_RE.search(text))]
    out = ""
    for text in kept:
        if out and not (_CJK_RE.search(out[-1]) or _CJK_RE.search(text[0])
                        or re.match(r"[，。、：；！？（）「」『』]", out[-1] + text[0])):
            out += " "
        elif out and not (_CJK_RE.search(out[-1]) or _CJK_RE.search(text[0])):
            out += " "
        out += text
    return out


_FULLWIDTH = {",": "，", ":": "：", ";": "；", "(": "（", ")": "）", "!": "！", "?": "？"}
_DIGIT_LOOKALIKE = str.maketrans({"O": "0", "o": "0", "l": "1", "I": "1", "|": "1"})


def postprocess(text: str) -> str:
    """Fixed-rule clean-up of Tesseract output for Traditional Chinese notices.

    * no spaces between Chinese characters, digits and punctuation (「115 年 12 月」→「115年12月」);
    * half-width punctuation next to Chinese becomes full-width (「主旨:」→「主旨：」);
    * inside a number, O/o read as 0 and l/I/| read as 1 (「2O26」→「2026」). Other look-alikes
      are left alone: guessing them could invent a wrong date or amount.
    """
    tight = f"{_CJK}，。、：；！？（）「」『』【】"
    lines = []
    for line in str(text or "").splitlines():
        def fix_number(match):
            token = match.group(0)
            letters = [ch for ch in token if not ch.isdigit() and ch not in ",./-:"]
            if len(letters) == 1 and sum(ch.isdigit() for ch in token) >= 2:
                return token.translate(_DIGIT_LOOKALIKE)
            return token
        line = re.sub(r"(?<![A-Za-z])[0-9OolI|][0-9OolI|,./:-]{2,}(?![A-Za-z])", fix_number, line)
        # Half-width punctuation touching Chinese (spaces allowed) becomes full-width.
        line = re.sub(f"(?<=[{_CJK}）」])\\s*([,:;!?()])|([,:;!?()])\\s*(?=[{_CJK}（「])",
                      lambda m: _FULLWIDTH[m.group(1) or m.group(2)], line)
        line = re.sub(f"(?<=[{_CJK}])\\s*\\(", "（", line)
        line = re.sub(f"\\)\\s*(?=[{_CJK}])", "）", line)
        for _ in range(2):
            line = re.sub(f"(?<=[{tight}])\\s+(?=[{tight}0-9])|(?<=[0-9])\\s+(?=[{tight}])", "", line)
        lines.append(re.sub(r"[ \t]{2,}", " ", line).strip())
    return "\n".join(line for line in lines if line)


def _ocr_png(path: Path, *, languages: str, timeout_sec: int, psm: int = 6) -> tuple[str, float, int]:
    binary = shutil.which("tesseract")
    if not binary:
        return "", 0.0, 0
    command = [binary, str(path), "stdout", "-l", languages, "--psm", str(psm), "-c", "tessedit_create_tsv=1"]
    best_models = _tessdata_args()
    try:
        proc = subprocess.run(command[:1] + best_models + command[1:], capture_output=True, text=True,
                              timeout=max(5, timeout_sec), check=False)
    except subprocess.TimeoutExpired:
        if not best_models:
            raise
        # The best models are slower; a page they cannot finish is read with the system models.
        proc = subprocess.run(command, capture_output=True, text=True,
                              timeout=max(5, timeout_sec), check=False)
    if proc.returncode != 0:
        return "", 0.0, 0
    return _parse_tsv(proc.stdout)


def _looks_vertical(text: str) -> bool:
    """Vertical columns read as horizontal lines give many very short Chinese lines."""
    lines = [re.sub(r"\s+", "", line) for line in str(text or "").splitlines()]
    lines = [line for line in lines if _CJK_RE.search(line)]
    if len(lines) < 3:
        return False
    short = sum(1 for line in lines if len(line) <= 5)
    return short / len(lines) >= 0.7 and not any(re.search(r"[，。：；]", line) for line in lines)


def _ocr_page(image, directory: Path, name: str, *, languages: str,
              timeout_sec: int) -> tuple[str, float, int]:
    """OCR one page image, retrying with cleaner preprocessing only when unsure.

    Pass 1: grayscale + autocontrast (the v1 behaviour).
    Pass 2: 2x upscale + median filter, when pass 1 confidence < RETRY_BELOW_CONFIDENCE.
    Pass 3: vertical Chinese model, when still < VERTICAL_BELOW_CONFIDENCE and it is installed.
    The result with the highest Tesseract confidence wins.
    """
    from PIL import Image, ImageFilter, ImageOps

    gray = ImageOps.autocontrast(image.convert("L"), cutoff=1)
    path = directory / f"{name}-a.png"
    gray.save(path, format="PNG")
    best = _ocr_png(path, languages=languages, timeout_sec=timeout_sec)
    if best[1] < RETRY_BELOW_CONFIDENCE and gray.width * gray.height * 4 <= MAX_UPSCALE_PIXELS:
        sharp = gray.resize((gray.width * 2, gray.height * 2), Image.LANCZOS).filter(ImageFilter.MedianFilter(3))
        path = directory / f"{name}-b.png"
        sharp.save(path, format="PNG")
        second = _ocr_png(path, languages=languages, timeout_sec=timeout_sec)
        if second[1] > best[1]:
            best = second
    looks_vertical = _looks_vertical(best[0])
    if (best[1] < VERTICAL_BELOW_CONFIDENCE or looks_vertical) and "chi_tra_vert" in installed_languages():
        vertical = _ocr_png(directory / f"{name}-a.png", languages="chi_tra_vert", timeout_sec=timeout_sec, psm=5)
        # Confidence alone cannot tell: columns read sideways still score high. When the horizontal
        # result is made of many 1–5 character lines, prefer the vertical reading unless it is clearly worse.
        if vertical[1] > best[1] + 5 or (looks_vertical and vertical[1] >= best[1] - 5 and not _looks_vertical(vertical[0])):
            best = vertical
    return postprocess(best[0]), best[1], best[2]


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
        "ocr_models": "tessdata_best" if _tessdata_args() else "system",
    }
    if page_count is not None:
        common["page_count"] = page_count
    if searchable_chars < min_chars:
        return dict(common, text="", parse_status="needs_ocr", reason="ocr_too_little_text",
                    evidence_confidence="insufficient")
    if confidence < min_confidence:
        return dict(
            common,
            text=_mark_insufficient_evidence(cleaned, confidence, max_chars),
            parse_status="parsed",
            reason="ocr_low_confidence",
            evidence_confidence="insufficient",
        )
    return dict(common, text=cleaned, parse_status="parsed", reason="",
                evidence_confidence="sufficient")


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
            with tempfile.TemporaryDirectory(prefix="cynews-ocr-") as directory:
                text, confidence, chars = _ocr_page(image, Path(directory), "page",
                                                    languages=languages, timeout_sec=timeout_sec)
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
                from PIL import Image
                image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
                attempted = True
                try:
                    text, confidence, chars = _ocr_page(image, Path(directory), f"page-{index + 1}",
                                                        languages=languages, timeout_sec=timeout_sec)
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
    """OCR one downloaded attachment and return text plus explicit evidence quality."""
    ext = str(extension or "").lower().lstrip(".")
    if not languages_ready(languages):
        return {"text": "", "parse_status": "needs_ocr", "reason": "ocr_language_unavailable",
                "ocr_version": OCR_VERSION, "ocr_engine": "tesseract",
                "ocr_languages": languages, "ocr_attempted": False,
                "evidence_confidence": "insufficient"}
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
                "ocr_version": OCR_VERSION, "ocr_attempted": False,
                "evidence_confidence": "insufficient"}
    result["ocr_languages"] = languages
    result.setdefault("ocr_engine", "tesseract")
    result.setdefault("evidence_confidence", "insufficient")
    return result