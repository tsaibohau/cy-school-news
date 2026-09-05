# -*- coding: utf-8 -*-
"""Fetch the newest public CYSH class timetable into a compact public JSON file.

Only a public, official PDF is used.  The previous verified dataset is kept if
the current source cannot be fetched or parsed.
"""
import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from html import unescape
from pathlib import Path
from urllib.parse import urljoin, urlparse

from timetable_adapter import extract_pdf_pages, parse_timetable_pages


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "docs" / "data" / "class-timetables.json"
SCHOOL_ID = "cysh"
SCHOOL_ORIGIN = "https://www.cysh.cy.edu.tw"
INDEX_URL = SCHOOL_ORIGIN + "/p/403-1008-300-1.php"
TW_TZ = timezone(timedelta(hours=8))
TERM = re.compile(r"(?P<year>1\d{2})\s*[-－]\s*(?P<semester>[12])")


def academic_period(day=None):
    day = day or datetime.now(TW_TZ).date()
    if day.month >= 8:
        return day.year - 1911, 1
    if day.month == 1:
        return day.year - 1912, 1
    return day.year - 1912, 2


def official_url(value, base_url=INDEX_URL):
    url = urljoin(base_url, str(value or ""))
    parsed = urlparse(url)
    allowed = urlparse(SCHOOL_ORIGIN)
    return url if parsed.scheme == "https" and parsed.hostname == allowed.hostname else ""


def _text(value):
    return " ".join(unescape(str(value or "")).split())


def links(html):
    """Extract simple anchors from the official CMS page without a browser."""
    for href, label in re.findall(r"<a\b[^>]*\bhref=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", str(html or ""), re.I | re.S):
        yield href, _text(re.sub(r"<[^>]+>", " ", label))


def find_current_timetable_article(html, *, academic_year, semester):
    """Select current term's formal PDF announcement before a trial version."""
    candidates = []
    for href, label in links(html):
        match = TERM.search(label)
        if not match or "課表" not in label:
            continue
        if int(match["year"]) != int(academic_year) or int(match["semester"]) != int(semester):
            continue
        version = "formal" if "正式" in label else ("trial" if "試行" in label else "")
        if not version:
            continue
        url = official_url(href, INDEX_URL)
        if url:
            candidates.append({"url": url, "label": label, "version": version})
    if not candidates:
        return None
    return sorted(candidates, key=lambda row: (row["version"] != "formal", row["label"]))[0]


def find_pdf_attachment(html, *, detail_url):
    for href, label in links(html):
        if "課表" not in label or (".pdf" not in label.lower() and "downloadfile" not in href.lower()):
            continue
        url = official_url(href, detail_url)
        if url:
            return {"url": url, "label": label}
    return None


def read_existing():
    try:
        data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) and isinstance(data.get("timetables"), list) else {"schema_version": 1, "timetables": []}
    except (OSError, ValueError, TypeError):
        return {"schema_version": 1, "timetables": []}


def discover(*, academic_year=None, semester=None, session=None):
    """Update only after an official PDF produces complete class tables."""
    current_year, current_semester = academic_period()
    academic_year = int(academic_year or current_year)
    semester = int(semester or current_semester)
    existing = read_existing()
    try:
        if session is None:
            import requests
            session = requests
        index = session.get(INDEX_URL, timeout=20)
        index.raise_for_status()
        article = find_current_timetable_article(index.text, academic_year=academic_year, semester=semester)
        if not article:
            print("[info] 尚未找到本學期官方班級課表；保留前一份資料")
            return 0
        detail = session.get(article["url"], timeout=20)
        detail.raise_for_status()
        attachment = find_pdf_attachment(detail.text, detail_url=article["url"])
        if not attachment:
            print("[warn] 課表公告沒有可驗證的官方 PDF；保留前一份資料")
            return 0
        document = session.get(attachment["url"], timeout=30)
        document.raise_for_status()
        revision = hashlib.sha256(document.content).hexdigest()
        classes = parse_timetable_pages(extract_pdf_pages(document.content))
        old = next((row for row in existing["timetables"] if row.get("school_id") == SCHOOL_ID and
                    row.get("academic_year") == academic_year and row.get("semester") == semester), None)
        if old and old.get("source_revision") == revision and old.get("classes") == classes:
            print("[info] 班級課表來源未變更")
            return 0
        row = {
            "school_id": SCHOOL_ID, "academic_year": academic_year, "semester": semester,
            "version": article["version"], "source_url": article["url"],
            "source_document": attachment["label"], "source_revision": revision,
            "fetched_at": datetime.now(TW_TZ).isoformat(timespec="seconds"),
            "classes": classes,
        }
        others = [item for item in existing["timetables"] if not (
            item.get("school_id") == SCHOOL_ID and item.get("academic_year") == academic_year and item.get("semester") == semester
        )]
        output = {"schema_version": 1, "timetables": others + [row]}
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[info] {len(classes)} 個班級課表 → {OUTPUT_PATH}")
    except Exception as exc:
        print(f"[warn] 課表來源暫時無法驗證：{exc}；保留前一份資料", file=sys.stderr)
    return 0


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "discover"
    if command == "discover":
        sys.exit(discover())
    print("用法：python scraper/timetable.py discover", file=sys.stderr)
    sys.exit(2)
