"""Resolve transient fetches and caches without treating cache as current truth."""
from __future__ import annotations

from typing import Any


def resolve_source(current: dict[str, Any] | None, cached: dict[str, Any] | None = None) -> dict[str, Any]:
    obs = current or {}
    status = str(obs.get("status") or "").lower()
    error = str(obs.get("error_class") or obs.get("fetch_error") or "").lower()
    try:
        code = int(obs["http_status"]) if obs.get("http_status") is not None else None
    except (TypeError, ValueError):
        code = None
    body = str(obs.get("body_text") or "").strip()
    if code in (404, 410) or status in {"confirmed_missing", "tombstoned"}:
        canonical = "missing_confirmed"
    elif (status in {"timeout", "network_error", "tls_error", "temporarily_unreachable", "source_check_failed"}
          or any(token in error for token in ("timeout", "connection", "network", "dns", "tls", "ssl", "http_5"))):
        canonical = "temporarily_unreachable"
    elif code is not None and 500 <= int(code) <= 599:
        canonical = "temporarily_unreachable"
    elif code == 206 or status == "partial":
        canonical = "partial"
    elif code is not None and 200 <= int(code) < 300 and body:
        canonical = "available"
    elif status in {"available", "ok", "success"} and body:
        canonical = "available"
    elif current is None and cached:
        canonical = "unknown"  # Stale cached text never proves a live source.
    elif status in {"fetch_failed", "fetch_error", "error", "failed"} or error:
        canonical = "unknown"
    elif current is not None and (code is not None or status):
        canonical = "partial"
    else:
        canonical = "unknown"
    return {
        "canonical_status": canonical,
        "page_available": canonical in {"available", "partial"},
        "current_http_status": code,
        "current_observation_status": status or None,
        "cache_present": bool(cached),
        "cache_used_as_live_truth": False,
    }
