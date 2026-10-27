# -*- coding: utf-8 -*-
"""共用 adapter 離線測試：以 2026-10-27 從各校網抓下的真實頁面（tests/fixtures/sites/*.gz）驗證。

執行：python tests/test_source_adapters.py
"""
import gzip
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

import requests  # noqa: E402
import scrape  # noqa: E402
import adapters  # noqa: E402
from adapters.common import TW_TZ, parse_rfc822, short_date, usable_title  # noqa: E402
from adapters import ischool_json, parser_cms  # noqa: E402

SITES = ROOT / "tests" / "fixtures" / "sites"
TODAY = datetime(2026, 10, 27, 12, 0, tzinfo=TW_TZ)


def load(name):
    return gzip.open(SITES / f"{name}.gz", "rt", encoding="utf-8").read()


def school(sid, base):
    return {"id": sid, "short": sid, "base": base}


def run(adapter, fixture, sid, base, source):
    return adapters.get_adapter(adapter).extract(load(fixture), school(sid, base), source, today=TODAY)


def assert_items(items, minimum, dated_ratio=1.0):
    assert len(items) >= minimum, len(items)
    assert len({i["id"] for i in items}) == len(items), "duplicate ids"
    dated = sum(1 for i in items if i["date"])
    assert dated >= int(len(items) * dated_ratio), (dated, len(items))
    for i in items:
        assert set(i) >= {"id", "school", "school_name", "title", "url", "date", "date_source",
                          "cat_ref", "source_category", "_source_url"}
        assert usable_title(i["title"]) and not i["title"].startswith("置頂"), i["title"]
        assert i["date_source"] == ("list" if i["date"] else "")
        assert not i["date"] or i["date"] <= "2026-10-28", i["date"]


# ---- iSchool JSON ----
PKSH = "https://www.pksh.ylc.edu.tw"
PKSH_SRC = PKSH + "/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_0a14b8dc17bb7190f9566cc9fece58668f20208a"


def test_ischool_json_pksh_short_dates():
    items = run("ischool-json", "pksh_ischool.json", "pksh", PKSH, PKSH_SRC)
    assert_items(items, 20)
    first = items[0]
    assert first["id"] == "pksh-28640" and first["date"] == "2026-10-27"
    assert first["url"] == PKSH + "/ischool/public/news_view/show.php?nid=28640"
    assert first["source_category"] == "公告"


def test_ischool_json_full_dates_and_rollover():
    items = run("ischool-json", "cyhvs_ischool.json", "cyhvs", "https://www.cyhvs.cy.edu.tw",
                "https://www.cyhvs.cy.edu.tw/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_f9cb4dd227aa767e7494223ca89ccf8f44339512")
    assert_items(items, 20)
    assert items[0]["date"] == "2026-10-12"
    jan = datetime(2027, 1, 3, 9, 0, tzinfo=TW_TZ)
    assert short_date("12/30", jan) == "2026-12-30"  # 跨年：12/30 是去年
    assert short_date("01/02", jan) == "2027-01-02"


def test_ischool_json_fetch_posts_with_uid():
    calls = []

    def fake_fetch(session, url, sch, method="GET", data=None):
        calls.append((url, method, data))
        return "[]"

    adapter = adapters.get_adapter("ischool-json")
    adapter.fetch_page(None, PKSH_SRC, school("pksh", PKSH), fake_fetch)
    url, method, data = calls[0]
    assert url == PKSH + ischool_json.JSON_PATH and method == "POST"
    assert data["uid"] == "WID_0_2_0a14b8dc17bb7190f9566cc9fece58668f20208a" and data["maxRows"] == "30"
    try:
        adapter.fetch_page(None, PKSH + ischool_json.JSON_PATH + "?uid=evil", school("pksh", PKSH), fake_fetch)
        raise AssertionError("invalid uid must fail closed")
    except ValueError:
        pass
    # show.php 是一般網頁（有完整發佈時間），照常抓文章頁
    assert adapter.fetch_articles is True and adapter.trust_article_title is True


# ---- WordPress ----
def test_wordpress_rss_feeds():
    items = run("wordpress", "cyivs_wp_feed.xml", "cyivs", "https://www.cyivs.cy.edu.tw",
                "https://www.cyivs.cy.edu.tw/feed/")
    assert_items(items, 12)
    assert items[0]["id"] == "cyivs-25423" and items[0]["date"] == "2026-10-27"
    assert items[0]["source_category"] == "教務處"
    for fixture, sid, base, n in [("tlsh_wp_feed.xml", "tlsh", "https://www.tlsh.ylc.edu.tw", 25),
                                  ("hlvs_wp_feed.xml", "hlvs", "https://www.hlvs.ylc.edu.tw", 20)]:
        assert_items(run("wordpress", fixture, sid, base, base + "/feed/"), n)


def test_wordpress_rest_and_archive_agree():
    base = "https://www.bwjh.ylc.edu.tw"
    rest = run("wordpress", "bwjh_wp_rest.json", "bwjh", base, base + "/wp-json/wp/v2/posts")
    archive = run("wordpress", "bwjh_wp_archive.html", "bwjh", base, base + "/category/ann/")
    assert_items(rest, 10)
    assert_items(archive, 10)
    # 同一篇從兩種來源抓到，ID 與日期相同（佈景把當地時間標成 +00:00 也不會偏一天）
    assert [(i["id"], i["date"]) for i in rest] == [(i["id"], i["date"]) for i in archive]


def test_wordpress_nt_table_theme():
    items = run("wordpress", "cmsh_wp_nt_table.html", "cmsh", "https://www.cmsh.cyc.edu.tw",
                "https://www.cmsh.cyc.edu.tw/category/news")
    assert_items(items, 25)
    assert items[0]["id"] == "cmsh-13260" and items[0]["date"] == "2026-10-13"
    assert items[0]["source_category"] == "最新消息"
    shsh = run("wordpress", "shsh_wp_nt_table.html", "shsh", "https://www.shsh.ylc.edu.tw",
               "https://www.shsh.ylc.edu.tw/category/news/")
    assert_items(shsh, 25)
    assert all(not i["title"].startswith("置頂") for i in shsh)


def test_wordpress_rejects_other_sites():
    rss = ('<?xml version="1.0"?><rss><channel><item><title>外站的文章標題</title>'
           '<link>https://evil.example/?p=5</link><guid>https://evil.example/?p=5</guid></item>'
           '<item><title>本校的公告標題</title><link>https://www.t.edu.tw/?p=7</link>'
           '<guid>https://www.t.edu.tw/?p=7</guid><pubDate>Tue, 27 Oct 2026 01:00:00 +0000</pubDate></item>'
           '</channel></rss>')
    items = adapters.get_adapter("wordpress").extract(rss, school("t", "https://t.edu.tw"), "x", today=TODAY)
    assert [i["id"] for i in items] == ["t-7"]


# ---- 雲林縣網站平台（CCMS）----
def test_ccms_homepages_with_roc_dates():
    for fixture, sid, base, n in [("dnsh_ccms_home.html", "dnsh", "https://dnsh.ylc.edu.tw", 100),
                                  ("mljh_ccms_home.html", "mljh", "https://mljh.ylc.edu.tw", 70)]:
        items = run("ylc-ccms", fixture, sid, base, base + "/")
        assert_items(items, n, dated_ratio=0.95)
    dnsh = run("ylc-ccms", "dnsh_ccms_home.html", "dnsh", "https://dnsh.ylc.edu.tw", "https://dnsh.ylc.edu.tw/")
    assert dnsh[0]["id"] == "dnsh-399389" and dnsh[0]["date"] == "2026-10-15"  # 115-10-15


def test_ccms_lists_without_date_column():
    base = "https://gwehs.ylc.edu.tw"
    items = run("ylc-ccms", "gwehs_ccms_list.html", "gwehs", base, base + "/News.aspx?n=115981&sms=57074")
    assert_items(items, 20, dated_ratio=0)
    assert items[0]["id"] == "gwehs-399200"
    assert items[0]["url"] == base + "/News_Content.aspx?n=115981&s=399200"
    assert items[0]["source_category"] == "學生公告專區"
    cards = run("ylc-ccms", "nsjh_ccms_cards.html", "nsjh", "https://nsjh.ylc.edu.tw",
                "https://nsjh.ylc.edu.tw/News2.aspx?n=99488&sms=53921")
    assert_items(cards, 30, dated_ratio=0.3)


# ---- XOOPS tadnews ----
def test_tadnews_rss_bad_timezone():
    items = run("xoops-tadnews", "hhsh_tadnews_rss.xml", "hhsh", "https://www.hhsh.cy.edu.tw",
                "https://www.hhsh.cy.edu.tw/modules/tadnews/rss.php")
    assert_items(items, 19)
    assert items[0]["id"] == "hhsh-1971" and items[0]["date"] == "2026-10-27"
    assert parse_rfc822("Mon, 26 Oct 2026 16:00:00 +1600", TODAY) == "2026-10-27"
    assert_items(run("xoops-tadnews", "mhvs_tadnews_rss.xml", "mhvs", "https://www.mhvs.cyc.edu.tw",
                     "https://www.mhvs.cyc.edu.tw/modules/tadnews/rss.php"), 20)


def test_tadnews_html_skips_static_pages_and_junk():
    items = run("xoops-tadnews", "hhsh_tadnews_list.html", "hhsh", "https://www.hhsh.cy.edu.tw",
                "https://www.hhsh.cy.edu.tw/modules/tadnews/index.php?tag_sn=14")
    assert_items(items, 5, dated_ratio=0.8)
    assert all("page.php" not in i["url"] for i in items)
    assert not any("link to" in i["title"] for i in items)


# ---- ASP Parser CMS ----
def test_parser_cms_list_pages():
    items = run("asp-parser-cms", "hnvs_parser_list.html", "hnvs", "https://www.hnvs.cy.edu.tw",
                "https://www.hnvs.cy.edu.tw/latestevent/index.asp?Parser=9,3,15")
    assert_items(items, 10)
    assert items[0]["id"] == "hnvs-9-14181" and items[0]["date"] == "2026-10-22"
    assert items[0]["title"].startswith("[重要公告]")  # 「置頂」標記已去除
    tssh = run("asp-parser-cms", "tssh_parser_list.html", "tssh", "https://www.tssh.cyc.edu.tw",
               "https://www.tssh.cyc.edu.tw/latestevent/Index.aspx?Parser=9,9,79,46")
    assert_items(tssh, 10)
    assert tssh[0]["id"] == "tssh-9-21353"


def test_parser_cms_excludes_pagination():
    assert parser_cms.article_key("https://x/latestevent/index.asp?Parser=9,3,15,,,,,,,,10") is None
    assert parser_cms.article_key("https://x/latestevent/index-1.asp?Parser=9,3,15,,,,14181") == ("9,3,15", "9-14181")
    assert parser_cms.article_key("https://x/latestevent/Details.aspx?Parser=9,9,79,46,,,21353") == ("9,9,79,46", "9-21353")


# ---- 共通：登錄與 TLS ----
def test_all_families_registered():
    for name in ("new-classic-cms", "rulingdigital", "ischool-site-news", "ischool-json",
                 "wordpress", "ylc-ccms", "xoops-tadnews", "asp-parser-cms"):
        adapters.get_adapter(name)


def test_intermediate_bundle_verifies_school_chains():
    """中繼憑證能讓四校的葉憑證鏈到 certifi 根憑證；沒有它就驗證失敗（對照組）。"""
    import certifi
    pem = scrape.INTERMEDIATES_PEM
    text = pem.read_text(encoding="utf-8")
    assert "PRIVATE KEY" not in text and text.count("BEGIN CERTIFICATE") == 3
    at = "1793000000"  # 2026-10-26，固定時間避免憑證到期讓測試變動
    for sid in ("pksh", "pkvs", "tlhc", "tkvs"):
        leaf = ROOT / "tests" / "fixtures" / "tls" / f"{sid}-leaf.pem"
        ok = subprocess.run(["openssl", "verify", "-attime", at, "-CAfile", certifi.where(),
                             "-untrusted", str(pem), str(leaf)], capture_output=True, text=True)
        assert ok.returncode == 0, (sid, ok.stdout, ok.stderr)
        bad = subprocess.run(["openssl", "verify", "-attime", at, "-CAfile", certifi.where(), str(leaf)],
                             capture_output=True, text=True)
        assert bad.returncode != 0, sid


def test_fetch_retries_with_bundled_intermediates():
    class Resp:
        status_code = 200
        content = b"[]"
        encoding = apparent_encoding = "utf-8"

        def raise_for_status(self):
            pass

    class Session:
        def __init__(self):
            self.calls = []

        def post(self, url, data=None, timeout=None, **kw):
            self.calls.append(kw.get("verify"))
            if "verify" not in kw:
                raise requests.exceptions.SSLError("unable to get local issuer certificate")
            return Resp()

    s = Session()
    out = scrape.fetch(s, "https://www.pksh.ylc.edu.tw/x", {"id": "pksh", "tls_verify_fallback": "bundled-intermediates"},
                       method="POST", data={"a": "1"})
    assert out == "[]" and s.calls[0] is None and s.calls[1].endswith(".pem")
    try:
        scrape.fetch(Session(), "https://x/", {"id": "x"}, method="POST", data={})
        raise AssertionError("schools without a fallback must still fail on TLS errors")
    except requests.exceptions.SSLError:
        pass



def test_main_loop_end_to_end_with_new_adapters():
    """scrape.main() 跑 iSchool JSON 與 WordPress 兩校：POST 取得列表、文章頁抓取受上限控制、RSS 標題不被覆蓋。"""
    import json
    import os
    import tempfile
    sys.path.insert(0, str(ROOT / "tests"))
    import scrape_harness as h

    feeds = {
        PKSH + ischool_json.JSON_PATH: load("pksh_ischool.json"),
        "https://www.cyivs.cy.edu.tw/feed/": load("cyivs_wp_feed.xml"),
    }
    log = []

    class Session(h.FakeSession):
        def get(self, url, **kw):
            log.append(("GET", url))
            if url in feeds:
                return h.FakeResponse(url, feeds[url])
            if "cyivs.cy.edu.tw/announcement" in url or "cyivs.cy.edu.tw/?p=" in url:
                return h.FakeResponse(url, "<html><head><meta property='og:title' content='網站名稱 – 錯誤標題'>"
                                           "<title>錯誤標題</title></head><body><p>內文</p></body></html>")
            return h.FakeResponse(url, "not found", 404)

        def post(self, url, data=None, **kw):
            log.append(("POST", url, (data or {}).get("uid")))
            return h.FakeResponse(url, feeds.get(url, "[]"))

    config = dict(scrape.CONFIG)
    config["schools"] = [
        {"id": "pksh", "name": "國立北港高級中學", "short": "北港高中", "base": PKSH, "adapter": "ischool-json",
         "scan_pages": [], "list_pages": [{"url": PKSH_SRC, "tier": "hot"}]},
        {"id": "cyivs", "name": "國立嘉義高工", "short": "嘉義高工", "base": "https://www.cyivs.cy.edu.tw",
         "adapter": "wordpress", "scan_pages": [], "list_pages": [{"url": "https://www.cyivs.cy.edu.tw/feed/", "tier": "hot"}]},
    ]
    saved = {k: getattr(scrape, k) for k in ("ROOT", "CONFIG", "DETAIL_ROOT", "datetime")}
    saved_session, saved_sleep = requests.Session, scrape.time.sleep
    saved_env = {k: os.environ.get(k) for k in ("FETCH_ALL", "ATTACHMENT_PDF_CAP", "HOT_ONLY", "DEEP_CRAWL")}
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        (tmp / "scraper").mkdir()
        try:
            scrape.ROOT, scrape.CONFIG = tmp, config
            scrape.DETAIL_ROOT = tmp / "docs/data/details"
            scrape.datetime = h.FrozenDatetime
            scrape.requests.Session = Session
            scrape.time.sleep = lambda s: None
            os.environ.update({"FETCH_ALL": "1", "ATTACHMENT_PDF_CAP": "0"})
            os.environ.pop("HOT_ONLY", None)
            os.environ.pop("DEEP_CRAWL", None)
            scrape.main()
        finally:
            for k, v in saved.items():
                setattr(scrape, k, v)
            scrape.requests.Session, scrape.time.sleep = saved_session, saved_sleep
            for k, v in saved_env.items():
                os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
        out = json.loads((tmp / "docs/data/announcements.json").read_text(encoding="utf-8"))
    items = {i["id"]: i for i in out["items"]}
    assert sum(1 for i in items if i.startswith("pksh-")) == 20
    assert sum(1 for i in items if i.startswith("cyivs-")) == 12
    assert ("POST", PKSH + ischool_json.JSON_PATH, "WID_0_2_0a14b8dc17bb7190f9566cc9fece58668f20208a") in log
    show_fetches = [entry for entry in log if "show.php" in entry[1]]
    limit = config["fetch_content_max_per_school"] + config["backfill_max_per_run"]
    assert 0 < len(show_fetches) <= limit, (len(show_fetches), limit)
    assert items["cyivs-25423"]["title"].startswith("公告教務處115學年度"), items["cyivs-25423"]["title"]
    assert any("cyivs.cy.edu.tw/announcement" in entry[1] for entry in log), "WordPress articles still fetched for summaries"



def test_legacy_unverified_dates_are_marked_and_repaired():
    """北港舊匯入資料：短日期被補成錯的年份 → 標為不可信 → 以官方文章頁「發佈時間」修正。"""
    import tempfile
    base_item = {"school": "pksh", "school_name": "北港高中", "category": "一般",
                 "first_seen": "2026-09-07T03:55:21+00:00", "snippet": ""}
    by_id = {
        "pksh-24786": dict(base_item, id="pksh-24786", title="115學年度國中教育會考重要日程表", date="2026-09-10",
                           url=PKSH + "/ischool/public/news_view/show.php?nid=24786"),
        "pksh-27716": dict(base_item, id="pksh-27716", title="8/20-8/23進行校內樹木修剪", date="2026-08-19",
                           url=PKSH + "/ischool/public/news_view/show.php?nid=27716"),
        "pksh-28640": dict(base_item, id="pksh-28640", title="新的公告不受影響", date="2026-10-27",
                           date_source="list", first_seen="2026-10-27T09:00:00+08:00",
                           url=PKSH + "/ischool/public/news_view/show.php?nid=28640"),
        "cysh-1": dict(base_item, id="cysh-1", school="cysh", title="別校舊資料不受影響", date="2026-01-01",
                       url="https://www.cysh.cy.edu.tw/p/406-1008-1.php"),
    }
    pk = {"id": "pksh", "short": "北港高中", "base": PKSH, "adapter": "ischool-json",
          "date_unverified_before": "2026-09-08", "date_repair_per_run": 25}
    assert scrape.mark_unverified_legacy_dates(by_id, [pk, {"id": "cysh"}]) == 2
    assert by_id["pksh-24786"]["date_source"] == "legacy_unverified"
    assert by_id["pksh-28640"]["date_source"] == "list"
    assert "date_source" not in by_id["cysh-1"]

    pages = {by_id["pksh-24786"]["url"]: load("pksh_show_24786.html"),
             by_id["pksh-27716"]["url"]: load("pksh_show_27716.html")}

    class Resp:
        status_code = 200
        encoding = apparent_encoding = "utf-8"

        def __init__(self, body):
            self.content = body.encode("utf-8")

        def raise_for_status(self):
            pass

    class Session:
        def get(self, url, **kw):
            return Resp(pages[url])

    saved = (scrape.DETAIL_ROOT, scrape.time.sleep)
    with tempfile.TemporaryDirectory() as td:
        scrape.DETAIL_ROOT, scrape.time.sleep = Path(td), (lambda s: None)
        try:
            fetched = set()
            n = scrape.repair_legacy_dates(Session(), pk, by_id, adapters.get_adapter(pk), "2026-10-27T10:00:00+08:00",
                                           0, fetched)
        finally:
            scrape.DETAIL_ROOT, scrape.time.sleep = saved
    assert n == 2 and fetched == {"pksh-24786", "pksh-27716"}
    assert by_id["pksh-24786"]["date"] == "2025-09-10"   # 原本錯成 2026-09-10
    assert by_id["pksh-27716"]["date"] == "2026-08-19"   # 原本就對，經確認後保留
    assert {by_id[i]["date_source"] for i in ("pksh-24786", "pksh-27716")} == {"publication"}
    assert by_id["pksh-24786"]["detail_status"] in ("parsed", "partial", "failed")
    # 不可信日期的優先序最低：任何列表日期都能取代
    legacy = {"date": "2026-12-18", "date_source": "legacy_unverified"}
    scrape.choose_date(legacy, {"date": "2025-12-18", "date_source": "list"})
    assert legacy == {"date": "2025-12-18", "date_source": "list"}



def test_legacy_date_repair_survives_public_projection():
    """真實流程：爬蟲 → 公開投影（會拿掉 date_source）→ 下一輪。已確認的不可退回、未確認的每輪續修。"""
    import json
    import os
    import tempfile
    sys.path.insert(0, str(ROOT / "tests"))
    import scrape_harness as h

    legacy_ids = [24000 + n for n in range(30)]
    show = PKSH + "/ischool/public/news_view/show.php?nid="

    def article(nid):
        return (f"<html><head><title>舊公告{nid}</title></head><body><div>舊公告{nid}</div>"
                f"<div>發佈單位 : 教務處 發佈時間 : 2025-{1 + nid % 12:02d}-{1 + nid % 27:02d} 09:00:00</div>"
                f"<p>內文內容{nid}，請同學留意。</p></body></html>")

    class Session(h.FakeSession):
        def get(self, url, **kw):
            if url.startswith(show):
                return h.FakeResponse(url, article(int(url[len(show):])))
            return h.FakeResponse(url, "not found", 404)

        def post(self, url, data=None, **kw):
            return h.FakeResponse(url, "[]")

    pk = {"id": "pksh", "name": "國立北港高級中學", "short": "北港高中", "base": PKSH, "adapter": "ischool-json",
          "date_unverified_before": "2026-09-08", "date_repair_per_run": 25, "scan_pages": [],
          "list_pages": [{"url": PKSH_SRC, "tier": "hot"}]}
    config = dict(scrape.CONFIG, schools=[pk], backfill_max_per_run=0)
    saved = {k: getattr(scrape, k) for k in ("ROOT", "CONFIG", "DETAIL_ROOT", "datetime")}
    saved_session, saved_sleep = requests.Session, scrape.time.sleep
    saved_env = {k: os.environ.get(k) for k in ("FETCH_ALL", "ATTACHMENT_PDF_CAP", "HOT_ONLY", "DEEP_CRAWL")}
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        (tmp / "scraper").mkdir()
        data = tmp / "docs" / "data"
        data.mkdir(parents=True)
        legacy = [{"id": f"pksh-{nid}", "school": "pksh", "school_name": "北港高中", "title": f"舊公告{nid}",
                   "url": show + str(nid), "date": "2026-12-18", "category": "一般", "source_category": "教務處",
                   "first_seen": "2026-09-07T03:55:21+00:00"} for nid in legacy_ids]
        (data / "announcements.json").write_text(json.dumps({"items": legacy}, ensure_ascii=False), encoding="utf-8")

        def project():
            subprocess.run(["node", str(ROOT / "tools/public-metadata-projection.js"), str(tmp / "docs")], check=True,
                           capture_output=True)
            out = {}
            for name in ("archive.json", "announcements.json"):   # 修正後早於一年的會移到封存檔
                path = data / name
                if path.exists():
                    out.update({i["id"]: i for i in json.loads(path.read_text(encoding="utf-8"))["items"]})
            return out

        try:
            scrape.ROOT, scrape.CONFIG = tmp, config
            scrape.DETAIL_ROOT = data / "details"
            scrape.datetime = h.FrozenDatetime
            scrape.requests.Session = Session
            scrape.time.sleep = lambda s: None
            for k in saved_env:
                os.environ.pop(k, None)
            os.environ["ATTACHMENT_PDF_CAP"] = "0"
            scrape.main()
            run1 = project()
            scrape.main()
            run2 = project()
        finally:
            for k, v in saved.items():
                setattr(scrape, k, v)
            scrape.requests.Session, scrape.time.sleep = saved_session, saved_sleep
            for k, v in saved_env.items():
                os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
    status1 = [run1[f"pksh-{n}"].get("date_status") for n in legacy_ids]
    assert status1.count("verified") == 25 and status1.count("unverified") == 5, status1
    assert all("date_source" not in item for item in run1.values()), "projection strips date_source"
    for nid in legacy_ids:
        item = run2[f"pksh-{nid}"]
        assert item["date_status"] == "verified", (nid, item)          # 第二輪補完剩下 5 則，已確認的不退回
        assert item["date"] == f"2025-{1 + nid % 12:02d}-{1 + nid % 27:02d}", (nid, item["date"])



def test_new_school_backlog_is_not_pushed():
    """新上架學校的舊公告只收錄、不推播；notify_since 之後的才進 new_items.json。"""
    import json
    import os
    import tempfile
    sys.path.insert(0, str(ROOT / "tests"))
    import scrape_harness as h

    class Session(h.FakeSession):
        def get(self, url, **kw):
            if url == "https://www.cyivs.cy.edu.tw/feed/":
                return h.FakeResponse(url, load("cyivs_wp_feed.xml"))
            return h.FakeResponse(url, "not found", 404)

    school = {"id": "cyivs", "name": "國立嘉義高工", "short": "嘉義高工", "base": "https://www.cyivs.cy.edu.tw",
              "adapter": "wordpress", "notify_since": "2026-10-27", "scan_pages": [],
              "list_pages": [{"url": "https://www.cyivs.cy.edu.tw/feed/", "tier": "hot"}]}
    config = dict(scrape.CONFIG, schools=[school], backfill_max_per_run=0, fetch_content_max_per_school=0)
    saved = {k: getattr(scrape, k) for k in ("ROOT", "CONFIG", "DETAIL_ROOT", "datetime")}
    saved_session, saved_sleep = requests.Session, scrape.time.sleep
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        (tmp / "scraper").mkdir()
        try:
            scrape.ROOT, scrape.CONFIG = tmp, config
            scrape.DETAIL_ROOT = tmp / "docs/data/details"
            scrape.datetime = h.FrozenDatetime
            scrape.requests.Session = Session
            scrape.time.sleep = lambda s: None
            scrape.main()
        finally:
            for k, v in saved.items():
                setattr(scrape, k, v)
            scrape.requests.Session, scrape.time.sleep = saved_session, saved_sleep
        new_items = json.loads((tmp / config["new_items_path"]).read_text(encoding="utf-8"))
        stored = json.loads((tmp / "docs/data/announcements.json").read_text(encoding="utf-8"))["items"]
    assert len(stored) == 12
    assert new_items and all(i["date"] and i["date"] >= "2026-10-27" for i in new_items), [i["date"] for i in new_items]
    assert len(new_items) < len(stored)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
    print("共用 adapter 測試全數通過 ✅")
