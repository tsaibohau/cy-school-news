"""One-off diagnostic: list-page dates, old code vs new code, both schools."""
import importlib.util
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraper"))
import requests  # noqa: E402
import scrape as new  # noqa: E402

spec = importlib.util.spec_from_file_location("old_scrape", Path(__file__).with_name("_old_scrape_for_diag.py"))
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)

session = requests.Session()
session.headers.update({"User-Agent": new.UA})
for school_id, url in (("cygsh", sys.argv[1]), ("cysh", sys.argv[2])):
    school = next(s for s in new.CONFIG["schools"] if s["id"] == school_id)
    html = new.fetch(session, url, school)
    rows = {}
    for name, mod in (("old", old), ("new", new)):
        items = mod.extract_rulingdigital_items(html, school, url)
        rows[name] = {i["id"]: i.get("date", "") for i in items}
        print(school_id, name, "items", len(items), "with date", sum(1 for d in rows[name].values() if d))
    changed = [(k, rows["old"][k], rows["new"].get(k)) for k in rows["old"] if rows["old"][k] and rows["old"][k] != rows["new"].get(k)]
    print(school_id, "dates that changed from a non-empty old value:", changed[:5], len(changed))
    print(school_id, "sample new:", list(rows["new"].items())[:3])
