"""One-off diagnostic: do 嘉女 list items get dates, old code vs new code?"""
import importlib.util
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraper"))
import requests  # noqa: E402
import scrape as new  # noqa: E402

spec = importlib.util.spec_from_file_location("old_scrape", Path(__file__).with_name("_old_scrape_for_diag.py"))
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)

url = sys.argv[1]
school = next(s for s in new.CONFIG["schools"] if s["id"] == "cygsh")
session = requests.Session()
session.headers.update({"User-Agent": new.UA})
html = new.fetch(session, url, school)
for name, mod in (("old", old), ("new", new)):
    items = mod.extract_rulingdigital_items(html, school, url)
    print(name, "items", len(items), "with date", sum(1 for i in items if i.get("date")))
print("links per article:", html.count("406-1013-186869"))

import re  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

soup = BeautifulSoup(html, "html.parser")
for a in soup.select("a[href*='/p/406-']")[:2]:
    node = a
    for depth in range(7):
        node = node.parent
        if node is None:
            break
        print(f"  depth {depth + 1} <{node.name} class={node.get('class')}>:", re.sub(r"\s+", " ", node.get_text(" ", strip=True))[:160])
print("date-like strings in page:", re.findall(r"20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}", html)[:8])
print("d-txt count:", html.count("d-txt"), "mobilercglist:", html.count("mobilercglist"), "data-th:", html.count("data-th"))
