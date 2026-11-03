# -*- coding: utf-8 -*-
"""一次性：看嘉女線上課表系統怎麼取資料（只印程式碼片段與結構）。間隔 3 秒。"""
import re
import sys
import time
import requests
sys.path.insert(0, "scraper")
from scrape import UA  # noqa: E402
B = "https://classtable.cygsh.cy.edu.tw/classtable/"
s = requests.Session(); s.headers.update({"User-Agent": UA})
for f in ("JS/top.js", "JS/ajax.js"):
    r = s.get(B + f, timeout=30); r.encoding = "big5"
    js = r.text
    print("=== ", f, r.status_code, len(js))
    for m in re.finditer(r"(?:\.asp|\.aspx|open\(|location|\.src\s*=|href\s*=)", js, re.I):
        print("  ..", js[max(0, m.start() - 160):m.end() + 160].replace("\n", " ")[:340])
    time.sleep(3)
r = s.get(B + "top.asp", timeout=30); r.encoding = "big5"
html = r.text
print("=== top.asp selects")
for m in re.finditer(r"<select\b[^>]*>", html, re.I):
    print("  ", m.group(0)[:200])
for m in re.finditer(r"<(?:input|button)\b[^>]*>", html, re.I):
    print("  ", m.group(0)[:200])
print("  form:", (re.search(r"<form\b[^>]*>", html, re.I) or [""])[0][:200])
