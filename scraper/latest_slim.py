"""Write the small first-load snapshots of the public announcement data.

The full docs/data/announcements.json is ~8 MB (~1 MB gzip); a phone on 4G needs
several seconds to download and parse it before the first list can be drawn.
This step writes, from the already published (projected) files:

  docs/data/announcements-latest.json          newest items of every school
  docs/data/schools/<id>/latest.json           newest items of one school

Both keep the exact shape of their full counterparts (same item objects, same
top-level keys) plus ``"partial": true`` and ``"total_items"``, so the site can
draw the first page from them and load the full file afterwards.  They are
machine generated and never hand edited; the site falls back to the full file
when one of them does not exist yet.

Run after tools/public-metadata-projection.js so the slim files carry the same
metadata-only items as the full ones.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "docs" / "data"

# The site renders 200 cards per page; keep headroom for items its own filters
# (unverified dates, staff-only category, retired schools) hide from that page.
SLIM_ITEMS = 320
SCHEMA_VERSION = 1


def _published(item: dict) -> str:
    value = str(item.get("date") or item.get("first_seen") or "")[:10]
    return value if len(value) == 10 and value[4] == "-" and value[7] == "-" else ""


def _shown_by_default(item: dict) -> bool:
    """Items the default list would hide anyway are not worth the first-load bytes."""
    if item.get("date_status") == "unverified" or item.get("date_source") == "legacy_unverified":
        return False
    if item.get("link_status") == "gone":
        return False
    if item.get("category") == "教職員":
        return False
    return True


def newest_items(items: list, limit: int = SLIM_ITEMS) -> list:
    """Newest first, same order as the site's 「最新在前」 sort (date, then id)."""
    rows = [item for item in items if isinstance(item, dict) and _shown_by_default(item)]
    rows.sort(key=lambda item: str(item.get("id") or ""))
    rows.sort(key=_published, reverse=True)
    return rows[:limit]


def _write_compact(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(path)


def slim_document(document: dict, limit: int = SLIM_ITEMS) -> dict:
    items = document.get("items") or []
    slim = {key: value for key, value in document.items() if key != "items"}
    slim["partial"] = True
    slim["total_items"] = len(items)
    slim["items"] = newest_items(items, limit)
    return slim


def build(data_dir: Path = DATA_DIR, limit: int = SLIM_ITEMS) -> list:
    written = []
    full = data_dir / "announcements.json"
    if full.exists():
        document = json.loads(full.read_text(encoding="utf-8"))
        target = data_dir / "announcements-latest.json"
        _write_compact(target, slim_document(document, limit))
        written.append(target)
    schools_dir = data_dir / "schools"
    if schools_dir.is_dir():
        for current in sorted(schools_dir.glob("*/current.json")):
            document = json.loads(current.read_text(encoding="utf-8"))
            target = current.with_name("latest.json")
            _write_compact(target, slim_document(document, limit))
            written.append(target)
    return written


def main(argv: list) -> int:
    data_dir = Path(argv[1]) if len(argv) > 1 else DATA_DIR
    written = build(data_dir)
    print(f"latest_slim: wrote {len(written)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
