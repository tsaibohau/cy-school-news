# -*- coding: utf-8 -*-
"""Deterministic parser for public class-timetable PDFs.

The public CYSH document is one class per page.  This adapter only accepts
the explicit table structure (five weekdays and eight numbered periods); it
does not OCR, infer missing slots, or expose any information beyond period,
time and course name.
"""
import io
import re


WEEKDAYS = ("星期一", "星期二", "星期三", "星期四", "星期五")
CLASS_CODE = re.compile(r"^\d{3}$")
TIME = re.compile(r"^\d{4}$")


def extract_pdf_pages(content):
    """Return text for each PDF page, failing closed without an extractor."""
    error = None
    for module_name in ("pypdf", "PyPDF2"):
        try:
            module = __import__(module_name)
            reader = module.PdfReader(io.BytesIO(content))
            pages = []
            for page in reader.pages:
                try:
                    text = page.extract_text(extraction_mode="layout")
                except TypeError:  # pypdf versions before layout extraction
                    text = page.extract_text()
                pages.append(text or "")
            return pages
        except Exception as exc:  # pragma: no cover - runner dependency
            error = exc
    raise RuntimeError("PDF text extractor unavailable") from error


def _lines(text):
    return [line.rstrip() for line in str(text or "").replace("\r", "").splitlines()]


def parse_class_page(text):
    """Parse exactly one public class timetable page, otherwise return None."""
    lines = _lines(text)
    weekday_at = next((index for index, line in enumerate(lines)
                       if all(day in line for day in WEEKDAYS)), None)
    if weekday_at is None:
        return None
    weekday_line = lines[weekday_at]
    starts = [weekday_line.find(day) for day in WEEKDAYS]
    if any(start < 0 for start in starts) or starts != sorted(starts):
        return None
    boundaries = [(starts[index] + starts[index + 1]) // 2 for index in range(len(starts) - 1)]
    class_codes = [line.strip() for line in lines[:weekday_at] if CLASS_CODE.fullmatch(line.strip())]
    if not class_codes:
        return None
    class_code = class_codes[-1]
    cursor = weekday_at + 1
    slots = []
    for expected_period in range(1, 9):
        while cursor < len(lines) and not lines[cursor].strip():
            cursor += 1
        raw_start = lines[cursor] if cursor < len(lines) else ""
        start_match = re.match(r"\s*(\d+)\s+(\d{4})(.*)$", raw_start)
        if not start_match or int(start_match.group(1)) != expected_period:
            return None
        start = start_match.group(2)
        inline = " " * start_match.end(2) + start_match.group(3)
        cursor += 1
        subject_lines = [[] for _ in WEEKDAYS]
        def collect(raw):
            for day in range(len(WEEKDAYS)):
                left = boundaries[day - 1] if day else 0
                right = boundaries[day] if day < len(boundaries) else None
                fragment = raw[left:right].strip()
                if fragment:
                    subject_lines[day].append(fragment)
        collect(inline)
        end = ""
        while cursor < len(lines):
            raw = lines[cursor]
            end_match = re.fullmatch(r"\s*(\d{4})\s*", raw)
            if end_match:
                end = end_match.group(1)
                cursor += 1
                break
            if re.match(r"\s*\d+\s+\d{4}", raw):
                return None
            collect(raw)
            cursor += 1
        subjects = [" ".join(parts) for parts in subject_lines]
        if not TIME.fullmatch(start) or not TIME.fullmatch(end) or any(not subject or len(subject) > 80 for subject in subjects):
            return None
        for weekday, subject in zip(WEEKDAYS, subjects):
            slots.append({"weekday": weekday, "period": expected_period,
                          "start": start, "end": end, "subject": subject})
    return {"class_name": class_code, "slots": slots}


def parse_timetable_pages(pages):
    """Return class rows only when every accepted page is complete and unique."""
    def blank_table_page(page):
        ignored = [
            CLASS_CODE, TIME, re.compile(r"^\d+\s+\d{4}$"), re.compile(r"^時間$"),
            re.compile(r"^頁\d+\s+共\d+頁$"), re.compile(r"^\d{1,2}/\d{1,2}/\d{4}$"),
        ]
        for raw in _lines(page):
            line = raw.strip()
            if not line or line in WEEKDAYS or all(day in line for day in WEEKDAYS) or line == "註" or "班級課表" in line:
                continue
            if "頁" in line and "共" in line:
                continue
            if any(pattern.fullmatch(line) for pattern in ignored):
                continue
            return False
        return True
    classes = {}
    for page in pages or []:
        row = parse_class_page(page)
        table_page = all(day in str(page or "") for day in WEEKDAYS)
        if table_page and not row and not blank_table_page(page):
            raise ValueError("incomplete class timetable page")
        if not row:
            continue
        code = row["class_name"]
        if code in classes:
            raise ValueError("duplicate class timetable page: " + code)
        classes[code] = row
    if not classes:
        raise ValueError("official timetable produced no complete class pages")
    return [classes[code] for code in sorted(classes)]
