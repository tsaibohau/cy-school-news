"""One-off diagnostic: where does a 嘉女 article page show its publish date?"""
import re
import sys

import requests
from bs4 import BeautifulSoup

URLS = sys.argv[1:]
for url in URLS:
    r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0 cy-school-news diagnostic"})
    r.encoding = "utf-8"
    print("==", url, r.status_code, len(r.text))
    soup = BeautifulSoup(r.text, "html.parser")
    text = soup.get_text(" ", strip=True)
    for m in re.finditer(r"(發[佈布]日期|日期|最後更新|Date|date)[^0-9]{0,12}(\d{2,4}[-/.年]\d{1,2}[-/.月]\d{1,2})", text):
        print("  label:", m.group(0)[:60])
    for m in re.finditer(r"20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|1\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}", r.text):
        start = max(0, m.start() - 160)
        print("  raw:", re.sub(r"\s+", " ", r.text[start:m.end() + 40]))
    for node in soup.find_all(class_=re.compile("date|time|info|meta", re.I))[:8]:
        print("  class:", node.get("class"), node.get_text(" ", strip=True)[:80])
