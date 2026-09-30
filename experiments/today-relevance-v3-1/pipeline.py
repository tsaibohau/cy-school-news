"""Provider-neutral, server-side two-stage inference orchestration.

No Supabase, browser, API credential or network client lives in this module.
Production code must inject a structured-output model provider on its server.
"""
from __future__ import annotations

import json
from typing import Any, Protocol

from content_quality import assess_content
from source_resolver import resolve_source
from temporal import normalize_temporal, strict_date
from attachment_reader import read_attachment


class StructuredModelProvider(Protocol):
    def extract_evidence(self, payload: dict[str, Any]) -> dict[str, Any]: ...
    def reason_relevance(self, payload: dict[str, Any]) -> dict[str, Any]: ...


LABELS = {"must_show", "useful", "optional", "should_hide"}
AUDIENCE = {"grade_1", "grade_2", "grade_3", "teacher", "all_students", "uncertain"}
ACTIONABILITY = {"action_required_now", "action_required_soon", "action_available_later", "information_only", "action_completed", "action_expired", "uncertain"}
TEMPORAL = {"not_started", "active", "closing_soon", "closed", "expired", "uncertain"}
REFERENCE = {"none", "limited", "useful_reference", "long_term_reference", "uncertain"}
FACT_KEYS = {"announcement_id", "source_status", "content_quality", "dates", "affected_audience", "teacher_related", "actions", "actionability_status", "temporal_status", "long_lived_information", "historical_reference", "post_expiry_reference_value", "evidence", "confidence"}
LABEL_KEYS = {"announcement_id", "today_label", "reasoning_factors", "reason_codes", "confidence"}
REASON_CODES = {"deadline_near", "deadline_passed", "event_upcoming", "event_passed", "action_required", "action_expired", "not_started", "closed", "source_missing", "source_uncertain", "content_insufficient", "audience_specific", "teacher_only", "rules_still_relevant", "historical_reference", "no_current_action", "emergency", "exam_soon", "latest_unread"}


def _body_text(source: dict) -> str:
    text = source.get("body_text")
    if isinstance(text, str):
        return text
    blocks = source.get("body_blocks") or []
    output = []
    for block in blocks:
        if isinstance(block, dict):
            output.append(str(block.get("text") or ""))
            output.extend(str(x) for x in block.get("items", []) if isinstance(x, str))
            for row in block.get("rows", []):
                output.append(" | ".join(str(x) for x in row))
    return "\n".join(x for x in output if x)


def _extract_attachments(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    prepared, statuses = [], []
    for row in rows:
        name = str(row.get("source_name") or row.get("filename") or "official attachment")
        ext = (Path(name).suffix or str(row.get("extension") or "")).lower().lstrip(".")
        data = row.get("bytes")
        parsed = None
        if isinstance(data, bytes):
            parsed = read_attachment(name, data, enable_ocr=bool(row.get("enable_ocr")))
        elif isinstance(row.get("extracted_text"), str) and row.get("parse_status") == "parsed":
            # Output of the repository's protected attachment parser.
            parsed = {"text": row["extracted_text"], "parse_status": "parsed",
                      "parser_version": row.get("parser_version"), "content_sha256": row.get("content_sha256")}
        if parsed and parsed.get("parse_status") == "parsed" and parsed.get("text"):
            prepared.append({"source_type": "attachment", "source_name": name,
                             "text": str(parsed["text"]), "parser_version": parsed.get("parser_version"),
                             "content_sha256": parsed.get("content_sha256")})
            statuses.append({"source_name": name, "parse_status": "parsed"})
        else:
            statuses.append({"source_name": name, "parse_status": (parsed or {}).get("parse_status", row.get("parse_status", "not_parsed")),
                             "reason": (parsed or {}).get("reason", row.get("reason"))})
    return prepared, statuses


def make_stage1_payload(item: dict, *, current_observation: dict | None,
                        cached_observation: dict | None = None,
                        attachments: list[dict] | None = None,
                        as_of: str) -> dict:
    if strict_date(as_of) is None:
        raise ValueError("explicit valid evaluation date required")
    # Explicit allowlist: human answers, old predictions, labels, and notes cannot enter inference.
    public_item = {key: item.get(key) for key in (
        "announcement_id", "school", "title", "category", "source_category",
        "published_date", "first_seen_date", "official_url")}
    if not public_item.get("announcement_id") or not public_item.get("title"):
        raise ValueError("announcement_id and title are required")
    source = resolve_source(current_observation, cached_observation)
    raw_body = _body_text(current_observation or {})
    quality = assess_content(raw_body, public_item["title"], fetch_succeeded=source["page_available"])
    prepared_attachments, attachment_statuses = _extract_attachments(attachments or [])
    source["attachments_checked"] = all(x["parse_status"] != "not_parsed" for x in attachment_statuses)
    source["unparsed_attachment_count"] = sum(x["parse_status"] != "parsed" for x in attachment_statuses)
    system_source_status = dict(source)
    model_source_status = {"canonical_status": source["canonical_status"],
                           "page_available": source["page_available"],
                           "attachments_checked": source["attachments_checked"],
                           "unparsed_attachment_count": source["unparsed_attachment_count"]}
    sources = [{"source_id": "title", "source_type": "title", "source_name": "announcement title", "text": public_item["title"]}]
    for field in ("school", "category", "source_category", "published_date", "first_seen_date", "official_url"):
        if public_item.get(field) is not None:
            sources.append({"source_id": "metadata:" + field, "source_type": "metadata", "source_name": field, "text": str(public_item[field])})
    if quality["usable_content"]:
        sources.append({"source_id": "body", "source_type": "body", "source_name": "official announcement body", "text": quality["text"]})
    for index, attachment in enumerate(prepared_attachments):
        attachment["source_id"] = "attachment:" + str(index)
        sources.append(attachment)
    payload = {"announcement": public_item, "evaluation_date": as_of,
               "resolved_source_status": model_source_status, "source_audit": system_source_status,
               "resolved_content_quality": quality["content_quality"],
               "attachments": attachment_statuses, "evidence_sources": sources,
               "task": "Extract facts only. Never output chain-of-thought. Cite every material claim using exact source text."}
    return payload


def _confidence_map(value: Any, required: set[str], label: str) -> None:
    if not isinstance(value, dict) or not required.issubset(value):
        raise ValueError(label + " must include each primitive confidence")
    if any(not isinstance(v, (int, float)) or isinstance(v, bool) or not 0 <= v <= 1 for v in value.values()):
        raise ValueError(label + " confidences must be between 0 and 1")


def validate_stage1(result: dict, payload: dict) -> dict:
    if not isinstance(result, dict) or set(result) != FACT_KEYS:
        raise ValueError("Stage 1 must match the evidence contract exactly; free-form reasoning is rejected")
    ann = payload["announcement"]
    if result["announcement_id"] != ann["announcement_id"]:
        raise ValueError("announcement_id mismatch")
    if result["actionability_status"] not in ACTIONABILITY or result["temporal_status"] not in TEMPORAL or result["post_expiry_reference_value"] not in REFERENCE:
        raise ValueError("invalid temporal/actionability/reference enum")
    if result["teacher_related"] not in (True, False, "uncertain"):
        raise ValueError("invalid teacher_related")
    if result["historical_reference"] not in (True, False, "uncertain"):
        raise ValueError("invalid historical_reference")
    if result["long_lived_information"] not in (True, False, None):
        raise ValueError("invalid long_lived_information")
    if not isinstance(result["affected_audience"], list) or not set(result["affected_audience"]).issubset(AUDIENCE):
        raise ValueError("invalid affected_audience")
    sources = {row["source_id"]: row for row in payload["evidence_sources"]}
    for fact in result["evidence"]:
        if not isinstance(fact, dict) or set(fact) != {"field", "value", "source_id", "source_type", "source_name", "evidence_text", "confidence"}:
            raise ValueError("every evidence item needs a closed source citation")
        source = sources.get(fact["source_id"])
        if (not source or source["source_type"] != fact["source_type"] or
            source["source_name"] != fact["source_name"] or not fact["evidence_text"] or
            fact["evidence_text"] not in source["text"]):
            raise ValueError("evidence snippet does not exactly match a supplied source")
        if not 0 <= fact["confidence"] <= 1:
            raise ValueError("evidence confidence must be in [0,1]")
    _confidence_map(result["confidence"], {"source_status", "content_quality", "dates", "audience", "actions", "temporal_status", "historical_reference"}, "Stage 1")
    normalized = dict(result)
    # These are system-observed facts and cannot be overridden by the model.
    normalized["source_status"] = payload["resolved_source_status"]
    normalized["content_quality"] = payload["resolved_content_quality"]
    dates = normalized.get("dates")
    date_fields = {"published_date", "deadline_date", "event_dates", "application_start", "application_end", "effective_until", "exam_date", "registration_start", "registration_end", "date_spans"}
    if not isinstance(dates, dict) or set(dates) != date_fields:
        raise ValueError("Stage 1 dates must contain every normalized date field")
    for field in date_fields - {"event_dates", "date_spans"}:
        value = dates[field]
        if value is not None and strict_date(value) is None:
            raise ValueError("invalid ISO date: " + field)
    if not isinstance(dates["event_dates"], list) or not isinstance(dates["date_spans"], list):
        raise ValueError("event_dates and date_spans must be arrays")
    cited = {(x["field"], json.dumps(x["value"], ensure_ascii=False, sort_keys=True)) for x in normalized["evidence"]}
    for field in date_fields - {"event_dates", "date_spans"}:
        if dates[field] is not None and ("dates." + field, json.dumps(dates[field], ensure_ascii=False, sort_keys=True)) not in cited:
            raise ValueError("non-null date lacks exact cited evidence: " + field)
    if normalized["affected_audience"] and not any(x["field"] == "affected_audience" for x in normalized["evidence"]):
        raise ValueError("affected audience requires cited evidence")
    if normalized["actions"] and not any(x["field"] == "actions" for x in normalized["evidence"]):
        raise ValueError("actions require cited evidence")
    citation_fields = {x["field"] for x in normalized["evidence"]}
    for fact_name, value in (("teacher_related", normalized["teacher_related"]),
                             ("long_lived_information", normalized["long_lived_information"]),
                             ("historical_reference", normalized["historical_reference"]),
                             ("temporal_status", normalized["temporal_status"]),
                             ("post_expiry_reference_value", normalized["post_expiry_reference_value"])):
        if value not in (None, "uncertain") and fact_name not in citation_fields:
            raise ValueError(fact_name + " requires cited evidence")
    for event in dates["event_dates"]:
        if not isinstance(event, dict) or strict_date(event.get("date")) is None:
            raise ValueError("event date must contain a valid ISO day; preserve month precision in date_spans")
        if ("dates.event_dates", json.dumps(event, ensure_ascii=False, sort_keys=True)) not in cited:
            raise ValueError("event date lacks exact cited evidence")
    for span in dates["date_spans"]:
        if not isinstance(span, dict) or not isinstance(span.get("raw_text"), str) or span.get("precision") not in {"day", "month", "year", "uncertain"}:
            raise ValueError("invalid date span")
        if span.get("start_date") and strict_date(span["start_date"]) is None or span.get("end_date") and strict_date(span["end_date"]) is None:
            raise ValueError("date span boundaries must be real ISO dates")
        if not any(x["field"] == "dates.date_spans" and span["raw_text"] in x["evidence_text"] for x in normalized["evidence"]):
            raise ValueError("date span lacks matching excerpt")
    return normalized


def validate_stage2(result: dict, announcement_id: str) -> dict:
    if not isinstance(result, dict) or set(result) != LABEL_KEYS:
        raise ValueError("Stage 2 must contain only structured output; chain-of-thought is rejected")
    if result["announcement_id"] != announcement_id or result["today_label"] not in LABELS:
        raise ValueError("invalid announcement id or Today label")
    factors = result["reasoning_factors"]
    factor_enums = {
        "actionability": {"high", "medium", "low", "none", "uncertain"},
        "urgency": {"immediate", "near_term", "later", "none", "uncertain"},
        "audience_relevance": {"direct", "broad", "niche", "none", "uncertain"},
        "temporal_relevance": {"current", "upcoming", "historical", "none", "uncertain"},
        "source_reliability": {"high", "medium", "low", "uncertain"},
        "reference_value": {"none", "limited", "useful", "long_term", "uncertain"}}
    if set(factors) != set(factor_enums) or any(v not in factor_enums[k] for k,v in factors.items()):
        raise ValueError("invalid structured reasoning factors")
    if not isinstance(result["reason_codes"], list) or not set(result["reason_codes"]).issubset(REASON_CODES):
        raise ValueError("invalid reason codes")
    _confidence_map(result["confidence"], {"label", *factor_enums}, "Stage 2")
    return result


def run_inference(item: dict, provider: StructuredModelProvider, *,
                  current_observation: dict | None, cached_observation: dict | None = None,
                  attachments: list[dict] | None = None, as_of: str,
                  user_context: dict | None = None, unread_state: bool | None = None) -> dict:
    payload = make_stage1_payload(item, current_observation=current_observation,
                                  cached_observation=cached_observation, attachments=attachments, as_of=as_of)
    facts = validate_stage1(provider.extract_evidence(payload), payload)
    temporal = normalize_temporal(facts, as_of)
    temporal_facts = dict(facts)
    temporal_facts["actionability_status"] = temporal["actionability_status"]
    temporal_facts["temporal_status"] = temporal["temporal_status"]
    stage2_input = {"announcement_id": item["announcement_id"], "as_of": as_of,
                    "evidence": temporal_facts, "temporal_calculation": temporal["temporal_calculation"],
                    "user_context": {k:v for k,v in (user_context or {}).items() if k in {"role", "grade", "school"}},
                    "unread_state": unread_state if isinstance(unread_state, bool) else None,
                    "task": "Choose one Today label from cited evidence; return concise reason codes, never chain-of-thought."}
    label = validate_stage2(provider.reason_relevance(stage2_input), item["announcement_id"])
    normalized_facts = dict(facts)
    normalized_facts["actionability_status"] = temporal["actionability_status"]
    normalized_facts["temporal_status"] = temporal["temporal_status"]
    return {"announcement_id": item["announcement_id"], "as_of": as_of,
            "evidence": normalized_facts, "temporal": temporal, "relevance": label,
            "source_audit": payload["source_audit"],
            "evidence_citations_validated": True,
            "inference_version": "v3.1-evidence-first-contract"}
