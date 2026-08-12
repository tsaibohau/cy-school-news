# -*- coding: utf-8 -*-
"""離線測試:驗證解析與分類邏輯(不需連網)。執行: python tests/test_parser.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scraper"))
from scrape import extract_items, classify, normalize_url, extract_article_snippet, extract_article_date, display_date, coverage_gaps, configured_categories, page_entries, should_fetch, TW_TZ, list_page_with_number, deep_stop_reason  # noqa: E402
from notify import push_topics  # noqa: E402
from schoolcal import build_ics, events_on  # noqa: E402
from datetime import datetime, timedelta  # noqa: E402

SCHOOL = {"id": "cysh", "short": "嘉中", "base": "https://www.cysh.cy.edu.tw", "unit": "1008"}

LIST_HTML = """
<html><head><title>行政單位&gt;教務處&gt;榮譽榜</title></head><body>
<div class="mtitle_list">
  <div class="row">
    <div class="mdate">2026-08-10</div>
    <div class="mtitle"><a href="/p/406-1008-136179,r17.php">恭賀317鍾秉言榮獲115年新竹市主委盃西洋棋錦標賽高中職組第二名</a></div>
  </div>
  <div class="row">
    <div class="mdate">2026-07-27</div>
    <div class="mtitle"><a href="/p/406-1008-136080,r17.php?Lang=zh-tw">【能力競賽初試】嘉中115年能力競賽校內初賽數學科得獎名單</a></div>
  </div>
  <!-- 重複的文章連結(圖片連結)應被去重 -->
  <a href="/p/406-1008-136179,r17.php"><img src="x.jpg"></a>
  <!-- MORE 連結應被忽略 -->
  <a href="/p/403-1008-17-1.php">MORE</a>
</div>
</body></html>
"""

HOME_HTML = """
<html><head><title>國立嘉義高中</title></head><body>
<div class="tab-pane">
  <ul>
    <li><span class="date">2026-08-08</span>
        <a href="https://www.cysh.cy.edu.tw/p/406-1008-136150,r14.php">115學年度第一次段考考試範圍公告</a></li>
    <li><span class="date">2026/08/05</span>
        <a href="/p/406-1008-136140,r15.php">社團博覽會暨社課選課須知</a></li>
  </ul>
</div>
</body></html>
"""

ARTICLE_HTML = """
<html><head><title>test</title></head><body>
<nav>選單選單選單</nav>
<div class="mpgdetail">一、 申請資格:本校在學學生。 二、 申請期限:即日起至115年9月14日止。 三、 檢附文件請洽註冊組。</div>
<footer>頁尾</footer>
</body></html>
"""

# 標題含 \x0b(垂直定位符)等隱形空白,應被壓成單一空格
DIRTY_TITLE_HTML = """
<html><body>
<a href="/p/406-1008-136300,r17.php">恭賀\x0b201王小明\x0b同學  榮獲全國賽第一名</a>
</body></html>
"""

ARTICLE_MDATE_HTML = """
<html><body>
<span class="mdate_s">公告日期 2026-08-09 16:20</span>
<div class="mpgdetail">內文文字。</div>
</body></html>
"""

ARTICLE_BODYDATE_HTML = """
<html><body>
<div class="mpgdetail">說明會日期:2026/8/3(一)於本校大禮堂辦理,請同學準時出席。</div>
</body></html>
"""

ARTICLE_NODATE_HTML = """
<html><body><div class="mpgdetail">內文沒有任何日期資訊。</div></body></html>
"""

# 「發佈日期」標籤應優先於 mdate 與內文日期
ARTICLE_PUBDATE_HTML = """
<html><body>
<span class="mdate">2026-01-01</span>
<p>發佈日期 : 2026-08-07 16:00 發佈單位 : 教務處</p>
<div class="mpgdetail">活動日期 2026/9/1 開始報名。</div>
</body></html>
"""


def run():
    ok = True

    items = extract_items(LIST_HTML, SCHOOL, "https://www.cysh.cy.edu.tw/p/403-1008-17-1.php")
    assert len(items) == 2, f"應萃取 2 筆,實得 {len(items)}"
    assert items[0]["date"] == "2026-08-10", items[0]
    assert items[0]["url"] == "https://www.cysh.cy.edu.tw/p/406-1008-136179,r17.php"
    assert items[1]["url"].endswith("136080,r17.php"), "query string 應被移除"
    assert items[0]["source_category"] == "榮譽榜", items[0]["source_category"]
    print("✓ 列表頁解析")

    home_items = extract_items(HOME_HTML, SCHOOL, "https://www.cysh.cy.edu.tw/")
    assert len(home_items) == 2
    assert home_items[0]["date"] == "2026-08-08"
    assert home_items[1]["date"] == "2026-08-05", "斜線日期也要能解析"
    assert home_items[0]["source_category"] == "", "首頁掃描不套用頁面標題為分類"
    print("✓ 首頁掃描解析")

    cases = {
        "115學年度第一次段考考試範圍公告": "段考考試",
        "社團博覽會暨社課選課須知": "社團",
        "繁星推薦入學說明會": "升學",
        "鴻海獎學鯨(高中職組)申請": "獎助學金",
        "恭賀本校同學榮獲國際科展金牌": "榮譽榜",
        "校內語文競賽報名開始": "競賽",
        "家長日活動流程": "研習活動",
        "115學年度高一新生編班公告": "招生編班",
        "圖書館閉館通知": "一般",
    }
    for text, expect in cases.items():
        got = classify(text)
        assert got == expect, f"「{text}」應為 {expect},實得 {got}"
    print("✓ 自動分類")

    assert normalize_url("https://a.b/p/406-1008-1,r2.php?Lang=zh-tw#x") == \
        "https://a.b/p/406-1008-1,r2.php"
    print("✓ URL 正規化")

    sn = extract_article_snippet(ARTICLE_HTML, "test")
    assert "申請資格" in sn and "選單" not in sn, sn
    print("✓ 內文摘要萃取")

    dirty = extract_items(DIRTY_TITLE_HTML, SCHOOL, "https://www.cysh.cy.edu.tw/")
    assert len(dirty) == 1
    assert dirty[0]["title"] == "恭賀 201王小明 同學 榮獲全國賽第一名", dirty[0]["title"]
    print("✓ 標題隱形空白清理")

    assert extract_article_date(ARTICLE_MDATE_HTML) == "2026-08-09"
    assert extract_article_date(ARTICLE_BODYDATE_HTML) == "2026-08-03", "單位數月日也要能解析並補零"
    assert extract_article_date(ARTICLE_NODATE_HTML) == ""
    assert extract_article_date(ARTICLE_PUBDATE_HTML) == "2026-08-07", "發佈日期標籤應最優先"
    print("✓ 文章頁日期補齊")

    assert display_date({"date": "2026-08-01", "first_seen": "2026-08-10T08:00:00+08:00"}) == "2026-08-01"
    assert display_date({"date": "", "first_seen": "2026-08-10T08:00:00+08:00"}) == "2026-08-10"
    assert display_date({"date": ""}) == ""
    print("✓ 排序/顯示日期鍵")

    subs = [{"name": "我的訂閱", "topic_suffix": "kw-me", "keywords": ["段考", "獎學金"]},
            {"name": "空後綴", "topic_suffix": "", "keywords": ["段考"]}]
    hit = push_topics({"title": "第一次段考範圍", "category": "段考考試"}, "cynews", subs)
    assert hit == ["cynews", "cynews-exam", "cynews-kw-me"], hit
    snip = push_topics({"title": "校內公告", "category": "一般",
                        "snippet": "本校獎學金申請開始"}, "cynews", subs)
    assert snip[-1] == "cynews-kw-me", "摘要命中關鍵字也要推播"
    cat = push_topics({"title": "期末考時間表", "category": "段考考試"}, "cynews", subs)
    assert cat[-1] == "cynews-kw-me", "自動分類名稱也要納入比對(訂段考收到期末考)"
    miss = push_topics({"title": "圖書館閉館通知", "category": "一般"}, "cynews", subs)
    assert miss == ["cynews", "cynews-general"], miss
    assert push_topics({"title": "段考", "category": "一般"}, "cynews") == \
        ["cynews", "cynews-general"], "沒有訂閱設定時只推全部與分類"
    print("✓ 個人關鍵字推播主題")

    school_cfg = {"unit": "1008", "list_pages": [
        "https://www.cysh.cy.edu.tw/p/403-1008-17-1.php",
        "https://www.cysh.cy.edu.tw/p/403-1008-168-1.php",
        "https://www.cysh.cy.edu.tw/p/412-1008-151.php",       # 412 不算分類編號
        "https://www.cygsh.cy.edu.tw/p/403-1013-508-1.php",    # 別校的不算
    ]}
    assert configured_categories(school_cfg) == {"17", "168"}, \
        configured_categories(school_cfg)

    scanned = extract_items(LIST_HTML, SCHOOL,
                            "https://www.cysh.cy.edu.tw/p/403-1008-17-1.php")
    assert scanned[0]["cat_ref"] == "17", scanned[0]
    assert coverage_gaps(scanned, {"17"}) == [], "已收錄的分類不該回報"
    gaps = coverage_gaps(scanned, set())
    assert len(gaps) == 1 and gaps[0]["cat_ref"] == "17" and gaps[0]["count"] == 2, gaps
    assert gaps[0]["example_title"], "缺口要附範例標題"
    assert coverage_gaps(scanned, set(), ignore=["17"]) == [], "ignore 清單要生效"
    # 首頁掃描:沒有 ,rXXX 的連結不會誤報
    home = extract_items(HOME_HTML, SCHOOL, "https://www.cysh.cy.edu.tw/")
    assert coverage_gaps(home, {"14", "15"}) == [], coverage_gaps(home, {"14", "15"})
    print("✓ 覆蓋率哨兵")

    tier_cfg = {"unit": "1008", "list_pages": [
        "https://x/p/403-1008-17-1.php",
        {"url": "https://x/p/403-1008-401-1.php", "tier": "hot"},
        {"url": "https://x/p/403-1008-242-1.php"},
    ]}
    assert configured_categories(tier_cfg) == {"17", "401", "242"}, \
        "物件型條目也要能解析分類編號"
    assert page_entries(tier_cfg) == [
        ("https://x/p/403-1008-17-1.php", "cold"),
        ("https://x/p/403-1008-401-1.php", "hot"),
        ("https://x/p/403-1008-242-1.php", "cold"),
    ], "字串與未標示 tier 都應預設 cold"

    now = datetime.now(TW_TZ)
    fresh = {"u": now.isoformat(timespec="seconds")}
    stale = {"u": (now - timedelta(hours=21)).isoformat(timespec="seconds")}
    assert should_fetch("u", "hot", fresh), "hot 每輪都抓"
    assert should_fetch("u", "cold", {}), "沒抓過的 cold 要抓"
    assert not should_fetch("u", "cold", fresh), "20 小時內抓過的 cold 要略過"
    assert should_fetch("u", "cold", stale), "超過 20 小時的 cold 要抓"
    assert should_fetch("u", "cold", fresh, fetch_all=True), "手動觸發一律全抓"
    assert should_fetch("u", "cold", {"u": "不是時間"}), "壞時間戳視同沒抓過"
    print("✓ 來源分級抓取")

    assert list_page_with_number("https://x/p/403-1008-17-1.php", 3) == \
        "https://x/p/403-1008-17-3.php"
    old_page = [{"id": "a", "date": "2024-05-01"}, {"id": "b", "date": "2024-07-31"}]
    assert deep_stop_reason([], set()) == "無公告"
    assert deep_stop_reason(old_page, {"a", "b"}) == "整頁重複", "頁碼鎖定要跳出"
    assert deep_stop_reason(old_page, {"a"}) == "早於截止日"
    assert deep_stop_reason([{"id": "c", "date": "2026-08-01"},
                             {"id": "d", "date": "2024-01-01"}], set()) == "", \
        "頁上仍有截止日後的公告就繼續翻"
    assert deep_stop_reason([{"id": "e", "date": ""}], set()) == "", \
        "整頁無日期時無從判斷,要繼續翻"
    print("✓ 深度回補分頁邏輯")

    evs = [{"date": "2026-08-31", "school": "嘉中", "title": "開學日"},
           {"date": "2026-09-02", "school": "嘉中", "title": "高三模擬考(9/2-9/3)"}]
    ics = build_ics(evs)
    assert ics.count("BEGIN:VEVENT") == 2
    assert "DTSTART;VALUE=DATE:20260831" in ics
    assert "DTEND;VALUE=DATE:20260901" in ics, "全天事件 DTEND 應為次日"
    assert "SUMMARY:[嘉中] 開學日" in ics
    assert "TRIGGER:-PT15H" in ics, "要含提醒欄位"
    assert "BEGIN:VALARM" in ics and ics.endswith("END:VCALENDAR\r\n")
    assert all(len(ln.encode("utf-8")) <= 75 for ln in ics.split("\r\n")), \
        "每行不得超過 75 octets(RFC 5545 行摺疊)"
    assert events_on(evs, "2026-08-31") == [evs[0]]
    assert events_on(evs, "2026-08-30") == []
    print("✓ 行事曆 ICS 與當日事件")

    return ok


if __name__ == "__main__":
    run()
    print("\n所有測試通過 ✅")
