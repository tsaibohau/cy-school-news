#!/usr/bin/env python3
"""Evaluate the announcement category classifier against the hand-labelled set.

Usage: python tools/eval_category_scoring.py [--legacy] [--errors]

The evaluation set (tests/fixtures/category_scoring_eval.json) contains only
public titles and the source office, never body text.  `--legacy` evaluates the
old first-match-wins classifier (scrape.classify_first_match) for comparison.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))
EVAL_PATH = ROOT / "tests" / "fixtures" / "category_scoring_eval.json"


def load_eval():
    return json.loads(EVAL_PATH.read_text(encoding="utf-8"))["items"]


def evaluate(predict, items=None):
    """predict(title, office) -> category.  Returns metrics dict."""
    items = items if items is not None else load_eval()
    tp, fp, fn = Counter(), Counter(), Counter()
    errors, correct = [], 0
    for it in items:
        got = predict(it["title"], it.get("office", ""))
        want = it["label"]
        if got == want:
            correct += 1
            tp[want] += 1
        else:
            fp[got] += 1
            fn[want] += 1
            errors.append((it["title"], it.get("office", ""), want, got))
    per_cat = {}
    for cat in sorted(set(tp) | set(fp) | set(fn)):
        p = tp[cat] / (tp[cat] + fp[cat]) if tp[cat] + fp[cat] else 0.0
        r = tp[cat] / (tp[cat] + fn[cat]) if tp[cat] + fn[cat] else 0.0
        per_cat[cat] = {"precision": p, "recall": r, "support": tp[cat] + fn[cat]}
    return {"accuracy": correct / len(items), "n": len(items), "per_category": per_cat, "errors": errors}


def print_report(name, res, show_errors=False):
    print("== %s: accuracy %.1f%% (%d)" % (name, res["accuracy"] * 100, res["n"]))
    for cat, m in sorted(res["per_category"].items(), key=lambda kv: -kv[1]["support"]):
        print("  %-6s support=%3d  P=%5.1f%%  R=%5.1f%%" % (cat, m["support"], m["precision"] * 100, m["recall"] * 100))
    if show_errors:
        for title, office, want, got in res["errors"]:
            print("  x [%s]->[%s] %s | %s" % (want, got, title, office))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--legacy", action="store_true")
    ap.add_argument("--errors", action="store_true")
    ap.add_argument("--data", action="store_true",
                    help="read-only: show how many items in docs/data/announcements.json would change category")
    args = ap.parse_args()
    import scrape
    if args.data:
        doc = json.loads((ROOT / "docs" / "data" / "announcements.json").read_text(encoding="utf-8"))
        moves = Counter()
        for it in doc["items"]:
            new = scrape.classify_scored(it.get("title", ""), it.get("source_category", ""))["category"]
            moves[(it.get("category"), new)] += 1
        changed = sum(n for (a, b), n in moves.items() if a != b)
        print("%d of %d items would change category" % (changed, len(doc["items"])))
        for (a, b), n in moves.most_common(25):
            if a != b:
                print("  %s -> %s: %d" % (a, b, n))
        return
    if args.legacy:
        fn = lambda t, o: scrape.classify_first_match(t + " " + o)
    else:
        fn = lambda t, o: scrape.classify_scored(t, o)["category"]
    print_report("legacy" if args.legacy else "scored", evaluate(fn), args.errors)


if __name__ == "__main__":
    main()
