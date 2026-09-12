"""Build the compact search index from a classification record."""

from classification_taxonomy import CLASSIFICATION_VERSION, INDEX_DIMENSIONS


def _append(entries, seen, dimension, token, announcement_id, version):
    token = str(token or "").strip()
    if dimension not in INDEX_DIMENSIONS or not token or len(token) > 180:
        return
    key = (dimension, token, announcement_id)
    if key in seen:
        return
    seen.add(key)
    entries.append({
        "dimension": dimension,
        "token": token,
        "announcement_id": announcement_id,
        "classification_version": version,
    })


def build_classification_index(record):
    """Return database-compatible index rows without copying title or body."""
    announcement_id = str(record.get("announcement_id") or "").strip()
    if not announcement_id:
        raise ValueError("announcement_id is required")
    version = int(record.get("classification_version") or CLASSIFICATION_VERSION)
    entries, seen = [], set()
    for dimension, field in (
        ("school", "school"),
        ("main_category", "main_category"),
        ("sub_category", "sub_category"),
        ("academic_year", "academic_year"),
        ("semester", "semester"),
    ):
        if record.get(field) is not None:
            _append(entries, seen, dimension, record.get(field), announcement_id, version)
    for dimension, field in (
        ("topic", "topics"),
        ("audience", "audience"),
        ("event_type", "event_types"),
        ("action", "actions"),
        ("available_field", "available_fields"),
    ):
        for token in record.get(field) or []:
            _append(entries, seen, dimension, token, announcement_id, version)
    dates = record.get("dates") or {}
    for mention in dates.get("mentions") or []:
        if isinstance(mention, dict) and mention.get("value"):
            _append(entries, seen, "date", "%s:%s" % (mention.get("role") or "mention", mention["value"]), announcement_id, version)
    return entries

