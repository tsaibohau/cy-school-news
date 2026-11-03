# -*- coding: utf-8 -*-
"""一次性：看嘉女線上課表系統的結構（是否公開、怎麼分頁）。只印網址與結構，不印課表內容。
每次請求間隔 3 秒，遵守 robots.txt。"""
import re
import sys
import time
from html import unescape
from urllib.parse import urljoin
from urllib import robotparser

import requests

sys.path.insert(0, "scraper")
from scrape import UA  # noqa: E402

BASE = "https://classtable.cygsh.cy.edu.tw/classtable/"
s = requests.Session()
s.headers.update({"User-Agent": UA})
r = s.get("https://classtable.cygsh.cy.edu.tw/robots.txt", timeout=20)
print("robots.txt", r.status_code, r.headers.get("content-type"), repr(r.text[:600]) if r.ok else "")
rp = robotparser.RobotFileParser()
rp.parse(r.text.splitlines() if r.ok and "text/plain" in r.headers.get("content-type", "") else [])
time.sleep(3)


def look(url, depth):
    print("\n=== ", url, "robots:", rp.can_fetch(UA, url))
    if not rp.can_fetch(UA, url):
        return []
    resp = s.get(url, timeout=30)
    resp.encoding = resp.apparent_encoding or "utf-8"
    html = resp.text
    title = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
    print("status", resp.status_code, resp.headers.get("content-type"), "len", len(html), "final", resp.url,
          "title", (title.group(1).strip()[:60] if title else ""))
    print("forms", len(re.findall(r"<form\b", html, re.I)), "password inputs", len(re.findall(r"type=[\"']?password", html, re.I)),
          "selects", len(re.findall(r"<select\b", html, re.I)), "options", len(re.findall(r"<option\b", html, re.I)),
          "tables", len(re.findall(r"<table\b", html, re.I)), "frames", re.findall(r"<i?frame\b[^>]*src=[\"']([^\"']+)", html, re.I)[:6])
    links = [(urljoin(resp.url, unescape(h)), " ".join(re.sub(r"<[^>]+>", " ", t).split())[:30])
             for h, t in re.findall(r"<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", html, re.I | re.S)]
    print("links", len(links))
    pats = {}
    for u, t in links:
        key = re.sub(r"\d+", "N", u)
        pats.setdefault(key, []).append((u, t))
    for k, v in list(pats.items())[:25]:
        print("  pattern", k, "x", len(v), "e.g.", v[0][0][:120], "|", v[0][1])
    opts = re.findall(r"<option[^>]*value=[\"']?([^\"'>]*)[\"']?[^>]*>([^<]{0,20})", html, re.I)
    print("  option samples", opts[:12])
    scripts = re.findall(r"<script[^>]*src=[\"']([^\"']+)", html, re.I)
    print("  scripts", scripts[:8])
    print("  json/xhr hints", sorted(set(re.findall(r"[\"']([\w/.-]+\.(?:json|php|aspx|asp|xml|txt))[\"']", html)))[:20])
    return [u for u, _ in links] + [urljoin(resp.url, f) for f in re.findall(r"<i?frame\b[^>]*src=[\"']([^\"']+)", html, re.I)]


nxt = look(BASE, 0)
time.sleep(3)
seen = {BASE}
for u in nxt:
    if len(seen) >= 4 or u in seen or "classtable.cygsh" not in u:
        continue
    seen.add(u)
    look(u, 1)
    time.sleep(3)
