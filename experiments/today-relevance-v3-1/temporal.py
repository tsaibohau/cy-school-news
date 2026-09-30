"""Calendar arithmetic belongs here; the language model identifies date meaning."""
from __future__ import annotations

from datetime import date


def strict_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed.isoformat() == value else None


def normalize_temporal(evidence: dict, as_of: str) -> dict:
    reference = strict_date(as_of)
    if reference is None:
        raise ValueError("as_of must be a real YYYY-MM-DD date")
    dates = dict(evidence.get("dates") or {})
    result = {"days_until_deadline": None, "days_since_deadline": None,
              "days_until_event": [], "days_since_event": [],
              "days_until_application_start": None, "days_until_application_end": None,
              "days_until_effective_until": None}
    for name, future, past in (("deadline_date", "days_until_deadline", "days_since_deadline"),
                               ("application_start", "days_until_application_start", None),
                               ("application_end", "days_until_application_end", None),
                               ("effective_until", "days_until_effective_until", None)):
        parsed = strict_date(dates.get(name))
        if parsed:
            delta = (parsed-reference).days
            result[future] = delta if delta >= 0 else None
            if past:
                result[past] = -delta if delta < 0 else None
    for event in dates.get("event_dates", []):
        parsed = strict_date(event.get("date")) if isinstance(event, dict) else strict_date(event)
        if parsed:
            delta = (parsed-reference).days
            (result["days_until_event"] if delta >= 0 else result["days_since_event"]).append(abs(delta))
    # Deterministic guard: action dates in the past cannot remain open.
    actions = [dict(row) for row in evidence.get("actions", []) if isinstance(row, dict)]
    dated_actions = [row for row in actions if strict_date(row.get("deadline"))]
    if dated_actions and len(dated_actions) == len(actions) and all(strict_date(row["deadline"]) < reference for row in dated_actions):
        actionability = "action_expired"
    elif any(strict_date(row.get("deadline")) == reference for row in dated_actions):
        actionability = "action_required_now"
    elif any(0 < (strict_date(row["deadline"])-reference).days <= 5 for row in dated_actions):
        actionability = "action_required_now"
    elif dated_actions:
        actionability = "action_required_soon"
    else:
        actionability = evidence.get("actionability_status", "uncertain")
    start = strict_date(dates.get("application_start"))
    end = strict_date(dates.get("application_end"))
    deadline = strict_date(dates.get("deadline_date"))
    events = [strict_date(x.get("date")) for x in dates.get("event_dates", []) if isinstance(x, dict)]
    events = [x for x in events if x]
    temporal_status = evidence.get("temporal_status", "uncertain")
    if start and start > reference and (not end or end >= start):
        temporal_status = "not_started"
    elif deadline and deadline < reference and (not end or end < reference) and not any(x >= reference for x in events):
        temporal_status = "closed"
    elif deadline and reference <= deadline and (deadline-reference).days <= 5:
        temporal_status = "closing_soon"
    elif end and end < reference and not any(x >= reference for x in events):
        temporal_status = "closed"
    elif any(x == reference for x in events):
        temporal_status = "active"
    elif any(x > reference for x in events):
        temporal_status = "not_started"
    return {"dates": dates, "temporal_calculation": result, "actionability_status": actionability,
            "temporal_status": temporal_status}
