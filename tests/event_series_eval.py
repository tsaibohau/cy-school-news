# -*- coding: utf-8 -*-
"""Score scraper/event_series.py against the hand-labelled public titles.

    python tests/event_series_eval.py            # print precision / recall / B-cubed and the mistakes

gold  = tests/fixtures/event_series_gold.json (id, title, gold series label; "single:*" = in no series)
A title the generator leaves out of every series counts as its own singleton cluster.
"""
from __future__ import annotations

import json
import sys
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))
import event_series as es  # noqa: E402

GOLD_PATH = ROOT / "tests" / "fixtures" / "event_series_gold.json"


def load_doc(path=GOLD_PATH):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_gold(path=GOLD_PATH):
    return load_doc(path)["items"]


def predict(rows, schools=()):
    """id -> predicted cluster label (series id, or a singleton label)."""
    series = es.build_series([{k: r[k] for k in ("id", "title", "date", "date_status", "school", "category")} for r in rows], schools=schools)
    pred = {}
    for s in series:
        for m in s["members"]:
            pred[m["id"]] = s["id"]
    for r in rows:
        pred.setdefault(r["id"], "alone:" + r["id"])
    return pred, series


def pairwise(gold, pred):
    ids = sorted(gold)
    tp = fp = fn = 0
    bad_merge, bad_split = [], []
    for a, b in combinations(ids, 2):
        g = gold[a] == gold[b] and not gold[a].startswith("single:")
        p = pred[a] == pred[b]
        if g and p:
            tp += 1
        elif p:
            fp += 1
            bad_merge.append((a, b))
        elif g:
            fn += 1
            bad_split.append((a, b))
    precision = tp / (tp + fp) if tp + fp else 1.0
    recall = tp / (tp + fn) if tp + fn else 1.0
    return precision, recall, tp, fp, fn, bad_merge, bad_split


def bcubed(gold, pred):
    ids = sorted(gold)
    by_g, by_p = {}, {}
    for i in ids:
        by_g.setdefault(gold[i] if not gold[i].startswith("single:") else gold[i], set()).add(i)
        by_p.setdefault(pred[i], set()).add(i)
    p_sum = r_sum = 0.0
    for i in ids:
        gset, pset = by_g[gold[i]], by_p[pred[i]]
        inter = len(gset & pset)
        p_sum += inter / len(pset)
        r_sum += inter / len(gset)
    p, r = p_sum / len(ids), r_sum / len(ids)
    return p, r, (2 * p * r / (p + r) if p + r else 0.0)


def evaluate(path=GOLD_PATH):
    doc = load_doc(path)
    rows = doc["items"]
    gold = {r["id"]: r["gold"] for r in rows}
    pred, series = predict(rows, doc.get("schools", []))
    pp, pr, tp, fp, fn, bad_merge, bad_split = pairwise(gold, pred)
    bp, br, bf = bcubed(gold, pred)
    return {"items": len(rows), "gold_series": len({g for g in gold.values() if not g.startswith("single:")}), "predicted_series": len(series),
            "pair_precision": pp, "pair_recall": pr, "pair_f1": 2 * pp * pr / (pp + pr) if pp + pr else 0.0, "tp": tp, "fp": fp, "fn": fn,
            "bcubed_precision": bp, "bcubed_recall": br, "bcubed_f": bf, "bad_merge": bad_merge, "bad_split": bad_split,
            "titles": {r["id"]: r["title"] for r in rows}, "gold": gold, "series": series}


def main():
    res = evaluate()
    print("items=%(items)d gold_series=%(gold_series)d predicted_series=%(predicted_series)d" % res)
    print("pairwise precision=%.3f recall=%.3f f1=%.3f (tp=%d fp=%d fn=%d)" % (res["pair_precision"], res["pair_recall"], res["pair_f1"], res["tp"], res["fp"], res["fn"]))
    print("B-cubed  precision=%.3f recall=%.3f F=%.3f" % (res["bcubed_precision"], res["bcubed_recall"], res["bcubed_f"]))
    t = res["titles"]
    if "-v" in sys.argv:
        print("-- wrongly merged")
        for a, b in res["bad_merge"][:60]:
            print("  ", res["gold"][a], "|", t[a][:40], "<>", res["gold"][b], "|", t[b][:40])
        print("-- wrongly split (first 60)")
        for a, b in res["bad_split"][:60]:
            print("  ", res["gold"][a], "|", t[a][:44], "<>", t[b][:44])


if __name__ == "__main__":
    main()
