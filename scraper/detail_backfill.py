# -*- coding: utf-8 -*-
"""Bounded snapshot-only Detail V2 backfill for cloud staging."""
import json
import os
import re
import time
from datetime import datetime

import requests
from public_shards import build_school_shards
from extractive_summary import SUMMARY_VERSION, summarize_detail

from scrape import (CONFIG, ROOT, TW_TZ, atomic_write_text, decode_response,
                    extract_article_date_result, extract_article_snippet,
                    extract_article_title, is_mojibake, merge_title,
                    choose_date, record_detail_fetch_failure,
                    write_detail_record)

DATA_PATH = ROOT / "docs" / "data" / "announcements.json"
ARCHIVE_PATH = ROOT / "docs" / "data" / "archive.json"


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
                str(row.get("extension") or "").lower() == ".pdf" and (
                    row.get("parse_status") in {"pending", "temporary_error"} or
                    (row.get("parse_status") == "unparsed" and not row.get("content_sha256"))
                )
                for row in record.get("attachments") or []
            )
        except (OSError, ValueError):
            attachment_pending = False
    return corrupt or retryable or attachment_pending


def select_targets(items, cap):
    pending = [item for item in items if needs_detail(item)]
    pending.sort(key=lambda item: (
        not (is_mojibake(item.get("title", "")) or is_mojibake(item.get("snippet", ""))),
        -(datetime.fromisoformat(item.get("first_seen")).timestamp()
          if item.get("first_seen") else 0),
    ))
    # Preserve corruption-first/newest-first priority inside each school's
    # queue, but round-robin schools so a bounded run cannot starve one source
    # merely because snapshots list the other source first for tied timestamps.
    selected = []
    tiers = [
        [item for item in pending if is_mojibake(item.get("title", "")) or is_mojibake(item.get("snippet", ""))],
        [item for item in pending if not (is_mojibake(item.get("title", "")) or is_mojibake(item.get("snippet", "")))],
    ]
    for tier in tiers:
        queues = {}
        order = []
        for item in tier:
            school = item.get("school") or item.get("school_id") or "unknown"
            if school not in queues:
                queues[school] = []
                order.append(school)
            queues[school].append(item)
        while len(selected) < cap and any(queues.values()):
            for school in order:
                if queues[school] and len(selected) < cap:
                    selected.append(queues[school].pop(0))
        if len(selected) >= cap:
            break
    return selected


def main():
    cap = min(10, max(1, int(os.environ.get("DETAIL_BACKFILL_CAP", "10"))))
    delay = max(1.5, float(CONFIG.get("request_delay_sec", 1.5)))
    recent_doc = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    archive_doc = json.loads(ARCHIVE_PATH.read_text(encoding="utf-8"))
    items = recent_doc.get("items", []) + archive_doc.get("items", [])
    summary_cap = min(100, max(1, int(os.environ.get("SUMMARY_BACKFILL_CAP", "100"))))
    summarized = backfill_existing_summaries(items, summary_cap)
    targets = select_targets(items, cap)
    session = requests.Session()
    session.headers.update({"User-Agent": "cy-school-news detail-backfill/1.0"})
    attachment_budget = {"remaining": min(4, max(0, int(os.environ.get("ATTACHMENT_PDF_CAP", "4"))))}
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
    print(f"DETAIL_BACKFILL_PROCESSED={len(targets)} CAP={cap} SUMMARY_BACKFILLED={summarized}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
