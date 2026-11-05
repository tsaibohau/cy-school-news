# -*- coding: utf-8 -*-
"""嘉中、嘉女公告清理（手動工作流程 announcement-prune.yml 執行）。

1. recheck：回過一次 404 的公告頁，隔 20 小時以上再確認一次（link_health 兩次才算下架）。
2. prune：確認下架的公告從公開資料移除，ID 記到 removed-announcements.json（之後列表又出現也不收），
   並產生「清空」紀錄，讓會員資料庫裡的內文一併清掉。
3. condense：過期公告重讀一次原文，交給 tools/condense-expired.js 改寫成不含時間的整理版。

請求一次一則，間隔至少 request_delay_sec（1.5 秒）。
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta

import requests

from link_health import GONE_HTTP_STATUS, http_status, is_gone, record_alive, record_missing, MIN_HOURS_BETWEEN
from public_shards import build_school_shards
from scrape import (CONFIG, ROOT, TW_TZ, UA, _detail_filename, atomic_write_text, decode_response, record_detail_fetch_failure,
                    write_detail_record)

DATA_PATH = ROOT / "docs" / "data" / "announcements.json"
ARCHIVE_PATH = ROOT / "docs" / "data" / "archive.json"
REMOVED_PATH = ROOT / "docs" / "data" / "removed-announcements.json"
WIPE_PATH = ROOT / ".announcement-wipe.json"
DETAIL_ROOT = ROOT / "docs" / "data" / "details"
SCHOOLS = {"cysh", "cygsh"}
CONDENSE_VERSION = 2  # tools/condense-expired.js VERSION; version 1 notices are condensed again
NO_DATE_EXPIRY_DAYS = 365


def _school(item):
    return str(item.get("school") or item.get("school_id") or "")


def _parse(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def recheck_targets(items, now, cap):
    """Pages that answered 404 once, long enough ago for the second check to count."""
    rows = []
    for item in items:
        if _school(item) not in SCHOOLS or is_gone(item) or not int(item.get("link_missing_checks") or 0):
            continue
        last = _parse(item.get("link_missing_at"))
        if last is None or (now - last).total_seconds() / 3600 >= MIN_HOURS_BETWEEN:
            rows.append(item)
    rows.sort(key=lambda i: str(i.get("link_missing_at") or ""))
    return rows[:cap]


def item_dates(item):
    dates = [str(r.get("date") or "") for r in item.get("calendar_events") or [] if isinstance(r, dict)]
    for seg in (item.get("tokens") or {}).get("segments") or []:
        dates.extend(str(d) for d in seg.get("d") or [])
    return sorted(d for d in dates if len(d) == 10)


def is_expired(item, today):
    """Every date in the notice has passed; a notice with no dates counts after a year."""
    dates = item_dates(item)
    if dates:
        return dates[-1] < today
    published = str(item.get("date") or item.get("first_seen") or "")[:10]
    if len(published) != 10:
        return False
    return published < (datetime.fromisoformat(today) - timedelta(days=NO_DATE_EXPIRY_DAYS)).date().isoformat()


def condense_targets(items, today, cap):
    rows = [i for i in items if _school(i) in SCHOOLS and i.get("url") and not is_gone(i)
            and not int(i.get("link_missing_checks") or 0)
            and i.get("body_condensed") != CONDENSE_VERSION and i.get("detail_status") in ("parsed", "empty")
            and is_expired(i, today)]
    rows.sort(key=lambda i: str(i.get("date") or i.get("first_seen") or ""))  # oldest first
    return rows[:cap]


def prune(recent_doc, archive_doc):
    """Remove confirmed-gone notices of 嘉中、嘉女. Returns the removed items."""
    removed = []
    for doc in (recent_doc, archive_doc):
        keep = []
        for item in doc.get("items", []):
            if _school(item) in SCHOOLS and is_gone(item):
                removed.append(item)
            else:
                keep.append(item)
        doc["items"] = keep
    return removed


def load_removed():
    try:
        data = json.loads(REMOVED_PATH.read_text(encoding="utf-8"))
        rows = data.get("removed") if isinstance(data, dict) else None
        return rows if isinstance(rows, list) else []
    except Exception:
        return []


def removed_ids():
    return {str(r.get("id") or "") for r in load_removed() if isinstance(r, dict)} - {""}


def record_removed(items, now_iso):
    rows = load_removed()
    known = {str(r.get("id") or "") for r in rows}
    for item in items:
        if item.get("id") and item["id"] not in known:
            rows.append({"id": item["id"], "school": _school(item), "reason": "official_page_gone", "removed_at": now_iso[:10]})
    REMOVED_PATH.write_text(json.dumps({"schema_version": 1, "removed": rows}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def wipe_records(items):
    """Upserts that empty the protected copy (the sync endpoint has no delete): no text is kept."""
    out = []
    for item in items:
        aid = str(item.get("id") or "")
        if not aid:
            continue
        out.append({"announcement_id": aid, "summary": "", "snippet": "", "source_hash": "removed",
                    "detail": {"provenance": "official_article", "announcement_id": aid, "source_hash": "removed",
                               "parse_status": "removed", "blocks": [], "attachments": []}})
        sidecar = DETAIL_ROOT / _school(item) / (_detail_filename(aid) + ".json")
        if sidecar.is_file():
            sidecar.unlink()
    return out


def main():
    recheck_cap = min(600, max(0, int(os.environ.get("RECHECK_CAP", "400"))))
    condense_cap = min(400, max(0, int(os.environ.get("CONDENSE_CAP", "300"))))
    attachment_cap = min(60, max(0, int(os.environ.get("ATTACHMENT_PDF_CAP", "30"))))
    delay = max(1.5, float(CONFIG.get("request_delay_sec", 1.5)))
    recent_doc = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    archive_doc = json.loads(ARCHIVE_PATH.read_text(encoding="utf-8"))
    items = recent_doc.get("items", []) + archive_doc.get("items", [])
    now = datetime.now(TW_TZ)
    now_iso = now.isoformat(timespec="seconds")
    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9"})

    checked = gone = alive = 0
    for item in recheck_targets(items, now, recheck_cap):
        checked += 1
        try:
            r = session.get(item["url"], timeout=CONFIG["timeout_sec"])
            if r.status_code in GONE_HTTP_STATUS:
                gone += 1 if record_missing(item, now_iso) else 0
            elif r.ok:
                record_alive(item)
                alive += 1
        except Exception as error:  # a timeout proves nothing
            if http_status(error) in GONE_HTTP_STATUS:
                record_missing(item, now_iso)
        time.sleep(delay)

    removed = prune(recent_doc, archive_doc)
    if removed:
        record_removed(removed, now_iso)
    WIPE_PATH.write_text(json.dumps({"schema_version": 1, "records": wipe_records(removed)}, ensure_ascii=False), encoding="utf-8")

    items = recent_doc.get("items", []) + archive_doc.get("items", [])
    today = now.date().isoformat()
    targets = condense_targets(items, today, condense_cap)
    budget = {"remaining": attachment_cap, "ocr_enabled": False, "ocr_remaining": 0}
    read = 0
    for item in targets:
        try:
            r = session.get(item["url"], timeout=CONFIG["timeout_sec"])
            r.raise_for_status()
            write_detail_record(item, decode_response(r), now_iso, session=session,
                                attachment_budget=budget, request_delay_sec=delay)
            item["condense_pending"] = CONDENSE_VERSION
            read += 1
        except Exception as error:
            record_detail_fetch_failure(item, error=error, now_iso=now_iso)
        time.sleep(delay)

    atomic_write_text(DATA_PATH, json.dumps(recent_doc, ensure_ascii=False, indent=1))
    atomic_write_text(ARCHIVE_PATH, json.dumps(archive_doc, ensure_ascii=False, indent=1))
    build_school_shards(recent_doc, archive_doc, ROOT / "docs" / "data" / "schools")
    print(f"PRUNE rechecked={checked} confirmed_gone={gone} alive_again={alive} removed={len(removed)} "
          f"condense_read={read}/{len(targets)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
