# -*- coding: utf-8 -*-
"""一次性：讀嘉女課表系統的前端程式，找取課表的請求格式。間隔 3 秒。"""
import re, sys, time, requests
sys.path.insert(0, "scraper")
from scrape import UA  # noqa: E402
B = "https://classtable.cygsh.cy.edu.tw/classtable/"
s = requests.Session(); s.headers.update({"User-Agent": UA})
r = s.get(B + "JS/top.js", timeout=30); r.encoding = "big5"; js = r.text
i = js.find("function go(")
print(js[i:i + 7000])
print("=====get_xtype")
j = js.find("function get_xtype"); print(js[j:j + 1500])
time.sleep(3)
r = s.get(B + "JS/ajax.js", timeout=30); r.encoding = "big5"; print("=====ajax.js"); print(r.text[:3000])
