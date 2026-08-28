import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraper"))
from public_shards import build_school_shards  # noqa: E402

recent = {"generated_at": "2026-08-26T00:00:00+08:00",
          "schools": [{"id": "cysh", "short": "嘉中"}, {"id": "cygsh", "short": "嘉女"}, {"id": "fjsh", "short": "輔仁"}, {"id": "pksh", "short": "北港高中"}],
          "categories": ["一般"], "category_slugs": {"一般": "general"},
          "items": [{"id": "a", "school": "cysh"}, {"id": "b", "school": "cygsh"}, {"id": "c", "school": "fjsh"}, {"id": "d", "school": "pksh"}]}
archive = {"generated_at": recent["generated_at"], "hot_cutoff": "2025-08-26",
           "items": [{"id": "old", "school": "cysh"}]}
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    manifest = build_school_shards(recent, archive, root)
    assert manifest["schools"][0]["current"] == "data/schools/cysh/current.json"
    cysh = json.loads((root / "cysh/current.json").read_text(encoding="utf-8"))
    cygsh = json.loads((root / "cygsh/current.json").read_text(encoding="utf-8"))
    fjsh = json.loads((root / "fjsh/current.json").read_text(encoding="utf-8"))
    pksh = json.loads((root / "pksh/current.json").read_text(encoding="utf-8"))
    assert [row["id"] for row in cysh["items"]] == ["a"]
    assert [row["id"] for row in cygsh["items"]] == ["b"]
    assert [row["id"] for row in fjsh["items"]] == ["c"]
    assert [row["id"] for row in pksh["items"]] == ["d"]
print("School-scoped public shard tests passed")
