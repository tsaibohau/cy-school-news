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
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parent.parent
NEW_ITEMS = ROOT / "scraper" / "new_items.json"
SUBSCRIPTIONS = ROOT / "scraper" / "subscriptions.json"
MAX_PUSH = 20  # 單次最多推播則數,避免第一次建置時灌爆訂閱者
SUMMARY_THRESHOLD = 8  # 單輪新公告超過此數改推一則彙總(個人關鍵字命中仍逐則)
SUMMARY_ITEM_LIMIT = 4
TITLE_LIMIT = 120
BODY_LIMIT = 260

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


def _compact(value: object, limit: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text if len(text) <= limit else text[:max(0, limit - 1)].rstrip() + "…"


def _readable_title(value: object) -> str:
    title = _compact(value, TITLE_LIMIT)
    generic = {"國立嘉義高中", "國立嘉義女子高級中學"}
    if title in generic or len(title) < 4:
        return ""
    return title if any(ch.isalnum() or "\u3400" <= ch <= "\u9fff" for ch in title) else ""


def _clean_snippet(value: object) -> str:
    text = _compact(value, BODY_LIMIT)
    return re.sub(
        r"^作者\s*[：:]\s*.*?\s+發[佈布]日期\s*[：:]\s*\d{4}-\d{2}-\d{2}"
        r"(?:\s+最後更新日期\s*[：:]\s*\d{4}-\d{2}-\d{2})?\s*",
        "", text,
    )


def normalize_topic(value: object) -> str:
    """Accept a private ntfy topic or its ntfy.sh URL without logging it."""
    raw = str(value or "").strip()
    if raw.startswith("https://"):
        parsed = urlparse(raw)
        if parsed.scheme != "https" or parsed.netloc != "ntfy.sh" or parsed.query or parsed.fragment:
            return ""
        raw = parsed.path.strip("/")
    return raw if re.fullmatch(r"[A-Za-z0-9_-]{1,128}", raw) else ""


def notification_payload(item: dict) -> tuple[str, str]:
    """Return a readable ntfy title/body; never use a publication date as content."""
    snippet = _clean_snippet(item.get("summary") or item.get("snippet"))
    title = _readable_title(item.get("title")) or _compact(snippet, TITLE_LIMIT) or "新公告"
    school = _compact(item.get("school_name"), 20)
    category = _compact(item.get("category", "一般"), 20)
    header = title + (f"｜{school}・{category}" if school else f"｜{category}")
    body = snippet or "尚未取得內文摘要，點擊查看官方公告。"
    return header, body


def summarize(items) -> str:
    """Flood-safe digest that still names recent announcements and their snippets."""
    from collections import Counter
    counts = Counter(it.get("category", "一般") for it in items)
    parts = "、".join(f"{cat} {n}" for cat, n in counts.most_common())
    base = f"本輪新增 {len(items)} 則:{parts}"
    visible = []
    for item in items[:SUMMARY_ITEM_LIMIT]:
        snippet = _clean_snippet(item.get("summary") or item.get("snippet"))
        title = _readable_title(item.get("title")) or _compact(snippet, 80)
        if not title:
            continue
        snippet = _compact(snippet, 110)
        visible.append("・" + title + ("\n  " + snippet if snippet else ""))
    return base + ("\n\n最新公告:\n" + "\n".join(visible) if visible else "")


def personal_topics(item: dict, topic: str, subs) -> list:
    """只取個人關鍵字命中的主題(去掉「全部」與「分類」兩個固定主題)。"""
    return push_topics(item, topic, subs)[2:]


def _post(t: str, body: str, title: str, click: str = "") -> None:
    headers = {"Title": title.encode("utf-8"), "Tags": "loudspeaker"}
    if click:
        headers["Click"] = click
    try:
        response = requests.post(f"https://ntfy.sh/{t}", data=body.encode("utf-8"),
                                 headers=headers, timeout=15)
        response.raise_for_status()
    except Exception as e:
        # Request exceptions often embed their URL; topic names are secrets.
        print(f"[warn] ntfy 推播失敗 ({type(e).__name__})", file=sys.stderr)
    time.sleep(0.3)


def main() -> int:
    topic = normalize_topic(os.environ.get("NTFY_TOPIC") or os.environ.get("NTFY_URL"))
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
                title, body = notification_payload(it)
                _post(t, body, title, it.get("url", ""))
            personal_sent += bool(hits)
        print(f"[info] 彙總模式:{len(items)} 則合併為 1 則推播,"
              f"個人關鍵字另推 {personal_sent} 則")
        return 0

    sent = 0
    for it in items[:MAX_PUSH]:
        title, body = notification_payload(it)
        for t in push_topics(it, topic, subs):
            _post(t, body, title, it.get("url", ""))
        sent += 1

    print(f"[info] 已推播 {sent} 則公告")
    return 0


if __name__ == "__main__":
    sys.exit(main())
