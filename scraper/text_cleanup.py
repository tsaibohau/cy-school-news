"""Zero-cost, deterministic clean-up of OCR / PDF extracted Traditional Chinese notices.

Pure standard library (``re`` + ``unicodedata``), no network, no AI service.

Ordered pipeline in :func:`clean_text`:

 1. strip zero-width characters / soft hyphen / BOM / bidi controls
 2. selective width normalisation (never NFKC on the whole text, Chinese punctuation stays full-width)
 3. remove table border / divider lines and runs
 4. remove leader dots (``目錄......3``) and ``. . .`` runs
 5. remove single spaces between CJK characters, and between CJK and digits
 6. collapse repeated punctuation (``，，、`` -> ``，``)
 7. half-width ``, ; :`` directly after a CJK character -> full-width (times, URLs, decimals untouched)
 8. drop garbage lines (punctuation-only, page numbers, mostly-symbol fragments)
 9. rejoin hard-wrapped lines (only when the previous line is nearly full width and the next
    line does not start a new item)

:func:`remove_repeated_lines` drops page headers / footers that repeat across pages, and
:func:`clean_pages` combines it with :func:`clean_text` when page boundaries are known.
"""

from __future__ import annotations

import re
import unicodedata

__all__ = ["clean_text", "clean_pages", "remove_repeated_lines", "normalize_width",
           "is_garbage_line", "unwrap_lines"]

_HAN = "㐀-䶿一-鿿豈-﫿"
_ZH_PUNCT = "，。、；：？！「」『』（）〈〉《》【】"
_CLOSERS = "）」』】》〉"
_LEADER = ""  # placeholder for a removed leader-dot run; becomes one space at the end

_ZERO_WIDTH_RE = re.compile("[​-‏‪-‮⁠-⁤﻿­]")
_RADICAL_RE = re.compile("[⺀-⿟豈-﫿]")
_FULLWIDTH_ALNUM_RE = re.compile("[０-９Ａ-Ｚａ-ｚ]")
_SPACE_VARIANTS_RE = re.compile("[　  -   ]")

# Box drawing runs, long -=_~ runs and form "____" blanks.
_BORDER_RUN_RE = re.compile("[─━│┃┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬▕▏┄┅┈┉╌╍]{2,}|(?<![A-Za-z0-9])[-=_~—–]{4,}(?![A-Za-z0-9])|_{3,}")
# Leader dots with a trailing page number; dots only (>= 3 consecutive).
_LEADER_RE = re.compile(r"(?:[.．·・…‧。]\s*){3,}")

_SPACE_CJK_RE = re.compile(f"(?<=[{_HAN}{_ZH_PUNCT}])[ \t](?=[{_HAN}{_ZH_PUNCT}])")
# CJK <-> plain integer only ("113 年" -> "113年"); times, decimals and dates keep their spacing.
_SPACE_DIGIT_CJK_RE = re.compile(
    f"(?<![^\\s{_HAN}{_ZH_PUNCT}])([0-9]+)[ \t](?=[{_HAN}{_ZH_PUNCT}])")
_SPACE_CJK_DIGIT_RE = re.compile(
    f"(?<=[{_HAN}{_ZH_PUNCT}])[ \t]([0-9]+)(?![^\\s{_HAN}{_ZH_PUNCT}])")
_REPEAT_PUNCT_RE = re.compile("([，、。；：])(?:[ \t]*[，、。；：]|[,.](?=[\\s]|$))+")
_HALF_PUNCT_RE = re.compile(
    f"(?<=[{_HAN}{_CLOSERS}])[ \t]?([,;:])[ \t]?(?=[{_HAN}（「『【《〈0-9]|$)")

_PUNCT_ONLY_RE = re.compile(r"[\W_]+", re.UNICODE)
_PAGE_NUMBER_RE = re.compile(
    r"[-–—\s]*(?:第\s*\d+\s*頁(?:\s*[,，]?\s*共\s*\d+\s*頁)?|[Pp]age\s*\d+(?:\s*(?:of|/)\s*\d+)?|\d+\s*(?:頁|/\s*\d+)?)[-–—\s]*")
_MARKER_LINE_RE = re.compile(r"\[[^\]]{1,40}\]")
_LIST_MARKER_ONLY_RE = re.compile(
    r"(?:[（(](?:[一二三四五六七八九十百]+|\d+|[A-Za-z])[)）]|(?:[一二三四五六七八九十百]+|\d+|[A-Za-z])[.、．)])\s*")

_LIST_START_RE = re.compile(
    r"^\s*(?:"
    r"[一二三四五六七八九十百]+[、.．]"
    r"|[（(][一二三四五六七八九十百0-9]+[)）]"
    r"|\d+[.、．)](?!\d)"
    r"|第[一二三四五六七八九十百零\d]+[條章節款項點條案]"
    r"|[■●◆※★○□▲►•・◎△▼]"
    r"|[\-–—]\s"
    r"|[①-⑳㈠-㈩]"
    r"|(?:主旨|說明|辦法|附件|備註|附註|公告事項|擬辦|決議)(?:[：:\s]|$)"
    r"|[" + _HAN + r"]{1,6}[：:]"
    r"|\[[^\]]{1,40}\]"
    r")")
_SENTENCE_END_RE = re.compile("[。！？；：.!?;:」』）)]\\s*$")


def normalize_width(text: str) -> str:
    """Zero-width removal and selective width normalisation (Chinese punctuation is kept)."""
    text = _ZERO_WIDTH_RE.sub("", str(text or ""))
    text = _RADICAL_RE.sub(lambda m: unicodedata.normalize("NFKC", m.group()), text)
    text = _FULLWIDTH_ALNUM_RE.sub(lambda m: chr(ord(m.group()) - 0xFEE0), text)
    return _SPACE_VARIANTS_RE.sub(" ", text)


_MARKER_PREFIX_RE = re.compile(r"^\[(?:OCR|工作表|投影片)[^\]]{0,40}\]")


def _clean_line(line: str) -> str:
    marker = _MARKER_PREFIX_RE.match(line.strip())
    if marker:  # extractor-added section markers are kept verbatim
        rest = _clean_line(line.strip()[marker.end():])
        return marker.group() + (" " + rest if rest else "")
    line = _BORDER_RUN_RE.sub(" ", line)
    line = _LEADER_RE.sub(_LEADER, line)
    line = _SPACE_CJK_RE.sub("", line)
    line = _SPACE_DIGIT_CJK_RE.sub(r"\1", line)
    line = _SPACE_CJK_DIGIT_RE.sub(r"\1", line)
    line = _REPEAT_PUNCT_RE.sub(r"\1", line)
    line = _HALF_PUNCT_RE.sub(lambda m: {",": "，", ";": "；", ":": "："}[m.group(1)], line)
    line = re.sub(r"[ \t\r\f\v]+", " ", line).strip()
    line = re.sub(f"\\s*{_LEADER}[{_LEADER}\\s]*", " ", line).strip()
    return line


def is_garbage_line(line: str, *, aggressive: bool = True) -> bool:
    """True for empty, punctuation-only, page-number-only or mostly-symbol lines."""
    s = str(line or "").strip()
    if not s:
        return True
    if _MARKER_LINE_RE.fullmatch(s):
        return False
    if _LIST_MARKER_ONLY_RE.fullmatch(s):
        return False
    if _PUNCT_ONLY_RE.fullmatch(s):
        return True
    if not aggressive:
        return False
    if _PAGE_NUMBER_RE.fullmatch(s):
        return True
    cjk = len(re.findall(f"[{_HAN}]", s))
    alnum = len(re.findall(r"[A-Za-z0-9]", s))
    if len(s) >= 4 and (cjk + alnum) / len(s) < 0.4:
        return True
    if cjk == 0 and alnum <= 2:
        return True
    return False


def _long_line_threshold(lines: list[str]) -> int:
    lengths = sorted(len(line) for line in lines if len(line) >= 10)
    if len(lengths) < 3:
        return 20
    median = lengths[len(lengths) // 2]
    return max(20, int(median * 0.8))


def unwrap_lines(lines: list[str]) -> list[str]:
    """Rejoin hard-wrapped lines of one paragraph, conservatively."""
    threshold = _long_line_threshold(lines)
    out: list[str] = []
    for line in lines:
        if out:
            prev = out[-1]
            if (len(prev) >= threshold
                    and not _SENTENCE_END_RE.search(prev)
                    and not _MARKER_LINE_RE.fullmatch(prev)
                    and not _LIST_START_RE.match(line)
                    and re.match(f"[{_HAN}A-Za-z0-9]", line)
                    and re.search(f"[{_HAN}A-Za-z0-9，、]$", prev)):
                glue = "" if (re.search(f"[{_HAN}，、]$", prev) or re.match(f"[{_HAN}]", line)) else " "
                out[-1] = prev + glue + line
                continue
        out.append(line)
    return out


def clean_text(text: str, *, unwrap: bool = True, aggressive: bool = True) -> str:
    """Clean one block of extracted text. ``unwrap`` rejoins hard-wrapped lines (PDF / OCR);
    ``aggressive`` enables the page-number / low-content-ratio line filters (off for Office tables)."""
    text = normalize_width(text)
    lines = []
    for raw in text.splitlines():
        line = _clean_line(raw)
        if line and not is_garbage_line(line, aggressive=aggressive):
            lines.append(line)
    if unwrap:
        lines = unwrap_lines(lines)
    return "\n".join(lines)


def _line_key(line: str) -> str:
    return re.sub(r"\s+", "", re.sub(r"\d+", "#", line))


def remove_repeated_lines(pages: list[str], *, edge: int = 3, min_pages: int = 3,
                          ratio: float = 0.5) -> list[str]:
    """Drop lines that repeat (digits ignored) in the first/last ``edge`` lines of >= ``ratio`` of pages."""
    pages = [str(page or "") for page in pages]
    if len(pages) < min_pages:
        return pages
    split = [[line for line in page.splitlines() if line.strip()] for page in pages]
    counts: dict[str, int] = {}
    for lines in split:
        keys = {_line_key(line) for line in lines[:edge] + lines[-edge:]}
        for key in keys:
            if key.replace("#", ""):
                counts[key] = counts.get(key, 0) + 1
    repeated = {key for key, n in counts.items() if n / len(pages) >= ratio}
    if not repeated:
        return pages
    result = []
    for lines in split:
        drop = {index for index in list(range(min(edge, len(lines))))
                + list(range(max(0, len(lines) - edge), len(lines)))
                if _line_key(lines[index]) in repeated}
        result.append("\n".join(line for index, line in enumerate(lines) if index not in drop))
    return result


def clean_pages(pages: list[str], *, unwrap: bool = True, aggressive: bool = True) -> list[str]:
    """Clean each page, then remove headers / footers repeated across pages."""
    cleaned = [clean_text(page, unwrap=False, aggressive=aggressive) for page in pages]
    cleaned = remove_repeated_lines(cleaned)
    if unwrap:
        cleaned = ["\n".join(unwrap_lines(page.splitlines())) for page in cleaned]
    return cleaned
