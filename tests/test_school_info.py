# -*- coding: utf-8 -*-
"""School pages and student-handbook chapters for 問校務 (scraper/school_info.py)."""
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))

import school_handbook as hb  # noqa: E402
import school_info as si  # noqa: E402

SCHOOL = si.SCHOOLS["cysh"]


def page(path, body, extra=""):
    crumbs = "".join(f'<li><a href="https://www.cysh.cy.edu.tw/p/412-1008-{i}.php">{name}</a></li>'
                     for i, name in enumerate(["首頁"] + path, start=1))
    return (f'<html><body><div class="module module-path"><ol class="breadcrumb">{crumbs}</ol></div>'
            f'<div class="mpgdetail"><div class="meditor">{body}</div></div>{extra}</body></html>')


def main():
    # Menu path and child pages.
    html = page(["行政單位", "學務處", "生輔組"], "<p>請假規定說明</p>",
                '<a href="/p/412-1008-3725.php">宿舍</a><a href="https://other.example/p/412-1008-9.php">x</a>')
    assert si.menu_path(html) == ["行政單位", "學務處", "生輔組"]
    assert si.child_pages(SCHOOL, html, si.page_url(SCHOOL, 202)) == [1, 2, 3, 4, 3725]
    print("✓ 選單路徑與子頁面")

    # Exclusions: staff sections, login, announcement lists, lists of people, staff profiles.
    assert si.classify_page(["行政單位", "人事室"], "", "") == "excluded_section"
    assert si.classify_page(["教學單位", "美術科", "榮譽榜單"], "", "") == "excluded_section"
    assert si.classify_page(["圖書館"], '<input type="password">', "") == "login"
    assert si.classify_page(["學務處", "最新消息"], "", "") == "announcement_list"
    assert si.classify_page(["教務處", "教務主任"], "", "") == "staff_profile"
    people = " ".join(f"{n} 王小明 " for n in (101, 102, 103, 104, 105, 106))
    assert si.classify_page(["學務處", "名冊"], "", people) in ("personal_data", "excluded_section")
    assert si.classify_page(["學務處", "公告"], "", people) == "personal_data"
    phones = "201 校長室 202 秘書室 203 教務處 204 學務處 205 註冊組 206 設備組"
    assert si.classify_page(["關於嘉中", "聯絡電話"], "", phones) == "ok", "an office phone list is not people"
    print("✓ 排除個資、登入與教職員專區")

    # Public item has metadata only.
    entry = {"page_id": 202, "path": ["行政單位", "學務處", "生輔組"], "status": "ok",
             "keywords": ["請假", "宿舍"], "attachments": [{"name": "學生請假要點", "url": "https://x/a.pdf"}],
             "detail_ref": "data/details/cysh/cysh-info-202.json", "detail_revision": "abc"}
    item = si.public_item("cysh", SCHOOL, entry)
    assert item["id"] == "cysh-info-202" and item["title"] == "行政單位 › 學務處 › 生輔組"
    assert item["kind"] == "school_info" and item["date"] == ""
    assert not any(key in item for key in ("text", "summary", "snippet", "blocks"))
    assert si.index_keywords("學生請假要點：請假須經導師核准，病假三日以上附證明")[:2] == ["請假", "病假"]
    print("✓ 公開索引只有標題、連結與索引詞")

    # Handbook: table of contents, chapter split, look-alike characters, no text in public items.
    pages = ["封面", "\n目錄\n學生考試要點 .......... 2\n國立嘉義高級中學 學生請假要點 .......... 3\n圖書館借書規定 4\n"]
    filler = "二、本要點經校務會議通過後實施，修正時亦同，並公告於學校網站。"
    pages += ["2\n學生考試要點\n一、學生需準時入場，遲到十五分鐘不得進入試場。\n" + filler,
              "3\n國立嘉義高級中學 學生請假要點\n三、學生因故必須請假時，應使用學生線上請假系統請假。\n" + filler,
              "4\n圖書館借書規定\n八、借閱期限：借期二週，借閱期滿得續借一次。\n" + filler]
    toc = hb.table_of_contents(pages)
    assert [row["page"] for row in toc] == [2, 3, 4], toc
    chapters = hb.split_chapters(pages)
    assert [c["title"] for c in chapters] == ["學生考試要點", "學生請假要點", "圖書館借書規定"]
    assert "借期二週" in chapters[2]["text"] and chapters[2]["first_page"] == 5
    assert hb.normalize_radicals("校⻑、國立") == "校長、國立"
    assert hb.normalize_radicals("借期，二週：") == "借期，二週：", "full-width punctuation stays"
    records = hb.chapter_records("cysh", "嘉中", {"article_id": 136504, "title": "115學年度學生手冊完整版",
                                                 "url": "https://www.cysh.cy.edu.tw/p/406-1008-136504,r1125.php"},
                                 {"name": "手冊.pdf", "url": "https://x/h.pdf", "published": "2026-09-01"}, chapters)
    item, detail = records[2]
    assert item["id"] == "cysh-handbook-115-03" and item["title"] == "學生手冊 › 圖書館借書規定"
    assert "借期" in item["keywords"] or "借書" in item["keywords"]
    assert "embedded_text" not in json.dumps(item, ensure_ascii=False)
    assert detail["provenance"] == "official_article" and detail["attachments"][0]["provenance"] == "official_attachment"
    assert item["detail_revision"] == detail["source_hash"]
    print("✓ 學生手冊依目錄拆章")

    list_html = ('<a href="/p/406-1008-129864,r1136.php">中學生文章相似度比對系統</a>'
                 '<a href="/p/406-1008-130000,r1125.php">114學年度學生手冊完整版</a>'
                 '<a href="/p/406-1008-136504,r1125.php?Lang=zh-tw">115學年度學生手冊完整版</a>')
    found = hb.latest_handbook(list_html, hb.HANDBOOKS["cysh"]["list_url"], "1008")
    assert found["article_id"] == 136504 and found["url"].endswith("406-1008-136504,r1125.php")
    article = ('<span class="ptinfoproperty_date"> 發佈日期 : <span> 2026-09-01 </span></span>'
               '<a href="/app/index.php?Action=downloadfile&amp;file=abc">115學年度學生手冊完整版.pdf</a>')
    att = hb.handbook_attachment(article, found["url"])
    assert att["published"] == "2026-09-01" and "Action=downloadfile&file=abc" in att["url"]
    print("✓ 每學期自動找最新版手冊")

    # Writing the public index never includes page text.
    with tempfile.TemporaryDirectory() as tmp:
        old = si.INDEX_ROOT
        si.INDEX_ROOT = Path(tmp)
        try:
            index = {"schema_version": 1, "school": "cysh", "pages": {"202": entry},
                     "handbook": {"items": [item]}}
            target = si.write_public("cysh", SCHOOL, index)
            text = target.read_text(encoding="utf-8")
        finally:
            si.INDEX_ROOT = old
        data = json.loads(text)
        assert [i["id"] for i in data["items"]] == ["cysh-info-202", "cysh-handbook-115-03"]
        assert "借期二週" not in text and "embedded_text" not in text
        assert data["content_access"] == "approved-account-required"
    print("✓ 公開檔案不含內文")

    # Staleness: new pages first, then pages not checked for 30 days.
    from datetime import datetime, timedelta, timezone
    now = datetime(2026, 10, 31, tzinfo=timezone(timedelta(hours=8)))
    index = {"pages": {"5": {"page_id": 5, "status": "ok", "checked_at": "2026-09-01T00:00:00+08:00"},
                       "6": {"page_id": 6, "status": "ok", "checked_at": "2026-10-30T00:00:00+08:00"},
                       "7": {"page_id": 7, "status": "pending"}}}
    picked = si.pick_pages(index, {"roots": [86]}, 10, now)
    assert picked[:2] == [86, 7] and 5 in picked and 6 not in picked
    print("✓ 每 30 天重新檢查一次")
    # Login systems: entry links only, staff and campus-only systems are not suggested.
    import school_services as ss
    menu = ('<div>網路服務</div><a href="https://cysh-cy.k12ea.gov.tw/SCH_UI/">校務行政系統</a>'
            '<a href="https://e-school.k12ea.gov.tw/Schoolcysh/Landing">自修室預約系統</a>'
            '<a href="https://campus.cysh.cy.edu.tw/exam_range/">考試範圍公告</a>'
            '<a href="http://192.168.62.56/exam/query.asp">試卷題庫(限校內)</a>'
            '<a href="https://pk12.cloudhr.tw/">雲端差勤系統</a>'
            '<a href="https://www.cysh.cy.edu.tw/p/412-1008-96.php">地理位置圖</a>'
            '<a href="https://goo.gl/maps/x">Google地圖</a>')
    systems = ss.build_services([("https://www.cysh.cy.edu.tw/", menu)])
    by_name = {row["name"]: row for row in systems}
    assert by_name["校務行政系統"]["audience"] == "student" and by_name["校務行政系統"]["login"] is True
    assert "成績" in by_name["校務行政系統"]["keywords"]
    assert by_name["考試範圍公告"]["login"] is None, "login not confirmed for this host"
    assert by_name["試卷題庫"]["audience"] == "internal" and by_name["雲端差勤系統"]["audience"] == "staff"
    assert "地理位置圖" not in by_name and "Google地圖" not in by_name
    items = ss.public_items("cysh", "嘉中", systems)
    assert sorted(i["title"] for i in items) == ["網路服務 › 校務行政系統", "網路服務 › 考試範圍公告", "網路服務 › 自修室預約系統"]
    assert all(i["kind"] == "school_service" and i["url"].startswith("https://") for i in items)
    print("✓ 需登入系統只記錄入口連結")
    print("所有校園資訊測試通過 ✅")


if __name__ == "__main__":
    main()
