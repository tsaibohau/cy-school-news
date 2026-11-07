"""Regression tests for the weighted-scoring category classifier.

The evaluation set (tests/fixtures/category_scoring_eval.json) is hand-labelled
public titles + office only (no body text).  The accuracy floor below is the
measured accuracy minus a small margin; raise it when the rules improve.
"""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))
sys.path.insert(0, str(ROOT / "tools"))

from category_scorer import score_category  # noqa: E402
from eval_category_scoring import evaluate  # noqa: E402

MEASURED_OVERALL = 0.918   # all 594 labelled titles
MARGIN = 0.03
MEASURED_FRESH = 0.833     # 60 titles labelled blind, before any rule was tuned on them
LEGACY_OVERALL = 0.665     # first-match-wins baseline on the same set


class CategoryScoringTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        data = json.loads((ROOT / "tests" / "fixtures" / "category_scoring_eval.json").read_text(encoding="utf-8"))
        cls.items = data["items"] + data["holdout"] + data["fresh"]
        cls.result = evaluate(lambda t, o: score_category(t, o)["category"], cls.items)

    def test_eval_set_is_public_titles_only(self):
        self.assertGreaterEqual(len(self.items), 300)
        for item in self.items:
            self.assertEqual({"title", "office", "label"}, set(item))
            self.assertLessEqual(len(item["title"]), 90)

    def test_overall_accuracy_floor(self):
        self.assertGreaterEqual(self.result["accuracy"], MEASURED_OVERALL - MARGIN, self.result["errors"][:10])
        self.assertGreater(self.result["accuracy"], LEGACY_OVERALL + 0.15)

    def test_per_category_floor(self):
        for cat, floor_p, floor_r in (
            ("段考考試", 0.85, 0.85), ("榮譽榜", 0.9, 0.8), ("競賽", 0.9, 0.9),
            ("教職員", 0.85, 0.85), ("研習活動", 0.85, 0.8), ("升學", 0.9, 0.8),
        ):
            m = self.result["per_category"][cat]
            self.assertGreaterEqual(m["precision"], floor_p, cat)
            self.assertGreaterEqual(m["recall"], floor_r, cat)

    def test_named_cases(self):
        cases = {
            "第二次期中考": "段考考試",
            "115學年度第1學期期末考考程": "段考考試",
            "模擬考範圍公告": "段考考試",
            "補考名單": "段考考試",
            "電腦科技營隊": "研習活動",
            "高中職暑期夏令營報名": "研習活動",
            "2027教育營—小木偶奇育記": "研習活動",
            "全國高中職學生科學體驗營": "研習活動",
            "校慶園遊會競賽成績公告": "競賽",
            "第16週整潔比賽成績": "競賽",
            "115學年度高一第一次段考成績查詢": "段考考試",
            "教師研習：AI教學工作坊": "教職員",
            "社團法人台灣某協會辦理講座": "研習活動",
            "賀！本校同學榮獲全國賽冠軍": "榮譽榜",
            "社團轉社名單": "社團",
        }
        for title, expect in cases.items():
            self.assertEqual(expect, score_category(title)["category"], title)

    def test_office_is_a_prior_not_a_verdict(self):
        self.assertEqual("榮譽榜", score_category("本校學生表現", "榮譽榜")["category"])
        # a strong title signal beats an unrelated office
        self.assertEqual("段考考試", score_category("第一次段考範圍", "獎助學金")["category"])

    def test_confidence_and_unsorted(self):
        sure = score_category("115學年度第一次段考考試範圍公告")
        self.assertGreaterEqual(sure["confidence"], 0.7)
        vague = score_category("圖書館閉館通知")
        self.assertEqual("一般", vague["category"])
        self.assertEqual(0.0, vague["confidence"])
        for item in self.items[:100]:
            r = score_category(item["title"], item["office"])
            self.assertGreaterEqual(r["confidence"], 0.0)
            self.assertLessEqual(r["confidence"], 1.0)

    def test_categories_stay_within_site_labels(self):
        import scrape
        allowed = set(scrape.CATEGORY_SLUGS)
        for item in self.items:
            self.assertIn(score_category(item["title"], item["office"])["category"], allowed)

    def test_deterministic(self):
        a = [score_category(i["title"], i["office"]) for i in self.items[:50]]
        b = [score_category(i["title"], i["office"]) for i in self.items[:50]]
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()
