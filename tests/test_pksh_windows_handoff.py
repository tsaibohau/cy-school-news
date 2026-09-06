from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from pksh_snapshot import PUBLIC_FIELDS, build_snapshot  # noqa: E402


fixture = (ROOT / "tests" / "fixtures" / "pksh_list.html").read_text(encoding="utf-8")
snapshot = build_snapshot(fixture, "2026-09-05T00:00:00+00:00")
assert snapshot["schema_version"] == 1
assert snapshot["fetched_at"] == "2026-09-05T00:00:00+00:00"
assert [row["id"] for row in snapshot["items"]] == ["pksh-28123", "pksh-28101"]
assert all(set(row) == set(PUBLIC_FIELDS) for row in snapshot["items"])
assert all(row["url"].startswith("https://www.pksh.ylc.edu.tw/") for row in snapshot["items"])
assert all("summary" not in row and "snippet" not in row and "detail_ref" not in row
           for row in snapshot["items"])

api_fixture = (ROOT / "tests" / "fixtures" / "pksh_list_api.json").read_text(encoding="utf-8")
api_snapshot = build_snapshot(api_fixture, "2026-09-06T00:00:00+00:00")
assert [row["id"] for row in api_snapshot["items"]] == ["pksh-28123", "pksh-28101"]
assert api_snapshot["items"][0]["date"] == "2026-08-26"
assert api_snapshot["items"][0]["source_category"] == "教務處"

script = (ROOT / "scraper" / "pksh_windows_fetch.ps1").read_text(encoding="utf-8")
lowered = script.lower()
assert "invoke-webrequest" in lowered
assert "news_query_json.php" in lowered
assert 'method post' in lowered
assert "windows_default_required" in lowered
assert "www.pksh.ylc.edu.tw" in lowered
assert "skipcertificatecheck" not in lowered
assert "--insecure" not in lowered and "curl -k" not in lowered
assert "http://www.pksh.ylc.edu.tw" not in lowered

print("PKSH Windows metadata handoff tests passed")
