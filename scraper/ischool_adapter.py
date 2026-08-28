"""Small, HTTP-only adapter for iSchool announcement widgets.

It deliberately keeps the iSchool protocol outside the RulingDigital parser.
All callers retain normal TLS verification; an unusable API response is an
availability failure, never an empty announcement board.
"""
from __future__ import annotations

import json
import re
import ssl
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urljoin

from bs4 import BeautifulSoup
import requests


UID_RE = re.compile(r"(?:g_unique_id|uid)\s*[=:]\s*[\"']([^\"']+)")
MISSING_DETAIL_RE = re.compile(r"(?:the\s+)?news\s+is\s+not\s+exist(?:ed)?", re.I)


def discover_uid(html: str, fallback_uid: str = "") -> tuple[str, bool]:
    """Return a board UID and whether the configured fallback was used."""
    match = UID_RE.search(html or "")
    if match and match.group(1).startswith("WID_"):
        return match.group(1), False
    soup = BeautifulSoup(html or "", "html.parser")
    for node in soup.select("[data-uid], input[name=uid]"):
        value = (node.get("data-uid") or node.get("value") or "").strip()
        if value.startswith("WID_"):
            return value, False
    return fallback_uid, True


def _date(value: object) -> str:
    text = str(value or "").strip()
    match = re.search(r"(20\d{2})[/-](\d{1,2})[/-](\d{1,2})", text)
    if not match:
        return ""
    try:
        return datetime(int(match.group(1)), int(match.group(2)), int(match.group(3))).date().isoformat()
    except ValueError:
        return ""


def _clean(value: object) -> str:
    return re.sub(r"\s+", " ", BeautifulSoup(str(value or ""), "html.parser").get_text(" ", strip=True)).strip()


@dataclass
class IschoolPage:
    items: list[dict]
    total_pages: int


class PkshAdapter:
    """North Gang HS iSchool board protocol, with no browser dependency."""
    list_path = "/ischool/widget/site_news/news_query_json.php"
    detail_path = "/ischool/widget/site_news/news_query_json_content.php"

    def __init__(self, school: dict):
        self.school = school
        self.base = school["base"].rstrip("/")
        self.fallback_uid = str(school.get("ischool_uid") or "")

    def discover_board(self, html: str) -> tuple[str, bool]:
        return discover_uid(html, self.fallback_uid)

    def _verified_post(self, session, url: str, data: dict, timeout: int):
        """POST without ever weakening certificate verification.

        Some iSchool installations need the operating-system CA bundle rather
        than Requests' bundled store.  This is a retry with a verified CA file,
        not ``verify=False``.
        """
        try:
            return session.post(url, data=data, timeout=timeout)
        except requests.exceptions.SSLError:
            if self.school.get("tls_verify_fallback") != "system-ca":
                raise
            candidates = [ssl.get_default_verify_paths().cafile,
                          "/etc/ssl/certs/ca-certificates.crt"]
            ca_bundle = next((str(Path(p).resolve()) for p in candidates
                              if p and Path(p).is_file()), "")
            if not ca_bundle:
                raise
            return session.post(url, data=data, timeout=timeout, verify=ca_bundle)

    def fetch_list(self, session, uid: str, page: int = 0, tf: int = 1, timeout: int = 20):
        response = self._verified_post(session, self.base + self.list_path, {
            "field": "time", "order": "DESC", "pageNum": str(page), "maxRows": "30",
            "keyword": "", "uid": uid, "tf": str(tf), "auth_type": "user", "flock": "",
        }, timeout=timeout)
        response.raise_for_status()
        return self.parse_list(response.json(), uid)

    def fetch_detail(self, session, nid: str, uid: str, timeout: int = 20) -> str:
        """Read the supported JSON detail API and reject deleted notices."""
        response = session.get(self.base + self.detail_path, params={
            "nid": nid, "dir": "0", "uid": uid,
        }, timeout=timeout)
        response.raise_for_status()
        try:
            payload = response.json()
        except ValueError:
            payload = response.text
        return self.parse_detail(payload)

    def parse_list(self, payload: object, uid: str) -> IschoolPage:
        if not isinstance(payload, list):
            raise ValueError("ischool list payload is not a list")
        total_pages, items, seen = 0, [], set()
        for row in payload:
            if not isinstance(row, dict):
                continue
            if "totalPages" in row:
                try: total_pages = max(total_pages, int(row["totalPages"]))
                except (TypeError, ValueError): pass
                continue
            nid = str(row.get("newsId") or "").strip()
            title = _clean(row.get("title") or row.get("title_hint"))
            if not re.fullmatch(r"\d+", nid) or not title or nid in seen:
                continue
            seen.add(nid)
            unit = _clean(row.get("unit_name"))
            source_category = _clean(row.get("attr_name") or row.get("content_type"))
            items.append({
                "id": f"pksh-{nid}", "source_id": f"pksh:{nid}", "school": "pksh",
                "school_name": self.school["short"], "title": title,
                "url": self.base + "/ischool/public/news_view/show.php?nid=" + nid,
                "date": _date(row.get("time")), "date_source": "list" if _date(row.get("time")) else "",
                "source_category": source_category or "消息公佈欄", "source_unit": unit,
                "view_count": str(row.get("clicks") or ""), "ischool_uid": uid,
            })
        if not items and total_pages > 0:
            raise ValueError("ischool list metadata has pages but no valid announcements")
        return IschoolPage(items, total_pages)

    def parse_detail(self, payload: object) -> str:
        text = unquote(str(payload.get("content") if isinstance(payload, dict) else payload or ""))
        if MISSING_DETAIL_RE.search(_clean(text)):
            raise ValueError("ischool detail does not exist")
        return text
