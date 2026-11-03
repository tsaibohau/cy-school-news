# -*- coding: utf-8 -*-
"""一次性：存兩班樣本課表頁給解析用（存成 workflow artifact）。間隔 3 秒。"""
import os, re, sys, time, requests
sys.path.insert(0, "scraper")
from scrape import UA  # noqa: E402
B = "https://classtable.cygsh.cy.edu.tw/classtable/"
s = requests.Session(); s.headers.update({"User-Agent": UA})
os.makedirs("probe-out", exist_ok=True)
r = s.get(B + "top.asp", timeout=30)
open("probe-out/top.html", "wb").write(r.content)
html = r.content.decode("big5", "ignore")
for sel in re.finditer(r"<select\b[^>]*id=[\"']?(\w+)[\s\S]*?</select>", html, re.I):
    opts = re.findall(r"<option[^>]*value=[\"']?([^\"'> ]*)", sel.group(0), re.I)
    print("select", sel.group(1), len(opts), opts[:6] if sel.group(1) not in ("s2", "s6") else "(teachers)")
for cls in ("101", "301"):
    time.sleep(3)
    url = B + "down.asp?sqlstr=%s&type=class&selArrange=ST&selWindow=Left&yt=115,1" % cls
    r = s.get(url, timeout=30)
    print(cls, r.status_code, r.headers.get("content-type"), len(r.content))
    open("probe-out/class-%s.html" % cls, "wb").write(r.content)
