# -*- coding: utf-8 -*-
"""Entry links to the school's login systems, for 問校務.

The systems themselves (校務行政系統、彈性學習平台、自修室預約…) need a school
account, so nothing inside them is ever fetched. Their entry links are public on
the school site (首頁「網路服務」 and 「網路系統服務」 pages), so 問校務 can say
「成績要登入校務行政系統查」 and give the official link.

The link list is re-read from the school site every ``CHECK_DAYS``; what each
system is for comes from ``KNOWN`` below. Links nobody has described yet are
kept with their name only, and staff or campus-network-only systems are kept but
not suggested to students.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from html import unescape
from urllib.parse import urljoin, urlsplit

TW_TZ = timezone(timedelta(hours=8))
CHECK_DAYS = 30

SOURCES = {
    "cysh": ["https://www.cysh.cy.edu.tw/", "https://www.cysh.cy.edu.tw/p/412-1008-5084.php"],
    # 嘉女 has no single 網路服務 menu: 首頁、網站導覽、教務處「校務行政-教務-學生」.
    "cygsh": ["https://www.cygsh.cy.edu.tw/", "https://www.cygsh.cy.edu.tw/p/17-1013.php",
              "https://www.cygsh.cy.edu.tw/p/412-1013-4239.php"],
}
# Where the 網路服務 menu sits on each page, so other links are not mistaken for systems.
MENU_MARKERS = ("網路服務", "網路系統服務")

# What each system is for. Matched against the link URL (host + path prefix).
KNOWN = [
    {"match": "k12ea.gov.tw/SCH_UI", "name": "校務行政系統", "audience": "student",
     "purpose": "查成績、缺曠與獎懲紀錄、線上請假、個人課表與選課結果",
     "keywords": ["成績", "查成績", "缺曠", "缺曠紀錄", "獎懲紀錄", "線上請假", "請假系統", "請假", "選課結果", "校務系統", "1campus"]},
    {"match": "jhenggao.com/iLearning", "name": "彈性學習平台", "audience": "student",
     "purpose": "彈性學習、自主學習計畫與微課程的選填和紀錄",
     "keywords": ["彈性學習", "自主學習", "微課程", "選填", "彈性學習平台"]},
    {"match": "e-school.k12ea.gov.tw", "name": "自修室預約系統", "audience": "student",
     "purpose": "預約圖書館自修室座位",
     "keywords": ["自修室", "預約自修室", "自修室預約", "座位預約", "晚自習"]},
    {"match": "campus.cysh.cy.edu.tw/exam_range", "name": "考試範圍公告", "audience": "student", "login": None,
     "purpose": "查段考（期中考、期末考）各科考試範圍",
     "keywords": ["考試範圍", "段考範圍", "期中考範圍", "期末考範圍", "範圍"]},
    {"match": "library.cygsh.cy.edu.tw", "name": "圖書館館藏查詢", "audience": "student", "login": None,
     "purpose": "查館藏、自己的借閱紀錄，辦理續借與預約",
     "keywords": ["館藏", "查書", "續借", "預約書", "借閱紀錄", "館藏查詢"]},
    {"match": "hyread.com.tw", "name": "HyRead 電子書", "audience": "student", "login": None,
     "purpose": "借閱學校訂閱的電子書", "keywords": ["電子書", "HyRead"]},
    {"match": "library.cysh.cy.edu.tw/webopac", "name": "圖書館館藏查詢", "audience": "student", "login": None,
     "purpose": "查館藏、自己的借閱紀錄，辦理續借與預約",
     "keywords": ["館藏", "查書", "續借", "預約書", "借閱紀錄", "館藏查詢"]},
    {"match": "school.bot.com.tw", "name": "學雜費繳款查詢", "audience": "student", "login": None,
     "purpose": "查詢與列印學雜費繳費單、確認是否已繳費",
     "keywords": ["學雜費", "繳費單", "繳費", "代收代辦費", "繳款"]},
    {"match": "accounts.google.com", "name": "Google Workspace（學校帳號）", "audience": "student",
     "purpose": "學校 Google 帳號：Classroom、雲端硬碟、學校信箱",
     "keywords": ["Google帳號", "Classroom", "學校信箱", "雲端硬碟"]},
    {"match": "mail.google.com/a/go.edu.tw", "name": "教育部 Gmail 信箱", "audience": "student",
     "purpose": "教育部 go.edu.tw 學校信箱", "keywords": ["學校信箱", "go.edu.tw", "教育部信箱"]},
    {"match": "mail.edu.tw", "name": "教育部校園雲端電子郵件", "audience": "student",
     "purpose": "教育部校園雲端信箱", "keywords": ["學校信箱", "雲端郵件"]},
    {"match": "406-1008-129864", "name": "中學生文章相似度比對系統", "audience": "student", "login": None,
     "purpose": "小論文、報告上傳前的文章相似度比對", "keywords": ["小論文", "相似度", "比對", "抄襲"]},
    {"match": "pk12.cloudhr.tw", "name": "雲端差勤系統", "audience": "staff", "purpose": "教職員差勤", "keywords": ["差勤"]},
    {"match": "cloudop.tw", "name": "雲端電子公文系統", "audience": "staff", "purpose": "公文", "keywords": ["公文"]},
    {"match": "eipnsh.k12ea.gov.tw", "name": "校務基金請購系統", "audience": "staff", "purpose": "請購", "keywords": ["請購"]},
]
INTERNAL = re.compile(r"限校內|^https?://(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)")
STAFF_NAME = re.compile(r"差勤|公文|請購|防毒|教師甄選|行政系統")


def now_iso() -> str:
    return datetime.now(TW_TZ).isoformat(timespec="seconds")


def _menu_block(html: str) -> tuple[str, bool]:
    """The part of the page from the 網路服務 menu onward, and whether such a menu exists."""
    for marker in MENU_MARKERS:
        at = html.find(marker)
        if at != -1:
            return html[at:at + 40000], True
    return html, False


def extract_links(html: str, base_url: str) -> list[dict]:
    out, seen = [], set()
    block, has_menu = _menu_block(html)
    for href, label in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', block, re.S):
        name = re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", label))).strip()
        url = urljoin(base_url, unescape(href).strip())
        if not name or not url.startswith("http") or url in seen:
            continue
        host = urlsplit(url).netloc
        own_site = host.endswith("www.cysh.cy.edu.tw") or host.endswith("www.cygsh.cy.edu.tw")
        # Keep outside systems and the one known own-site tool; skip ordinary menu pages.
        if own_site and not any(k["match"] in url for k in KNOWN):
            continue
        if re.search(r"goo\.gl/maps|accessibility\.moda|facebook|instagram|youtube", url):
            continue
        # Without a 網路服務 menu the page links to everything; keep only known systems.
        if not has_menu and not any(k["match"] in url for k in KNOWN):
            continue
        seen.add(url)
        out.append({"name": name[:40], "url": url})
    return out


def describe(link: dict) -> dict:
    known = next((k for k in KNOWN if k["match"] in link["url"]), None)
    internal = bool(INTERNAL.search(link["name"]) or INTERNAL.search(link["url"]))
    audience = known["audience"] if known else ("staff" if STAFF_NAME.search(link["name"]) else "unknown")
    return {
        "name": known["name"] if known else re.sub(r"\(限校內\)|（限校內）", "", link["name"]).strip(),
        "url": link["url"],
        "purpose": known["purpose"] if known else "",
        "keywords": list(known["keywords"]) if known else [],
        "audience": "internal" if internal else audience,
        # True: needs a school account. None: not confirmed (the system host was not checked).
        "login": known.get("login", True) if known else True,
    }


def build_services(pages: list[tuple[str, str]]) -> list[dict]:
    services, seen = [], set()
    for url, html in pages:
        for link in extract_links(html, url):
            row = describe(link)
            key = row["name"] if row["purpose"] else row["url"]
            if key in seen:
                continue
            seen.add(key)
            services.append(row)
    return services


def public_items(school_id: str, short: str, services: list[dict]) -> list[dict]:
    """問校務 entries for systems students use (staff and campus-only systems are left out)."""
    items = []
    for row in services:
        if row["audience"] != "student":
            continue
        slug = re.sub(r"[^A-Za-z0-9]+", "-", urlsplit(row["url"]).netloc + urlsplit(row["url"]).path).strip("-").lower()[:60]
        items.append({
            "id": f"{school_id}-service-{slug}",
            "kind": "school_service",
            "title": f"網路服務 › {row['name']}",
            "school": school_id,
            "school_name": short,
            "url": row["url"],
            "category": "校園資訊",
            "date": "",
            "purpose": row["purpose"],
            "login_required": row["login"],
            "keywords": row["keywords"],
        })
    return items


def update(index: dict, school_id: str, session, fetch, *, delay: float, now: datetime, force: bool = False) -> str:
    import time

    urls = SOURCES.get(school_id)
    if not urls:
        return "unsupported"
    state = index.setdefault("services", {})
    checked = state.get("checked_at") or ""
    if not force and checked and checked > (now - timedelta(days=CHECK_DAYS)).isoformat(timespec="seconds"):
        return "fresh"
    pages = []
    for url in urls:
        try:
            pages.append((url, fetch(session, url)))
        except Exception:  # keep the previous list for a page that failed
            pass
        time.sleep(delay)
    if not pages:
        return "failed"
    services = build_services(pages)
    if services:
        state.update(checked_at=now.isoformat(timespec="seconds"), systems=services)
    return "updated" if services else "empty"
