# -*- coding: utf-8 -*-
"""公告來源 adapter 登錄表。

scrape.py 的主迴圈只透過這裡取得 adapter，不再針對個別學校或系統寫分支。
新增一種校網系統 = 新增一個 adapter 模組並在此登錄；
新增一所學校 = 只改 school_registry.py 與 config.json（登錄表），不改主程式。

每個 adapter 提供：
- entries(school)            → [(網址, tier)]，主迴圈依序抓取
- fetch_page(session, url, school, fetch) → 頁面內容（預設用 scrape.fetch）
- extract(html, school, url) → 公告項目清單
- follow_pages(...)          → 額外分頁（可選）
- deep_crawl_pages(url)      → 深度回補要翻的頁（可選）
- coverage_sentinel          → 是否啟用「首頁有、分類頁沒收」的覆蓋率哨兵
"""
from typing import Callable, Dict, List, Tuple

DEFAULT_ADAPTER = "new-classic-cms"


class Adapter:
    name = ""
    coverage_sentinel = False

    def entries(self, school: dict) -> List[Tuple[str, str]]:
        """首頁類的 scan_pages 一律 hot，其後接 list_pages（未標示 tier 者為 cold）。"""
        out = [(url, "hot") for url in school.get("scan_pages", [])]
        for page in school.get("list_pages", []):
            if isinstance(page, str):
                out.append((page, "cold"))
            else:
                out.append((page["url"], page.get("tier", "cold")))
        return out

    def fetch_page(self, session, url: str, school: dict, fetch: Callable) -> str:
        return fetch(session, url, school)

    def extract(self, html: str, school: dict, source_url: str) -> list:
        raise NotImplementedError

    def follow_pages(self, session, school: dict, page_url: str, html: str,
                     fetch: Callable, on_items: Callable, sleep: Callable) -> None:
        """抓完一個來源頁後的額外分頁；預設沒有。"""
        return None

    def deep_crawl_pages(self, page_url: str) -> List[str]:
        """DEEP_CRAWL 模式要往後翻的網址；預設不翻。"""
        return []


_REGISTRY: Dict[str, Adapter] = {}


def register(adapter: Adapter, *aliases: str) -> Adapter:
    for name in (adapter.name,) + aliases:
        if name in _REGISTRY and _REGISTRY[name] is not adapter:
            raise ValueError(f"adapter name already registered: {name}")
        _REGISTRY[name] = adapter
    return adapter


def adapter_name(school: dict) -> str:
    """config.json 有寫就用；沒寫就看 school_registry 的 announcement_adapter。"""
    if school.get("adapter"):
        return school["adapter"]
    try:
        from school_registry import SCHOOLS
        definition = SCHOOLS.get(str(school.get("id", "")))
    except ImportError:  # pragma: no cover
        definition = None
    return definition.announcement_adapter if definition else DEFAULT_ADAPTER


def get_adapter(school_or_name) -> Adapter:
    name = school_or_name if isinstance(school_or_name, str) else adapter_name(school_or_name)
    try:
        return _REGISTRY[name]
    except KeyError as exc:
        raise KeyError(f"unknown announcement adapter: {name}") from exc


def registered_names() -> List[str]:
    return sorted(_REGISTRY)
