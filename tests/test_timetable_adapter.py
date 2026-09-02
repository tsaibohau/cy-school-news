# -*- coding: utf-8 -*-
"""Offline, deterministic class-timetable parser checks."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraper"))
from timetable_adapter import parse_class_page, parse_timetable_pages  # noqa: E402
from timetable import find_current_timetable_article, find_pdf_attachment  # noqa: E402


def page(class_name="109"):
    width = 16
    def cells(values):
        return " " * 10 + "".join(str(value).ljust(width) for value in values)
    def subjects(values):
        return " " * 10 + " " * width + "".join(str(value).ljust(width) for value in values)
    rows = [class_name, cells(["時間", "星期一", "星期二", "星期三", "星期四", "星期五"])]
    times = [("0800", "0850"), ("0900", "0950"), ("1000", "1050"), ("1100", "1150"),
             ("1320", "1410"), ("1420", "1510"), ("1520", "1610"), ("1620", "1710")]
    for period, (start, end) in enumerate(times, 1):
        rows += [f"{period} {start}", subjects([f"科目{period}{day}" for day in range(1, 6)]), end]
    return "\n".join(rows)


def run():
    parsed = parse_class_page(page())
    assert parsed["class_name"] == "109"
    assert len(parsed["slots"]) == 40
    assert parsed["slots"][0] == {"weekday": "星期一", "period": 1, "start": "0800", "end": "0850", "subject": "科目11"}
    assert parse_class_page(page().replace("科目33", "", 1)) is None
    assert [row["class_name"] for row in parse_timetable_pages([page("109"), page("101")])] == ["101", "109"]
    blank = "121\n時間 星期一 星期二 星期三 星期四 星期五\n1 0800\n0850\n2 0900\n0950\n3 1000\n1050\n4 1100\n1150\n5 1320\n1410\n6 1420\n1510\n7 1520\n1610\n8 1620\n1710\n註"
    assert [row["class_name"] for row in parse_timetable_pages([page("109"), blank])] == ["109"]

    index = '''<a href="/formal">115-1正式課表</a><a href="/trial">115-1試行課表</a>
      <a href="https://evil.example/x">115-1正式課表</a>'''
    article = find_current_timetable_article(index, academic_year=115, semester=1)
    assert article == {"url": "https://www.cysh.cy.edu.tw/formal", "label": "115-1正式課表", "version": "formal"}
    attachment = find_pdf_attachment('<a href="/app/index.php?Action=downloadfile&file=x">115-1班級大課表.pdf</a>', detail_url=article["url"])
    assert attachment["url"].startswith("https://www.cysh.cy.edu.tw/app/index.php?")
    print("✓ public class timetable parser / official source guards")


if __name__ == "__main__":
    run()
