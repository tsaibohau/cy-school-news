# -*- coding: utf-8 -*-
"""官方行事曆工具: normalized events → public calendar/ICS/notify。

用法:
  python scraper/schoolcal.py build    # 產生 docs/calendar.ics(排程每輪執行)
  python scraper/schoolcal.py discover # 檢查官方日曆索引, fail-closed
  python scraper/schoolcal.py notify   # 當天有事件就推播到 {NTFY_TOPIC}-calendar

scraper/events.json 由維護者手動整理(來源:兩校官網的行事曆 PDF),
每學期初更新一次即可。格式:
  [{"date": "2026-08-31", "school": "嘉中", "title": "開學日"}]

(檔名刻意不用 calendar.py:那會遮蔽 Python 標準函式庫的 calendar 模組。)
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from calendar_adapter import (discover_calendar_attachments, extract_pdf_text,
                              fetch_source, parse_calendar_text, source_revision)
from calendar_schema import normalize_event, validate_events, source_status
from school_registry import SCHOOLS

ROOT = Path(__file__).resolve().parent.parent
EVENTS_PATH = ROOT / "scraper" / "events.json"
ICS_PATH = ROOT / "docs" / "calendar.ics"
JSON_PATH = ROOT / "docs" / "data" / "calendar-events.json"
STATUS_PATH = ROOT / "docs" / "data" / "calendar-source-status.json"
OFFICIAL_PATH = ROOT / "docs" / "data" / "official-calendar-events.json"
TW_TZ = timezone(timedelta(hours=8))


def load_events() -> list:
    events = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))
    return sorted((e for e in events if e.get("date") and e.get("title")),
                  key=lambda e: e["date"])


def build_public_events(events) -> list:
    """Expose curated school-calendar records, separate from announcement dates."""
    result = []
    for e in events:
        school = e.get("school", "")
        school_id = e.get("school_id") or {"嘉中": "cysh", "嘉女": "cygsh"}.get(school, "")
        source_url = e.get("source_url") or next(
            (s.calendar_sources[0].url for s in SCHOOLS.values() if s.short_name == school), ""
        )
        row = normalize_event(
            event_id=e.get("id") or f"official-calendar:{school_id}:{e['date']}:{e['title']}",
            school_id=school_id,
            title=e["title"],
            start_date=e["date"],
            end_date=e.get("end_date", e["date"]),
            event_type=e.get("event_type", "school_activity"),
            source_url=source_url,
            source_document=e.get("source_document", "legacy-curated-calendar"),
            source_revision=e.get("source_revision", "legacy-curated"),
            fetched_at=e.get("fetched_at", ""),
            parser_provenance=e.get("parser_provenance", {"adapter": "legacy-curated", "parser_version": "1"}),
        )
        row.update({
            # Backward-compatible fields consumed by the current UI/ICS.
            "date": row["start_date"], "endDate": row["end_date"],
            "school": school, "kind": "official", "sourceLabel": "學校行事曆",
        })
        result.append(row)
    return validate_events(result, school_id=None)


def academic_period(day=None):
    """Return Taiwan academic year/semester without inferring event dates."""
    day = day or datetime.now(TW_TZ).date()
    if day.month >= 8:
        return day.year - 1911, 1
    if day.month == 1:
        return day.year - 1912, 1
    return day.year - 1912, 2


def load_official_events() -> list:
    if not OFFICIAL_PATH.exists():
        return []
    try:
        return validate_events(json.loads(OFFICIAL_PATH.read_text(encoding="utf-8")), school_id=None)
    except (OSError, ValueError, TypeError):
        return []


def merge_calendar_events(curated, official):
    """Replace curated rows only for school/term pairs with validated official data."""
    official = validate_events(official, school_id=None)
    covered = {(row["school_id"], int(row["academic_year"]), int(row["semester"])) for row in official}
    merged = []
    for row in curated:
        school_id = row.get("school_id", "")
        try:
            day = datetime.fromisoformat(row["start_date"]).date()
            term = academic_period(day)
        except (KeyError, TypeError, ValueError):
            term = None
        if term and (school_id, term[0], term[1]) in covered:
            continue
        merged.append(row)
    for row in official:
        visible = dict(row)
        visible.update({
            "date": row["start_date"], "endDate": row["end_date"],
            "school": SCHOOLS[row["school_id"]].short_name if row["school_id"] in SCHOOLS else "",
            "kind": "official", "sourceLabel": "學校行事曆",
        })
        merged.append(visible)
    deduped = {row["id"]: row for row in merged}
    return sorted(deduped.values(), key=lambda row: (row["start_date"], row["school_id"], row["id"]))


def discover(*, academic_year=None, semester=None) -> int:
    """Check official indexes and publish only validated parsed documents.

    Missing 115-1 documents are represented as awaiting_official_source.  The
    last trustworthy public dataset is never replaced by an empty/guessed one.
    """
    checked = datetime.now(TW_TZ).isoformat(timespec="seconds")
    current_year, current_semester = academic_period()
    academic_year = int(academic_year or os.environ.get("CALENDAR_ACADEMIC_YEAR") or current_year)
    semester = int(semester or os.environ.get("CALENDAR_SEMESTER") or current_semester)
    if semester not in (1, 2):
        raise ValueError("calendar semester must be 1 or 2")
    statuses = []
    published = []
    if OFFICIAL_PATH.exists():
        try:
            published = json.loads(OFFICIAL_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            published = []
    for school in SCHOOLS.values():
        source = school.calendar_sources[0]
        try:
            html, revision, content_type = fetch_source(source.url)
            matches = discover_calendar_attachments(
                html.decode("utf-8", errors="replace"), base_url=school.base_url,
                academic_year=academic_year, semester=semester,
            )
            if not matches:
                statuses.append(source_status(
                    school_id=school.school_id, academic_year=academic_year, semester=semester,
                    status="awaiting_official_source", source_url=source.url,
                    last_checked_at=checked,
                    last_verified_document=None,
                ))
                continue
            # A matching attachment still needs deterministic PDF parsing and
            # validation before it can replace public events.
            document = matches[0]
            content, doc_revision, content_type = fetch_source(document["url"])
            if "html" in content_type or document["url"].lower().endswith((".php", "/")):
                nested = discover_calendar_attachments(
                    content.decode("utf-8", errors="replace"),
                    base_url=document["url"], academic_year=academic_year, semester=semester,
                    allowed_origin=school.base_url,
                )
                if not nested:
                    raise ValueError("calendar detail page has no matching PDF attachment")
                document = nested[0]
                content, doc_revision, _ = fetch_source(document["url"])
            text = extract_pdf_text(content)
            parsed = parse_calendar_text(
                text, school_id=school.school_id, academic_year=academic_year, semester=semester,
                source_url=document["url"], source_document=document["label"],
                source_revision_value=doc_revision, fetched_at=checked,
            )
            validate_events(parsed, school_id=school.school_id)
            if not parsed:
                statuses.append(source_status(
                    school_id=school.school_id, academic_year=academic_year, semester=semester,
                    status="validation_failed", source_url=source.url,
                    last_checked_at=checked,
                    last_verified_document={"url": document["url"], "label": document["label"], "revision": doc_revision},
                    event_count=0, error="official document produced no validated events",
                ))
                continue
            published = [row for row in published if not (
                row.get("school_id") == school.school_id and
                row.get("academic_year") == academic_year and row.get("semester") == semester
            )]
            for row in parsed:
                row["academic_year"] = academic_year
                row["semester"] = semester
            published.extend(parsed)
            statuses.append(source_status(
                school_id=school.school_id, academic_year=academic_year, semester=semester,
                status="official_complete",
                source_url=source.url, last_checked_at=checked,
                last_verified_document={"url": document["url"], "label": document["label"], "revision": doc_revision},
                event_count=len(parsed),
            ))
        except Exception as exc:
            statuses.append(source_status(
                school_id=school.school_id, academic_year=academic_year, semester=semester,
                status="parse_failed", source_url=source.url,
                last_checked_at=checked, error=str(exc),
            ))
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATUS_PATH.write_text(json.dumps(statuses, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if published:
        OFFICIAL_PATH.write_text(json.dumps(published, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[info] 官方行事曆來源狀態 → {STATUS_PATH}")
    return 0


def events_on(events, day_str: str) -> list:
    return [e for e in events if e["date"] == day_str]


def _escape(text: str) -> str:
    """RFC 5545 文字欄位跳脫。"""
    return (text.replace("\\", "\\\\").replace(";", "\\;")
                .replace(",", "\\,").replace("\n", "\\n"))


def _fold(line: str) -> str:
    """RFC 5545 行摺疊:每行至多約 75 octets,續行以空白開頭;不切斷 UTF-8 字元。"""
    out, cur, cur_len = [], "", 0
    for ch in line:
        w = len(ch.encode("utf-8"))
        if cur_len + w > 74:
            out.append(cur)
            cur, cur_len = " " + ch, 1 + w
        else:
            cur += ch
            cur_len += w
    out.append(cur)
    return "\r\n".join(out)


def build_ics(events) -> str:
    """把事件清單轉成 iCalendar 全天事件(含前一天 09:00 的提醒)。"""
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0",
        "PRODID:-//cy-school-news//school calendar//ZH-TW",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:嘉校快訊行事曆",
        "X-WR-TIMEZONE:Asia/Taipei",
    ]
    for e in events:
        day = datetime.strptime(e["date"], "%Y-%m-%d").date()
        try:
            end_day = datetime.strptime(e.get("end_date", e["date"]), "%Y-%m-%d").date()
        except (TypeError, ValueError):
            end_day = day
        nxt = max(day, end_day) + timedelta(days=1)
        school = e.get("school", "")
        summary = f'[{school}] {e["title"]}' if school else e["title"]
        digest = hashlib.md5(f'{e["date"]}|{summary}'.encode("utf-8")).hexdigest()[:12]
        lines += [
            "BEGIN:VEVENT",
            f'UID:{day:%Y%m%d}-{digest}@cy-school-news',
            # DTSTAMP 固定取事件日期,讓輸出可重現,排程重跑不會產生無意義的檔案變更
            f"DTSTAMP:{day:%Y%m%d}T000000Z",
            f"DTSTART;VALUE=DATE:{day:%Y%m%d}",
            f"DTEND;VALUE=DATE:{nxt:%Y%m%d}",
            f"SUMMARY:{_escape(summary)}",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_escape(summary)}",
            # 全天事件自當日 00:00 起算,-PT15H = 前一天 09:00 提醒
            "TRIGGER:-PT15H",
            "END:VALARM",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(ln) for ln in lines) + "\r\n"


def build() -> int:
    events = load_events()
    public_events = merge_calendar_events(build_public_events(events), load_official_events())
    legacy_shape = [{
        "date": row["start_date"], "end_date": row["end_date"],
        "school": SCHOOLS[row["school_id"]].short_name if row["school_id"] in SCHOOLS else "",
        "title": row["title"],
    } for row in public_events]
    ICS_PATH.write_text(build_ics(legacy_shape), encoding="utf-8", newline="")
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(public_events, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[info] {len(public_events)} 個事件 → {ICS_PATH}")
    return 0


def notify() -> int:
    import requests
    today = datetime.now(TW_TZ).strftime("%Y-%m-%d")
    if JSON_PATH.exists():
        canonical = json.loads(JSON_PATH.read_text(encoding="utf-8"))
        notification_events = [{
            "date": row.get("start_date") or row.get("date"),
            "school": row.get("school") or (SCHOOLS[row.get("school_id")].short_name if row.get("school_id") in SCHOOLS else ""),
            "title": row.get("title", ""),
        } for row in canonical]
    else:
        notification_events = load_events()
    todays = events_on(notification_events, today)
    if not todays:
        print(f"[info] {today} 沒有行事曆事件")
        return 0
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        print("[info] 未設定 NTFY_TOPIC,略過推播")
        return 0
    for e in todays:
        title = f'[{e.get("school", "嘉校")}] 今日行事曆'
        try:
            requests.post(
                f"https://ntfy.sh/{topic}-calendar",
                data=e["title"].encode("utf-8"),
                headers={"Title": title.encode("utf-8"), "Tags": "calendar"},
                timeout=15,
            )
            print(f"[info] 已推播:{e.get('school', '')} {e['title']}")
        except Exception as ex:
            print(f"[warn] 推播失敗:{ex}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "build":
        sys.exit(build())
    if cmd == "notify":
        sys.exit(notify())
    if cmd == "discover":
        sys.exit(discover())
    print("用法:python scraper/schoolcal.py [build|notify|discover]", file=sys.stderr)
    sys.exit(2)
