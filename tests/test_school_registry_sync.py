# -*- coding: utf-8 -*-
"""學校登錄表一致性：school_registry.py ↔ config.json ↔ docs/school-registry.js ↔ adapter 登錄表。

新增學校時只改登錄表；這支測試確保三處不會互相矛盾。
執行：python tests/test_school_registry_sync.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

import scrape  # noqa: E402,F401  (登錄 new-classic-cms / ischool-site-news)
import adapters  # noqa: E402
from school_registry import SCHOOLS  # noqa: E402

CONFIG = json.loads((ROOT / "scraper/config.json").read_text(encoding="utf-8"))


def frontend_schools():
    js = ("const r=require(process.argv[1]);"
          "const all=['cysh','cygsh','fjsh','pksh'].concat(%s).map(id=>r.find(id)).filter(Boolean);"
          "console.log(JSON.stringify(all));")
    ids = json.dumps(sorted(SCHOOLS))
    out = subprocess.run(["node", "-e", js % ids, str(ROOT / "docs/school-registry.js")],
                         capture_output=True, text=True, check=True).stdout
    return {row["id"]: row for row in json.loads(out)}


def test_config_and_registry_agree():
    config_ids = [s["id"] for s in CONFIG["schools"]]
    assert sorted(config_ids) == sorted(SCHOOLS), (config_ids, sorted(SCHOOLS))
    for school in CONFIG["schools"]:
        definition = SCHOOLS[school["id"]]
        assert school["name"] == definition.name, school["id"]
        assert school["short"] == definition.short_name, school["id"]
        assert school["base"].rstrip("/") == definition.base_url.rstrip("/"), school["id"]
        enabled = school.get("enabled", True) is not False
        assert enabled == (definition.status == "active"), (school["id"], enabled, definition.status)
        assert enabled == bool(definition.capabilities.get("announcements")), school["id"]
        # config 寫的 adapter 與登錄表必須指向同一個 adapter
        assert adapters.get_adapter(school) is adapters.get_adapter(definition.announcement_adapter), school["id"]


def test_source_urls_are_valid_for_their_adapter():
    """每個來源網址都在學校自己的網域；iSchool 來源帶有效 uid；新上架學校有 notify_since。"""
    from urllib.parse import urlsplit
    from adapters.ischool_json import source_uid
    from adapters.common import same_site
    original = {"cysh", "cygsh"}
    for school in CONFIG["schools"]:
        urls = list(school.get("scan_pages", [])) + [p if isinstance(p, str) else p["url"] for p in school.get("list_pages", [])]
        assert urls, school["id"]
        for url in urls:
            assert urlsplit(url).scheme == "https", (school["id"], url)
            assert same_site(url, school), (school["id"], url)
            if adapters.get_adapter(school).name == "ischool-json":
                assert source_uid(url), (school["id"], url)
        if school["id"] not in original:
            assert school.get("notify_since"), school["id"] + " must not push its backlog"


def test_history_capacity_has_headroom():
    """max_items 只是防止刪資料的保護；目前資料量必須低於上限的一半，新增學校前就會先發現。

    2026-10-27 上架雲林 13 校時，總數 6,369 超過舊上限 6,000，正式抓取因此失敗。
    """
    total = 0
    for name in ("announcements.json", "archive.json"):
        path = ROOT / "docs" / "data" / name
        if path.exists():
            total += len(json.loads(path.read_text(encoding="utf-8")).get("items", []))
    new_school_backlog = 120 * sum(1 for s in CONFIG["schools"] if s.get("notify_since"))
    assert CONFIG["max_items"] >= 2 * (total + new_school_backlog), (CONFIG["max_items"], total, new_school_backlog)


def test_backlog_does_not_overlap_live_schools():
    """待處理清單（自建網站／連不上）與已上架學校不得重疊；上架後要從清單移除。"""
    backlog = json.loads((ROOT / "scraper/school_backlog.json").read_text(encoding="utf-8"))
    ids = [row["id"] for row in backlog["schools"]]
    assert len(ids) == len(set(ids)), ids
    live = {s["id"] for s in CONFIG["schools"]}
    assert not (set(ids) & live), set(ids) & live
    for row in backlog["schools"]:
        assert row["reason"] in ("custom", "unreachable"), row
        assert row["county"] and row["site"].startswith("http") and row["notes"], row


def test_every_registry_adapter_is_registered():
    for definition in SCHOOLS.values():
        adapters.get_adapter(definition.announcement_adapter)
    assert "new-classic-cms" in adapters.registered_names()
    assert "rulingdigital" in adapters.registered_names()


def test_frontend_registry_matches_backend():
    front = frontend_schools()
    assert sorted(front) == sorted(SCHOOLS), sorted(front)
    for school_id, definition in SCHOOLS.items():
        row = front[school_id]
        assert row["name"] == definition.name, school_id
        assert row["short"] == definition.short_name, school_id
        assert row.get("status", "active") == definition.status, school_id
        assert (row.get("visible", True) is not False) == definition.visible, school_id
        assert row["capabilities"] == dict(definition.capabilities), school_id
    # 前端的舊日期截止日必須與 config.json 相同，確保爬蟲尚未標記前也不會顯示錯的日期
    for school in CONFIG["schools"]:
        assert front[school["id"]].get("dateUnverifiedBefore") == school.get("date_unverified_before"), school["id"]


def test_scrape_has_no_school_specific_branches():
    """主迴圈依 adapter 分派，不得再出現特定學校或系統名稱的判斷。"""
    src = (ROOT / "scraper/scrape.py").read_text(encoding="utf-8")
    main_src = src[src.index("def main()"):]
    for needle in ('"cysh"', '"cygsh"', '"pksh"', '"fjsh"', '== "ischool-site-news"', '== "rulingdigital"'):
        assert needle not in main_src, needle


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
