"""Track official announcement pages that no longer exist (HTTP 404/410).

A page is marked gone only after two 404/410 answers at least 20 hours apart,
so a short outage or a page being edited does not hide an announcement. A later
successful fetch clears the mark. Nothing is deleted: the app hides gone items.
"""
from __future__ import annotations

from datetime import datetime

GONE_HTTP_STATUS = {404, 410}
CONFIRMATIONS = 2
MIN_HOURS_BETWEEN = 20


def http_status(error) -> int | None:
    response = getattr(error, "response", None)
    status = getattr(response, "status_code", None)
    return status if isinstance(status, int) else None


def _hours_between(earlier: str, later: str) -> float | None:
    try:
        a = datetime.fromisoformat(str(earlier).replace("Z", "+00:00"))
        b = datetime.fromisoformat(str(later).replace("Z", "+00:00"))
    except ValueError:
        return None
    return (b - a).total_seconds() / 3600


def record_missing(item: dict, now_iso: str) -> bool:
    """Count one 404/410 answer; return True once the page is confirmed gone."""
    last = item.get("link_missing_at")
    hours = _hours_between(last, now_iso) if last else None
    if not last or hours is None or hours >= MIN_HOURS_BETWEEN:
        item["link_missing_checks"] = int(item.get("link_missing_checks") or 0) + 1
        item["link_missing_at"] = now_iso
    if int(item.get("link_missing_checks") or 0) >= CONFIRMATIONS:
        item["link_status"] = "gone"
    return is_gone(item)


def record_alive(item: dict) -> None:
    for key in ("link_status", "link_missing_checks", "link_missing_at"):
        item.pop(key, None)


def is_gone(item: dict) -> bool:
    return item.get("link_status") == "gone"
