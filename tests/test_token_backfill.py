# -*- coding: utf-8 -*-
"""公告 token 補建：只重讀問校務開放學校、還沒有段落標籤的公告，新的先。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scraper"))
import detail_backfill as b  # noqa: E402

items = [
    {"id": "cysh-1", "school": "cysh", "url": "https://x/1", "first_seen": "2026-10-01"},
    {"id": "cysh-2", "school": "cysh", "url": "https://x/2", "first_seen": "2026-11-01", "tokens": {"v": b.TOKEN_VERSION}},
    {"id": "cygsh-1", "school": "cygsh", "url": "https://x/3", "first_seen": "2026-10-20"},
    {"id": "pksh-1", "school": "pksh", "url": "https://x/4", "first_seen": "2026-11-02"},
    {"id": "cysh-3", "school": "cysh", "url": "https://x/5", "first_seen": "2026-10-30", "link_status": "gone"},
    {"id": "cysh-4", "school": "cysh", "url": "https://x/6", "first_seen": "2026-09-01", "tokens": {"v": 0}},
]
ids = [i["id"] for i in b.select_token_targets(items, 10)]
assert "cysh-2" not in ids, "already labelled"
assert "pksh-1" not in ids, "問校務 is open for 嘉中、嘉女 only"
assert "cysh-3" not in ids, "the page is gone"
assert "cysh-4" in ids, "old label version is redone"
assert ids[0] in ("cysh-1", "cygsh-1") and set(ids[:2]) == {"cysh-1", "cygsh-1"}, ids
assert len(b.select_token_targets(items, 1)) == 1
print("token backfill tests passed")
