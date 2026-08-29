"""Deterministic, multi-label search taxonomy shared with the public UI."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAXONOMY = json.loads((ROOT / "search-taxonomy.json").read_text(encoding="utf-8"))
VERSION = int(TAXONOMY["version"])


def compact(value: object) -> str:
    return re.sub(r"[^0-9a-z\u3400-\u9fff]+", "", str(value or "").lower())


def _matched(rules: list[dict], text: str) -> tuple[list[str], dict[str, list[str]]]:
    value = compact(text)
    labels, evidence = [], {}
    for rule in rules:
        found = [term for term in rule["terms"] if compact(term) in value]
        if found:
            labels.append(rule["id"])
            evidence[rule["id"]] = found
    return labels, evidence


def classify_search_tags(title: str, source_category: str = "", category: str = "") -> dict:
    """Classify only stable metadata, never a free-form body/snippet.

    This prevents an unrelated notice that merely mentions a topic in its body
    from being promoted into that topic's search results.
    """
    text = " ".join((title or "", source_category or "", category or ""))
    topics, topic_evidence = _matched(TAXONOMY["topics"], text)
    actions, action_evidence = _matched(TAXONOMY["actions"], text)
    return {"topics": topics, "actions": actions,
            "classification_version": VERSION,
            "classification_evidence": {"fields": ["title", "source_category", "category"],
                                        "topics": topic_evidence, "actions": action_evidence}}


def apply_search_tags(item: dict) -> dict:
    item.update(classify_search_tags(item.get("title", ""), item.get("source_category", ""), item.get("category", "")))
    return item
