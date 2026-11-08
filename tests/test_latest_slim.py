"""Tests for scraper/latest_slim.py (first-load snapshots). All data is made up."""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraper"))
import latest_slim  # noqa: E402

HIDDEN = {"cysh-hidden-unverified", "cysh-hidden-gone", "cysh-hidden-staff"}


def item(n, date, **extra):
    row = {"id": f"cysh-{n}", "title": f"公告{n}", "date": date, "school": "cysh", "school_name": "嘉中",
           "category": "一般", "first_seen": f"{date}T00:00:00+00:00"}
    row.update(extra)
    return row


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        data = Path(tmp)
        items = [item(n, f"2026-10-{1 + n % 28:02d}") for n in range(600)]
        items.append(item("hidden-unverified", "2026-11-30", date_status="unverified"))
        items.append(item("hidden-gone", "2026-11-29", link_status="gone"))
        items.append(item("hidden-staff", "2026-11-28", category="教職員"))
        doc = {"generated_at": "2026-11-08T00:00:00Z", "schools": [{"id": "cysh"}], "categories": ["一般"],
               "category_slugs": {"一般": "general"}, "content_access": "approved-account-required", "items": items}
        write(data / "announcements.json", doc)
        write(data / "schools" / "cysh" / "current.json",
              {"schema_version": 1, "generated_at": doc["generated_at"], "school": {"id": "cysh"}, "items": items[:50]})
        original = (data / "announcements.json").read_text(encoding="utf-8")

        written = latest_slim.build(data)
        assert len(written) == 2, written
        assert (data / "announcements.json").read_text(encoding="utf-8") == original, "the full file is never modified"

        slim = json.loads((data / "announcements-latest.json").read_text(encoding="utf-8"))
        assert slim["partial"] is True and slim["total_items"] == len(items)
        assert len(slim["items"]) == latest_slim.SLIM_ITEMS
        for key in ("generated_at", "schools", "categories", "category_slugs", "content_access"):
            assert slim[key] == doc[key], key
        ids = {row["id"] for row in slim["items"]}
        assert not ids & HIDDEN, "items the list hides are left out"
        dates = [row["date"] for row in slim["items"]]
        assert dates == sorted(dates, reverse=True), "newest first"
        left_out = [r for r in items if r["id"] not in ids and r["id"] not in HIDDEN]
        assert all(r["date"] <= dates[-1] for r in left_out), "everything left out is no newer than the oldest kept item"
        by_id = {row["id"]: row for row in items}
        assert all(row == by_id[row["id"]] for row in slim["items"]), "items are copied unchanged"

        shard = json.loads((data / "schools" / "cysh" / "latest.json").read_text(encoding="utf-8"))
        assert shard["partial"] is True and shard["school"] == {"id": "cysh"} and len(shard["items"]) == 50
        assert shard["total_items"] == 50

        assert "\n " not in (data / "announcements-latest.json").read_text(encoding="utf-8"), "compact output"
        assert latest_slim.build(data / "nowhere") == [], "missing inputs are not an error"
    print("latest_slim: ok")


if __name__ == "__main__":
    main()
