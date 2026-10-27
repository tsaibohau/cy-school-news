# -*- coding: utf-8 -*-
"""離線執行 scrape.main() 的測試夾具：假網路、凍結時間、暫存目錄。

用途：重構爬蟲主程式時，確認輸出逐位元不變。
- 每個網址回傳由網址決定的固定 HTML（列表頁、首頁、文章頁、iSchool 列表）。
- 時間凍結在 2026-10-27 09:00（台灣時間）。
- 跑三輪：FETCH_ALL（含補齊）→ 一般排程（cold 頁應被略過）→ DEEP_CRAWL 深度翻頁。
- 回傳所有輸出檔的 SHA-256 與請求順序。
"""
import copy
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import datetime as _dt, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))
FIXTURES = ROOT / "tests" / "fixtures"
TW = timezone(timedelta(hours=8))
FROZEN = _dt(2026, 10, 27, 9, 0, 0, tzinfo=TW)

KEYWORDS = ["段考範圍", "繁星推薦", "獎學金申請", "恭賀榮獲", "科展競賽", "社團博覽會",
            "研習講座", "新生報到", "代理教師甄選", "圖書館公告", "校慶活動", "系統維護"]


class FrozenDatetime(_dt):
    @classmethod
    def now(cls, tz=None):
        return FROZEN if tz is None else FROZEN.astimezone(tz)


def _h(text):
    return int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:8], 16)


def rd_list_html(url, unit, base):
    """銳鼎列表頁或首頁：由網址決定 3–7 筆，文章 ID 取自共用池，讓頁面之間有重疊。"""
    h = _h(url)
    n = 3 + h % 5
    rows = []
    for k in range(n):
        art = 130000 + (h // 7 + k * 37) % 260
        cat = [12, 13, 14, 17, 18, 21, 25, 99, 451][(h + k) % 9]
        title = f"{KEYWORDS[(art + k) % len(KEYWORDS)]}公告第{art}號"
        date = "" if (art % 11 == 0) else f"2026-{1 + art % 10:02d}-{1 + art % 27:02d}"
        rows.append(f'<div class="d-txt"><a href="{base}/p/406-{unit}-{art},r{cat}.php">{title}</a>'
                    f'<i class="mdate">{date}</i></div>')
    return f"<html><head><title>行政單位>教務處>列表{h % 50}</title></head><body>{''.join(rows)}</body></html>"


def article_html(url):
    h = _h(url)
    art = re.search(r"(\d+)(?:,r\d+)?\.php|nid=(\d+)", url)
    art_id = (art.group(1) or art.group(2)) if art else str(h % 1000)
    title = f"{KEYWORDS[h % len(KEYWORDS)]}公告第{art_id}號（內文）"
    date = "" if h % 9 == 0 else f"2026-{1 + h % 10:02d}-{1 + h % 27:02d}"
    pub = f"<p>發佈日期：{date}</p>" if date else ""
    return (f"<html><head><title>{title}</title></head><body><div class=\"mpgdetail\">"
            f"<h2 class=\"hdline\">{title}</h2>{pub}<div class=\"mcont\"><p>{title}。"
            f"請同學於 2026-11-{1 + h % 27:02d} 前完成報名，相關事項請洽教務處。</p></div></div></body></html>")


class FakeResponse:
    def __init__(self, url, body, status=200):
        self.url = url
        self.status_code = status
        self.content = body.encode("utf-8")
        self.encoding = "utf-8"
        self.apparent_encoding = "utf-8"
        self.headers = {"Content-Type": "text/html; charset=utf-8"}
        self.ok = status < 400

    @property
    def text(self):
        return self.content.decode("utf-8")

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests
            err = requests.exceptions.HTTPError(f"{self.status_code} for {self.url}")
            err.response = self
            raise err


class FakeSession:
    log = []

    def __init__(self, *a, **kw):
        self.headers = {}

    def _route(self, url):
        if "/ischool/widget/site_news/main2.php" in url and "pageNum" not in url:
            return (FIXTURES / "pksh_list.html").read_text(encoding="utf-8"), 200
        if "/ischool/public/news_view/show.php" in url or "/p/406-" in url:
            return article_html(url), 200
        m = re.match(r"https://[^/]+", url)
        base = m.group(0) if m else ""
        unit = {"https://www.cysh.cy.edu.tw": "1008", "https://www.cygsh.cy.edu.tw": "1013"}.get(base)
        if unit and ("/p/403-" in url or "/p/412-" in url or url.rstrip("/") == base):
            if _h(url) % 23 == 0:
                return "server error", 500  # 少數來源失敗，覆蓋錯誤處理分支
            return rd_list_html(url, unit, base), 200
        return "not found", 404

    def get(self, url, **kw):
        FakeSession.log.append(("GET", url))
        body, status = self._route(url)
        return FakeResponse(url, body, status)

    def request(self, method, url, **kw):
        FakeSession.log.append((method, url))
        body, status = self._route(url)
        return FakeResponse(url, body, status)

    def post(self, url, **kw):
        return self.request("POST", url, **kw)


def harness_config(scrape):
    # 凍結的設定快照：之後在 config.json 新增或啟用學校，不會改變這份黃金比對的基準
    cfg = json.loads((FIXTURES / "scrape_golden_config.json").read_text(encoding="utf-8"))
    for school in cfg["schools"]:
        if school["id"] == "pksh":
            school["enabled"] = True  # 覆蓋 iSchool 分支
    return cfg


def seed_existing(tmp):
    """既有資料：幾筆會被再次抓到的公告（測合併）與一筆封存公告。"""
    data = tmp / "docs" / "data"
    data.mkdir(parents=True, exist_ok=True)
    items = [{"id": "cysh-130010", "school": "cysh", "school_name": "嘉中", "title": "舊標題",
              "url": "https://www.cysh.cy.edu.tw/p/406-1008-130010,r12.php", "date": "2026-03-01",
              "date_source": "list", "category": "一般", "first_seen": "2026-03-01T08:00:00+08:00",
              "snippet": "", "detail_status": "pending"},
             {"id": "cygsh-130055", "school": "cygsh", "school_name": "嘉女", "title": "校慶活動公告第130055號",
              "url": "https://www.cygsh.cy.edu.tw/p/406-1013-130055,r21.php", "date": "",
              "category": "一般", "first_seen": "2026-09-01T08:00:00+08:00", "snippet": "x"}]
    archive = [{"id": "cysh-1", "school": "cysh", "school_name": "嘉中", "title": "很久以前的公告標題",
                "url": "https://www.cysh.cy.edu.tw/p/406-1008-1.php", "date": "2024-01-01",
                "category": "一般", "first_seen": "2024-01-01T08:00:00+08:00", "snippet": "舊"}]
    (data / "announcements.json").write_text(json.dumps({"items": items}, ensure_ascii=False), encoding="utf-8")
    (data / "archive.json").write_text(json.dumps({"items": archive}, ensure_ascii=False), encoding="utf-8")


def run_harness():
    import scrape
    import requests

    saved = {k: getattr(scrape, k) for k in ("ROOT", "CONFIG", "DETAIL_ROOT", "datetime")}
    saved_session = requests.Session
    saved_sleep = scrape.time.sleep
    saved_env = {k: os.environ.get(k) for k in ("FETCH_ALL", "HOT_ONLY", "DEEP_CRAWL",
                                                 "DETAIL_BACKFILL", "ATTACHMENT_PDF_CAP",
                                                 "ANNOUNCEMENT_TOMBSTONES_PATH")}
    FakeSession.log = []
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        (tmp / "scraper").mkdir()
        seed_existing(tmp)
        try:
            scrape.ROOT = tmp
            scrape.CONFIG = harness_config(scrape)
            scrape.DETAIL_ROOT = tmp / "docs" / "data" / "details"
            scrape.datetime = FrozenDatetime
            scrape.requests.Session = FakeSession
            scrape.time.sleep = lambda s: None
            for k in saved_env:
                os.environ.pop(k, None)
            os.environ["ATTACHMENT_PDF_CAP"] = "0"
            os.environ["FETCH_ALL"] = "1"
            scrape.main()
            run1 = len(FakeSession.log)
            os.environ.pop("FETCH_ALL")
            scrape.main()
            os.environ["DEEP_CRAWL"] = "1"  # 第三輪：深度回補翻頁
            scrape.main()
        finally:
            for k, v in saved.items():
                setattr(scrape, k, v)
            scrape.requests.Session = saved_session
            scrape.time.sleep = saved_sleep
            for k, v in saved_env.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
        files = {}
        for p in sorted(tmp.rglob("*")):
            if p.is_file():
                files[str(p.relative_to(tmp))] = hashlib.sha256(p.read_bytes()).hexdigest()
        announcements = json.loads((tmp / "docs/data/announcements.json").read_text(encoding="utf-8"))
    log_text = "\n".join(f"{m} {u}" for m, u in FakeSession.log)
    return {
        "files": files,
        "requests_run1": run1,
        "requests_total": len(FakeSession.log),
        "request_log_sha256": hashlib.sha256(log_text.encode("utf-8")).hexdigest(),
        "recent_items": len(announcements["items"]),
    }
