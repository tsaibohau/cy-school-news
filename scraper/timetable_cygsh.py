# -*- coding: utf-8 -*-
"""嘉女公開班級課表：學校「課表查詢系統」（classtable.cygsh.cy.edu.tw，不需登入）。

只存班級、星期、節次、時間與科目，不存教師與教室。每週最多更新一次，每班一個請求、
間隔至少 1.5 秒；任何一班讀不到或解析不完整就保留前一份資料。
"""
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "docs" / "data" / "class-timetables.json"
SCHOOL_ID = "cygsh"
BASE = "https://classtable.cygsh.cy.edu.tw/classtable/"
TW_TZ = timezone(timedelta(hours=8))
REFRESH_DAYS = 7
MIN_CLASSES = 30
CN_NUM = "一二三四五六七八九十"


def _text(fragment):
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", str(fragment or ""))).replace(" ", " ").split())


def decode(content):
    """The system serves Big5 and says so in a <meta> tag."""
    if not isinstance(content, bytes):
        return str(content or "")
    m = re.search(rb"charset=[\"']?([\w-]+)", content[:3000], re.I)
    enc = m.group(1).decode("ascii").lower() if m else "big5"
    return content.decode("cp950" if enc in ("big5", "big-5") else enc, "ignore")


def select_options(html, select_id):
    m = re.search(r"<select\b[^>]*id=[\"']?%s\b[^>]*>([\s\S]*?)</select>" % re.escape(select_id), html, re.I)
    if not m:
        return []
    return [(v, _text(t)) for v, t in re.findall(r"<option[^>]*value=[\"']?([^\"'> ]*)[\"']?[^>]*>([\s\S]*?)</option>", m.group(1), re.I)]


def term_options(html):
    """['115,1', ...] for regular terms (',4' is the summer session)."""
    return [v for v, _ in select_options(html, "ddlTerm") if re.fullmatch(r"1\d{2},[12]", v)]


def class_options(html):
    return [v for v, _ in select_options(html, "s1") if re.fullmatch(r"\d{3}", v)]


def _period(label):
    t = label.replace(" ", "")
    m = re.search(r"第([一二三四五六七八九十\d]+)節", t)
    if not m:
        return 0
    v = m.group(1)
    return int(v) if v.isdigit() else CN_NUM.index(v) + 1 if v in CN_NUM else 0


def parse_class_table(html):
    """One class page → slots [{weekday, period, start, end, subject}] (teachers and rooms dropped)."""
    html = decode(html)
    body = re.sub(r"<(script|style)[\s\S]*?</\1>", "", html, flags=re.I)
    # Split on <tr>: the lunch row is not closed, so </tr> cannot be trusted.
    rows = re.split(r"<tr\b[^>]*>", body, flags=re.I)[1:]
    weekdays, slots = None, []
    for row in rows:
        cells = re.findall(r"<t[dh]\b[^>]*>([\s\S]*?)(?=</t[dh]>|<t[dh]\b|</tr>|$)", row.split("</table>")[0], re.I)
        texts = [_text(c) for c in cells]
        if weekdays is None:
            if sum(1 for t in texts if t in ("一", "二", "三", "四", "五", "六", "日")) >= 5:
                weekdays = ["星期" + t if t in "一二三四五六日" and len(t) == 1 else "" for t in texts]
            continue
        if len(cells) == len(weekdays) + 2:
            cells, texts = cells[:-1], texts[:-1]  # the first row of 上午／下午 carries that label
        if len(cells) != len(weekdays) + 1:
            continue
        period = _period(texts[-1])
        if not period:
            continue  # 早自習、午休
        times = re.findall(r"(\d{1,2}):(\d{2})", texts[-2])
        start, end = ("%02d%s" % (int(times[0][0]), times[0][1]), "%02d%s" % (int(times[1][0]), times[1][1])) if len(times) >= 2 else ("", "")
        for index, cell in enumerate(cells[:len(weekdays)]):
            day = weekdays[index]
            if not day:
                continue
            subjects = [_text(s) for s in re.findall(r"<a\b[^>]*class=[\"']?course[^>]*>([\s\S]*?)</a>", cell, re.I)]
            subjects = [s for s in subjects if s]
            if subjects:
                slots.append({"weekday": day, "period": period, "start": start, "end": end, "subject": "／".join(dict.fromkeys(subjects))})
    order = {"星期一": 1, "星期二": 2, "星期三": 3, "星期四": 4, "星期五": 5, "星期六": 6, "星期日": 7}
    slots.sort(key=lambda s: (s["period"], order.get(s["weekday"], 9)))
    return slots


def read_existing():
    try:
        data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) and isinstance(data.get("timetables"), list) else {"schema_version": 1, "timetables": []}
    except Exception:
        return {"schema_version": 1, "timetables": []}


def due(existing, now):
    rows = [r for r in existing["timetables"] if r.get("school_id") == SCHOOL_ID]
    if not rows:
        return True
    last = max(str(r.get("fetched_at") or "") for r in rows)
    try:
        return now - datetime.fromisoformat(last) >= timedelta(days=REFRESH_DAYS)
    except ValueError:
        return True


def discover(*, session=None, delay=1.5, force=False):
    existing = read_existing()
    now = datetime.now(TW_TZ)
    if not force and not due(existing, now):
        print("[info] 嘉女課表一週內已更新，略過")
        return 0
    try:
        if session is None:
            import requests
            from scrape import UA
            session = requests.Session()
            session.headers.update({"User-Agent": UA})
        top = session.get(BASE + "top.asp", timeout=30)
        top.raise_for_status()
        html = decode(top.content)
        terms = term_options(html)
        classes = class_options(html)
        if not terms or len(classes) < MIN_CLASSES:
            print("[warn] 嘉女課表系統的學期或班級清單不完整；保留前一份資料")
            return 0
        term = sorted(terms, key=lambda v: (int(v.split(",")[0]), int(v.split(",")[1])))[-1]
        year, semester = (int(x) for x in term.split(","))
        out, digest = [], hashlib.sha256()
        for name in classes:
            time.sleep(max(1.5, delay))
            r = session.get(BASE + "down.asp", params={"sqlstr": name, "type": "class", "selArrange": "R", "selWindow": "Left", "yt": term}, timeout=30)
            r.raise_for_status()
            slots = parse_class_table(r.content)
            if not slots:
                print(f"[warn] 嘉女 {name} 班課表解析不到內容；保留前一份資料")
                return 0
            out.append({"class_name": name, "slots": slots})
            digest.update(json.dumps(slots, ensure_ascii=False, sort_keys=True).encode("utf-8"))
        revision = digest.hexdigest()
        old = next((r for r in existing["timetables"] if r.get("school_id") == SCHOOL_ID and r.get("academic_year") == year and r.get("semester") == semester), None)
        row = {"school_id": SCHOOL_ID, "academic_year": year, "semester": semester, "version": "formal",
               "source_url": BASE, "source_document": "嘉女課表查詢系統", "source_revision": revision,
               "fetched_at": now.isoformat(timespec="seconds"), "classes": out}
        if old and old.get("source_revision") == revision:
            row["fetched_at"] = now.isoformat(timespec="seconds")  # checked this week, unchanged
        # One table per school: the newest term replaces the older one.
        others = [r for r in existing["timetables"] if r.get("school_id") != SCHOOL_ID]
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_PATH.write_text(json.dumps({"schema_version": 1, "timetables": others + [row]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[info] 嘉女 {year}-{semester} {len(out)} 個班級課表 → {OUTPUT_PATH}")
    except Exception as exc:
        print(f"[warn] 嘉女課表來源暫時無法讀取：{type(exc).__name__}；保留前一份資料", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(discover(force="--force" in sys.argv))
