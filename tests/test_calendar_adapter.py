# -*- coding: utf-8 -*-
"""Offline official-calendar adapter tests using historical source fixtures."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraper"))
from calendar_adapter import (discover_calendar_attachments, parse_calendar_text,
                              parse_explicit_date, roc_to_gregorian)  # noqa: E402
from calendar_schema import source_status, validate_events  # noqa: E402
from school_registry import get_school, registry_snapshot  # noqa: E402
from schoolcal import academic_period, build_ics, merge_calendar_events  # noqa: E402


ROOT = Path(__file__).resolve().parent / "fixtures"


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


def run():
    assert roc_to_gregorian(115, 9, 1) == "2026-09-01"
    assert parse_explicit_date("115年9月1日") == "2026-09-01"
    assert parse_explicit_date("2025/09/01") == "2025-09-01"
    assert parse_explicit_date("公告日期 2026/09/01") == "2026-09-01"

    cysh = parse_calendar_text(
        read("calendar_cysh_114_1.txt"), school_id="cysh", academic_year=114,
        semester=1, source_url="https://www.cysh.cy.edu.tw/official.pdf",
        source_document="114-1.pdf", source_revision_value="sha256-cysh",
    )
    assert any(row["title"] == "第一次段考" for row in cysh)
    exam = next(row for row in cysh if row["title"] == "第一次段考")
    assert exam["start_date"] == "2025-10-13"
    assert exam["end_date"] == "2025-10-14"
    assert exam["provenance"] == "official_school_calendar"
    assert exam["source_revision"] == "sha256-cysh"
    assert all(row["source_url"].startswith("https://www.cysh.cy.edu.tw/") for row in cysh)

    cygsh = parse_calendar_text(
        read("calendar_cygsh_114_2.txt"), school_id="cygsh", academic_year=114,
        semester=2, source_url="https://www.cygsh.cy.edu.tw/official.pdf",
        source_document="114-2.pdf",
    )
    sports = next(row for row in cygsh if "運動會" in row["title"])
    assert sports["start_date"] == "2026-04-18"
    assert sports["end_date"] == "2026-04-23"
    validate_events(cygsh, school_id="cygsh")

    pending = source_status(
        school_id="cysh", academic_year=115, semester=1,
        status="awaiting_official_source", source_url="https://www.cysh.cy.edu.tw/",
        last_checked_at="2026-08-23T00:00:00+08:00",
    )
    assert pending["status"] == "awaiting_official_source"
    assert get_school("cysh").capabilities["official_calendar"] is True
    assert {row["school_id"] for row in registry_snapshot()} == {"cysh", "cygsh", "fjsh"}
    assert get_school("cygsh").calendar_sources[0].url.endswith("/p/412-1013-1827.php")

    nested = discover_calendar_attachments(
        """<a href='/var/file/13/1013/img/1.pdf'>115學年度第一學期行事曆</a>
        <a href='https://evil.example/115-1行事曆.pdf'>115學年度第一學期行事曆</a>""",
        base_url="https://www.cygsh.cy.edu.tw/p/406-1013-999.php",
        allowed_origin="https://www.cygsh.cy.edu.tw", academic_year=115, semester=1,
    )
    assert [row["url"] for row in nested] == ["https://www.cygsh.cy.edu.tw/var/file/13/1013/img/1.pdf"]

    assert academic_period(__import__("datetime").date(2026, 8, 25)) == (115, 1)
    assert academic_period(__import__("datetime").date(2027, 1, 15)) == (115, 1)
    assert academic_period(__import__("datetime").date(2027, 2, 1)) == (115, 2)
    curated = [{
        "id": "legacy-cysh", "school_id": "cysh", "title": "舊人工事件",
        "start_date": "2026-09-01", "end_date": "2026-09-01",
        "provenance": "official_school_calendar", "source_url": "https://www.cysh.cy.edu.tw/calendar",
    }, {
        "id": "legacy-cygsh", "school_id": "cygsh", "title": "嘉女人工事件",
        "start_date": "2026-09-01", "end_date": "2026-09-01",
        "provenance": "official_school_calendar", "source_url": "https://www.cygsh.cy.edu.tw/calendar",
    }]
    official = [{
        "id": "official-cysh", "school_id": "cysh", "title": "官方事件",
        "start_date": "2026-09-02", "end_date": "2026-09-02",
        "provenance": "official_school_calendar", "source_url": "https://www.cysh.cy.edu.tw/official.pdf",
        "academic_year": 115, "semester": 1,
    }]
    merged = merge_calendar_events(curated, official)
    assert {row["id"] for row in merged} == {"legacy-cygsh", "official-cysh"}
    official_visible = next(row for row in merged if row["id"] == "official-cysh")
    assert official_visible["school"] == "嘉中" and official_visible["kind"] == "official"
    ranged_ics = build_ics([{"date": "2026-09-02", "end_date": "2026-09-03", "school": "嘉中", "title": "兩日活動"}])
    assert "DTSTART;VALUE=DATE:20260902" in ranged_ics
    assert "DTEND;VALUE=DATE:20260904" in ranged_ics
    print("✓ official calendar fixtures / ROC / ranges / provenance")


if __name__ == "__main__":
    run()
