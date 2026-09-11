import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraper"))
import scrape


def main():
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        tombstones = root / "tombstones.json"
        tombstones.write_text(json.dumps({"deleted_ids": ["cysh:ABC123"]}), encoding="utf-8")
        assert scrape.load_deleted_announcement_ids(str(tombstones)) == {"cysh:ABC123"}
        detail_root = root / "details"
        sidecar = detail_root / "cysh" / (scrape._detail_filename("cysh:ABC123") + ".json")
        sidecar.parent.mkdir(parents=True)
        sidecar.write_text('{"detail":"must be removed"}', encoding="utf-8")
        corpus = {"cysh:ABC123": {"id": "cysh:ABC123", "school": "cysh"}, "keep": {"id": "keep", "school": "cysh"}}
        with patch.object(scrape, "DETAIL_ROOT", detail_root):
            assert scrape.purge_deleted_announcements(corpus, {"cysh:ABC123"}) == 1
        assert "cysh:ABC123" not in corpus and "keep" in corpus
        assert not sidecar.exists(), "deleted detail sidecar must not survive"
    print("Scraper tombstone filtering passed")


if __name__ == "__main__":
    main()
