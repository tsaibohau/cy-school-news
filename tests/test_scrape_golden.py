# -*- coding: utf-8 -*-
"""爬蟲主程式黃金比對：重構前後，所有輸出檔與請求順序必須逐位元相同。

執行：python tests/test_scrape_golden.py
更新（只在確定行為應改變時）：python tests/test_scrape_golden.py --update
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scrape_harness import run_harness  # noqa: E402

GOLDEN = Path(__file__).resolve().parent / "fixtures" / "scrape_golden.json"


def main():
    result = run_harness()
    if "--update" in sys.argv:
        GOLDEN.write_text(json.dumps(result, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                          encoding="utf-8")
        print(f"updated {GOLDEN.name}: {len(result['files'])} files, {result['requests_total']} requests")
        return 0
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    problems = []
    for key in ("requests_run1", "requests_total", "request_log_sha256", "recent_items"):
        if result[key] != golden[key]:
            problems.append(f"{key}: {golden[key]} -> {result[key]}")
    for path in sorted(set(golden["files"]) | set(result["files"])):
        if golden["files"].get(path) != result["files"].get(path):
            problems.append(f"file changed: {path}")
    assert not problems, "scrape output drifted:\n" + "\n".join(problems)
    print(f"黃金比對通過：{len(result['files'])} 個輸出檔、{result['requests_total']} 個請求完全一致 ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
