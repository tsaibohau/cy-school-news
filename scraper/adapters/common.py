# -*- coding: utf-8 -*-
"""各 adapter 共用的固定規則：日期、標題、網址同源檢查、項目格式。

不 import scrape.py（避免循環匯入與 `python scraper/scrape.py` 時的雙重載入）。
"""
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin, urlsplit, urlunsplit

TW_TZ = timezone(timedelta(hours=8))

_ISO_RE = re.compile(r"(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})")
_ROC_RE = re.compile(r"(?<![\d])(1\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d])")
_INVISIBLE_RE = re.compile(r"[​-‏ -‮⁠﻿]")
STICKY_PREFIX_RE = re.compile(r"^(?:置頂|TOP)\s*")


def now_tw():
    return datetime.now(TW_TZ)


def valid_date(y, mo, d, today=None):
    """組出 YYYY-MM-DD；無效或晚於台灣時間「明天」者回空字串（與 scrape._fmt_valid_date 相同規則）。"""
    try:
        value = datetime(int(y), int(mo), int(d))
    except (TypeError, ValueError):
        return ""
    s = value.strftime("%Y-%m-%d")
    tomorrow = ((today or now_tw()) + timedelta(days=1)).strftime("%Y-%m-%d")
    return "" if s > tomorrow else s


def parse_date_text(text, today=None):
    """從一段文字找公告日期：西元 2026-10-27／2026/10/27／2026年10月27日，或民國 115-10-27。"""
    text = str(text or "")
    m = _ISO_RE.search(text)
    if m:
        s = valid_date(m.group(1), m.group(2), m.group(3), today)
        if s:
            return s
    m = _ROC_RE.search(text)
    if m:
        return valid_date(int(m.group(1)) + 1911, m.group(2), m.group(3), today)
    return ""


def parse_rfc822(value, today=None):
    """RSS pubDate → 台灣日期。時區欄位明顯錯誤（例如 tadnews 的 +1600）時視為 UTC。"""
    raw = str(value or "").strip()
    if not raw:
        return ""
    fixed = re.sub(r"\s[+-](1[5-9]|[2-9]\d)\d\d$", " +0000", raw)
    try:
        dt = parsedate_to_datetime(fixed)
    except (TypeError, ValueError, IndexError):
        return parse_date_text(raw, today)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(TW_TZ)
    return valid_date(local.year, local.month, local.day, today)


def parse_iso_datetime(value, today=None, assume_tz=TW_TZ):
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return parse_date_text(raw, today)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=assume_tz)
    local = dt.astimezone(TW_TZ)
    return valid_date(local.year, local.month, local.day, today)


def short_date(value, today=None):
    """iSchool 的「10/27」短日期：補今年；若比明天還晚，視為去年。"""
    m = re.fullmatch(r"\s*(\d{1,2})[-/](\d{1,2})\s*", str(value or ""))
    if not m:
        return ""
    today = today or now_tw()
    s = valid_date(today.year, m.group(1), m.group(2), today)
    return s or valid_date(today.year - 1, m.group(1), m.group(2), today)


def clean_title(text):
    title = _INVISIBLE_RE.sub("", str(text or ""))
    title = re.sub(r"\s+", " ", title).strip()
    return STICKY_PREFIX_RE.sub("", title).strip()


def usable_title(title):
    if not title or len(title) < 4 or title in ("MORE", "更多", "more", "詳全文"):
        return False
    # 連結文字本身是網址（「link to https://…」）的是選單或外部連結，不是公告標題
    return not re.search(r"https?://|^link to\b", title, re.I)


def site_host(url):
    host = (urlsplit(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def same_site(url, school):
    """公告連結必須在學校自己的網域（含 www 與否）。"""
    return bool(url) and site_host(url) == site_host(school["base"])


def absolute(url, base):
    try:
        out = urljoin(base, str(url or "").strip())
        parts = urlsplit(out)
    except ValueError:
        return ""
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return ""
    return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))


def make_item(school, article_id, title, url, date, source_url, source_category=""):
    return {
        "id": f'{school["id"]}-{article_id}',
        "school": school["id"],
        "school_name": school["short"],
        "title": title,
        "url": url,
        "date": date,
        "date_source": "list" if date else "",
        "cat_ref": "",
        "source_category": source_category,
        "_source_url": source_url,
    }


def date_near(node, link_pattern, today=None, max_levels=6):
    """往上找所在列的日期；一旦容器出現第二則公告連結就停止（避免拿到相鄰列的日期）。"""
    cur = node
    for _ in range(max_levels):
        if cur is None:
            break
        if cur is not node and len({a.get("href") for a in cur.find_all("a", href=link_pattern)}) > 1:
            break
        s = parse_date_text(cur.get_text(" ", strip=True), today)
        if s:
            return s
        cur = cur.parent
    return ""


def page_title_tail(soup):
    """頁面 <title> 的最後一段（「學校-公布欄-公告訊息」→「公告訊息」），當作來源分類。"""
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    parts = [p.strip() for p in re.split(r"[-|>｜]", title) if p.strip()]
    return parts[-1] if len(parts) > 1 else ""


# 不是實體開頭的「&」（例如標題「A & B」）；校網 RSS 常沒跳脫，整份 XML 會解析失敗
BARE_AMP_RE = re.compile(r"&(?!(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#x[0-9A-Fa-f]+);)")


def parse_feed_xml(text):
    """解析 RSS；若因沒跳脫的「&」失敗，跳脫後再試一次。仍失敗回傳 None。"""
    data = str(text or "").lstrip("\ufeff")
    try:
        return ET.fromstring(data.encode("utf-8"))
    except ET.ParseError:
        pass
    try:
        return ET.fromstring(BARE_AMP_RE.sub("&amp;", data).encode("utf-8"))
    except ET.ParseError:
        return None
