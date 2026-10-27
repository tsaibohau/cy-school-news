# -*- coding: utf-8 -*-
"""XOOPS + tadnews 模組（興華、民雄農工、永慶）。

- RSS：/modules/tadnews/rss.php，最新 20 則；pubDate 的時區常是錯的（+1600），視為 UTC。
- HTML：/modules/tadnews/index.php 列表，連結 index.php?nsn=<編號>。
  page.php?nsn= 是「靜態頁面」（學校沿革等），不是公告，一律排除。
"""
import re
import xml.etree.ElementTree as ET
from urllib.parse import parse_qs, urlsplit

from bs4 import BeautifulSoup

from . import Adapter, register
from .common import absolute, clean_title, date_near, make_item, parse_rfc822, same_site, usable_title

NEWS_LINK_RE = re.compile(r"modules/tadnews/index\.php\?(?:[^\"'#]*&)?nsn=\d+")


def news_id(url):
    parts = urlsplit(url)
    if not parts.path.endswith("/modules/tadnews/index.php"):
        return ""
    value = (parse_qs(parts.query).get("nsn") or [""])[0]
    return value if value.isdigit() else ""


class TadnewsAdapter(Adapter):
    name = "xoops-tadnews"
    trust_article_title = False

    def extract(self, payload, school, source_url, today=None):
        text = str(payload or "").lstrip("﻿ \r\n\t")
        if text[:200].lower().startswith("<?xml") or "<rss" in text[:300].lower():
            return self._rss(text, school, source_url, today)
        return self._html(text, school, source_url, today)

    def _rss(self, text, school, source_url, today):
        try:
            root = ET.fromstring(text.encode("utf-8"))
        except ET.ParseError:
            return []
        items, seen = [], set()
        for node in root.iter("item"):
            url = absolute(node.findtext("link"), school["base"])
            nid = news_id(url)
            title = clean_title(node.findtext("title"))
            if not nid or nid in seen or not same_site(url, school) or not usable_title(title):
                continue
            seen.add(nid)
            items.append(make_item(school, nid, title, url, parse_rfc822(node.findtext("pubDate"), today),
                                   source_url, clean_title(node.findtext("category") or "")))
        return items

    def _html(self, html, school, source_url, today):
        soup = BeautifulSoup(html, "html.parser")
        items, seen = [], set()
        for anchor in soup.find_all("a", href=NEWS_LINK_RE):
            url = absolute(anchor["href"], source_url or school["base"])
            nid = news_id(url)
            title = clean_title(anchor.get_text(" ", strip=True))
            if not nid or nid in seen or not same_site(url, school) or not usable_title(title):
                continue
            seen.add(nid)
            items.append(make_item(school, nid, title, url, date_near(anchor, NEWS_LINK_RE, today),
                                   source_url))
        return items


register(TadnewsAdapter())
