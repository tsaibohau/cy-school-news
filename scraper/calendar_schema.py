# -*- coding: utf-8 -*-
"""Canonical official-school-calendar records and source status."""
from datetime import date

ALLOWED_STATUSES = {
    "awaiting_official_source", "partial_official", "official_complete",
    "parse_failed", "validation_failed",
}


def _iso(value):
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "")
    date.fromisoformat(text)
    return text


def normalize_event(*, event_id, school_id, title, start_date, end_date=None,
                    all_day=True, event_type="school_activity", source_url="",
                    source_document="", source_revision="", fetched_at="",
                    parser_provenance=None):
    start = _iso(start_date)
    end = _iso(end_date or start)
    if end < start:
        raise ValueError("calendar event end_date precedes start_date")
    title = str(title or "").strip()
    if not title:
        raise ValueError("calendar event title required")
    return {
        "id": str(event_id),
        "school_id": str(school_id),
        "title": title,
        "start_date": start,
        "end_date": end,
        "all_day": bool(all_day),
        "event_type": str(event_type or "school_activity"),
        "source_url": str(source_url or ""),
        "source_document": str(source_document or ""),
        "source_revision": str(source_revision or ""),
        "fetched_at": str(fetched_at or ""),
        "provenance": "official_school_calendar",
        "parser_provenance": parser_provenance or {},
    }


def validate_events(events, *, school_id=None):
    rows = list(events or [])
    ids = set()
    for row in rows:
        required = ("id", "school_id", "title", "start_date", "end_date",
                    "provenance", "source_url")
        if any(not row.get(key) for key in required):
            raise ValueError("calendar event missing required provenance field")
        if row["provenance"] != "official_school_calendar":
            raise ValueError("calendar provenance mismatch")
        if school_id and row["school_id"] != school_id:
            raise ValueError("calendar school mismatch")
        if row["id"] in ids:
            raise ValueError("duplicate calendar event id")
        ids.add(row["id"])
        _iso(row["start_date"])
        _iso(row["end_date"])
        if row["end_date"] < row["start_date"]:
            raise ValueError("calendar event range invalid")
    return rows


def source_status(*, school_id, academic_year, semester, status,
                  source_url, last_checked_at, last_verified_document=None,
                  event_count=0, error=""):
    if status not in ALLOWED_STATUSES:
        raise ValueError(f"unknown calendar source status: {status}")
    return {
        "school_id": school_id,
        "academic_year": int(academic_year),
        "semester": int(semester),
        "status": status,
        "source_url": source_url,
        "last_checked_at": last_checked_at,
        "last_verified_document": last_verified_document,
        "event_count": int(event_count),
        "error": error,
    }
