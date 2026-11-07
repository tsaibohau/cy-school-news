# -*- coding: utf-8 -*-
"""scraper/event_series.py: normalization, vetoes, series building, ids, overrides, accuracy on hand labels."""
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))
sys.path.insert(0, str(ROOT / "tests"))
import event_series as es  # noqa: E402
import event_series_eval as ev  # noqa: E402


def item(i, title, date="", school="cysh", category="競賽"):
    return {"id": "%s-%s" % (school, i), "title": title, "date": date, "school": school, "category": category}


# ---- 1. normalization: office prefixes, years, editions, stages, synonyms --------------------------------
a = es.parse_title("【公告】轉知115學年度聯合盃作文競賽報名簡章")
b = es.parse_title("第12屆聯合盃作文比賽")
c = es.parse_title("聯合盃作文比賽得獎名單")
assert a["key"] == b["key"] == c["key"], (a["key"], b["key"], c["key"])
assert a["ay"] == 115 and b["edition"] == 12
assert c["stage"] == "得獎" and a["stage"] == "簡章"            # longest stage word wins, 簡章 not 報名
assert es.parse_title("民國115年臺灣大學物理營")["cy"] == 115
assert es.parse_title("2026 台灣經濟學奧林匹亞")["cy"] == 115 and "臺灣" in es.parse_title("2026 台灣經濟學奧林匹亞")["key"]
assert es.parse_title("115-1教科書驗退書")["ay"] == 115
assert es.parse_title("第二十三梯次本土語文認證輔導班")["edition"] == 23
assert es.parse_title("夏令營").get("key") is not None
assert es.parse_title("暑期營隊")["key"] == es.parse_title("暑期營")["key"]   # 營隊 -> 營
assert es.parse_title("延期：聯合盃作文比賽報名")["stage"] == "延期"          # 延期 outranks 報名
assert es.STAGE_RANK["簡章"] < es.STAGE_RANK["報名"] < es.STAGE_RANK["延期"] < es.STAGE_RANK["初賽"] < es.STAGE_RANK["複賽"] \
    < es.STAGE_RANK["決賽"] < es.STAGE_RANK["得獎"] < es.STAGE_RANK["頒獎"]

# ---- 2. distinctive slots veto a merge even when the strings are nearly identical -------------------------------
def rec(title, i=1, date="2026-09-01"):
    return es.item_record(item(i, title, date))

assert es.conflict(rec("113學年度物理奧林匹亞初賽"), rec("114學年度地球科學奧林匹亞初賽", 2))
assert es.conflict(rec("113學年度高一英文營", 1), rec("114學年度高二英文營", 2))
assert es.conflict(rec("113學年度全國英文演講比賽", 1), rec("114學年度全國數學演講比賽", 2))
assert es.conflict(rec("全國學生音樂比賽", 1), rec("嘉義市學生音樂比賽", 2))
assert es.conflict(rec("115學年度國際數學奧林匹亞", 1), rec("115學年度亞太數學奧林匹亞", 2))
assert es.conflict(rec("【漏洞預警】Veeam Backup 存在重大資安漏洞", 1), rec("【漏洞預警】Fortinet FortiOS 存在重大資安漏洞", 2))
assert es.conflict(rec("長榮大學116學年度特殊選才招生", 1), rec("東海大學116學年度特殊選才招生", 2))
assert not es.conflict(rec("113學年度物理奧林匹亞初賽", 1), rec("114學年度物理奧林匹亞決賽", 2))
# same year with a different edition number is a different event; a different year is evidence for recurrence
assert es.conflict(rec("115學年度第1次校外教學", 1), rec("115學年度第2次校外教學", 2))
assert not es.conflict(rec("114學年度第1次校外教學", 1), rec("115學年度第1次校外教學", 2))

# ---- 3. building series ---------------------------------------------------------------------------------------
items = [
    item(1, "【轉知】112學年度聯合盃作文比賽簡章", "2023-09-10"),
    item(2, "112學年度聯合盃作文比賽報名延期", "2023-10-02"),
    item(3, "112學年度聯合盃作文比賽得獎名單", "2024-01-15"),
    item(4, "113學年度聯合盃作文比賽簡章", "2024-09-12"),
    item(5, "113學年度聯合盃作文比賽報名", "2024-09-20"),
    item(6, "115學年度聯合盃作文比賽簡章", "2026-09-08"),
    item(7, "113學年度聯合盃作文比賽初賽", "2024-11-01"),
    item(10, "113學年度高一英文營報名", "2024-06-01", category="研習活動"),
    item(11, "114學年度高一英文營報名", "2025-06-01", category="研習活動"),
    item(12, "114學年度高二英文營報名", "2025-06-03", category="研習活動"),
    item(13, "116學年度高二英文營報名", "2027-06-03", category="研習活動"),
    item(20, "校慶運動會場地租借", "2025-03-01", category="一般"),          # appears once: no series
]
series = es.build_series(items)
names = {s["name"]: s for s in series}
assert "聯合盃作文比賽" in names, [s["name"] for s in series]
contest = names["聯合盃作文比賽"]
assert contest["category"] == "競賽" and contest["school"] == "cysh" and contest["years"] == [112, 115]
ids = [m["id"] for m in contest["members"]]
assert ids == ["cysh-1", "cysh-2", "cysh-3", "cysh-4", "cysh-5", "cysh-7", "cysh-6"] or ids[0] == "cysh-1", ids
years = [m["year"] for m in contest["members"]]
assert years == sorted(years), "timeline is ordered by academic year first"
stages = [m["stage"] for m in contest["members"] if m["year"] == 113]
assert stages.index("簡章") < stages.index("報名") < stages.index("初賽"), stages
# 高一 and 高二 never share a series, so each of them is below the threshold or separate
for s in series:
    titles = {m["id"] for m in s["members"]}
    assert not ({"cysh-11", "cysh-10"} & titles and {"cysh-12", "cysh-13"} & titles), "高一/高二 merged"
assert not any("cysh-20" in {m["id"] for m in s["members"]} for s in series)
# public metadata only
for s in series:
    assert set(s) == {"id", "name", "school", "category", "years", "members"}
    assert all(set(m) == {"id", "year", "stage"} for m in s["members"])

# thresholds: 2 notices in one year are not a series, 3 are; 2 across two years are
two_same = [item(1, "115學年度未來領袖營簡章", "2026-09-01"), item(2, "115學年度未來領袖營報名", "2026-09-02")]
assert es.build_series(two_same) == []
assert len(es.build_series(two_same + [item(3, "115學年度未來領袖營得獎名單", "2026-12-01")])) == 1
assert len(es.build_series([item(1, "114學年度未來領袖營簡章", "2025-09-01"), item(2, "115學年度未來領袖營簡章", "2026-09-02")])) == 1

# schools never mix
mixed = [item(1, "114學年度未來領袖營簡章", "2025-09-01", "cysh"), item(2, "115學年度未來領袖營簡章", "2026-09-02", "cygsh")]
assert es.build_series(mixed) == []

# ---- 4. no chaining: A~B and B~C must not glue A to C when C is a different thing ------------------------------
chain = [
    item(1, "113學年度物理營簡章", "2024-06-01"), item(2, "114學年度物理營簡章", "2025-06-01"),
    item(3, "114學年度物理地科營簡章", "2025-06-02"), item(4, "114學年度地科營簡章", "2025-06-03"), item(5, "115學年度地科營簡章", "2026-06-03"),
]
for s in es.build_series(chain):
    got = {m["id"] for m in s["members"]}
    assert not ({"cysh-1", "cysh-2"} & got and {"cysh-4", "cysh-5"} & got), "物理 and 地科 chained together"

# ---- 5. name: majority 「」 name, then majority cleaned title, deterministic -----------------------------------
named = [
    item(1, "轉知「全國高中數理能力檢定」報名", "2024-09-01"), item(2, "轉知「全國高中數理能力檢定」簡章", "2025-09-01"),
    item(3, "全國高中數理能力檢定成績公告", "2026-01-01"),
]
assert es.build_series(named)[0]["name"] == "全國高中數理能力檢定"
assert es.build_series(list(reversed(named)))[0]["id"] == es.build_series(named)[0]["id"], "input order must not change the output"

# ---- 6. ids: stable, re-used by member overlap >= 0.5 --------------------------------------------------------------
first = es.build_series(items)
again = es.build_series(items + [item(8, "115學年度聯合盃作文比賽報名", "2026-09-15")], previous=first)
assert {s["id"] for s in first} <= {s["id"] for s in again}, "series ids survive new members"
other = es.build_series(items[:3] + [item(30, "117學年度聯合盃作文比賽簡章", "2028-09-01")], previous=first)
assert any(s["id"] == names["聯合盃作文比賽"]["id"] for s in other), "overlap >= 0.5 keeps the id"
fresh = es.build_series([item(40, "114學年度未來領袖營簡章", "2025-09-01"), item(41, "115學年度未來領袖營簡章", "2026-09-01")], previous=first)
assert fresh and all(s["id"] not in {p["id"] for p in first} for s in fresh), "no overlap: a new id, never someone else's"
assert len({s["id"] for s in again}) == len(again), "ids are unique"

# ---- 7. overrides: merge / split / exclude / rename ---------------------------------------------------------------
sep = [item(1, "113學年度春季登山活動", "2024-03-01"), item(2, "114學年度春季登山活動", "2025-03-01"), item(3, "113學年度某某講座", "2024-04-01"), item(4, "114學年度某某講座", "2025-04-01")]
base = es.build_series(sep)
assert len(base) == 2
merged = es.build_series(sep, overrides={"merge": [{"ids": ["cysh-1", "cysh-3"]}]})
assert any({"cysh-1", "cysh-3"} <= {m["id"] for m in s["members"]} for s in merged)
split = es.build_series(sep, overrides={"split": [["cysh-1"], ["cysh-2"]]})
assert not any({"cysh-1", "cysh-2"} <= {m["id"] for m in s["members"]} for s in split)
excluded = es.build_series(sep, overrides={"exclude": ["cysh-1"]})
assert all("cysh-1" not in {m["id"] for m in s["members"]} for s in excluded)
renamed = es.build_series(sep, overrides={"rename": {"cysh-2": "山友會"}})
assert any(s["name"] == "山友會" for s in renamed)
assert json.loads((ROOT / "scraper" / "series_overrides.json").read_text(encoding="utf-8"))["merge"] == []

# ---- 8. the generated file ---------------------------------------------------------------------------------------------
with tempfile.TemporaryDirectory() as directory:
    data = Path(directory)
    (data / "announcements.json").write_text(json.dumps({"schools": [{"id": "cysh", "name": "國立嘉義高級中學", "short": "嘉中"}], "items": items[:7]}, ensure_ascii=False), encoding="utf-8")
    (data / "archive.json").write_text(json.dumps({"items": items[7:11]}, ensure_ascii=False), encoding="utf-8")
    (data / "removed-announcements.json").write_text(json.dumps({"removed": [{"id": "cysh-3"}]}), encoding="utf-8")
    out = data / "series.json"
    doc = es.main(data, out, ROOT / "scraper" / "series_overrides.json")
    written = json.loads(out.read_text(encoding="utf-8"))
    assert written["schema_version"] == 1 and written["count"] == len(written["series"]) == doc["count"]
    assert all("cysh-3" not in {m["id"] for m in s["members"]} for s in written["series"]), "removed announcements stay out"
    raw = out.read_text(encoding="utf-8")
    assert "summary" not in raw and "snippet" not in raw and "detail" not in raw, "metadata only"
    before = out.read_text(encoding="utf-8")
    es.main(data, out, ROOT / "scraper" / "series_overrides.json")
    assert out.read_text(encoding="utf-8") == before, "unchanged data must not rewrite the file (no timestamp-only commits)"

# ---- 9. accuracy on the hand-labelled public titles (see tests/event_series_eval.py) ---------------------------------------
res = ev.evaluate()
print("gold: items=%d series=%d pairwise P=%.3f R=%.3f  B-cubed P=%.3f R=%.3f F=%.3f" % (
    res["items"], res["gold_series"], res["pair_precision"], res["pair_recall"], res["bcubed_precision"], res["bcubed_recall"], res["bcubed_f"]))
assert res["items"] >= 150 and res["gold_series"] >= 30
assert res["pair_precision"] >= 0.95, "wrong merges hurt readers more than missing ones"
assert res["bcubed_f"] >= 0.85
assert res["pair_recall"] >= 0.80
print("test_event_series ok")
