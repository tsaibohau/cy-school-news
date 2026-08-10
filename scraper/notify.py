# -*- coding: utf-8 -*-
"""把本次新增的公告推播到 ntfy.sh(免費、免帳號)。

環境變數:
  NTFY_TOPIC   主題名稱(在 GitHub repo 的 Settings → Variables 設定)。
               未設定時本腳本直接跳過,不影響流程。

每則新公告會發到兩個主題:
  1. {NTFY_TOPIC}                → 訂閱全部消息
  2. {NTFY_TOPIC}-{分類代號}      → 只訂閱特定分類(exam / club / admission ...)
使用者在 ntfy App(iOS/Android)或 https://ntfy.sh/{主題} 訂閱即可收到推播。
"""
import json
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
NEW_ITEMS = ROOT / "scraper" / "new_items.json"
MAX_PUSH = 20  # 單次最多推播則數,避免第一次建置時灌爆訂閱者


def main() -> int:
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        print("[info] 未設定 NTFY_TOPIC,略過推播")
        return 0
    if not NEW_ITEMS.exists():
        print("[info] 找不到 new_items.json,略過推播")
        return 0

    items = json.loads(NEW_ITEMS.read_text(encoding="utf-8"))
    if not items:
        print("[info] 本次沒有新公告")
        return 0

    slugs = {
        "段考考試": "exam", "升學": "admission", "獎助學金": "scholarship",
        "榮譽榜": "honor", "競賽": "contest", "社團": "club",
        "研習活動": "event", "招生編班": "enroll", "行政公告": "admin", "一般": "general",
    }

    sent = 0
    for it in items[:MAX_PUSH]:
        title = f'[{it.get("school_name", "")}] {it.get("category", "一般")}'
        body = it.get("title", "")
        cat_slug = slugs.get(it.get("category", "一般"), "general")
        for t in (topic, f"{topic}-{cat_slug}"):
            try:
                requests.post(
                    f"https://ntfy.sh/{t}",
                    data=body.encode("utf-8"),
                    headers={
                        "Title": title.encode("utf-8"),
                        "Click": it.get("url", ""),
                        "Tags": "loudspeaker",
                    },
                    timeout=15,
                )
            except Exception as e:
                print(f"[warn] 推播失敗 {t}: {e}", file=sys.stderr)
            time.sleep(0.3)
        sent += 1

    if len(items) > MAX_PUSH:
        print(f"[info] 新公告 {len(items)} 則,僅推播最新 {MAX_PUSH} 則")
    print(f"[info] 已推播 {sent} 則到主題 {topic}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
