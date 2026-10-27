# -*- coding: utf-8 -*-
"""WordPress 校網。依內容自動判斷三種格式（皆為固定規則）：

1. RSS（/feed/、/category/x/feed/）：最通用，多數校網都開著。
2. REST JSON（/wp-json/wp/v2/posts）：少數學校開放。
3. HTML 列表：
   - 「nt_table」公告表格佈景（協同、正心）：<a class="news_title" nid="13271">
   - 一般文章彙整頁：<article id="post-123"> ＋ <time datetime>
文章 ID 一律用 WordPress 的 post ID，因此同一則公告從不同來源抓到也不會重複。
"""
import json
import re
from urllib.parse import parse_qs, urlsplit

from bs4 import BeautifulSoup

from . import Adapter, register
from .common import (absolute, clean_title, make_item, parse_date_text, parse_feed_xml, parse_iso_datetime,
                     parse_rfc822, same_site, usable_title)

POST_ID_RE = re.compile(r"[?&]p=(\d+)")
PATH_ID_RE = re.compile(r"/(\d{2,9})/?$")


def post_id_from(*values):
    for value in values:
        value = str(value or "")
        m = POST_ID_RE.search(value)
        if m:
            return m.group(1)
    for value in values:
        m = PATH_ID_RE.search(urlsplit(str(value or "")).path)
        if m:
            return m.group(1)
    return ""


def detect_format(payload):
    head = str(payload or "").lstrip("﻿ \r\n\t")[:300].lower()
    if head.startswith("<?xml") or "<rss" in head:
        return "rss"
    if head.startswith("[") or head.startswith("{"):
        return "json"
    return "html"


def _rss_items(payload, school, source_url, today):
    root = parse_feed_xml(payload)
    if root is None:
        return []
    out = []
    for node in root.iter("item"):
        link = absolute(node.findtext("link"), school["base"])
        guid = node.findtext("guid") or ""
        post_id = post_id_from(guid, link)
        title = clean_title(node.findtext("title"))
        if not post_id or not same_site(link, school) or not usable_title(title):
            continue
        cats = [clean_title(c.text) for c in node.findall("category") if c.text]
        out.append(make_item(school, post_id, title, link, parse_rfc822(node.findtext("pubDate"), today),
                             source_url, cats[0] if cats else ""))
    return out


def _json_items(payload, school, source_url, today):
    try:
        rows = json.loads(str(payload).lstrip("﻿"))
    except ValueError:
        return []
    if not isinstance(rows, list):
        return []
    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        post_id = str(row.get("id") or "")
        link = absolute(row.get("link"), school["base"])
        title_field = row.get("title")
        raw_title = title_field.get("rendered") if isinstance(title_field, dict) else title_field
        title = clean_title(BeautifulSoup(str(raw_title or ""), "html.parser").get_text(" "))
        if not post_id.isdigit() or not same_site(link, school) or not usable_title(title):
            continue
        out.append(make_item(school, post_id, title, link, parse_iso_datetime(row.get("date"), today),
                             source_url))
    return out


def _html_items(payload, school, source_url, today):
    soup = BeautifulSoup(payload or "", "html.parser")
    out = []
    # nt_table 佈景：每列有日期欄、標題連結（nid）、類別欄
    for anchor in soup.select("a.news_title[nid]"):
        post_id = str(anchor.get("nid") or "").strip()
        link = absolute(anchor.get("href"), school["base"])
        for extra in anchor.select(".sticky_text"):
            extra.decompose()
        title = clean_title(anchor.get_text(" ", strip=True))
        if not post_id.isdigit() or not same_site(link, school) or not usable_title(title):
            continue
        row = anchor.find_parent("tr")
        date_cell = row.select_one(".nt_date") if row else None
        cat_cell = row.select_one(".nt_category") if row else None
        date = parse_date_text(date_cell.get_text(" ", strip=True) if date_cell else "", today)
        out.append(make_item(school, post_id, title, link, date, source_url,
                             clean_title(cat_cell.get_text(" ", strip=True)) if cat_cell else ""))
    if out:
        return out
    # 一般彙整頁：<article id="post-123">
    for article in soup.select("article[id^=post-]"):
        post_id = article["id"].split("-", 1)[1]
        heading = article.find(["h1", "h2", "h3", "h4"])
        anchor = (heading.find("a", href=True) if heading else None) or article.find("a", href=True)
        if not anchor or not post_id.isdigit():
            continue
        link = absolute(anchor.get("href"), school["base"])
        title = clean_title((heading or anchor).get_text(" ", strip=True))
        if not same_site(link, school) or not usable_title(title):
            continue
        # 佈景的 <time datetime> 常把當地時間標成 +00:00，只取日期部分，不做時區換算
        stamp = article.find("time")
        date = parse_date_text(stamp.get("datetime") if stamp and stamp.get("datetime")
                               else article.get_text(" ", strip=True), today)
        out.append(make_item(school, post_id, title, link, date, source_url))
    return out


class WordPressAdapter(Adapter):
    name = "wordpress"
    trust_article_title = False  # og:title 常帶「 – 學校名稱」，以列表／RSS 標題為準

    def extract(self, payload, school, source_url, today=None):
        kind = detect_format(payload)
        if kind == "rss":
            items = _rss_items(payload, school, source_url, today)
        elif kind == "json":
            items = _json_items(payload, school, source_url, today)
        else:
            items = _html_items(payload, school, source_url, today)
        seen, unique = set(), []
        for item in items:
            if item["id"] not in seen:
                seen.add(item["id"])
                unique.append(item)
        return unique


register(WordPressAdapter())
