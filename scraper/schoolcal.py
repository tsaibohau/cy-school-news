# -*- coding: utf-8 -*-
"""官方行事曆工具: normalized events → public calendar/ICS/notify。

用法:
  python scraper/schoolcal.py build    # 產生 docs/calendar.ics(排程每輪執行)
  python scraper/schoolcal.py discover # 檢查官方日曆索引, fail-closed
  python scraper/schoolcal.py notify   # 當天有事件就推播到 {NTFY_TOPIC}-calendar

scraper/events.json 由維護者手動整理(來源:兩校官網的行事曆 PDF),
每學期初更新一次即可。格式:
  [{"date": "2026-08-31", "school": "嘉中", "title": "開學日"}]
# -*- coding: utf-8 -*-
"""官方行事曆工具: normalized events -> public calendar/ICS/notify。

用法:
  python scraper/schoolcal.py build     # 產生 docs/calendar.ics(排程每輪執行)
  python scraper/schoolcal.py discover  # 檢查官方日曆索引，fail-closed
  python scraper/schoolcal.py notify    # 當天有事件就推播到 {NTFY_TOPIC}-calendar

scraper/events.json 由維護者手動整理(來源:兩校官網的行事曆 PDF)，
每學期變更更新一次即可。格式:
  [{"date": "2026-08-31", "school": "嘉中", "title": "開學日"}]

(檔名刻意不用 calendar.py:那會遮蔽 Python 標準函式庫的 calendar 模組。)
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from calendar_adapter import (
    discover_calendar_attachments,
    extract_pdf_text,
    fetch_source,
    parse_calendar_text,
    source_revision,
    calendar_quality_gate,
)
from calendar_schema import normalize_event, validate_events, source_status
from school_registry import SCHOOLS

ROOT = Path(__file__).resolve().parent.parent
EVENTS_PATH = ROOT / "scraper" / "events.json"
ICS_PATH = ROOT / "docs" / "calendar.ics"
JSON_PATH = ROOT / "docs" / "data" / "calendar-events.json"
STATUS_PATH = ROOT / "docs" / "data" / "calendar-source-status.json"
OFFICIAL_PATH = ROOT / "docs" / "data" / "official-calendar-events.json"
ANNOUNCEMENTS_PATH = ROOT / "docs" / "data" / "announcements.json"
REFRESH_MAX_AGE_HOURS = 24
TW_TZ = timezone(timedelta(hours=8))


def academic_period(day=None):
    day = day or datetime.now(TW_TZ).date()
    if day.month >= 8:
        return day.year - 1911, 1
    if day.month == 1:
        return day.year - 1912, 1
    if day.month >= 2 and day.month <= 7:
        return day.year - 1912, 2
    return day.year - 1911, 1


def load_announcements() -> list:
    if not ANNOUNCEMENTS_PATH.exists():
        return []
    try:
        with open(ANNOUNCEMENTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("items", []) if isinstance(data, dict) else []
    except Exception:
        return []


def find_calendar_announcements(announcements, *, school_id, base_url, academic_year, semester) -> list:
    urls = []
    for item in announcements:
        if item.get("school") != school_id:
            continue
        title = item.get("title", "")
        if "行事曆" not in title:
            continue
        
        m = re.search(r"1\d{2}", title)
        if m:
            title_year = int(m.group(0))
            if title_year != academic_year:
                continue
                
        url = item.get("url") or item.get("link") or ""
        if url and url not in urls:
            urls.append(url)
    return urls


def needs_calendar_refresh(*, academic_year=None, semester=None, statuses=None, official_events=None, announcements=None):
    curr_year, curr_sem = academic_period()
    academic_year = academic_year or curr_year
    semester = semester or curr_sem
    
    if statuses is None and STATUS_PATH.exists():
        try:
            with open(STATUS_PATH, "r", encoding="utf-8") as f:
                statuses = json.load(f)
        except Exception:
            statuses = {}
    statuses = statuses or {}
    
    if official_events is None and OFFICIAL_PATH.exists():
        try:
            with open(OFFICIAL_PATH, "r", encoding="utf-8") as f:
                official_events = json.load(f)
        except Exception:
            official_events = []
    official_events = official_events or []
    
    if announcements is None:
        announcements = load_announcements()
        
    reasons = []
    today_str = datetime.now(TW_TZ).date().isoformat()
    
    for school in SCHOOLS:
        if not getattr(school, "official_calendar", False):
            continue
        school_id = school.id
        key = f"{school_id}:{academic_year}:{semester}"
        
        st = statuses.get(key)
        if not st or st.get("status") != "official_complete":
            reasons.append(f"{school_id}:missing_or_incomplete_term")
            continue
            
        school_events = [e for e in official_events if e.get("school") == school.name or e.get("school_id") == school_id]
        if school_events:
            max_end = max((e.get("end_date") or e.get("date") or "") for e in school_events)
            if max_end and max_end < today_str:
                reasons.append(f"{school_id}:events_expired")
        else:
            reasons.append(f"{school_id}:events_expired")
            
        last_checked = st.get("last_checked_at", "")
        if last_checked:
            try:
                dt = datetime.fromisoformat(last_checked.replace("Z", "+00:00"))
                if datetime.now(timezone.utc) - dt > timedelta(hours=REFRESH_MAX_AGE_HOURS):
                    reasons.append(f"{school_id}:ttl_expired")
            except Exception:
                reasons.append(f"{school_id}:ttl_expired")
        else:
            reasons.append(f"{school_id}:ttl_expired")
            
        cand_urls = find_calendar_announcements(announcements, school_id=school_id, base_url=getattr(school, "origin", ""), academic_year=academic_year, semester=semester)
        if cand_urls:
            for item in announcements:
                if (item.get("url") in cand_urls or item.get("link") in cand_urls):
                    pub = item.get("first_seen") or item.get("published_at") or item.get("date") or ""
                    if pub and pub > last_checked:
                        reasons.append(f"{school_id}:new_announcement_detected")
                        break

    return bool(reasons), reasons


def discover(*, academic_year=None, semester=None) -> int:
    import requests
    curr_year, curr_sem = academic_period()
    academic_year = academic_year or curr_year
    semester = semester or curr_sem
    
    announcements = load_announcements()
    updated_count = 0
    
    all_statuses = {}
    if STATUS_PATH.exists():
        try:
            with open(STATUS_PATH, "r", encoding="utf-8") as f:
                all_statuses = json.load(f)
        except Exception:
            all_statuses = {}
            
    all_official_events = []
    if OFFICIAL_PATH.exists():
        try:
            with open(OFFICIAL_PATH, "r", encoding="utf-8") as f:
                all_official_events = json.load(f)
        except Exception:
            all_official_events = []
            
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0"})
    
    for school in SCHOOLS:
        if not getattr(school, "official_calendar", False):
            continue
            
        school_id = school.id
        print(f"[info] Discovering calendar for {school_id} ({academic_year}-{semester})...")
        
        sources_to_try = list(getattr(school, "calendar_sources", []))
        announcement_urls = find_calendar_announcements(announcements, school_id=school_id, base_url=getattr(school, "origin", ""), academic_year=academic_year, semester=semester)
        
        for url in announcement_urls:
            if url not in sources_to_try:
                sources_to_try.append(url)
                
        parsed_events = None
        used_url = None
        
        for src_url in sources_to_try:
            try:
                attachments = discover_calendar_attachments(src_url, session=session)
                for att_url in attachments:
                    pdf_resp = session.get(att_url, timeout=30)
                    if pdf_resp.status_code == 200:
                        text = extract_pdf_text(pdf_resp.content)
                        events = parse_calendar_text(text, school_id=school_id, academic_year=academic_year, semester=semester)
                        if validate_events(events) and calendar_quality_gate(events):
                            parsed_events = events
                            used_url = att_url
                            break
                if parsed_events:
                    break
            except Exception as e:
                print(f"[warn] Failed processing {src_url} for {school_id}: {e}")
                
        key = f"{school_id}:{academic_year}:{semester}"
        now_iso = datetime.now(timezone.utc).isoformat()
        
        if parsed_events:
            all_official_events = [e for e in all_official_events if not (e.get("school_id") == school_id and e.get("academic_year") == academic_year and e.get("semester") == semester)]
            all_official_events.extend(parsed_events)
            
            all_statuses[key] = source_status(
                school_id=school_id,
                academic_year=academic_year,
                semester=semester,
                status="official_complete",
                source_url=used_url,
                last_checked_at=now_iso,
                event_count=len(parsed_events)
            )
            updated_count += 1
        else:
            all_statuses[key] = source_status(
                school_id=school_id,
                academic_year=academic_year,
                semester=semester,
                status="failed_or_missing",
                source_url="",
                last_checked_at=now_iso,
                event_count=0
            )
            
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(STATUS_PATH, "w", encoding="utf-8") as f:
        json.dump(all_statuses, f, ensure_ascii=False, indent=2)
        
    OFFICIAL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OFFICIAL_PATH, "w", encoding="utf-8") as f:
        json.dump(all_official_events, f, ensure_ascii=False, indent=2)
        
    return updated_count


def build() -> int:
    try:
        should_refresh, reasons = needs_calendar_refresh()
        if should_refresh:
            print(f"[info] 偵測到行事曆需更新 ({', '.join(reasons)})，自動執行 discover 重新抓取...")
            discover()
    except Exception as e:
        print(f"[warn] Auto discover check failed: {e}")
        
    events = []
    if EVENTS_PATH.exists():
        try:
            with open(EVENTS_PATH, "r", encoding="utf-8") as f:
                raw_events = json.load(f)
                events.extend(raw_events)
        except Exception as e:
            print(f"[warn] Failed to load {EVENTS_PATH}: {e}")
            
    if OFFICIAL_PATH.exists():
        try:
            with open(OFFICIAL_PATH, "r", encoding="utf-8") as f:
                official_events = json.load(f)
                events.extend(official_events)
        except Exception as e:
            print(f"[warn] Failed to load {OFFICIAL_PATH}: {e}")
            
    normalized = [normalize_event(e) for e in events]
    normalized = [e for e in normalized if e]
    
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(normalized, f, ensure_ascii=False, indent=2)
        
    print(f"[info] Built calendar with {len(normalized)} events.")
    return len(normalized)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "discover":
        discover()
    else:
        build()
(檔名刻意不用 calendar.py:那會遮蔽 Python 標準函式庫的 calendar 模組。)
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from calendar_adapter import (discover_calendar_attachments, extract_pdf_text,
                              fetch_source, parse_calendar_text, source_revision,
                              calendar_quality_gate)
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


def merge_calendar_events(curated, official, *, accepted_terms=None):
    """Replace curated rows only for school/term pairs with validated official data."""
    official = validate_events(official, school_id=None)
    covered = {(row["school_id"], int(row["academic_year"]), int(row["semester"])) for row in official}
    if accepted_terms is not None:
        covered &= set(accepted_terms)
        official = [row for row in official if
                    (row["school_id"], int(row["academic_year"]), int(row["semester"])) in covered]
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
    previous_statuses = []
    if STATUS_PATH.exists():
        try:
            previous_statuses = json.loads(STATUS_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            previous_statuses = []
    statuses = []
    published = []
    if OFFICIAL_PATH.exists():
        try:
            published = json.loads(OFFICIAL_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            published = []
    for school in SCHOOLS.values():
        if not school.capabilities.get("official_calendar") or not school.calendar_sources:
            continue
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
            previous = next((row for row in previous_statuses if
                             row.get("school_id") == school.school_id and
                             row.get("academic_year") == academic_year and
                             row.get("semester") == semester and
                             row.get("status") == "official_complete" and
                             row.get("quality", {}).get("passed") is True), None)
            quality = calendar_quality_gate(
                parsed, school_id=school.school_id, academic_year=academic_year,
                semester=semester,
                last_known_good_count=previous.get("event_count") if previous else None,
            )
            if not quality["passed"]:
                quality["using_last_known_good"] = bool(previous)
                statuses.append(source_status(
                    school_id=school.school_id, academic_year=academic_year, semester=semester,
                    status="validation_failed", source_url=source.url,
                    last_checked_at=checked,
                    last_verified_document={"url": document["url"], "label": document["label"], "revision": doc_revision},
                    event_count=len(parsed), error=";".join(quality["reasons"]), quality=quality,
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
                quality=quality,
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
    line = line.rstrip()
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
        "X-WR-CALNAME:嘉義校訊行事曆",
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
    accepted_terms = set()
    if STATUS_PATH.exists():
        try:
            accepted_terms = {
                (row["school_id"], int(row["academic_year"]), int(row["semester"]))
                for row in json.loads(STATUS_PATH.read_text(encoding="utf-8"))
                if ((row.get("status") == "official_complete" and row.get("quality", {}).get("passed") is True) or
                    (row.get("status") == "validation_failed" and row.get("quality", {}).get("using_last_known_good") is True))
            }
        except (OSError, ValueError, KeyError, TypeError):
            accepted_terms = set()
    public_events = merge_calendar_events(
        build_public_events(events), load_official_events(), accepted_terms=accepted_terms,
    )
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
