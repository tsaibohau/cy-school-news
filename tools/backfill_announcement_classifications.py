#!/usr/bin/env python3
"""Prepare or send idempotent classification v1 batches.

Dry-run is the default and performs no network request.  A write requires both
`--execute` and an exact confirmation string so routine tests cannot mutate a
Supabase project accidentally.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from announcement_classifier import classify_announcement  # noqa: E402
from classification_taxonomy import CLASSIFICATION_VERSION  # noqa: E402

WRITE_CONFIRMATION = "WRITE_CLASSIFICATION_BATCHES"


def load_items(path):
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        payload = payload.get("items")
    if not isinstance(payload, list):
        raise ValueError("input must be a JSON array or an object with items")
    return payload


def prepare_records(items):
    return [
        {
            "announcement_id": classification["announcement_id"],
            "title": classification["title"],
            "classification": classification,
        }
        for classification in (classify_announcement(item) for item in items)
    ]


def batch_records(records, batch_size):
    if not 1 <= batch_size <= 500:
        raise ValueError("batch_size must be between 1 and 500")
    for start in range(0, len(records), batch_size):
        yield start // batch_size, records[start:start + batch_size]


def batch_key(batch):
    raw = json.dumps(batch, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def default_run_id(source_path):
    digest = hashlib.sha256(Path(source_path).read_bytes()).hexdigest()[:20]
    return "classification-v%d-%s" % (CLASSIFICATION_VERSION, digest)


def make_rpc_payload(batch, run_id, batch_number):
    return {
        "records": batch,
        "target_run_id": run_id,
        "target_batch_number": batch_number,
        "target_batch_key": batch_key(batch),
    }


def post_batch(supabase_url, service_role_key, payload, opener=None):
    opener = opener or urllib.request.urlopen
    request = urllib.request.Request(
        supabase_url.rstrip("/") + "/rest/v1/rpc/upsert_announcement_classifications",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "apikey": service_role_key,
            "Authorization": "Bearer " + service_role_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with opener(request, timeout=60) as response:
            return int(json.loads(response.read().decode("utf-8")))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:500]
        raise RuntimeError("classification RPC failed: HTTP %s: %s" % (error.code, detail)) from error


def build_plan(source_path, batch_size=100, run_id=None, resume_from=0):
    records = prepare_records(load_items(source_path))
    run_id = run_id or default_run_id(source_path)
    batches = []
    for number, batch in batch_records(records, batch_size):
        if number < resume_from:
            continue
        batches.append(make_rpc_payload(batch, run_id, number))
    return {
        "classification_version": CLASSIFICATION_VERSION,
        "run_id": run_id,
        "record_count": len(records),
        "batch_count": len(batches),
        "resume_from": resume_from,
        "batches": batches,
    }


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="announcement fixture/export JSON")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--run-id")
    parser.add_argument("--resume-from", type=int, default=0, help="first batch number to send")
    parser.add_argument("--output", help="write the dry-run plan to a local JSON file")
    parser.add_argument("--execute", action="store_true", help="send batches to the configured project")
    parser.add_argument("--confirm-write", default="", help="must equal %s" % WRITE_CONFIRMATION)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    if args.resume_from < 0:
        raise SystemExit("--resume-from must not be negative")
    plan = build_plan(args.input, args.batch_size, args.run_id, args.resume_from)
    summary = {key: value for key, value in plan.items() if key != "batches"}
    if args.output:
        Path(args.output).write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if not args.execute:
        summary["mode"] = "DRY_RUN"
        print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
        return 0
    if args.confirm_write != WRITE_CONFIRMATION:
        raise SystemExit("refusing database write without --confirm-write %s" % WRITE_CONFIRMATION)
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    written = 0
    for payload in plan["batches"]:
        written += post_batch(url, key, payload)
    summary.update({"mode": "EXECUTE", "upserted": written})
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

