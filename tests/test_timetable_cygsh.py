# -*- coding: utf-8 -*-
"""嘉女課表查詢系統：解析班級課表，只留科目（不留教師、教室）。"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scraper"))
import timetable_cygsh as t  # noqa: E402

page = (HERE / "fixtures" / "cygsh_timetable" / "class-101.html").read_text(encoding="utf-8")
slots = t.parse_class_table(page)
by = {(s["weekday"], s["period"]): s for s in slots}
assert by[("星期一", 1)] == {"weekday": "星期一", "period": 1, "start": "0800", "end": "0850", "subject": "英語文"}, by[("星期一", 1)]
assert by[("星期三", 5)]["subject"] == "團體活動時間", "the first afternoon row (with the 下午 label) is read"
assert by[("星期三", 5)]["start"] == "1310"
assert by[("星期四", 8)]["subject"] == "數學(輔)"
assert ("星期六", 1) not in by and not any(s["period"] == 0 for s in slots), "no Saturday, no 早自習"
text = json.dumps(slots, ensure_ascii=False)
assert "教師" not in text and "TEAL" not in text, "teachers and rooms are not kept"
assert len(slots) == 38, len(slots)

top = (HERE / "fixtures" / "cygsh_timetable" / "top.html").read_text(encoding="utf-8")
assert t.term_options(top) == ["114,1", "114,2", "115,1"], "summer terms (,4) are skipped"
classes = t.class_options(top)
assert classes[0] == "101" and len(classes) >= t.MIN_CLASSES


class Resp:
    def __init__(self, content): self.content = content.encode("utf-8") if isinstance(content, str) else content
    def raise_for_status(self): pass


class Session:
    def __init__(self, broken=None): self.calls, self.broken = [], broken
    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        if url.endswith("top.asp"):
            return Resp(top)
        return Resp("<html></html>" if params and params.get("sqlstr") == self.broken else page)


import tempfile  # noqa: E402
from datetime import datetime  # noqa: E402
with tempfile.TemporaryDirectory() as tmp:
    out = Path(tmp) / "class-timetables.json"
    out.write_text(json.dumps({"schema_version": 1, "timetables": [{"school_id": "cysh", "academic_year": 115, "semester": 1, "classes": []}]}), encoding="utf-8")
    t.OUTPUT_PATH = out
    t.time.sleep = lambda s: None
    s = Session()
    t.discover(session=s, delay=0, force=True)
    data = json.loads(out.read_text(encoding="utf-8"))
    rows = {r["school_id"]: r for r in data["timetables"]}
    assert "cysh" in rows, "嘉中 stays"
    g = rows["cygsh"]
    assert (g["academic_year"], g["semester"]) == (115, 1) and len(g["classes"]) == len(classes)
    assert all(p and p.get("yt") == "115,1" for _, p in s.calls[1:])
    assert t.due(data, datetime.now(t.TW_TZ)) is False, "updated at most once a week"
    before = out.read_text(encoding="utf-8")
    t.discover(session=Session(broken="105"), delay=0, force=True)
    assert out.read_text(encoding="utf-8") == before, "one unreadable class keeps the previous data"
print("cygsh timetable tests passed")
