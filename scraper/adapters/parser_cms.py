# -*- coding: utf-8 -*-
"""ASP「Parser=」校網平台（華南高商 .asp、東石高中 .aspx）。

列表頁 latestevent/index.as(p|px)?Parser=9,3,15；
文章連結的 Parser 參數最後是「,,,<編號>」：
  華南  index-1.asp?Parser=9,3,15,,,,14181
  東石  Details.aspx?Parser=9,9,79,46,,,21353
Parser 以逗號分成 7 欄、第 7 欄是編號的才是文章；分頁連結（…,,,,,,,,10）是 11 欄，排除。
編號在同一個 Parser 前綴（模組）內唯一，ID 取「模組號-編號」避免不同模組撞號。
來源網址本身有 Parser 時（列表頁），只收同一個列表前綴的文章，避免收到選單與其他模組。
"""
import re
from urllib.parse import unquote, urlsplit

from bs4 import BeautifulSoup

from . import Adapter, register
from .common import absolute, clean_title, date_near, make_item, page_title_tail, same_site, usable_title

ARTICLE_HREF_RE = re.compile(r"Parser=\d+,[\d,]*,,,\d+", re.I)
PARSER_RE = re.compile(r"Parser=([\d,]+)", re.I)


def parser_fields(url):
    m = PARSER_RE.search(unquote(urlsplit(url).query))
    return m.group(1).split(",") if m else []


def article_key(url):
    """回傳 (列表前綴, 文章 ID)；不是文章就回 None。"""
    fields = parser_fields(url)
    if len(fields) != 7 or not fields[6].isdigit() or not fields[0].isdigit():
        return None
    prefix = ",".join(f for f in fields[:6] if f)
    return prefix, f"{fields[0]}-{fields[6]}"


class ParserCmsAdapter(Adapter):
    name = "asp-parser-cms"
    trust_article_title = False

    def extract(self, html, school, source_url, today=None):
        soup = BeautifulSoup(html or "", "html.parser")
        category = page_title_tail(soup)
        source_fields = parser_fields(source_url or "")
        source_prefix = ",".join(f for f in source_fields if f) if 1 <= len(source_fields) <= 4 else ""
        items, seen = [], set()
        for anchor in soup.find_all("a", href=ARTICLE_HREF_RE):
            url = absolute(anchor["href"], source_url or school["base"])
            if not same_site(url, school):
                continue
            key = article_key(url)
            if not key or (source_prefix and key[0] != source_prefix):
                continue
            article_id = key[1]
            for extra in anchor.select(".top_type"):
                extra.decompose()
            title = clean_title(anchor.get("title") or "") or clean_title(anchor.get_text(" ", strip=True))
            if article_id in seen or not usable_title(title):
                continue
            seen.add(article_id)
            items.append(make_item(school, article_id, title, url,
                                   date_near(anchor, ARTICLE_HREF_RE, today), source_url, category))
        return items


register(ParserCmsAdapter())
