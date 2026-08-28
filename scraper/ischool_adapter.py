"""HTTP-only adapter for North Gang High School's iSchool announcement board.

This module owns the iSchool JSON protocol. It never weakens TLS verification
and treats invalid responses as availability failures, not an empty board.
"""
from __future__ import annotations

import re
import ssl
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup
import requests

UID_RE = re.compile(r"(?:g_unique_id|uid)\s*[=:]\s*[\"']([^\"']+)")
MISSING_DETAIL_RE = re.compile(r"(?:the\s+)?news\s+is\s+not\s+exist(?:ed)?", re.I)
MAX_TOTAL_PAGES = 500


def discover_uid(html: str, fallback_uid: str = "") -> tuple[str, bool]:
    """Find a board UID and report explicitly when the fallback is used."""
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
    match = re.search(r"(20\d{2})[/-](\d{1,2})[/-](\d{1,2})", str(value or ""))
    if not match:
        return ""
    try:
        return datetime(*map(int, match.groups())).date().isoformat()
    except ValueError:
        return ""


def _clean(value: object) -> str:
    return re.sub(r"\s+", " ", BeautifulSoup(str(value or ""), "html.parser")
                  .get_text(" ", strip=True)).strip()


def _safe_url(value: object, base: str, *, same_origin: bool = False) -> str:
    resolved = urljoin(base, str(value or "").strip())
    target, source = urlsplit(resolved), urlsplit(base)
    if target.scheme != "https" or not target.hostname or target.username or target.password:
        return ""
    try:
        target_port, source_port = target.port or 443, source.port or 443
    except ValueError:
        return ""
    if same_origin and (target.hostname, target_port) != (source.hostname, source_port):
        return ""
    return urlunsplit((target.scheme, target.netloc, target.path, target.query, ""))


def _links(html: str, base: str) -> tuple[list[dict], list[dict]]:
    attachments, external, seen = [], [], set()
    for anchor in BeautifulSoup(html or "", "html.parser").select("a[href]"):
        href = _safe_url(anchor.get("href"), base)
        if not href or href in seen:
            continue
        seen.add(href)
        text = _clean(anchor)
        path = urlsplit(href).path.rsplit("/", 1)[-1]
        filename = unquote(path) or text or "官方附件"
        is_attachment = "/ischool/news/attached/" in urlsplit(href).path or bool(
            re.search(r"\.(?:pdf|docx?|xlsx?|pptx?|ods|zip|rar|jpe?g|png)$", filename, re.I))
        if is_attachment:
            official = _safe_url(href, base, same_origin=True)
            if official:
                attachments.append({"filename": filename[:300], "url": official,
                                    "provenance": "official_attachment"})
        elif not _safe_url(href, base, same_origin=True):
            external.append({"text": text or href, "url": href})
    return attachments, external


@dataclass
class IschoolPage:
    items: list[dict]
    total_pages: int


@dataclass
class IschoolDetail:
    content: str
    content_html: str
    attachments: list[dict]
    external_links: list[dict]


class PkshAdapter:
    """North Gang High School iSchool API adapter; no browser dependency."""
    list_path = "/ischool/widget/site_news/news_query_json.php"
    detail_path = "/ischool/widget/site_news/news_query_json_content.php"
    popup_path = "/ischool/widget/site_news/news_pop_content.php"

    def __init__(self, school: dict):
        self.school = school
        self.base = school["base"].rstrip("/")
        self.fallback_uid = str(school.get("ischool_uid") or "")

    def discover_board(self, html: str) -> tuple[str, bool]:
        return discover_uid(html, self.fallback_uid)

    def _request(self, session, method: str, path: str, *, timeout: int, **kwargs):
        request = getattr(session, method)
        try:
            return request(self.base + path, timeout=timeout, **kwargs)
        except requests.exceptions.SSLError:
            if self.school.get("tls_verify_fallback") != "system-ca":
                raise
            paths = (ssl.get_default_verify_paths().cafile, "/etc/ssl/certs/ca-certificates.crt")
            ca_bundle = next((str(Path(p).resolve()) for p in paths if p and Path(p).is_file()), "")
            if not ca_bundle:
                raise
            return request(self.base + path, timeout=timeout, verify=ca_bundle, **kwargs)

    def fetch_list(self, session, uid: str, *, page: int = 0, tf: int = 1,
                   timeout: int = 20) -> IschoolPage:
        response = self._request(session, "post", self.list_path, timeout=timeout, data={
            "field": "time", "order": "DESC", "pageNum": str(page), "maxRows": "30",
            "keyword": "", "uid": uid, "tf": str(tf), "auth_type": "user", "flock": "",
        })
        response.raise_for_status()
        try:
            payload = response.json()
        except ValueError as exc:
            raise ValueError("ischool list response is not JSON") from exc
        return self.parse_list(payload, uid)

    def fetch_list_with_fallback(self, session, uid: str, *, page: int = 0,
                                 timeout: int = 20) -> tuple[IschoolPage, int]:
        """Try tf=1 first, then tf=2 for an error or a zero-row result."""
        first_error = None
        for tf in (1, 2):
            try:
                result = self.fetch_list(session, uid, page=page, tf=tf, timeout=timeout)
                if result.items or tf == 2:
                    return result, tf
            except Exception as exc:
                first_error = exc
                if tf == 2:
                    raise
        raise first_error or ValueError("ischool list returned no result")

    def parse_list(self, payload: object, uid: str) -> IschoolPage:
        if not isinstance(payload, list):
            raise ValueError("ischool list payload is not a list")
        total_pages, items, seen = 0, [], set()
        for row in payload:
            if not isinstance(row, dict):
                continue
            if "totalPages" in row:
                try:
                    total_pages = max(total_pages, int(row["totalPages"]))
                except (TypeError, ValueError) as exc:
                    raise ValueError("ischool totalPages is invalid") from exc
                continue
            nid = str(row.get("newsId") or "").strip()
            title = _clean(row.get("title") or row.get("title_hint"))
            if not re.fullmatch(r"\d+", nid) or not title or nid in seen:
                continue
            seen.add(nid)
            date = _date(row.get("time"))
            items.append({
                "id": f"pksh-{nid}", "source_id": f"pksh:{nid}", "school": "pksh",
                "school_name": self.school["short"], "title": title,
                "url": self.base + "/ischool/public/news_view/show.php?nid=" + nid,
                "date": date, "date_source": "list" if date else "",
                "source_category": _clean(row.get("attr_name") or row.get("content_type")) or "消息公佈欄",
                "source_unit": _clean(row.get("unit_name")),
                "view_count": str(row.get("clicks") or ""), "ischool_uid": uid,
            })
        if total_pages < 0 or total_pages > MAX_TOTAL_PAGES:
            raise ValueError("ischool totalPages is out of bounds")
        if not items and total_pages > 0:
            raise ValueError("ischool list metadata has pages but no valid announcements")
        return IschoolPage(items, total_pages)

    def fetch_detail(self, session, nid: str, uid: str, *, timeout: int = 20) -> IschoolDetail:
        """Prefer JSON detail; use the official popup endpoint only if unavailable."""
        try:
            response = self._request(session, "get", self.detail_path, timeout=timeout,
                                     params={"nid": nid, "dir": "0", "uid": uid})
            response.raise_for_status()
            try:
                payload = response.json()
            except ValueError:
                return self.parse_detail(response.text)
            return self.parse_detail(payload)
        except (requests.exceptions.RequestException, ValueError) as exc:
            if "does not exist" in str(exc):
                raise
        response = self._request(session, "get", self.popup_path, timeout=timeout, params={
            "newsId": nid, "maxRows_rsResult": "30", "fh": "900", "bid": "0", "uid": uid,
        })
        response.raise_for_status()
        return self.parse_detail(response.text)

    def parse_detail(self, payload: object) -> IschoolDetail:
        if isinstance(payload, dict):
            raw = payload.get("content") or payload.get("content_html") or payload.get("news_content") or ""
            attached = payload.get("attachedfile") or payload.get("attachments") or []
        else:
            raw, attached = payload or "", []
        content_html = unquote(str(raw))
        content = _clean(content_html)
        if not content or MISSING_DETAIL_RE.search(content):
            raise ValueError("ischool detail does not exist")
        attachments, external_links = _links(content_html, self.base)
        for row in attached if isinstance(attached, list) else []:
            if not isinstance(row, dict):
                continue
            url = _safe_url(row.get("url") or row.get("path") or row.get("file_url"),
                            self.base, same_origin=True)
            if url and url not in {item["url"] for item in attachments}:
                attachments.append({"filename": _clean(row.get("name") or row.get("filename")) or
                                    unquote(urlsplit(url).path.rsplit("/", 1)[-1]),
                                    "url": url, "provenance": "official_attachment"})
        return IschoolDetail(content, content_html, attachments, external_links)
