# -*- coding: utf-8 -*-
"""數位果子 iSchool 消息公佈欄（JSON 端點）。

iSchool 首頁的公告是 JS 向 /ischool/widget/site_news/news_query_json.php POST 取得，
直接抓 HTML 只會得到空殼。來源網址寫成
  https://<校網>/ischool/widget/site_news/news_query_json.php?uid=WID_0_2_xxx
adapter 從網址取出 uid 後 POST（參數與北港原本的 Windows 抓取相同）。
文章頁 show.php 是一般網頁，有完整標題、內文與「發佈時間 : 2025-09-10 09:28:20」，
所以照常抓文章頁：列表若只給「10/27」短日期，文章頁的完整發佈時間會覆蓋推測的年份。
"""
import json
import re
from urllib.parse import parse_qs, urlsplit, urlunsplit

from . import Adapter, register
from .common import clean_title, make_item, parse_date_text, short_date, usable_title

JSON_PATH = "/ischool/widget/site_news/news_query_json.php"
SHOW_PATH = "/ischool/public/news_view/show.php"
UID_RE = re.compile(r"^WID_\d+_\d+_[0-9a-f]{40}$")
DEFAULT_ROWS = 30


def source_uid(url):
    parts = urlsplit(url)
    if parts.path != JSON_PATH:
        return ""
    uid = parse_qs(parts.query).get("uid", [""])[0]
    return uid if UID_RE.match(uid) else ""


def query_body(uid, page_num=0, rows=DEFAULT_ROWS):
    return {"field": "time", "order": "DESC", "pageNum": str(page_num), "maxRows": str(rows),
            "keyword": "", "uid": uid, "tf": "2", "auth_type": "user", "use_cache": "1"}


def item_date(value, today=None):
    raw = str(value or "").strip()
    return parse_date_text(raw, today) or short_date(raw, today)


class IschoolJsonAdapter(Adapter):
    name = "ischool-json"

    def fetch_page(self, session, url, school, fetch):
        uid = source_uid(url)
        if not uid:
            raise ValueError(f"iSchool 來源網址缺少有效 uid: {url}")
        endpoint = urlunsplit(urlsplit(url)._replace(query="", fragment=""))
        rows = max(10, min(int(school.get("ischool_rows", DEFAULT_ROWS)), 50))
        return fetch(session, endpoint, school, method="POST", data=query_body(uid, 0, rows))

    def extract(self, payload, school, source_url, today=None):
        try:
            records = json.loads(str(payload or "").lstrip("﻿"))
        except ValueError:
            return []
        if not isinstance(records, list):
            return []
        base = urlsplit(school["base"])
        items, seen = [], set()
        for record in records:
            if not isinstance(record, dict):
                continue
            news_id = str(record.get("newsId") or "").strip()
            title = clean_title(record.get("title"))
            if not news_id.isdigit() or news_id in seen or not usable_title(title):
                continue
            seen.add(news_id)
            url = urlunsplit((base.scheme, base.netloc, SHOW_PATH, "nid=" + news_id, ""))
            category = clean_title(record.get("attr_name") or record.get("unit_name") or "")
            items.append(make_item(school, news_id, title, url, item_date(record.get("time"), today),
                                   source_url, category))
        return items


register(IschoolJsonAdapter())
