"""Read-only official-site coverage census.

Usage:
  python tools/coverage_census.py --output C:/temp/cynews-census.json

The output is deliberately outside scraper/ and docs/data by default.  This
tool never writes production snapshots and never treats an empty live result
as proof of coverage.
"""
import argparse
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))
from scrape import extract_items, page_entries, decode_response  # noqa: E402

DELAY = 1.5
TIMEOUT = 20
PAGE_CEILING = 20
P403 = re.compile(r"/p/403-(\d+)-(\d+)-\d+\.php")


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def stored_ids():
    recent = load_json(ROOT / "docs/data/announcements.json").get("items", [])
    archive = load_json(ROOT / "docs/data/archive.json").get("items", [])
    return set(x["id"] for x in recent), set(x["id"] for x in archive)


def request_page(session, url):
    try:
        response = session.get(url, timeout=TIMEOUT)
        return response, decode_response(response), ""
    except Exception as exc:  # pragma: no cover - network dependent
        return None, "", repr(exc)


def page_structure(html):
    soup = BeautifulSoup(html, "html.parser")
    return {
        "title": soup.title.get_text(" ", strip=True) if soup.title else "",
        "has_links": bool(soup.find_all("a", href=True)),
        "has_article_links": bool(re.search(r"/p/406-\d+-\d+", html)),
    }


def preflight(session, config, stored):
    rows = []
    for school in config["schools"]:
        recent, archive = stored
        candidates = [school["base"]]
        candidates += [u for u, _ in page_entries(school)[:2]]
        known = next((x["url"] for x in recent_items(recent, archive)
                      if x.get("school") == school["id"]), None)
        if known:
            candidates.append(known)
        for url in candidates:
            response, html, error = request_page(session, url)
            row = {"school": school["id"], "url": url, "error": error}
            if response is not None:
                row.update({"status": response.status_code,
                            "size": len(response.content),
                            "structure": page_structure(html)})
            rows.append(row)
            time.sleep(DELAY)
    return rows


def recent_items(recent_ids, archive_ids):
    del archive_ids
    data = load_json(ROOT / "docs/data/announcements.json").get("items", [])
    return [x for x in data if x.get("id") in recent_ids]


def discover_category_urls(session, school):
    urls = {u for u, _ in page_entries(school)}
    homepage = school["base"]
    response, html, _ = request_page(session, homepage)
    time.sleep(DELAY)
    if response is not None and response.ok:
        for href in re.findall(r'href=["\']([^"\']*?/p/403-[^"\']+?\.php)', html):
            urls.add(urljoin(homepage, href).split("?")[0].replace("-2.php", "-1.php"))
    # Navigation/category links are intentionally discovered from live HTML,
    # not copied from historical site_map.json.
    nav = f"{school['base']}/p/17-{school['unit']}.php"
    response, html, _ = request_page(session, nav)
    time.sleep(DELAY)
    if response is not None and response.ok:
        for href in re.findall(r'href=["\']([^"\']*?/p/403-[^"\']+?\.php)', html):
            urls.add(urljoin(school["base"], href).split("?")[0].replace("-2.php", "-1.php"))
    return sorted(urls)


def crawl_lists(session, school, urls):
    live_ids, category_rows = set(), []
    for seed in urls:
        match = P403.search(seed)
        if not match:
            continue
        unit, category = match.groups()
        page_ids = set()
        stop = "safety ceiling"
        for page_no in range(1, PAGE_CEILING + 1):
            url = re.sub(r"-\d+\.php$", f"-{page_no}.php", seed)
            response, html, error = request_page(session, url)
            time.sleep(DELAY)
            if response is None:
                stop = "transport error"
                break
            if response.status_code == 404:
                stop = "404"
                break
            if not response.ok:
                stop = f"HTTP {response.status_code}"
                break
            items = extract_items(html, dict(school, unit=unit), url)
            ids = {x["id"] for x in items}
            if not ids:
                stop = "empty page"
                break
            if ids == page_ids:
                stop = "repeated page"
                break
            live_ids.update(ids)
            page_ids = ids
        category_rows.append({"school": school["id"], "unit": unit,
                              "category": category, "seed": seed,
                              "stop": stop})
    return live_ids, category_rows


def quality_scan():
    rows = []
    for name in ("announcements.json", "archive.json"):
        items = load_json(ROOT / "docs/data" / name).get("items", [])
        rows.extend(items)
    return {
        "rows": len(rows),
        "duplicate_ids": len(rows) - len({x.get("id") for x in rows}),
        "empty_titles": sum(not x.get("title") for x in rows),
        "empty_snippets": sum(not x.get("snippet") for x in rows),
        "replacement_chars": sum("\ufffd" in x.get("title", "") for x in rows),
        "bad_urls": sum(not str(x.get("url", "")).startswith("http") for x in rows),
        "future_dates": sum((x.get("date", "") or "")[:4] > "2026" for x in rows),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    config = load_json(ROOT / "scraper/config.json")
    recent_ids, archive_ids = stored_ids()
    stored = recent_ids | archive_ids
    session = requests.Session()
    session.headers.update({"User-Agent": "cy-school-news coverage audit"})
    result = {
        "status": "INCONCLUSIVE",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "stored": {"recent": len(recent_ids), "archive": len(archive_ids),
                    "union": len(stored), "duplicate_ids": 0},
        "preflight": preflight(session, config, (recent_ids, archive_ids)),
        "schools": {},
        "quality": quality_scan(),
    }
    for school in config["schools"]:
        urls = discover_category_urls(session, school)
        live, categories = crawl_lists(session, school, urls)
        result["schools"][school["id"]] = {
            "live_ids": sorted(live),
            "live_count": len(live),
            "category_urls": categories,
            "configured_categories": sorted({
                P403.search(u).group(2) for u, _ in page_entries(school)
                if P403.search(u)
            }),
        }
    live_all = set().union(*(set(v["live_ids"]) for v in result["schools"].values()))
    result["comparison"] = {
        "A_minus_B": sorted(live_all - stored),
        "B_minus_A": sorted(stored - live_all),
        "intersection": len(live_all & stored),
        "confidence": "partial live census; transport/category scope recorded per row",
    }
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(output)
    print(json.dumps({"stored": result["stored"], "live": {
        k: v["live_count"] for k, v in result["schools"].items()},
        "A_minus_B": len(result["comparison"]["A_minus_B"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
