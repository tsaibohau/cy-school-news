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
    assert cysh["parser_version"] == "detail-v2"
    table = next(block for block in cysh["blocks"] if block["type"] == "table")
    assert table["header_rows"] == [0]
    assert any(block["type"] == "list" for block in cysh["blocks"])
    assert len(cysh["attachments"]) == 1
    assert cysh["attachments"][0]["provenance"] == "official_attachment"
    assert all("網站頁尾" not in json.dumps(block, ensure_ascii=False) for block in cysh["blocks"])
    assert cysh["verified_dates"] == [{
        "kind": "deadline", "date": "2026-09-14", "title": "物理競賽公告",
        "provenance": "verified_announcement_deadline", "source": "official_article",
        "source_revision": cysh["source_hash"], "verification": "explicit_full_date_with_label",
    }]
    assert any(block["type"] == "list" and block["ordered"] for block in cygsh["blocks"])
    assert cygsh["attachments"][0]["extension"] == ".docx"
    assert cygsh["attachments"][0]["mime_type"].endswith("wordprocessingml.document")
    assert cygsh["parse_status"] == "parsed"
    empty = parse_article_detail("<html><body><div class='mnav'>nav</div></body></html>",
                                 announcement_id="empty", school_id="cysh", title="空",
                                 source_url="https://example.test/a")
    assert empty["parse_status"] in {"empty", "permanent_error"}
    hostile = parse_article_detail("""<article><p>&lt;img src=x onerror=alert(1)&gt;
      <a href='javascript:alert(1)'>危險</a><a href='data:text/html,x'>資料</a>
      <a href='/safe'>安全</a></p><a href='javascript:file.pdf'>evil.pdf</a></article>""",
      announcement_id="hostile", school_id="cysh", title="安全測試",
      source_url="https://www.cysh.cy.edu.tw/p/406-1008-1.php")
    hostile_links = [link for block in hostile["blocks"] for link in block.get("links", [])]
    assert [link["url"] for link in hostile_links if link["url"]] == ["https://www.cysh.cy.edu.tw/safe"]
    assert hostile["attachments"] == []
    publication = parse_article_detail("<article><p>發布日期：115年9月14日</p><p>校務說明 115年9月15日</p></article>",
      announcement_id="publication", school_id="cysh", title="日期測試",
      source_url="https://www.cysh.cy.edu.tw/p/406-1008-2.php")
    assert publication["verified_dates"] == [], "publication and unlabelled body dates are never reminder targets"
    encoded = parse_article_detail("""<article><p>附件如下</p>
      <a href='/download?filename=%E7%94%B3%E8%AB%8B%E8%A1%A8.xlsx'>下載</a>
      <a href='/files/%E6%B4%BB%E5%8B%95%E7%85%A7%E7%89%87.JPG?token=official'>附件</a>
      <a href='/download?file=not-an-extension'>下載頁面</a></article>""",
      announcement_id="encoded", school_id="cygsh", title="附件測試",
      source_url="https://www.cygsh.cy.edu.tw/p/406-1013-2.php")
    assert encoded["attachments"][0]["filename"] == "申請表.xlsx"
    assert encoded["attachments"][0]["extension"] == ".xlsx"
    assert encoded["attachments"][0]["mime_type"].endswith("spreadsheetml.sheet")
    assert encoded["attachments"][1]["filename"] == "活動照片.JPG"
    assert encoded["attachments"][1]["extension"] == ".jpg"
    assert encoded["attachments"][1]["mime_type"] == "image/jpeg"
    assert encoded["attachments"][2]["extension"] == ""
    assert all(row["announcement_id"] == "encoded" for row in encoded["attachments"])
    print("Detail parser tests passed")


if __name__ == "__main__":
    main()

