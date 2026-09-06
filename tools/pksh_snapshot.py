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


def _api_items(payload: str, school: dict) -> list[dict]:
    records = json.loads(payload)
    if not isinstance(records, list):
        raise ValueError("PKSH API payload must be a list")
    items = []
    seen = set()
    for record in records:
        if not isinstance(record, dict) or not record.get("newsId") or not record.get("title"):
            continue
        news_id = str(record["newsId"]).strip()
        if not news_id.isdigit() or news_id in seen:
            continue
        seen.add(news_id)
        raw_date = str(record.get("time", "")).strip().replace("/", "-")
        items.append({
            "id": f"pksh-{news_id}",
            "school": "pksh",
            "school_name": school["short"],
            "title": str(record["title"]).strip(),
            "url": f"{school['base']}/ischool/public/news_view/show.php?nid={news_id}",
            "date": raw_date[:10],
            "date_source": "list",
            "source_category": str(record.get("unit_name") or record.get("attr_name") or "").strip(),
        })
    return items


def build_snapshot(payload: str, fetched_at: str = "") -> dict:
    school = pksh_config()
    source_url = school["list_pages"][0]["url"]
    stripped = payload.lstrip()
    items = _api_items(payload, school) if stripped.startswith("[") else extract_items(payload, school, source_url)
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
