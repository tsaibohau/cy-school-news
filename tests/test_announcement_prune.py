# -*- coding: utf-8 -*-
"""公告清理：404 要隔 20 小時再確認、確認下架才移除（只限嘉中、嘉女）、過期的定義。"""
import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scraper"))
import announcement_prune as p  # noqa: E402

now = datetime.fromisoformat("2026-11-04T12:00:00+08:00")
items = [
    {"id": "cysh-1", "school": "cysh", "url": "u", "link_missing_checks": 1, "link_missing_at": "2026-11-03T10:00:00+08:00"},
    {"id": "cysh-2", "school": "cysh", "url": "u", "link_missing_checks": 1, "link_missing_at": "2026-11-04T09:00:00+08:00"},
    {"id": "pksh-1", "school": "pksh", "url": "u", "link_missing_checks": 1, "link_missing_at": "2026-11-01T10:00:00+08:00"},
    {"id": "cygsh-1", "school": "cygsh", "url": "u", "link_missing_checks": 2, "link_status": "gone"},
]
ids = [i["id"] for i in p.recheck_targets(items, now, 10)]
assert ids == ["cysh-1"], ids  # 3 hours is too soon; other schools are left alone; gone is done

recent = {"items": [items[3], {"id": "pksh-2", "school": "pksh", "link_status": "gone"}, {"id": "cysh-9", "school": "cysh"}]}
archive = {"items": []}
removed = p.prune(recent, archive)
assert [i["id"] for i in removed] == ["cygsh-1"]
assert [i["id"] for i in recent["items"]] == ["pksh-2", "cysh-9"], "only 嘉中、嘉女 are removed"
wipe = p.wipe_records(removed)
assert wipe[0]["detail"]["blocks"] == [] and wipe[0]["summary"] == "" and wipe[0]["detail"]["source_hash"] == wipe[0]["source_hash"]

with tempfile.TemporaryDirectory() as tmp:
    p.REMOVED_PATH = Path(tmp) / "removed.json"
    p.record_removed(removed, "2026-11-04T12:00:00+08:00")
    p.record_removed(removed, "2026-11-05T12:00:00+08:00")
    rows = json.loads(p.REMOVED_PATH.read_text(encoding="utf-8"))["removed"]
    assert rows == [{"id": "cygsh-1", "school": "cygsh", "reason": "official_page_gone", "removed_at": "2026-11-04"}], rows
    assert p.removed_ids() == {"cygsh-1"}

today = "2026-11-04"
assert p.is_expired({"calendar_events": [{"date": "2026-10-01"}], "tokens": {"segments": [{"d": ["2026-10-20"]}]}}, today)
assert not p.is_expired({"calendar_events": [{"date": "2026-10-01"}], "tokens": {"segments": [{"d": ["2026-12-01"]}]}}, today), "one date still ahead"
assert p.is_expired({"date": "2025-10-01"}, today), "no dates: a year old"
assert not p.is_expired({"date": "2026-06-01"}, today)
pool = [{"id": "a", "school": "cysh", "url": "u", "detail_status": "parsed", "date": "2025-01-01"},
        {"id": "b", "school": "cysh", "url": "u", "detail_status": "parsed", "date": "2025-01-01", "body_condensed": p.CONDENSE_VERSION},
        {"id": "c", "school": "pksh", "url": "u", "detail_status": "parsed", "date": "2025-01-01"},
        {"id": "d", "school": "cygsh", "url": "u", "detail_status": "parsed", "date": "2025-01-01", "link_missing_checks": 1}]
assert [i["id"] for i in p.condense_targets(pool, today, 10)] == ["a"]
print("announcement prune tests passed")
