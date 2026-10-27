# -*- coding: utf-8 -*-
"""雲林縣網站平台（CCMS，政府網站共構型 .aspx）：斗南、古坑華德福、麥寮、蔦松等縣立學校。

公告連結一律是 News_Content.aspx?n=<節點>&s=<公告編號>；s 在整個網站唯一，當作文章 ID。
首頁與 News.aspx／News2.aspx 列表都適用；日期多為民國格式（115-10-14），
若列表版型沒有日期欄（例如古坑學生公告），日期留空，交給文章頁補齊。
"""
import re
from urllib.parse import parse_qs, urlsplit

from bs4 import BeautifulSoup

from . import Adapter, register
from .common import absolute, clean_title, date_near, make_item, page_title_tail, same_site, usable_title

CONTENT_RE = re.compile(r"News_Content\.aspx\?", re.I)


class CcmsAdapter(Adapter):
    name = "ylc-ccms"
    trust_article_title = False

    def extract(self, html, school, source_url, today=None):
        soup = BeautifulSoup(html or "", "html.parser")
        category = page_title_tail(soup)
        items, seen = [], set()
        for anchor in soup.find_all("a", href=CONTENT_RE):
            url = absolute(anchor["href"], source_url or school["base"])
            if not same_site(url, school):
                continue
            query = parse_qs(urlsplit(url).query)
            article_id = (query.get("s") or [""])[0]
            node = (query.get("n") or [""])[0]
            if not article_id.isdigit() or not node.isdigit() or article_id in seen:
                continue
            title = clean_title(anchor.get("title") or "") or clean_title(anchor.get_text(" ", strip=True))
            if not usable_title(title):
                caption = anchor.select_one(".caption")
                title = clean_title(caption.get_text(" ", strip=True)) if caption else title
            if not usable_title(title):
                continue
            seen.add(article_id)
            date = date_near(anchor, CONTENT_RE, today)
            items.append(make_item(school, article_id, title, url, date, source_url, category))
        return items


register(CcmsAdapter())
