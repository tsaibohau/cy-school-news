# -*- coding: utf-8 -*-
"""行事曆工具:events.json → docs/calendar.ics(build),與當日 ntfy 提醒(notify)。

用法:
  python scraper/schoolcal.py build    # 產生 docs/calendar.ics(排程每輪執行)
  python scraper/schoolcal.py notify   # 當天有事件就推播到 {NTFY_TOPIC}-calendar

scraper/events.json 由維護者手動整理(來源:兩校官網的行事曆 PDF),
每學期初更新一次即可。格式:
  [{"date": "2026-08-31", "school": "嘉中", "title": "開學日"}]

(檔名刻意不用 calendar.py:那會遮蔽 Python 標準函式庫的 calendar 模組。)
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVENTS_PATH = ROOT / "scraper" / "events.json"
ICS_PATH = ROOT / "docs" / "calendar.ics"
JSON_PATH = ROOT / "docs" / "data" / "calendar-events.json"
TW_TZ = timezone(timedelta(hours=8))


def load_events() -> list:
    events = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))
    return sorted((e for e in events if e.get("date") and e.get("title")),
                  key=lambda e: e["date"])


def build_public_events(events) -> list:
    """Expose curated school-calendar records, separate from announcement dates."""
    return [{
        "id": f"school:{e.get('school', '')}:{e['date']}:{e['title']}",
        "date": e["date"],
        "endDate": e.get("end_date", e["date"]),
        "school": e.get("school", ""),
        "title": e["title"],
        "kind": "official",
        "provenance": "scraper/events.json:curated-school-calendar",
        "sourceLabel": "學校行事曆",
    } for e in events]


def events_on(events, day_str: str) -> list:
    return [e for e in events if e["date"] == day_str]


def _escape(text: str) -> str:
    """RFC 5545 文字欄位跳脫。"""
    return (text.replace("\\", "\\\\").replace(";", "\\;")
                .replace(",", "\\,").replace("\n", "\\n"))


def _fold(line: str) -> str:
    """RFC 5545 行摺疊:每行至多約 75 octets,續行以空白開頭;不切斷 UTF-8 字元。"""
    out, cur, cur_len = [], "", 0
    for ch in line:
        w = len(ch.encode("utf-8"))
        if cur_len + w > 74:
            out.append(cur)
            cur, cur_len = " " + ch, 1 + w
        else:
            cur += ch
            cur_len += w
    out.append(cur)
    return "\r\n".join(out)


def build_ics(events) -> str:
    """把事件清單轉成 iCalendar 全天事件(含前一天 09:00 的提醒)。"""
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0",
        "PRODID:-//cy-school-news//school calendar//ZH-TW",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:嘉校快訊行事曆",
        "X-WR-TIMEZONE:Asia/Taipei",
    ]
    for e in events:
        day = datetime.strptime(e["date"], "%Y-%m-%d").date()
        nxt = day + timedelta(days=1)
        school = e.get("school", "")
        summary = f'[{school}] {e["title"]}' if school else e["title"]
        digest = hashlib.md5(f'{e["date"]}|{summary}'.encode("utf-8")).hexdigest()[:12]
        lines += [
            "BEGIN:VEVENT",
            f'UID:{day:%Y%m%d}-{digest}@cy-school-news',
            # DTSTAMP 固定取事件日期,讓輸出可重現,排程重跑不會產生無意義的檔案變更
            f"DTSTAMP:{day:%Y%m%d}T000000Z",
            f"DTSTART;VALUE=DATE:{day:%Y%m%d}",
            f"DTEND;VALUE=DATE:{nxt:%Y%m%d}",
            f"SUMMARY:{_escape(summary)}",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_escape(summary)}",
            # 全天事件自當日 00:00 起算,-PT15H = 前一天 09:00 提醒
            "TRIGGER:-PT15H",
            "END:VALARM",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(ln) for ln in lines) + "\r\n"


def build() -> int:
    events = load_events()
    ICS_PATH.write_text(build_ics(events), encoding="utf-8", newline="")
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(build_public_events(events), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[info] {len(events)} 個事件 → {ICS_PATH}")
    return 0


def notify() -> int:
    import requests
    today = datetime.now(TW_TZ).strftime("%Y-%m-%d")
    todays = events_on(load_events(), today)
    if not todays:
        print(f"[info] {today} 沒有行事曆事件")
        return 0
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        print("[info] 未設定 NTFY_TOPIC,略過推播")
        return 0
    for e in todays:
        title = f'[{e.get("school", "嘉校")}] 今日行事曆'
        try:
            requests.post(
                f"https://ntfy.sh/{topic}-calendar",
                data=e["title"].encode("utf-8"),
                headers={"Title": title.encode("utf-8"), "Tags": "calendar"},
                timeout=15,
            )
            print(f"[info] 已推播:{e.get('school', '')} {e['title']}")
        except Exception as ex:
            print(f"[warn] 推播失敗:{ex}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "build":
        sys.exit(build())
    if cmd == "notify":
        sys.exit(notify())
    print("用法:python scraper/schoolcal.py [build|notify]", file=sys.stderr)
    sys.exit(2)
