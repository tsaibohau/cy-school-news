# -*- coding: utf-8 -*-
import sys
import json
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scraper"))
import detail_backfill  # noqa: E402
from detail_backfill import select_targets  # noqa: E402

rows = [{"id": f"pending-{n}", "first_seen": f"2026-08-{n:02d}T00:00:00+08:00",
         "detail_status": "pending"} for n in range(1, 20)]
rows.append({"id": "corrupt", "title": "гҖҗиҪүзҹҘгҖ‘", "detail_status": "parsed",
             "first_seen": "2020-01-01T00:00:00+08:00"})
selected = select_targets(rows, 10)
assert len(selected) == 10
assert selected[0]["id"] == "corrupt", "corruption repair must outrank ordinary pending rows"
assert all(row["id"] != "pending-1" for row in selected), "newer pending rows should backfill first"

balanced = []
for school in ("cysh", "cygsh"):
    balanced.extend({"id": f"{school}-{n}", "school": school,
                     "first_seen": f"2026-08-{n:02d}T00:00:00+08:00",
                     "detail_status": "pending"} for n in range(1, 13))
selected = select_targets(balanced, 10)
assert sum(row["school"] == "cysh" for row in selected) == 5
assert sum(row["school"] == "cygsh" for row in selected) == 5
assert {"cysh-12", "cygsh-12"}.issubset({row["id"] for row in selected})

priority = [{"id": f"broken-{n}", "school": "cysh", "title": "гҖҗиҪүзҹҘгҖ‘",
             "first_seen": f"2020-01-{n:02d}T00:00:00+08:00", "detail_status": "parsed"}
            for n in range(1, 4)]
priority.extend({"id": f"ordinary-{n}", "school": "cygsh",
                 "first_seen": f"2026-08-{n:02d}T00:00:00+08:00", "detail_status": "pending"}
                for n in range(1, 8))
selected = select_targets(priority, 5)
assert [row["id"] for row in selected[:3]] == ["broken-3", "broken-2", "broken-1"]

with tempfile.TemporaryDirectory() as directory:
    original_root = detail_backfill.ROOT
    detail_backfill.ROOT = Path(directory)
    sidecar = Path(directory) / "docs/data/details/cysh/cysh-summary.json"
    sidecar.parent.mkdir(parents=True)
    sidecar.write_text(json.dumps({
        "provenance": "official_article", "title": "報名公告", "blocks": [
            {"type": "paragraph", "text": "符合資格學生請於9月10日前完成報名。"},
        ], "attachments": [],
    }, ensure_ascii=False), encoding="utf-8")
    item = {"id": "cysh-summary", "title": "報名公告",
            "detail_ref": "data/details/cysh/cysh-summary.json"}
    assert detail_backfill.backfill_existing_summaries([item], 10) == 1
    assert item["summary_status"] == "extracted" and "9月10日" in item["summary"]
    assert detail_backfill.backfill_existing_summaries([item], 10) == 0
    detail_backfill.ROOT = original_root
print("Snapshot-only detail backfill selection tests passed")
