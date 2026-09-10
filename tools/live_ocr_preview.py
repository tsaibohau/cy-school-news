# -*- coding: utf-8 -*-
"""Bounded live probe for CYSH/CYGSH attachment OCR.

The probe reads public announcement metadata, fetches only a small number of
official article/attachment URLs, never syncs Supabase, and never prints OCR
text. It is intended for feature-branch validation only.
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from attachment_parser import OCR_EXTENSIONS, enrich_pdf_attachments  # noqa: E402
from detail_parser import parse_article_detail  # noqa: E402
from scrape import CONFIG, TW_TZ, UA, decode_response  # noqa: E402

TARGET_SCHOOLS = {"cysh", "cygsh"}


def load_items() -> list[dict]:
    rows = []
    for path in (ROOT / "docs/data/announcements.json", ROOT / "docs/data/archive.json"):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        rows.extend(row for row in doc.get("items", []) if isinstance(row, dict))
    rows = [row for row in rows
            if (row.get("school") or row.get("school_id")) in TARGET_SCHOOLS
            and str(row.get("url") or "").startswith("https://")]
    rows.sort(key=lambda row: (str(row.get("date") or ""), str(row.get("first_seen") or ""),
                               str(row.get("id") or "")), reverse=True)
    return rows


def is_ocr_candidate(row: dict) -> bool:
    ext = str(row.get("extension") or "").lower().lstrip(".")
    return ext in OCR_EXTENSIONS or ext == "pdf"


def main() -> int:
    article_cap = min(12, max(1, int(os.environ.get("LIVE_OCR_ARTICLE_CAP", "10"))))
    attachment_cap = min(4, max(1, int(os.environ.get("LIVE_OCR_ATTACHMENT_CAP", "3"))))
    ocr_cap = 1
    delay = max(1.5, float(CONFIG.get("request_delay_sec", 1.5)))
    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9"})
    budget = {"remaining": attachment_cap, "ocr_enabled": True, "ocr_remaining": ocr_cap}
    scanned_articles = 0
    candidate_attachments = 0
    attempted = 0
    accepted = 0
    low_confidence = 0
    unavailable = 0
    fetch_failures = 0

    for item in load_items()[:article_cap]:
        scanned_articles += 1
        try:
            response = session.get(item["url"], timeout=CONFIG["timeout_sec"])
            response.raise_for_status()
            html = decode_response(response)
            record = parse_article_detail(
                html,
                announcement_id=str(item.get("id") or ""),
                school_id=str(item.get("school") or item.get("school_id") or ""),
                title=str(item.get("title") or ""),
                source_url=str(item.get("url") or ""),
                fetched_at=datetime.now(TW_TZ).isoformat(timespec="seconds"),
            )
        except Exception:
            fetch_failures += 1
            time.sleep(delay)
            continue

        candidates = [row for row in record.get("attachments") or [] if is_ocr_candidate(row)]
        candidates.sort(key=lambda row: (
            str(row.get("extension") or "").lower().lstrip(".") not in OCR_EXTENSIONS,
            str(row.get("url") or ""),
        ))
        if candidates and budget["remaining"] > 0:
            candidate_attachments += len(candidates)
            record["attachments"] = candidates
            enrich_pdf_attachments(
                record, session, budget,
                timeout_sec=CONFIG["timeout_sec"], request_delay_sec=delay,
            )
            for row in record.get("attachments") or []:
                if not row.get("ocr_version"):
                    continue
                if row.get("ocr_confidence") is not None or row.get("parse_reason") == "ocr_timeout":
                    attempted += 1
                if row.get("parse_status") == "parsed" and row.get("embedded_text"):
                    accepted += 1
                if row.get("parse_reason") in {"ocr_low_confidence", "ocr_too_little_text"}:
                    low_confidence += 1
                if row.get("parse_reason") == "ocr_language_unavailable":
                    unavailable += 1
        time.sleep(delay)
        if budget["ocr_remaining"] <= 0 or budget["remaining"] <= 0:
            break

    print(
        "LIVE_OCR_PREVIEW "
        f"ARTICLES={scanned_articles} CANDIDATE_ATTACHMENTS={candidate_attachments} "
        f"ATTACHMENT_REQUESTS={attachment_cap - budget['remaining']} "
        f"OCR_ATTEMPTED={attempted} OCR_ACCEPTED={accepted} "
        f"OCR_LOW_CONFIDENCE={low_confidence} OCR_UNAVAILABLE={unavailable} "
        f"FETCH_FAILURES={fetch_failures}"
    )
    if unavailable:
        return 3
    # A live corpus is allowed to contain no scan in this small bounded window.
    # That is inconclusive, not a parser failure; the synthetic OCR regression
    # remains the deterministic correctness gate.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
