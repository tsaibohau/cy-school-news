#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""比對 predictions.json 與標準答案。完全離線。
用法：python evaluate.py predictions.json gold.json
gold.json 格式：[{"id": "...", "label": "must_show|useful|optional|should_hide"}, ...]
未確認（label=None）計入 recall 分母，不被排除。分母為 0 時回傳 null。
"""
import json, sys
from collections import Counter

LABELS = ["must_show", "useful", "optional", "should_hide"]


def ratio(a, b):
    return None if b == 0 else round(a / b, 4)


def evaluate(pred_path, gold_path):
    pred = json.load(open(pred_path, encoding="utf-8"))["outputs"]
    gold = json.load(open(gold_path, encoding="utf-8"))
    pm = {p["id"]: p for p in pred}
    if len(pm) != len(pred):
        raise ValueError("predictions 有重複 id")
    gm = {}
    for g in gold:
        if g["id"] in gm:
            raise ValueError("gold 有重複 id: " + g["id"])
        if g["label"] not in LABELS:
            raise ValueError("gold 標籤不合法: " + str(g["label"]))
        gm[g["id"]] = g["label"]
    if set(pm) != set(gm):
        raise ValueError("id 集合不一致: " + str(sorted(set(pm) ^ set(gm))))
    confusion = Counter()
    errors = []
    for i, truth in gm.items():
        guess = pm[i]["label"] or "unresolved"
        confusion[(truth, guess)] += 1
        if guess != truth:
            errors.append({"id": i, "gold": truth, "predicted": guess,
                           "reason": pm[i]["reason"], "evidence": pm[i]["evidence"]})
    per = {}
    for lab in LABELS:
        tp = confusion[(lab, lab)]
        predicted = sum(v for (t, g), v in confusion.items() if g == lab)
        actual = sum(v for (t, g), v in confusion.items() if t == lab)
        per[lab] = {"precision": ratio(tp, predicted), "recall": ratio(tp, actual),
                    "predicted": predicted, "actual": actual}
    n = len(gm)
    unresolved = sum(v for (t, g), v in confusion.items() if g == "unresolved")
    dangerous = sum(v for (t, g), v in confusion.items()
                    if g == "should_hide" and t in {"must_show", "useful"})
    missed_urgent = sum(v for (t, g), v in confusion.items()
                        if t == "must_show" and g in {"should_hide", "optional"})
    return {"count": n, "unresolved_ratio": ratio(unresolved, n),
            "accuracy_including_unresolved": ratio(sum(confusion[(l, l)] for l in LABELS), n),
            "dangerous_hides_(useful_or_must_show_hidden)": dangerous,
            "urgent_downgraded_to_optional_or_hidden": missed_urgent,
            "per_label": per,
            "confusion": {f"{t}->{g}": v for (t, g), v in sorted(confusion.items())},
            "errors": errors}


if __name__ == "__main__":
    print(json.dumps(evaluate(sys.argv[1], sys.argv[2]), ensure_ascii=False, indent=2))
