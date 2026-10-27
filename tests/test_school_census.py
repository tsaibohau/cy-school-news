# -*- coding: utf-8 -*-
"""校網普查工具的離線測試：系統辨識規則、名錄合併、請求上限。"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "scraper"))

import school_census as sc  # noqa: E402

RD_HOME = """<html><head><title>國立測試高中</title></head><body>
<a href="/p/403-1099-12-1.php">最新消息</a>
<a href="/p/412-1099-151.php">行事曆</a>
<div class="d-txt"><a href="/p/406-1099-500,r12.php">115學年度第一學期期中考試日程表</a><i class="mdate">2026-10-20</i></div>
<div class="d-txt"><a href="/p/406-1099-501,r12.php">校慶運動會注意事項公告</a><i class="mdate">2026-10-21</i></div>
<div class="d-txt"><a href="/p/406-1099-502,r12.php">獎學金申請說明會開始報名</a><i class="mdate">2026-10-22</i></div>
</body></html>"""

ISCHOOL_HOME = """<html><body><a href="/ischool/publish_page/0/">首頁</a>
<script>load('/ischool/widget/site_news/main2.php?uid=WID_0_2_abc&amp;maximize=1');</script>
<a href="/files/cal.pdf">行事曆</a></body></html>"""

ISCHOOL_LIST = """<html><body>
<tr><td>2026-10-20</td><td><a href="https://www.test.ylc.edu.tw/ischool/public/news_view/show.php?nid=101">期中考試範圍公告</a></td></tr>
<tr><td>2026-10-21</td><td><a href="https://www.test.ylc.edu.tw/ischool/public/news_view/show.php?nid=102">新生訓練活動通知</a></td></tr>
<tr><td>2026-10-22</td><td><a href="https://www.test.ylc.edu.tw/ischool/public/news_view/show.php?nid=103">圖書館閉館時間調整</a></td></tr>
</body></html>"""


def test_fingerprint_rules():
    assert sc.fingerprint(RD_HOME, "https://www.t.cy.edu.tw/")[0] == "new-classic-cms"
    assert sc.fingerprint(ISCHOOL_HOME, "https://www.t.ylc.edu.tw/")[0] == "ischool"
    wp = '<meta name="generator" content="WordPress 6.5"><link href="/wp-content/x.css">'
    assert sc.fingerprint(wp, "https://x/")[0] == "wordpress"
    assert sc.fingerprint('<a href="/modules/tadnews/index.php">x</a>', "https://x/")[0] == "xoops"
    assert sc.fingerprint('<meta name="generator" content="Joomla! 4">', "https://x/")[0] == "joomla"
    assert sc.fingerprint('<input name="__VIEWSTATE">', "https://x/")[0] == "aspnet"
    assert sc.fingerprint('<a href="/files/11-1000-1.php">a</a><a href="/files/14-1000-2.php">b</a>',
                          "https://x/")[0] == "old-classic-cms"
    assert sc.fingerprint("<p>hello</p>", "https://x/")[0] == "unknown"
    code, _, ev = sc.fingerprint(RD_HOME, "https://rpage.t.cy.edu.tw/")
    assert code == "new-classic-cms" and "rpage 子網域" in ev


def test_school_key_and_redirect():
    assert sc.school_key("https://rpage.fjsh.cy.edu.tw/") == "fjsh"
    assert sc.school_key("www.pksh.ylc.edu.tw") == "pksh"
    assert sc.school_key("https://www.tssh.cyc.edu.tw/index.php") == "tssh"
    html = '<meta http-equiv="refresh" content="0; url=/home/index.php">'
    assert sc.find_redirect(html, "https://a.cy.edu.tw/") == "https://a.cy.edu.tw/home/index.php"
    assert sc.find_redirect(RD_HOME, "https://a/") == ""


def test_directory_csv_and_merge():
    csv_text = ("代碼,學校名稱,公/私立,縣市名稱,地址,電話,網址\n"
                "180301,國立華南高級商業職業學校,國立,[20]嘉義市,x,x,http://www.hnvs.cy.edu.tw\n"
                "010301,國立臺北測試高中,國立,[63]臺北市,x,x,http://www.tp.edu.tw\n"
                "720301,雲林縣私立新校高級中學,私立,[09]雲林縣,x,x,www.newx.ylc.edu.tw\n")
    rows = sc.parse_directory_csv(csv_text, ["嘉義市", "嘉義縣", "雲林縣"])
    assert [r["county"] for r in rows] == ["嘉義市", "雲林縣"]
    seed = [{"id": "hnvs", "name": "華南高商", "county": "嘉義市", "url": "https://www.hnvs.cy.edu.tw/"},
            {"id": "cysh", "name": "嘉中", "county": "嘉義市", "url": "https://www.cysh.cy.edu.tw/"}]
    merged = {r["id"]: r for r in sc.merge_targets(seed, rows)}
    assert merged["hnvs"]["url"] == "http://www.hnvs.cy.edu.tw/"
    assert merged["hnvs"]["url_source"] == "moe+seed"
    assert merged["cysh"]["url_source"] == "seed"
    assert merged["newx"]["url_source"] == "moe" and merged["newx"]["url"] == "https://www.newx.ylc.edu.tw/"


def test_dataset_csv_links_sorted_newest_first():
    payload = {"result": {"distribution": [
        {"resourceDownloadUrl": "https://stats.moe.gov.tw/files/school/113/high.csv"},
        {"resourceDownloadUrl": "https://stats.moe.gov.tw/files/school/115/high.csv"},
        {"resourceDownloadUrl": "https://stats.moe.gov.tw/files/school/115/high.json"}]}}
    assert sc.csv_links_from_dataset(payload)[0].endswith("/115/high.csv")


class FakeResp:
    def __init__(self, url, text, status=200):
        self.url, self.status_code, self.content = url, status, text.encode("utf-8")
        self.headers, self.ok = {"Server": "nginx"}, status < 400
        self.encoding = self.apparent_encoding = "utf-8"


class FakeSession:
    def __init__(self, pages):
        self.pages, self.calls = pages, []

    def get(self, url, **kw):
        self.calls.append(url)
        if url not in self.pages:
            return FakeResp(url, "not found", 404)
        return FakeResp(url, self.pages[url])


def test_probe_new_classic_uses_existing_parser():
    base = "https://www.t.cy.edu.tw/"
    s = FakeSession({base: RD_HOME, base + "p/403-1099-12-1.php": RD_HOME})
    row = sc.probe_school(s, {"id": "t", "name": "測試", "county": "嘉義市", "url": base}, delay=0)
    assert row["system"] == "new-classic-cms"
    assert row["list_test"]["count"] == 3 and row["list_test"]["dated"] == 3
    assert row["verdict"] == "可直接套用"
    assert row["calendar_type"] == "校網頁面（new-classic-cms）"
    assert len(s.calls) <= sc.MAX_REQUESTS_PER_SCHOOL


def test_probe_ischool_and_budget():
    base = "https://www.test.ylc.edu.tw/"
    widget = base + "ischool/widget/site_news/main2.php?uid=WID_0_2_abc&maximize=1"
    s = FakeSession({base: ISCHOOL_HOME, widget: ISCHOOL_LIST})
    row = sc.probe_school(s, {"id": "test", "url": base}, delay=0)
    assert row["system"] == "ischool"
    assert row["list_test"]["count"] == 3
    assert row["verdict"] == "可直接套用"
    assert row["calendar_type"] == "PDF"
    assert len(s.calls) <= sc.MAX_REQUESTS_PER_SCHOOL


def test_unknown_system_needs_new_adapter():
    base = "https://www.u.cyc.edu.tw/"
    s = FakeSession({base: '<a href="/news.php">最新消息</a><a href="/cal">行事曆</a>'})
    row = sc.probe_school(s, {"id": "u", "url": base}, delay=0)
    assert row["system"] == "unknown" and row["verdict"] == "需新 adapter"
    assert row["list_url"] == base + "news.php"
    assert len(s.calls) == 1  # 未知系統不多打列表頁


def test_garbage_href_is_skipped():
    base = "https://www.g.cyc.edu.tw/"
    html = ('<a href="http://某校 網址：x.example 帳號：admin 密碼：secret">公告</a>'
            '<a href="http://[bad">最新消息</a><a href="/news.php">最新消息</a>')
    s = FakeSession({base: html})
    row = sc.probe_school(s, {"id": "g", "url": base}, delay=0)
    assert [c["url"] for c in row["announce_candidates"]] == [base + "news.php"]
    assert "secret" not in repr(row)


def test_markdown_report_renders():
    rows = [{"id": "t", "name": "測試", "county": "嘉義市", "system": "new-classic-cms",
             "verdict": "可直接套用", "list_url": "u", "list_test": {"count": 3, "dated": 3},
             "calendar_type": "PDF", "evidence": [], "url_source": "seed", "requests": 2}]
    md = sc.render_markdown(rows, {"generated_at": "x", "directory_source": "", "log": [], "total_requests": 2})
    assert "| t | 測試 | new-classic-cms | 可直接套用 |" in md


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
