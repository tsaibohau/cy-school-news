# -*- coding: utf-8 -*-
"""一次性：實跑嘉女課表抓取，只印統計。"""
import json, subprocess, sys
r = subprocess.run([sys.executable, "scraper/timetable_cygsh.py", "--force"], capture_output=True, text=True)
print(r.stdout[-800:], r.stderr[-800:])
d = json.load(open("docs/data/class-timetables.json", encoding="utf-8"))
for t in d["timetables"]:
    n = [len(c["slots"]) for c in t["classes"]]
    print(t["school_id"], t["academic_year"], t["semester"], "classes", len(n), "slots min/max", min(n) if n else 0, max(n) if n else 0,
          "names", [c["class_name"] for c in t["classes"]][:3], "...", [c["class_name"] for c in t["classes"]][-3:])
