import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))
from reminder_targets import build_targets  # noqa: E402


def main():
    revision = "a" * 64
    announcements = [{
        "id": "a1", "title": "競賽報名", "date": "2099-01-01",
        "url": "https://school.example/a1", "detail_revision": revision,
        "calendar_events": [
            {"kind": "deadline", "date": "2099-09-14", "provenance": "verified_announcement_deadline", "source_revision": revision},
            {"kind": "event", "date": "2099-09-20", "provenance": "verified_announcement_event", "source_revision": revision},
            {"kind": "deadline", "date": "2099-01-01", "provenance": "publication"},
        ],
    }, {"id": "publication-only", "title": "發布", "date": "2099-12-31", "url": "https://school.example/p"}]
    calendars = [{
        "id": "exam", "title": "段考", "start_date": "2099-10-01",
        "source_url": "https://school.example/calendar.pdf", "source_revision": revision,
        "provenance": "official_school_calendar",
    }, {"id": "legacy", "title": "猜測活動", "date": "2099-10-02", "provenance": "legacy"}]
    rows = build_targets(announcements, calendars, today="2099-01-02")
    assert [row["target_kind"] for row in rows] == ["announcement_deadline", "announcement_event", "official_calendar_event"]
    assert all(row["target_at"].endswith("+08:00") for row in rows)
    assert all(row["source_revision"] == revision for row in rows)
    assert not any("publication-only" in row["target_id"] for row in rows)
    workflow = (ROOT / ".github/workflows/scrape-hourly.yml").read_text(encoding="utf-8")
    source = (ROOT / "scraper/reminder_targets.py").read_text(encoding="utf-8")
    assert "python scraper/reminder_targets.py" in workflow
    assert "docs/data/reminder-targets.json" in workflow
    assert "git add docs/data/details" in workflow
    assert '"generated_at"' not in source
    print("Reminder target manifest provenance and historical-flood tests passed")


if __name__ == "__main__":
    main()
