#!/usr/bin/env python3
"""Create member-only summaries from transient PKSH detail responses."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from detail_parser import parse_article_detail  # noqa: E402
from extractive_summary import summarize_detail  # noqa: E402


def build_records(payload: str) -> list[dict]:
    source = json.loads(payload)
    if not isinstance(source, list) or len(source) > 200:
        raise ValueError("invalid PKSH detail payload")
    records = []
    for row in source:
        news_id = str((row or {}).get("newsId", "")).strip()
        title = str((row or {}).get("title", "")).strip()
        source_url = str((row or {}).get("source_url", "")).strip()
        encoded = str((row or {}).get("content", ""))
        if not news_id.isdigit() or not title or not source_url.startswith(
                "https://www.pksh.ylc.edu.tw/ischool/public/news_view/show.php?nid="):
            continue
        html = unquote(encoded)
        if not html or len(html) > 2_000_000:
            continue
        detail = parse_article_detail(
            html, announcement_id=f"pksh-{news_id}", school_id="pksh",
            title=title, source_url=source_url,
        )
        summary = summarize_detail(detail, title)
        text = str(summary.get("text") or "")
        records.append({
            "announcement_id": f"pksh-{news_id}",
            "summary": text,
            "snippet": text,
            "detail": None,
            "source_hash": hashlib.sha256(html.encode("utf-8")).hexdigest(),
        })
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    records = build_records(args.input.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"schema_version": 1, "records": records}, ensure_ascii=False), encoding="utf-8")
    print(f"Prepared {len(records)} protected PKSH summaries")


if __name__ == "__main__":
    main()
