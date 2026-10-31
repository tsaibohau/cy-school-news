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
    # 嘉女: same collector, documents on Google Drive, custom-layout pages, no 網路服務 menu.
    assert si.SCHOOLS["cygsh"]["unit"] == "1013" and si.SCHOOLS["cygsh"]["short"] == "嘉女"
    drive = ('<div class="module-path"></div><a href="https://drive.google.com/file/d/abc/view">學生獎懲規定</a>'
             '<a href="https://drive.google.com/x">（請按我連結）</a><a href="https://drive.google.com/y">得獎名單</a>')
    names = [d["name"] for d in si.doc_links(drive, "https://www.cygsh.cy.edu.tw/p/412-1013-1843.php")]
    assert names == ["學生獎懲規定", "（請按我連結）"], names
    custom = ('<div class="mpgdetail"><style>.x{color:red}</style><div class="protocol"><div>圖書館借閱辦法</div>'
              '<div>(4)學 生：借出圖書總數為五冊，圖書借期14天。</div></div></div>:::')
    lines = si.page_text_lines(custom)
    assert lines == ["圖書館借閱辦法", "(4)學 生：借出圖書總數為五冊，圖書借期14天。"], lines
    no_menu = ('<a href="https://cygsh-cy.k12ea.gov.tw/SCH_UI/">校務系統入口</a>'
               '<a href="https://www.ceec.edu.tw/">大學入學考試中心</a><a href="https://library.cygsh.cy.edu.tw">圖書查詢與借閱</a>')
    found = {row["name"] for row in ss.build_services([("https://www.cygsh.cy.edu.tw/p/412-1013-4239.php", no_menu)])}
    assert found == {"校務行政系統", "圖書館館藏查詢"}, "without a 網路服務 menu only known systems are kept"
    print("✓ 嘉女：雲端文件、自訂版面頁面、系統入口")
    # Other Rpage schools: roots come from the home-page menu, links to other sites are ignored.
    fj = si.SCHOOLS["fjsh"]
    assert fj["roots"] == "auto" and si.SCHOOLS["ccjh"]["roots"] == "auto"
    home = ('<a href="/p/412-1000-12.php">學校簡介</a><a href="https://rpage.fjsh.cy.edu.tw/p/412-1000-34.php">學務處</a>'
            '<a href="/p/412-1000-12.php">dup</a><a href="https://www.cysh.cy.edu.tw/p/412-1008-86.php">x</a>')
    assert si.home_roots(fj, home) == [12, 34]
    print("✓ 其他學校從首頁選單找起點")
    # Every other school: general site mode (iSchool, WordPress, XOOPS, CCMS, ASP).
    schools = si.all_schools()
    import json as _json
    config_ids = [row["id"] for row in _json.loads((ROOT / "scraper" / "config.json").read_text(encoding="utf-8"))["schools"]]
    assert set(config_ids) <= set(schools), "every school in config.json is collected"
    tl = schools["tlsh"]
    assert si.is_site(tl) and tl["origin"] == "https://www.tlsh.ylc.edu.tw" and not si.is_site(schools["cysh"])
    home = ('<nav><a href="/">首頁</a></nav><a href="/about/">學校簡介</a><a href="https://tlsh.ylc.edu.tw/office/affairs/">學務處</a>'
            '<a href="/2026/10/sports-day/">運動會花絮</a><a href="/category/news/">最新消息</a><a href="/feed/">RSS</a>'
            '<a href="/wp-content/uploads/a.pdf">手冊.pdf</a><a href="https://www.cysh.cy.edu.tw/">嘉中</a>'
            '<a href="/about/#top">學校簡介</a><a href="/staff/">人事室</a><a href="/?p=12">文章</a>'
            '<a href="/modules/tad_page/index.php?tad_page_id=3">校規彙編</a><a href="/album/">相簿</a>')
    links = si.site_links(tl, home, "https://www.tlsh.ylc.edu.tw/")
    assert [l["label"] for l in links] == ["學校簡介", "學務處", "校規彙編"], links
    assert links[0]["page_id"] == si.site_page_id("https://www.tlsh.ylc.edu.tw/about/")
    assert all(l["page_id"] < 2 ** 53 for l in links), "ids stay exact in JavaScript"
    page_html = ('<html><head><title>學生請假規定 | 斗六高中</title></head><body><header class="site-header">校名 選單</header>'
                 '<div class="menu"><a href="/about/">學校簡介</a></div><main><h1>學生請假規定</h1>'
                 '<p>一、學生因病請假應於三日內辦理。</p><p>二、事假須家長簽章。</p><p>聯絡電話 05-5322039</p></main>'
                 '<footer>版權所有</footer></body></html>')
    lines = si.site_text_lines(page_html)
    assert lines[:3] == ["學生請假規定", "一、學生因病請假應於三日內辦理。", "二、事假須家長簽章。"], lines
    assert "版權所有" not in lines and "校名 選單" not in lines
    assert si.site_title_path(page_html, "請假規定", ["學務處"]) == ["學務處", "請假規定"]
    assert si.site_title_path(page_html) == ["學生請假規定"]
    crumb = '<ol class="breadcrumb"><li><a href="/">首頁</a></li><li><a href="/x">學務處</a></li><li>生輔組</li></ol>'
    assert si.site_title_path(crumb, "x") == ["學務處", "生輔組"]
    # Processing a site page: text without the home-page boilerplate, children one level down.
    import hashlib
    with tempfile.TemporaryDirectory() as tmp:
        import scrape
        old_root, old_detail = si.ROOT, scrape.DETAIL_ROOT
        scrape.DETAIL_ROOT = Path(tmp) / "docs" / "data" / "details"
        try:
            url = "https://www.tlsh.ylc.edu.tw/office/affairs/"
            pid = si.site_page_id(url)
            index = {"pages": {str(pid): {"page_id": pid, "url": url, "label": "學務處", "depth": 0, "status": "pending"}},
                     "boiler": [hashlib.sha1("聯絡電話 05-5322039".encode("utf-8")).hexdigest()[:10]]}
            body = page_html.replace("</main>", '<a href="/office/affairs/leave/">請假辦法</a></main>')
            real_root = si.ROOT
            si.ROOT = Path(tmp)
            (Path(tmp) / "docs").mkdir(exist_ok=True)
            try:
                entry = si.process_page("tlsh", tl, index, pid, body)
            finally:
                si.ROOT = real_root
        finally:
            scrape.DETAIL_ROOT = old_detail
    assert entry["status"] == "ok" and entry["path"] == ["學務處"], entry
    child = [v for k, v in index["pages"].items() if k != str(pid)]
    leave = [c for c in child if c["label"] == "請假辦法"]
    assert leave and leave[0]["depth"] == 1 and leave[0]["parent_path"] == ["學務處"], child
    item = si.public_item("tlsh", tl, entry)
    assert item["url"] == url and item["id"] == f"tlsh-info-{pid}" and item["school_name"] == "斗六高中"
    print("✓ 其他 24 校：一般網站模式（首頁選單、去掉選單與頁尾、只往下兩層）")
    print("所有校園資訊測試通過 ✅")


if __name__ == "__main__":
    main()
