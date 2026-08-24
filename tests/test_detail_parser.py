"""Offline tests for deterministic article detail and attachment parsing."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))
from detail_parser import parse_article_detail  # noqa: E402


def fixture(name):
    return (ROOT / "tests" / "fixtures" / name).read_text(encoding="utf-8")


def main():
    cysh = parse_article_detail(fixture("detail_cysh.html"), announcement_id="a-cysh",
                                school_id="cysh", title="物理競賽公告",
                                source_url="https://www.cysh.cy.edu.tw/p/406-1008-1.php")
    cygsh = parse_article_detail(fixture("detail_cygsh.html"), announcement_id="a-cygsh",
                                 school_id="cygsh", title="校內活動通知",
                                 source_url="https://www.cygsh.cy.edu.tw/p/406-1013-1.php")
    assert cysh["parse_status"] == "parsed"
    assert any(block["type"] == "table" for block in cysh["blocks"])
    assert any(block["type"] == "list" for block in cysh["blocks"])
    assert len(cysh["attachments"]) == 1
    assert cysh["attachments"][0]["provenance"] == "official_attachment"
    assert all("網站頁尾" not in json.dumps(block, ensure_ascii=False) for block in cysh["blocks"])
    assert cysh["verified_dates"] == [], "body dates must not become publication dates"
    assert any(block["type"] == "list" and block["ordered"] for block in cygsh["blocks"])
    assert cygsh["attachments"][0]["extension"] == ".docx"
    assert cygsh["attachments"][0]["mime_type"].endswith("wordprocessingml.document")
    assert cygsh["parse_status"] == "parsed"
    empty = parse_article_detail("<html><body><div class='mnav'>nav</div></body></html>",
                                 announcement_id="empty", school_id="cysh", title="空",
                                 source_url="https://example.test/a")
    assert empty["parse_status"] in {"empty", "failed"}
    print("Detail parser tests passed")


if __name__ == "__main__":
    main()

