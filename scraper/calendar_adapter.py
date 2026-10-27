# -*- coding: utf-8 -*-
"""Deterministic PDF/HTML official calendar adapter.

The parser consumes text extracted from official HTML/PDF sources.  It never
uses OCR, an LLM, publication dates, or guessed year promotion.
"""
import hashlib
import io
import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone
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
    """Extract layout-preserving text from a PDF without OCR."""
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
    return "\n\f\n".join(page.extract_text() or "" for page in reader.pages)


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


def _calendar_year(academic_year, semester, month):
    base = int(academic_year) + 1911
    month = int(month)
    if int(semester) == 1:
        return base + (1 if month <= 2 else 0)
    return base + 1


def _term_date(academic_year, semester, month, day):
    return date(_calendar_year(academic_year, semester, month), int(month), int(day))


def _normal_title(value):
    title = " ".join(str(value or "").replace("\u3000", " ").split())
    return re.sub(r"^[\s:：、。()）]+|[\s]+$", "", title)


CJK = "\u3400-\u9fff"
CJK_PUNCT = "（）()【】「」，。、：；！？"
OFFICE_TAG = re.compile(r"[(（](?:教官室|教務處|學務處|總務處|輔導室|圖書館|人事室|主計室)[)）]")
# PDF 表格的頁首、週次列與校名會被抽進最後一格；遇到這些標記就截斷。
TABLE_NOISE = re.compile(
    r"[一二三四五六七八九十]+月第[一二三四五六七八九十]+週|第[一二三四五六七八九十]+週(?:\d+\s*){3,}"
    r"|國立嘉義(?:女子)?高(?:級)?中(?:學)?\d*學年度|月週份次日")


def _squeeze_cjk(text):
    """移除 PDF 抽字在中文字之間插入的空白（「新 進 教 師」→「新進教師」）。"""
    text = re.sub(rf"(?<=[{CJK}{CJK_PUNCT}])\s+(?=[{CJK}{CJK_PUNCT}])", "", text)
    text = re.sub(rf"(?<=[{CJK}{CJK_PUNCT}])\s+(?=\d)|(?<=\d)\s+(?=[{CJK}{CJK_PUNCT}])", "", text)
    text = re.sub(r"(?<=\d)\s*/\s*(?=\d)", "/", text)
    text = re.sub(r"(?<=[\d:])\s*[-~–]\s*(?=\d)", "-", text)
    return " ".join(text.split())


def _balance_parens(text):
    """補齊或移除 PDF 斷行造成的單邊括號。"""
    text = text.replace("（", "(").replace("）", ")")
    text = re.sub(r"\({2,}", "(", re.sub(r"\){2,}", ")", text))
    out, depth = [], 0
    for index, char in enumerate(text):
        if char == "(":
            depth += 1
        elif char == ")":
            if depth == 0:
                # 「座談 9/19)」：把缺的左括號補在最近的日期前；找不到就丟掉這個右括號。
                prefix = "".join(out)
                opened = prefix.rfind(")") + 1
                dates = list(re.finditer(r"\d{1,2}/\d{1,2}", prefix[opened:]))
                times = list(re.finditer(r"\d{1,2}:\d{2}", prefix[opened:]))
                stamp = [dates[-1]] if dates else times[:1]
                if stamp:
                    cut = opened + stamp[-1].start()
                    out = list(prefix[:cut] + "(" + prefix[cut:])
                    out.append(char)
                continue
            depth -= 1
        out.append(char)
    text = "".join(out)
    if depth > 0:
        text = text.rstrip("。，、 ") + ")" * depth
    return text


def clean_calendar_title(raw, start=None, end=None):
    """把官方行事曆的一格文字整理成可直接閱讀的事件名稱（固定規則，不用 AI）。

    - 去除中文字間的多餘空白、表格頁首與週次雜訊、承辦單位標註。
    - 與事件日期重複的「(8/28)」只留時間地點；「● 」條列改成「；」。
    - 單邊括號補齊，結尾句號移除。
    """
    text = _squeeze_cjk(str(raw or "").replace("\u3000", " "))
    noise = TABLE_NOISE.search(text)
    if noise:
        text = text[:noise.start()]
    # 「工程。08/31開學日…」：句號後面若不是條列，多半是鄰格雜訊。
    sentence = re.match(r"^(.+?。)\s*(\d.*)$", text)
    if sentence and "●" not in text:
        text = sentence.group(1)
    text = OFFICE_TAG.sub("", text)
    text = _balance_parens(text)
    if start is not None:
        stamps = {f"{start.month}/{start.day}"}
        if end is not None and end != start:
            stamps.add(f"{start.month}/{start.day}-{end.month}/{end.day}")
            stamps.add(f"{start.month}/{start.day}-{end.day}")
        # 只刪括號裡與事件日期重複的日期；「9/14前公告…」這種句首日期是內容的一部分。
        pattern = "|".join(re.escape(stamp) for stamp in sorted(stamps, key=len, reverse=True))
        text = re.sub(rf"\(([^()]*)\)", lambda m: "(" + re.sub(
            rf"(?<![\d/])(?:{pattern})(?![\d/]|-\d)\s*", "", m.group(1)) + ")", text)
    for _ in range(3):
        text = re.sub(r"\(\s*[，、,]?\s*\d?\s*\)", "", text)  # 移除日期後留下的空括號
    text = re.sub(r"\(\s*[，、,]\s*", "(", text)
    text = re.sub(r"\s*[，、,]\s*\)", ")", text)
    text = re.sub(r"[。\s]*●\s*", "；", text)
    text = re.sub(r"[：:]\s*；", "：", text)
    text = re.sub(r"】；", "】", text)
    text = re.sub(r"^；|；$", "", text)
    text = re.sub(r"。+", "。", text)
    text = re.sub(r"\s+(?=[)）；，。])|(?<=[(（])\s+", "", text)
    text = re.sub(r"[。．\s]+$", "", text)
    text = re.sub(r"^[\s:：、。，)）]+", "", text)
    return text.strip()


def _event(*, school_id, academic_year, semester, start, end, title, index,
           source_url, source_document, source_revision_value, fetched_at, id_title=None):
    # 事件 ID 用原始抽字計算，整理標題不會讓使用者已設定的提醒失效。
    digest = hashlib.sha1((id_title if id_title is not None else title).encode("utf-8")).hexdigest()[:10]
    return normalize_event(
        event_id=f"official-calendar:{school_id}:{academic_year}-{semester}:{start.isoformat()}:{index}:{digest}",
        school_id=school_id, title=title, start_date=start.isoformat(), end_date=end.isoformat(),
        event_type="school_activity", source_url=source_url, source_document=source_document,
        source_revision=source_revision_value, fetched_at=fetched_at or "",
        parser_provenance={"adapter": f"{school_id}-layout-table", "parser_version": "3"},
    )


def _cysh_week_anchors(lines, academic_year, semester):
    start = _term_date(academic_year, semester, 8 if int(semester) == 1 else 2, 1)
    candidates, cursor = [], start
    while cursor <= start + timedelta(days=220):
        candidates.append(tuple(cursor + timedelta(days=i) for i in range(7)))
        cursor += timedelta(days=1)
    anchors, previous = [], None
    for index, line in enumerate(lines):
        days = [int(value) for value in re.findall(r"(?<!\d)(\d{1,2})(?!\d)", line[:100])][:7]
        if len(days) < 7:
            continue
        matches = [week for week in candidates if tuple(day.day for day in week) == tuple(days)]
        if previous:
            matches = [week for week in matches if week[0] > previous]
        if matches:
            anchors.append((index, matches[0]))
            previous = matches[0][0]
    return anchors


def _parse_cysh_layout(text, **context):
    """嘉中行事曆：每格一行一事，長標題會折到下一行。

    折行（不以「N 日」開頭的行）接回同一格上一則事件；句中的「9 日補假」不再被當成新事件。
    事件索引與 ID 沿用舊版切法計算，讓既有提醒對得上。
    """
    lines = str(text).splitlines()
    anchors = _cysh_week_anchors(lines, context["academic_year"], context["semester"])
    anchor_lines = {index for index, _ in anchors}
    first_anchor = min(anchor_lines) if anchor_lines else len(lines)
    date_token = re.compile(r"(?<![\d/:])(?P<d1>\d{1,2})(?:\s*[-~]\s*(?P<d2>\d{1,2}))?\s*日")
    pending, last, raw_index, recovered = [], None, 0, 0
    for line_index, line in enumerate(lines):
        if not anchors:
            break
        stripped = line.strip()
        if not stripped or line_index < first_anchor:
            last = None
            continue
        if line_index in anchor_lines:
            # 週次列本身也可能接著寫事件（「二 15 16 … 21 17-18 日高三複習考」）。
            last = None
        # 舊版以「最近的週次列」定週；正確應是「上方最近的週次列」。兩者都試，
        # 舊版接受過的事件索引照舊累加，新找回的事件另外編號，既有 ID 不變。
        nearest = min(anchors, key=lambda item: abs(item[0] - line_index))[1]
        above = [week for index, week in anchors if index < line_index]
        above = above[-1] if above else nearest
        matches = list(date_token.finditer(line))
        starts_with_date = bool(matches) and (line_index in anchor_lines or
                                              re.fullmatch(r"\s*(?:\d{1,2}\s*月\s*)?", line[:matches[0].start()]) is not None)
        if line_index in anchor_lines and not matches:
            continue
        if not starts_with_date:
            # 左側直書的月份／年份／寒暑假標籤（「十」「月」「116」「寒」「假」）不是事件內容。
            label = re.fullmatch(r"[一二三四五六七八九十月年寒暑假]|\d{2,3}", stripped)
            span = re.match(r"^\s*(\d{1,2})/(\d{1,2})(?:\s*-\s*(\d{1,2})/(\d{1,2}))?\s*(.+)$", line)
            if span and len(_normal_title(span.group(5))) >= 2:
                # 「11/30-12/4 中等學校籃球聯賽」：以月/日開頭的是另一則事件。
                try:
                    start = _term_date(context["academic_year"], context["semester"], int(span.group(1)), int(span.group(2)))
                    end = start
                    if span.group(3):
                        candidate = _term_date(context["academic_year"], context["semester"], int(span.group(3)), int(span.group(4)))
                        if 0 < (candidate - start).days <= 31:
                            end = candidate
                    recovered += 1
                    last = {"start": start, "end": end, "index": f"r{recovered}",
                            "id_title": _normal_title(span.group(5)), "text": span.group(5)}
                    pending.append(last)
                    continue
                except ValueError:
                    pass
            if last is not None and not label:
                last["text"] += " " + stripped
            # 舊版會把句中的日期也切成一則；照算索引但不輸出，事件 ID 才不會位移。
            for match in matches:
                if len(_normal_title(line[match.end():])) >= 2 and [d for d in nearest if d.day == int(match["d1"])]:
                    raw_index += 1
            continue
        for match_index, match in enumerate(matches):
            end_pos = matches[match_index + 1].start() if match_index + 1 < len(matches) else len(line)
            segment = re.split(r"\s{12,}", line[match.end():end_pos], 1)[0]
            title = _normal_title(segment)
            if len(title) < 2 or title in {"V1", "星期", "None"}:
                continue
            legacy = [day for day in nearest if day.day == int(match["d1"])]
            options = legacy or [day for day in above if day.day == int(match["d1"])]
            if not options:
                last = None
                continue
            if legacy:
                index = raw_index
                raw_index += 1
            else:
                recovered += 1
                index = f"r{recovered}"
            mid_sentence = match_index > 0 and match.start() > 0 and not line[match.start() - 1].isspace()
            if mid_sentence and last is not None:
                last["text"] += " " + line[match.start():end_pos].strip()
                continue
            start, end = options[0], options[0]
            if match["d2"]:
                for offset in range(32):
                    candidate = start + timedelta(days=offset)
                    if candidate.day == int(match["d2"]):
                        end = candidate
                        break
            last = {"start": start, "end": end, "index": index, "id_title": title, "text": segment}
            pending.append(last)
    rows = []
    for row in pending:
        title = clean_calendar_title(row["text"], row["start"], row["end"]) or row["id_title"]
        rows.append(_event(start=row["start"], end=row["end"], title=title, index=row["index"],
                           id_title=row["id_title"], **context))
    return rows


def _parse_cygsh_layout(text, **context):
    items, current = [], None
    for raw in str(text).splitlines():
        line = _normal_title(raw)
        numbered = re.match(r"^\d{1,2}\.\s*(.*)$", line)
        if numbered:
            if current:
                items.append(current)
            current = numbered.group(1)
        elif current and line not in {"星期", "日期", "預定重要工作", "備考"}:
            current += " " + line
    if current:
        items.append(current)
    rows, seen, cleaned_seen, index = [], set(), set(), 0
    for item in items:
        title = _normal_title(item)
        stamp = RANGE.search(title) or MD.search(title)
        if not stamp or len(title) < 5:
            continue
        month = int(stamp["m1"] if stamp.re is RANGE else stamp["month"])
        day = int(stamp["d1"] if stamp.re is RANGE else stamp["day"])
        try:
            start = _term_date(context["academic_year"], context["semester"], month, day)
        except ValueError:
            continue
        key = (start.isoformat(), title)
        if key in seen:
            continue
        seen.add(key)
        end = start
        if stamp.re is RANGE:
            try:
                candidate = _term_date(context["academic_year"], context["semester"],
                                       int(stamp["m2"] or month), int(stamp["d2"]))
                # 超過一個月的區間（例如投稿期間）保留在標題文字裡，不當成連續事件。
                if 0 < (candidate - start).days <= 31:
                    end = candidate
            except ValueError:
                pass
        clean = clean_calendar_title(title, start, end) or title
        index += 1
        # PDF 有時把同一事件印在兩欄，整理後完全相同就只留一則（索引照算，既有 ID 不位移）。
        if (start, clean) in cleaned_seen:
            continue
        cleaned_seen.add((start, clean))
        rows.append(_event(start=start, end=end, title=clean, index=index - 1, id_title=title, **context))
    return rows


def calendar_quality_gate(events, *, school_id, academic_year, semester,
                          last_known_good_count=None):
    rows = list(events or [])
    minimum = {"cysh": 40, "cygsh": 25}.get(school_id, 20)
    term_start = _term_date(academic_year, semester, 8 if int(semester) == 1 else 2, 1)
    term_end = _term_date(academic_year, semester, 2 if int(semester) == 1 else 7, 28)
    titles = [_normal_title(row.get("title")) for row in rows]
    fragments = [title for title in titles if len(title) <= 3 or not re.search(r"[\u4e00-\u9fffA-Za-z]", title)]
    months = sorted({int(row["start_date"][5:7]) for row in rows})
    out_of_range, long_ranges = [], []
    for row in rows:
        start, end = date.fromisoformat(row["start_date"]), date.fromisoformat(row["end_date"])
        if not term_start <= start <= term_end or not term_start <= end <= term_end:
            out_of_range.append(row["id"])
        if (end - start).days > 31:
            long_ranges.append(row["id"])
    duplicates = sum(count - 1 for count in Counter((row["start_date"], _normal_title(row["title"])) for row in rows).values() if count > 1)
    reasons = []
    if len(rows) < minimum: reasons.append(f"event_count_below_{minimum}")
    if len(months) < 4: reasons.append("month_coverage_below_4")
    if rows and len(fragments) / len(rows) > 0.20: reasons.append("fragment_ratio_above_0.20")
    if rows and duplicates / len(rows) > 0.10: reasons.append("duplicate_ratio_above_0.10")
    if out_of_range: reasons.append("date_outside_term")
    if long_ranges: reasons.append("range_over_31_days")
    if last_known_good_count and len(rows) < max(minimum, int(last_known_good_count * 0.60)):
        reasons.append("event_count_collapsed_from_last_known_good")
    return {"passed": not reasons, "event_count": len(rows), "months": months,
            "fragment_count": len(fragments), "duplicate_count": duplicates,
            "out_of_range_count": len(out_of_range), "long_range_count": len(long_ranges),
            "last_known_good_count": last_known_good_count, "reasons": reasons}


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
    context = dict(school_id=school_id, academic_year=academic_year, semester=semester,
                   source_url=source_url, source_document=source_document,
                   source_revision_value=source_revision_value, fetched_at=fetched_at)
    if "\f" in text and school_id == "cysh":
        return validate_events(_parse_cysh_layout(text, **context), school_id=school_id)
    if "\f" in text and school_id == "cygsh":
        return validate_events(_parse_cygsh_layout(text, **context), school_id=school_id)
    default_year = _calendar_year(academic_year, semester, 8 if int(semester) == 1 else 2)
    rows = []
    for index, raw in enumerate(text.splitlines()):
        line = " ".join(raw.split()).strip()
        if not line or "預定重要工作" in line and not (MD.search(line) or GREGORIAN.search(line) or ROC.search(line)):
            continue
        month_match = MD.search(line)
        line_year = _calendar_year(academic_year, semester, month_match["month"]) if month_match else default_year
        explicit = parse_explicit_date(line, default_year=line_year)
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
