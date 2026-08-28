"""Report the ephemeral full-scraper result used by PKSH live acceptance."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path, default):
    target = ROOT / path
    return json.loads(target.read_text(encoding="utf-8")) if target.exists() else default


current = read("docs/data/announcements.json", {"items": []})["items"]
archive = read("docs/data/archive.json", {"items": []})["items"]
items = current + archive
counts = Counter(row.get("school") for row in items)
ids = [row.get("id") for row in items]
duplicates = len(ids) - len(set(ids))
pksh = [row for row in items if row.get("school") == "pksh"]
detail_failures = sum(row.get("detail_status") in {"temporary_error", "permanent_error"}
                      for row in pksh)
state = read("scraper/fetch_state.json", {})
statuses = state.get("__source_status__", {})
pksh_status = [value for value in statuses.values()
               if isinstance(value, dict) and value.get("school") == "pksh"]
report = {
    "CYSH": counts["cysh"], "CYGSH": counts["cygsh"], "PKSH": counts["pksh"],
    "duplicates": duplicates, "PKSH_detail_failures": detail_failures,
    "PKSH_source_status": pksh_status,
}
(ROOT / "pksh-integration-report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"event": "pksh_integration", **report}, ensure_ascii=False))
if counts["cysh"] <= 0 or counts["cygsh"] <= 0 or duplicates:
    raise SystemExit(1)
if counts["pksh"] <= 0:
    raise SystemExit(2)
