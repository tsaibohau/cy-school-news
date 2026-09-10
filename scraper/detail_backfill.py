# -*- coding: utf-8 -*-
"""Bounded Detail V2 backfill with a persistent metadata-only cursor.

The sidecars produced here are transient in production: member content is
exported first and the public projection removes detail files before commit.
The cursor lives in fetch_state.json so protected attachment backfill can still
progress across runs without publishing attachment text.
"""
import json
import os
import re
import time
from datetime import datetime

import requests
from public_shards import build_school_shards
from extractive_summary import SUMMARY_VERSION, summarize_detail

from scrape import (CONFIG, ROOT, TW_TZ, UA, atomic_write_text, decode_response,
                    extract_article_date_result, extract_article_snippet,
                    extract_article_title, is_mojibake, merge_title,
                    choose_date, record_detail_fetch_failure,
                    write_detail_record)

DATA_PATH = ROOT / "docs" / "data" / "announcements.json"
ARCHIVE_PATH = ROOT / "docs" / "data" / "archive.json"
BACKFILL_STATE_KEY = "__member_detail_backfill__"
SEARCHABLE_ATTACHMENT_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".pptx"}


def backfill_existing_summaries(items, cap):
    """Summarize existing sidecars without another request to either school."""
    updated = 0
    ordered = sorted(items, key=lambda item: item.get("first_seen") or "", reverse=True)
    for item in ordered:
        if updated >= cap:
            break
        detail_ref = str(item.get("detail_ref") or "")
        if not re.match(r"^data/details/(?:cysh|cygsh|pksh)/[A-Za-z0-9._-]+\.json$", detail_ref):
            continue
        path = ROOT / "docs" / detail_ref
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if record.get("provenance") != "official_article" or (record.get("summary") or {}).get("version") == SUMMARY_VERSION:
            continue
        summary = summarize_detail(record, str(item.get("title") or ""))
        record["summary"] = summary
        atomic_write_text(path, json.dumps(record, ensure_ascii=False, indent=1) + "\n")
        item["summary"] = summary["text"]
        item["summary_status"] = summary["status"]
        item["summary_version"] = summary["version"]
        item["summary_provenance"] = summary["provenance"]
        updated += 1
    return updated


def needs_detail(item):
    corrupt = is_mojibake(item.get("title", "")) or is_mojibake(item.get("snippet", ""))
    status = item.get("detail_status")
    retryable = (not status or status in {"pending", "temporary_error"}) \
        and int(item.get("detail_attempts") or 0) < 5
    detail_ref = str(item.get("detail_ref") or "")
    attachment_pending = False
    if detail_ref.startswith("data/details/") and int(item.get("detail_attempts") or 0) < 5:
        path = ROOT / "docs" / detail_ref
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
            attachment_pending = any(
                str(row.get("extension") or "").lower() in SEARCHABLE_ATTACHMENT_EXTENSIONS and (
                    row.get("parse_status") in {"pending", "temporary_error"} or
                    (row.get("parse_status") == "unparsed" and not row.get("content_sha256"))
                )
                for row in record.get("attachments") or []
            )
        except (OSError, ValueError):
            attachment_pending = False
    return corrupt or retryable or attachment_pending


def _cursor_key(item):
    return (str(item.get("first_seen") or ""), str(item.get("id") or ""))


def _after_cursor(rows, state):
    """Return ordinary rows after the stable newest-to-oldest cursor, or wrap."""
    if not state or not state.get("cursor_id"):
        return rows
    cursor = (str(state.get("cursor_first_seen") or ""), str(state.get("cursor_id") or ""))
    after = [row for row in rows if _cursor_key(row) < cursor]
    return after if after else rows


def _round_robin(rows):
    queues = {}
    order = []
    for item in rows:
        school = item.get("school") or item.get("school_id") or "unknown"
        if school not in queues:
            queues[school] = []
            order.append(school)
        queues[school].append(item)
    selected = []
    while any(queues.values()):
        for school in order:
            if queues[school]:
                selected.append(queues[school].pop(0))
    return selected


def select_targets(items, cap, state=None):
    pending = [item for item in items if needs_detail(item)]
    pending.sort(key=_cursor_key, reverse=True)
    corrupt = [item for item in pending
               if is_mojibake(item.get("title", "")) or is_mojibake(item.get("snippet", ""))]
    ordinary = [item for item in pending if item not in corrupt]

    selected = _round_robin(corrupt)[:cap]
    if len(selected) >= cap:
        return selected
    remaining = _round_robin(_after_cursor(ordinary, state))
    selected_ids = {str(item.get("id") or "") for item in selected}
    selected.extend(item for item in remaining if str(item.get("id") or "") not in selected_ids)
    return selected[:cap]


def _state_path():
    return ROOT / CONFIG.get("fetch_state_path", "scraper/fetch_state.json")


def load_fetch_state():
    try:
        data = json.loads(_state_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_cursor(fetch_state, target):
    state = fetch_state.setdefault(BACKFILL_STATE_KEY, {})
    state["schema_version"] = 1
    if target:
        state["cursor_id"] = str(target.get("id") or "")
        state["cursor_first_seen"] = str(target.get("first_seen") or "")
    state["updated_at"] = datetime.now(TW_TZ).isoformat(timespec="seconds")
    atomic_write_text(_state_path(), json.dumps(fetch_state, ensure_ascii=False, indent=1))


def main():
    cap = min(10, max(1, int(os.environ.get("DETAIL_BACKFILL_CAP", "10"))))
    delay = max(1.5, float(CONFIG.get("request_delay_sec", 1.5)))
    recent_doc = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    archive_doc = json.loads(ARCHIVE_PATH.read_text(encoding="utf-8"))
    items = recent_doc.get("items", []) + archive_doc.get("items", [])
    summary_cap = min(100, max(1, int(os.environ.get("SUMMARY_BACKFILL_CAP", "100"))))
    summarized = backfill_existing_summaries(items, summary_cap)
    fetch_state = load_fetch_state()
    cursor_state = fetch_state.get(BACKFILL_STATE_KEY, {})
    targets = select_targets(items, cap, cursor_state)

    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9"})
    attachment_cap = min(4, max(0, int(os.environ.get("ATTACHMENT_PDF_CAP", "4"))))
    attachment_budget = {"remaining": attachment_cap}
    fetched_at = datetime.now(TW_TZ).isoformat(timespec="seconds")

    for item in targets:
        try:
            response = session.get(item["url"], timeout=CONFIG["timeout_sec"])
            response.raise_for_status()
            html = decode_response(response)
            merge_title(item, extract_article_title(html), authoritative=True)
            snippet = extract_article_snippet(html, item.get("title", ""))
            if snippet:
                item["snippet"] = snippet
            choose_date(item, extract_article_date_result(html))
            write_detail_record(item, html, fetched_at, session=session,
                                attachment_budget=attachment_budget, request_delay_sec=delay)
            if is_mojibake(item.get("title", "")) or is_mojibake(item.get("snippet", "")):
                raise RuntimeError("decoded detail remains corrupted")
        except Exception as error:
            record_detail_fetch_failure(item)
            print(f"[warn] detail backfill failed {item.get('id')}: {type(error).__name__}")
        time.sleep(delay)

    atomic_write_text(DATA_PATH, json.dumps(recent_doc, ensure_ascii=False, indent=1))
    atomic_write_text(ARCHIVE_PATH, json.dumps(archive_doc, ensure_ascii=False, indent=1))
    build_school_shards(recent_doc, archive_doc, ROOT / "docs" / "data" / "schools")
    save_cursor(fetch_state, targets[-1] if targets else None)
    print(f"DETAIL_BACKFILL_PROCESSED={len(targets)} CAP={cap} SUMMARY_BACKFILLED={summarized} ATTACHMENT_REQUESTS_USED={attachment_cap - attachment_budget['remaining']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
