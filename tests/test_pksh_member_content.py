from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from pksh_member_content import build_records  # noqa: E402

payload = (ROOT / "tests" / "fixtures" / "pksh_detail_api.json").read_text(encoding="utf-8")
records = build_records(payload)
assert len(records) == 1
assert records[0]["announcement_id"] == "pksh-28123"
assert "九月二日前" in records[0]["summary"]
assert records[0]["detail"] is None
assert set(records[0]) == {"announcement_id", "summary", "snippet", "detail", "source_hash"}
print("PKSH member-only summary tests passed")
