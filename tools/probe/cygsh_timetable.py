# -*- coding: utf-8 -*-
"""一次性：看嘉女官網公開的課表放在哪裡。只列連結、檔案類型與大小，不存內文。
每次請求間隔 3 秒，遵守 robots.txt。"""
import re
import sys
import time
from html import unescape
from urllib.parse import urljoin, urlparse
from urllib import robotparser

import requests

sys.path.insert(0, "scraper")
from scrape import UA  # noqa: E402

ORIGIN = "https://www.cygsh.cy.edu.tw"
PAGES = [ORIGIN + "/p/406-1013-186482,r508.php",   # 115-1 正式課表公告
         ORIGIN + "/p/406-1013-186383,r508.php",   # 115-1 試行課表
         ORIGIN + "/p/412-1013-1779.php",           # 教務處 › 教學組 › 線上課表
         ORIGIN + "/p/412-1013-1765.php"]           # 功能快捷選單 › 線上課表
WANT = re.compile(r"課表|課程表|timetable|schedule|\.pdf|\.xlsx?|\.ods|\.html?$|drive\.google|docs\.google|kebiao|class", re.I)
s = requests.Session()
s.headers.update({"User-Agent": UA})

rp = robotparser.RobotFileParser()
r = s.get(ORIGIN + "/robots.txt", timeout=20)
print("robots.txt", r.status_code)
print(r.text[:1500] if r.ok else "")
rp.parse(r.text.splitlines() if r.ok else [])
time.sleep(3)


def anchors(html, base):
    out = []
    for tag, attr in (("a", "href"), ("iframe", "src"), ("embed", "src"), ("object", "data")):
        for m in re.finditer(r"<%s\b[^>]*\b%s=[\"']([^\"']+)[\"'][^>]*>(.*?)(?:</%s>|$)" % (tag, attr, tag), html, re.I | re.S):
            label = " ".join(unescape(re.sub(r"<[^>]+>", " ", m.group(2)[:300])).split())[:60]
            out.append((tag, urljoin(base, unescape(m.group(1))), label))
    return out


followed = set()
for page in PAGES:
    print("\n=== PAGE", page, "allowed" if rp.can_fetch(UA, page) else "DISALLOWED")
    if not rp.can_fetch(UA, page):
        continue
    resp = s.get(page, timeout=30)
    print("status", resp.status_code)
    resp.encoding = resp.apparent_encoding or "utf-8"
    main = resp.text
    m = re.search(r'<div[^>]+class="[^"]*(?:mpgdetail|module-detail|art-text|mptattach)[^"]*"[\s\S]*', main)
    region = m.group(0)[:60000] if m else main
    every = anchors(main, page)
    skip = re.compile(r"/p/40[34]-|/p/412-|javascript:|#|mailto:|facebook|instagram|youtube|line\.me|/app/index\.php|Lang=|/p/1[0-9]{2}-1013|/var/file/13/1013/msys|rss", re.I)
    print("  all links:", len(every))
    for tag, url, label in every:
        if not skip.search(url):
            print("  .", tag, "|", label, "|", url[:150])
    rows = [a for a in every if WANT.search(a[1] + " " + a[2]) and not skip.search(a[1])]
    for tag, url, label in rows[:40]:
        print(" ", tag, "|", label, "|", url)
        host = urlparse(url).hostname or ""
        if url in followed or len(followed) >= 8:
            continue
        followed.add(url)
        time.sleep(3)
        try:
            if host.endswith("cygsh.cy.edu.tw") and not rp.can_fetch(UA, url):
                print("     robots disallows"); continue
            h = s.get(url, timeout=30, stream=True, allow_redirects=True)
            ctype = h.headers.get("content-type", ""); size = h.headers.get("content-length", "?")
            first = h.raw.read(400, decode_content=True) if "html" in ctype else b""
            h.close()
            title = re.search(rb"<title>(.*?)</title>", first or b"", re.I | re.S)
            print("     ->", h.status_code, ctype, size, "final:", h.url[:120],
                  "title:", (title.group(1).decode("utf-8", "ignore").strip()[:60] if title else ""))
        except Exception as e:  # noqa: BLE001
            print("     -> error", type(e).__name__)
    time.sleep(3)
