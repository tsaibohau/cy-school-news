"""Dead official pages are hidden only after two 404/410 answers on different days."""
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))
from link_health import is_gone, record_alive, record_missing  # noqa: E402
from scrape import record_detail_fetch_failure  # noqa: E402


def http_error(status):
    response = requests.Response()
    response.status_code = status
    return requests.exceptions.HTTPError(response=response)


item = {"id": "cysh-1"}
assert record_missing(item, "2026-10-26T01:00:00+00:00") is False
assert record_missing(item, "2026-10-26T05:00:00+00:00") is False, "same-day retries do not confirm"
assert item["link_missing_checks"] == 1
assert record_missing(item, "2026-10-27T02:00:00+00:00") is True
assert is_gone(item)
record_alive(item)
assert not is_gone(item) and "link_missing_checks" not in item, "a later successful fetch restores the item"

# Scraper failure path: only 404/410 count; timeouts and 500s never hide anything.
dead = {"id": "cysh-2"}
record_detail_fetch_failure(dead, error=http_error(404), now_iso="2026-10-25T01:00:00+00:00")
record_detail_fetch_failure(dead, error=http_error(410), now_iso="2026-10-26T01:00:00+00:00")
assert is_gone(dead)
flaky = {"id": "cysh-3"}
for day in ("25", "26", "27"):
    record_detail_fetch_failure(flaky, error=http_error(500), now_iso=f"2026-10-{day}T01:00:00+00:00")
record_detail_fetch_failure(flaky, error=requests.exceptions.Timeout(), now_iso="2026-10-28T01:00:00+00:00")
assert not is_gone(flaky)
print("Link health tests passed")
