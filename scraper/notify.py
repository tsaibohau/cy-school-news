# -*- coding: utf-8 -*-
"""把本次新增的公告推播到 ntfy.sh(免費、免帳號)。

環境變數:
  NTFY_TOPIC   主題名稱(在 GitHub repo 的 Settings → Variables 設定)。
               未設定時本腳本直接跳過,不影響流程。

每則新公告會發到以下主題:
  1. {NTFY_TOPIC}                → 訂閱全部消息
  2. {NTFY_TOPIC}-{分類代號}      → 只訂閱特定分類(exam / club / admission ...)
  3. {NTFY_TOPIC}-{topic_suffix} → 個人關鍵字訂閱:scraper/subscriptions.json
                                   內 keywords 命中「標題+摘要」的訂閱組
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
SUBSCRIPTIONS = ROOT / "scraper" / "subscriptions.json"
MAX_PUSH = 20  # 單次最多推播則數,避免第一次建置時灌爆訂閱者
SUMMARY_THRESHOLD = 8  # 單輪新公告超過此數改推一則彙總(個人關鍵字命中仍逐則)

CATEGORY_SLUGS = {
    "段考考試": "exam", "升學": "admission", "獎助學金": "scholarship",
    "榮譽榜": "honor", "競賽": "contest", "社團": "club",
    "研習活動": "event", "招生編班": "enroll", "行政公告": "admin", "一般": "general",
}


def push_topics(item: dict, topic: str, subs=()) -> list:
    """算出一則公告要推到哪些 ntfy 主題:全部 + 分類 + 命中關鍵字的個人訂閱。

    個人訂閱比對「標題 + 摘要 + 自動分類名稱」,不分大小寫;同一組訂閱只會加一次。
    納入分類名稱是為了讓訂「段考」的人能命中整個「段考考試」分類,
    即使公告標題用的是「期末考」「考程」等其他字眼。
    """
    cat_slug = CATEGORY_SLUGS.get(item.get("category", "一般"), "general")
    topics = [topic, f"{topic}-{cat_slug}"]
    haystack = (item.get("title", "") + " " + (item.get("snippet") or "") +
                " " + item.get("category", "")).lower()
    for sub in subs or ():
        suffix = str(sub.get("topic_suffix", "")).strip()
        keywords = [str(k).strip().lower() for k in sub.get("keywords", [])]
        if not suffix or f"{topic}-{suffix}" in topics:
            continue
        if any(k and k in haystack for k in keywords):
            topics.append(f"{topic}-{suffix}")
    return topics


def summarize(items) -> str:
    """彙總文字:「本輪新增 N 則:段考考試 2、獎助學金 5…」,分類依數量排序。"""
    from collections import Counter
    counts = Counter(it.get("category", "一般") for it in items)
    parts = "、".join(f"{cat} {n}" for cat, n in counts.most_common())
    return f"本輪新增 {len(items)} 則:{parts}"


def personal_topics(item: dict, topic: str, subs) -> list:
    """只取個人關鍵字命中的主題(去掉「全部」與「分類」兩個固定主題)。"""
    return push_topics(item, topic, subs)[2:]


def _post(t: str, body: str, title: str, click: str = "") -> None:
    headers = {"Title": title.encode("utf-8"), "Tags": "loudspeaker"}
    if click:
        headers["Click"] = click
    try:
        requests.post(f"https://ntfy.sh/{t}", data=body.encode("utf-8"),
                      headers=headers, timeout=15)
    except Exception as e:
        print(f"[warn] 推播失敗 {t}: {e}", file=sys.stderr)
    time.sleep(0.3)


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

    subs = []
    if SUBSCRIPTIONS.exists():
        try:
            subs = json.loads(SUBSCRIPTIONS.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[warn] subscriptions.json 讀取失敗,略過個人訂閱:{e}", file=sys.stderr)

    if len(items) > SUMMARY_THRESHOLD:
        # 防洪:改推一則彙總到主主題;個人關鍵字命中的(使用者點名要的)仍逐則推
        site_url = os.environ.get("SITE_URL", "").strip()
        _post(topic, summarize(items), "[嘉校快訊] 新公告彙總", site_url)
        personal_sent = 0
        for it in items:
            if personal_sent >= MAX_PUSH:
                break
            hits = personal_topics(it, topic, subs)
            for t in hits:
                _post(t, it.get("title", ""),
                      f'[{it.get("school_name", "")}] {it.get("category", "一般")}',
                      it.get("url", ""))
            personal_sent += bool(hits)
        print(f"[info] 彙總模式:{len(items)} 則合併為 1 則推播,"
              f"個人關鍵字另推 {personal_sent} 則")
        return 0

    sent = 0
    for it in items[:MAX_PUSH]:
        title = f'[{it.get("school_name", "")}] {it.get("category", "一般")}'
        body = it.get("title", "")
        for t in push_topics(it, topic, subs):
            _post(t, body, title, it.get("url", ""))
        sent += 1

    print(f"[info] 已推播 {sent} 則到主題 {topic}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
