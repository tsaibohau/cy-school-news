"""Build school-scoped public snapshots while preserving combined compatibility files."""
from __future__ import annotations

import json
from pathlib import Path

SCHEMA_VERSION = 1


def _write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    temporary.replace(path)


def build_school_shards(recent_doc: dict, archive_doc: dict, output_dir: Path) -> dict:
    schools = recent_doc.get("schools") or []
    recent = recent_doc.get("items") or []
    archive = archive_doc.get("items") or []
    known = {str(row.get("id")) for row in schools}
    if not known or any(str(item.get("school") or item.get("school_id")) not in known
                        for item in recent + archive):
        raise ValueError("school shard source contains an unknown school")
    manifest_schools = []
    written_ids = set()
    for school in schools:
        school_id = str(school["id"])
        current_items = [item for item in recent
                         if str(item.get("school") or item.get("school_id")) == school_id]
        archive_items = [item for item in archive
                         if str(item.get("school") or item.get("school_id")) == school_id]
        for item in current_items + archive_items:
            item_id = str(item.get("id"))
            if not item_id or item_id in written_ids:
                raise ValueError("school shard would duplicate or lose an announcement id")
            written_ids.add(item_id)
        current_path = output_dir / school_id / "current.json"
        archive_path = output_dir / school_id / "archive.json"
        _write(current_path, {"schema_version": SCHEMA_VERSION,
                              "generated_at": recent_doc.get("generated_at"),
                              "school": school, "items": current_items})
        _write(archive_path, {"schema_version": SCHEMA_VERSION,
                              "generated_at": archive_doc.get("generated_at"),
                              "hot_cutoff": archive_doc.get("hot_cutoff"),
                              "school": school, "items": archive_items})
        manifest_schools.append({**school,
                                 "current": f"data/schools/{school_id}/current.json",
                                 "archive": f"data/schools/{school_id}/archive.json",
                                 "current_count": len(current_items),
                                 "archive_count": len(archive_items)})
    expected_ids = {str(item.get("id")) for item in recent + archive}
    if written_ids != expected_ids:
        raise ValueError("school shard partition is incomplete")
    manifest = {"schema_version": SCHEMA_VERSION,
                "generated_at": recent_doc.get("generated_at"),
                "categories": recent_doc.get("categories") or [],
                "category_slugs": recent_doc.get("category_slugs") or {},
                "schools": manifest_schools}
    _write(output_dir / "manifest.json", manifest)
    return manifest
