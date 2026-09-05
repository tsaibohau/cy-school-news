#!/usr/bin/env python3
"""Convert one Windows-fetched PKSH page into a metadata-only handoff."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from scrape import CONFIG, extract_items  # noqa: E402


PUBLIC_FIELDS = (
    "id", "school", "school_name", "title", "url", "date",
    "date_source", "source_category",
)


def pksh_config() -> dict:
    return next(school for school in CONFIG["schools"] if school["id"] == "pksh")


def build_snapshot(html: str, fetched_at: str = "") -> dict:
    school = pksh_config()
    source_url = school["list_pages"][0]["url"]
    items = extract_items(html, school, source_url)
    if not items or len(items) > 200:
        raise ValueError("PKSH page produced an unexpected announcement count")
    public_items = [{key: item.get(key, "") for key in PUBLIC_FIELDS} for item in items]
    if any(item["school"] != "pksh" or not item["url"].startswith(school["base"] + "/")
           for item in public_items):
        raise ValueError("PKSH page produced an item outside the official school origin")
    return {
        "schema_version": 1,
        "fetched_at": fetched_at or datetime.now(timezone.utc).isoformat(),
        "source_url": source_url,
        "items": public_items,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--html", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--fetched-at", default="")
    args = parser.parse_args()
    snapshot = build_snapshot(args.html.read_text(encoding="utf-8"), args.fetched_at)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(snapshot['items'])} PKSH metadata records")


if __name__ == "__main__":
    main()
