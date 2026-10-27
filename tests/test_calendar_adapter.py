# -*- coding: utf-8 -*-
"""Offline official-calendar adapter tests using historical source fixtures."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraper"))
from calendar_adapter import (calendar_quality_gate, discover_calendar_attachments,
                              parse_calendar_text, parse_explicit_date,
                              roc_to_gregorian)  # noqa: E402
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

    cysh_115 = parse_calendar_text(
        read("calendar_cysh_115_1_layout.txt"), school_id="cysh", academic_year=115,
        semester=1, source_url="https://www.cysh.cy.edu.tw/fixed-revision.pdf",
        source_document="國立嘉義高中115學年第一學期行事曆.pdf",
        source_revision_value="fixture-cysh-115-1",
    )
    cygsh_115 = parse_calendar_text(
        read("calendar_cygsh_115_1_layout.txt"), school_id="cygsh", academic_year=115,
        semester=1, source_url="https://www.cygsh.cy.edu.tw/fixed-revision.pdf",
        source_document="115學年度第一學期行事曆",
        source_revision_value="fixture-cygsh-115-1",
    )
    # v3：嘉中折行接回同一則、找回被週次列誤判丟掉的事件；嘉女去除字間空白與表格雜訊。
    assert len(cysh_115) == 134
    assert len(cygsh_115) == 169  # 兩欄重複印的「日本姊妹校國際交流出訪」合併為一則
    assert all(row["parser_provenance"]["parser_version"] == "3" for row in cysh_115 + cygsh_115)
    cysh_titles = {row["title"] for row in cysh_115}
    cygsh_titles = {row["title"] for row in cygsh_115}
    for expected in ("導師知能研習(上午全體、下午高一)", "高一興趣量表測驗(第6節101-110、第7節111-120)",
                     "第一次學生圖書借閱逾期通知", "中秋節放假一天", "元旦放假一天", "歲末感恩晚會",
                     "高三第三次複習考", "中等學校籃球聯賽嘉義區預賽", "國慶日適逢星期六，9日補假一天"):
        assert expected in cysh_titles, expected
    assert not any(title.endswith(("(上", "興趣量", "學生圖書")) for title in cysh_titles)
    assert not any("(教官室)" in title for title in cysh_titles), "承辦單位標註不放進事件名稱"
    assert not any(title.startswith("補假") or title == "補假一天" for title in cysh_titles), "句中日期不再切成新事件"
    holiday = next(row for row in cysh_115 if row["title"] == "中秋節放假一天")
    assert holiday["start_date"] == "2026-09-25"
    for expected in ("新進教師輔導知能研習", "全校輔導知能研習(13:30-16:00國際會議廳)", "大學學科能力測驗報名",
                     "高三親師座談", "紅土網球場整修工程", "各科財產盤點", "9/14前公告選社結果並進行人工補選",
                     "閱讀心得投稿時間：9/1-10/8中午12時止"):
        assert expected in cygsh_titles, expected
    exam_signup = next(row for row in cygsh_115 if row["title"] == "大學學科能力測驗報名")
    assert (exam_signup["start_date"], exam_signup["end_date"]) == ("2026-10-27", "2026-11-10")
    import re as _re
    for title in cygsh_titles | cysh_titles:
        assert not _re.search(r"[\u4e00-\u9fff] [\u4e00-\u9fff]", title), title
        assert "第 二 週" not in title and "國立嘉義女子高級中學" not in title, title
        assert title.count("(") == title.count(")"), title
        assert not title.endswith("。"), title
        assert "()" not in title, title
    # 標題整理不改事件 ID：既有提醒仍對得上（ID 由原始抽字計算）。
    legacy_ids = {
        "official-calendar:cysh:115-1:2026-08-24:1:31bda457ac",
        "official-calendar:cygsh:115-1:2026-08-27:0:" + __import__("hashlib").sha1(
            "新 進 教 師 輔 導 知 能 研 習(8/27)。".encode("utf-8")).hexdigest()[:10],
    }
    assert legacy_ids <= {row["id"] for row in cysh_115 + cygsh_115}
    forbidden_fragments = {")", ")。", "）。", "第 5-6 節)。", "第 5-6 節）。", "12:10", "中午 12 時"}
    assert not forbidden_fragments.intersection(row["title"] for row in cygsh_115)
    assert not any(row["title"] == "V1" for row in cysh_115)
    assert any(row["start_date"].startswith("2027-01-") for row in cysh_115)
    assert any(row["start_date"].startswith("2027-01-") for row in cygsh_115)
    assert calendar_quality_gate(cysh_115, school_id="cysh", academic_year=115, semester=1)["passed"]
    cygsh_quality = calendar_quality_gate(cygsh_115, school_id="cygsh", academic_year=115, semester=1)
    # 去掉日期後「休業式」這類本來就短的名稱會被品質門檻計為短標題，只允許零星幾則。
    assert cygsh_quality["passed"] and cygsh_quality["fragment_count"] <= 2
    assert cygsh_quality["duplicate_count"] == 0

    collapsed = calendar_quality_gate(
        cysh_115[:2], school_id="cysh", academic_year=115, semester=1,
        last_known_good_count=100,
    )
    assert not collapsed["passed"]
    assert "event_count_collapsed_from_last_known_good" in collapsed["reasons"]

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
    assert {row["school_id"] for row in registry_snapshot()} == {"cysh", "cygsh", "fjsh", "pksh", "ccjh"}
    for school_id in ("fjsh", "pksh", "ccjh"):
        # 公告上架；目前沒有官方行事曆來源
        assert get_school(school_id).capabilities["official_calendar"] is False
        assert get_school(school_id).capabilities["announcements"] is True
        assert get_school(school_id).status == "active"
        assert get_school(school_id).visible is True
    assert get_school("pksh").announcement_adapter == "ischool-json"
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
    rejected = merge_calendar_events(curated, official, accepted_terms=set())
    assert {row["id"] for row in rejected} == {"legacy-cysh", "legacy-cygsh"}
    ranged_ics = build_ics([{"date": "2026-09-02", "end_date": "2026-09-03", "school": "嘉中", "title": "兩日活動"}])
    assert "DTSTART;VALUE=DATE:20260902" in ranged_ics
    assert "DTEND;VALUE=DATE:20260904" in ranged_ics
    print("✓ official calendar fixtures / ROC / ranges / provenance")


if __name__ == "__main__":
    run()
