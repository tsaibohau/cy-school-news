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
from pathlib import Path# -*- coding: utf-8 -*-
"""Fetch the newest public CYSH class timetable into a compact public JSON file.

Only a public, official PDF is used. The previous verified dataset is kept if
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
ANNOUNCEMENTS_PATH = ROOT / "docs" / "data" / "announcements.json"
SCHOOL_ID = "cysh"
SCHOOL_ORIGIN = "https://www.cysh.cy.edu.tw"
INDEX_URL = SCHOOL_ORIGIN + "/p/403-1008-300-1.php"
NEWS_INDEX_URL = SCHOOL_ORIGIN + "/p/403-1008-12-1.php"
INDEX_URLS = (NEWS_INDEX_URL, INDEX_URL)
TW_TZ = timezone(timedelta(hours=8))
TERM = re.compile(r"(?P<year>1\d{2})\s*[-_]\s*(?P<semester>[12])")
TERM_CN = re.compile(r"(?P<year>1\d{2})\s*學年(?:度)?\s*第?\s*(?P<semester>[12一二上下])\s*學期")
REFRESH_MAX_AGE_HOURS = 24


def academic_period(day=None):
    day = day or datetime.now(TW_TZ).date()
    if day.month >= 8:
        return day.year - 1911, 1
    if day.month == 1:
        return day.year - 1912, 1
    if day.month >= 2 and day.month <= 7:
        return day.year - 1912, 2
    return day.year - 1911, 1


def _match_term(text):
    if not text:
        return None
    m = TERM.search(text)
    if m:
        return int(m.group("year")), int(m.group("semester"))
    m = TERM_CN.search(text)
    if m:
        sem_map = {"1": 1, "一": 1, "上": 1, "2": 2, "二": 2, "下": 2}
        sem = sem_map.get(m.group("semester"))
        if sem:
            return int(m.group("year")), sem
    return None


def find_current_timetable_article(html, *, academic_year, semester):
    candidates = []
    for m in re.finditer(r'<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.DOTALL | re.IGNORECASE):
        href, label = m.group(1), unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
        if "課表" not in label or "教師" in label:
            continue
        matched_term = _match_term(label)
        if matched_term and matched_term != (academic_year, semester):
            continue
        
        version = None
        if any(w in label for w in ("正式", "定稿", "更新", "更正")):
            version = "formal"
        elif any(w in label for w in ("試行", "暫行")):
            version = "trial"
        elif "班級課表" in label:
            version = "formal"
            
        if version:
            candidates.append({
                "url": urljoin(SCHOOL_ORIGIN, href),
                "label": label,
                "version": version,
                "published_at": ""
            })
    return candidates


def load_announcements():
    if not ANNOUNCEMENTS_PATH.exists():
        return []
    try:
        with open(ANNOUNCEMENTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("items", []) if isinstance(data, dict) else []
    except Exception:
        return []


def find_announcement_timetable_articles(announcements, *, academic_year, semester):
    candidates = []
    for item in announcements:
        if item.get("school") != SCHOOL_ID:
            continue
        title = item.get("title", "")
        if "課表" not in title or "教師" in title:
            continue
            
        matched_term = _match_term(title)
        pub_date = item.get("published_at") or item.get("date") or ""
        
        if matched_term:
            if matched_term != (academic_year, semester):
                continue
        else:
            if pub_date:
                try:
                    dt = datetime.fromisoformat(pub_date.replace("Z", "+00:00"))
                    if academic_period(dt.date()) != (academic_year, semester):
                        continue
                except Exception:
                    pass
                    
        version = None
        if any(w in title for w in ("正式", "定稿", "更新", "更正")):
            version = "formal"
        elif any(w in title for w in ("試行", "暫行")):
            version = "trial"
        elif "班級課表" in title:
            version = "formal"
            
        if version:
            candidates.append({
                "url": item.get("url") or item.get("link") or "",
                "label": title,
                "version": version,
                "published_at": pub_date
            })
    return candidates


def needs_timetable_refresh(existing, *, academic_year, semester, announcements=None):
    timetables = (existing or {}).get("timetables", {})
    key = f"{SCHOOL_ID}:{academic_year}:{semester}"
    old = timetables.get(key)
    
    if not old or not old.get("classes"):
        return True, "missing_current_term"
    if old.get("version") != "formal":
        return True, "non_formal_version"
        
    fetched_at_str = old.get("fetched_at", "")
    if fetched_at_str:
        try:
            fetched_at = datetime.fromisoformat(fetched_at_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - fetched_at > timedelta(hours=REFRESH_MAX_AGE_HOURS):
                return True, "ttl_expired"
        except Exception:
            return True, "ttl_expired"
    else:
        return True, "ttl_expired"
        
    if announcements is not None:
        cand = find_announcement_timetable_articles(announcements, academic_year=academic_year, semester=semester)
        for c in cand:
            if c.get("published_at") and c.get("published_at") > fetched_at_str:
                return True, "new_announcement_detected"
            if c.get("url") and c.get("url") != old.get("source_url"):
                return True, "new_announcement_detected"
                
    return False, "up_to_date"


def load_existing():
    if not OUTPUT_PATH.exists():
        return {"timetables": {}}
    try:
        with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"timetables": {}}


def discover(*, academic_year=None, semester=None, session=None):
    import requests
    curr_year, curr_sem = academic_period()
    academic_year = academic_year or curr_year
    semester = semester or curr_sem
    
    existing = load_existing()
    announcements = load_announcements()
    
    should_refresh, reason = needs_timetable_refresh(existing, academic_year=academic_year, semester=semester, announcements=announcements)
    print(f"[info] Timetable refresh check: should_refresh={should_refresh}, reason={reason}")
    
    session = session or requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0"})
    
    articles = find_announcement_timetable_articles(announcements, academic_year=academic_year, semester=semester)
    
    for idx_url in INDEX_URLS:
        try:
            resp = session.get(idx_url, timeout=15)
            if resp.status_code == 200:
                found = find_current_timetable_article(resp.text, academic_year=academic_year, semester=semester)
                for f in found:
                    if not any(a["url"] == f["url"] for a in articles):
                        articles.append(f)
        except Exception as e:
            print(f"[warn] Failed to fetch {idx_url}: {e}")
            
    if not articles:
        print("[warn] No timetable articles found.")
        return 0
        
    best_article = sorted(articles, key=lambda x: (x["version"] == "formal", x.get("published_at", "")), reverse=True)[0]
    print(f"[info] Best timetable article: {best_article['label']} ({best_article['url']})")
    
    try:
        resp = session.get(best_article["url"], timeout=15)
        if resp.status_code != 200:
            print(f"[error] Failed to fetch article page: {resp.status_code}")
            return 0
            
        pdf_urls = []
        for m in re.finditer(r'<a\s+[^>]*href="([^"]+\.pdf)"[^>]*>', resp.text, re.IGNORECASE):
            pdf_urls.append(urljoin(best_article["url"], m.group(1)))
            
        if not pdf_urls:
            print("[warn] No PDF found in article page.")
            return 0
            
        pdf_url = pdf_urls[0]
        pdf_resp = session.get(pdf_url, timeout=30)
        if pdf_resp.status_code != 200:
            print(f"[error] Failed to fetch PDF: {pdf_resp.status_code}")
            return 0
            
        pages = extract_pdf_pages(pdf_resp.content)
        classes = parse_timetable_pages(pages)
        
        if not classes:
            print("[error] Failed to parse timetable classes from PDF.")
            return 0
            
        key = f"{SCHOOL_ID}:{academic_year}:{semester}"
        existing["timetables"][key] = {
            "school": SCHOOL_ID,
            "academic_year": academic_year,
            "semester": semester,
            "version": best_article["version"],
            "source_url": best_article["url"],
            "pdf_url": pdf_url,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "classes": classes
        }
        
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
            
        print(f"[info] Successfully updated timetable for {key}")
        return 1
    except Exception as e:
        print(f"[error] Error during timetable discovery: {e}")
        return 0


if __name__ == "__main__":
    discover()
from urllib.parse import urljoin, urlparse

from timetable_adapter import extract_pdf_pages, parse_timetable_pages


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "docs" / "data" / "class-timetables.json"
SCHOOL_ID = "cysh"
SCHOOL_ORIGIN = "https://www.cysh.cy.edu.tw"
INDEX_URL = SCHOOL_ORIGIN + "/p/403-1008-300-1.php"
NEWS_INDEX_URL = SCHOOL_ORIGIN + "/p/403-1008-12-1.php"
INDEX_URLS = (NEWS_INDEX_URL, INDEX_URL)
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


def find_current_timetable_article(html, *, academic_year, semester, base_url=INDEX_URL):
    """Select current term's class timetable, preferring formal over trial."""
    candidates = []
    for href, label in links(html):
        match = TERM.search(label)
        if not match or "課表" not in label or "教師" in label:
            continue
        if int(match["year"]) != int(academic_year) or int(match["semester"]) != int(semester):
            continue
        version = "formal" if "正式" in label else ("trial" if "試行" in label else "")
        if not version:
            continue
        url = official_url(href, base_url)
        if url:
            candidates.append({"url": url, "label": label, "version": version})
    if not candidates:
        return None
    return sorted(
        candidates,
        key=lambda row: (row["version"] != "formal", "班級" not in row["label"], row["label"]),
    )[0]


def is_direct_pdf_url(value):
    """Return True only for a same-site URL whose path is a PDF."""
    url = official_url(value)
    return bool(url and urlparse(url).path.lower().endswith(".pdf"))


def find_pdf_attachment(html, *, detail_url):
    candidates = []
    for href, label in links(html):
        if "課表" not in label or "教師" in label or (".pdf" not in label.lower() and "downloadfile" not in href.lower()):
            continue
        url = official_url(href, detail_url)
        if url:
            candidates.append({"url": url, "label": label})
    if not candidates:
        return None
    return sorted(candidates, key=lambda row: ("班級" not in row["label"], row["label"]))[0]


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

        articles = []
        for index_url in INDEX_URLS:
            try:
                index = session.get(index_url, timeout=20)
                index.raise_for_status()
            except Exception as exc:
                print(f"[warn] 課表索引暫時無法讀取：{index_url} ({exc})", file=sys.stderr)
                continue
            article = find_current_timetable_article(
                index.text,
                academic_year=academic_year,
                semester=semester,
                base_url=index_url,
            )
            if article:
                articles.append(article)

        if not articles:
            print("[info] 尚未找到本學期官方班級課表；保留前一份資料")
            return 0

        article = sorted(
            articles,
            key=lambda row: (row["version"] != "formal", "班級" not in row["label"], row["label"]),
        )[0]

        if is_direct_pdf_url(article["url"]):
            attachment = {"url": article["url"], "label": article["label"]}
        else:
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
