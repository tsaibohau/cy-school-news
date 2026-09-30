"""Development-only evaluator. Predictions must come from a configured model provider."""
from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

HERE=Path(__file__).parent
_DATA_PATHS=(HERE.parent/"today-relevance-v3"/"fixtures"/"01-manual-ranking-label-view-2026-09-26-reviewed.json",
             HERE.parent/"v3"/"fixtures"/"01-manual-ranking-label-view-2026-09-26-reviewed.json")
DEFAULT_DATA=next((p for p in _DATA_PATHS if p.is_file()),_DATA_PATHS[0])
SPLIT_AUDIT=HERE/"split-audit.json"
LABELS=["must_show","useful","optional","should_hide"]


def load_dataset(path: Path) -> list[dict]:
    doc=json.loads(path.read_text(encoding="utf-8")); rows=doc.get("records",[])
    if len(rows)!=150 or len({r["announcement_id"] for r in rows})!=150:
        raise ValueError("development set must contain exactly 150 unique announcements")
    counts={label:sum(r.get("human_label")==label for r in rows) for label in LABELS}
    if counts!={"must_show":18,"useful":36,"optional":26,"should_hide":70}:
        raise ValueError("reviewed development label totals mismatch: "+str(counts))
    return rows


def score(rows: list[dict], predictions: dict[str,dict]) -> dict:
    matched=[r for r in rows if r["announcement_id"] in predictions]
    if len(matched)!=len(rows):
        raise ValueError(f"prediction ID coverage mismatch: {len(matched)} of {len(rows)} rows")
    cm={human:{machine:0 for machine in LABELS} for human in LABELS}
    for row in matched:
        got=predictions[row["announcement_id"]].get("relevance",{}).get("today_label")
        if got not in LABELS: continue
        cm[row["human_label"]][got]+=1
    selected=[r for r in matched if predictions[r["announcement_id"]].get("relevance",{}).get("today_label") in {"must_show","useful"}]
    positive=sum(r["human_label"] in {"must_show","useful"} for r in selected)
    denom={label:sum(r["human_label"]==label for r in rows) for label in LABELS}
    by={label:sum(r["human_label"]==label for r in selected) for label in LABELS}
    truth_pos=denom["must_show"]+denom["useful"]
    valid_cites=[predictions[r["announcement_id"]].get("evidence_citations_validated") is True for r in matched]
    human_missing=[r for r in rows if r.get("announcement_missing") is True]
    predicted_missing=[r for r in human_missing if predictions.get(r["announcement_id"],{}).get("evidence",{}).get("source_status",{}).get("canonical_status")=="missing_confirmed"]
    human_teacher=[r for r in rows if r.get("teacher_related") is True]
    predicted_teacher=[r for r in human_teacher if predictions.get(r["announcement_id"],{}).get("evidence",{}).get("teacher_related") is True]
    return {"scored_count":len(matched),"label_confusion_matrix":cm,
      "label_accuracy":sum(cm[x][x] for x in LABELS)/len(matched) if matched else None,
      "positive_precision":positive/len(selected) if selected else None,
      "positive_recall":positive/truth_pos if truth_pos else None,
      "must_show_recall":by["must_show"]/denom["must_show"],"useful_recall":by["useful"]/denom["useful"],
      "should_hide_leakage":by["should_hide"]/denom["should_hide"],"optional_positive_leakage":by["optional"]/denom["optional"],
      "displayed_count":len(selected),"human_missing_flag_diagnostic":{"denominator":len(human_missing),"captured_as_missing":len(predicted_missing),"recall":len(predicted_missing)/len(human_missing) if human_missing else None},
      "human_teacher_flag_diagnostic":{"denominator":len(human_teacher),"captured_as_teacher_related":len(predicted_teacher),"recall":len(predicted_teacher)/len(human_teacher) if human_teacher else None},
      "evidence_citation_validation_rate":sum(valid_cites)/len(valid_cites) if valid_cites else None}


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--predictions",type=Path);ap.add_argument("--dataset",type=Path,default=DEFAULT_DATA)
    args=ap.parse_args();rows=load_dataset(args.dataset);audit=json.loads(SPLIT_AUDIT.read_text())
    overlap=set(audit["round1_development_overlap_ids"])
    report={"dataset":{"rows":len(rows),"unique_ids":len({r["announcement_id"] for r in rows}),
      "label_counts":dict(collections.Counter(r["human_label"] for r in rows)),
      "body_available_in_label_export":sum(bool(r.get("official_body") or r.get("body_text")) for r in rows),
      "attachment_bytes_or_text_in_label_export":sum(bool(r.get("attachments")) for r in rows),
      "note":"The label export contains title/metadata, not official bodies or attachments. No HTTP source acquisition is performed here."},
      "split_audit":{"round1_overlap_count":len(overlap),"clean_nonoverlap_count":len(rows)-len(overlap)},
      "extraction_ground_truth":{"date_accuracy":"not_measurable: development label export has no adjudicated date fields","actionability_accuracy":"not_measurable","temporal_accuracy":"not_measurable","audience_primitive":"teacher_related boolean only; affected grade/audience ground truth absent","historical_reference_accuracy":"not_measurable"},
      "autonomous_metrics":None,"clean_nonoverlap_metrics":None,"extraction_counts":None,
      "model_execution":{"provider_configured":False,"predictions_supplied":bool(args.predictions),
        "autonomous_run_performed":False,"source_body_or_attachment_acquisition_performed":False,
        "reason":"No structured model provider or objective source-content bundle is configured."}}
    if args.predictions:
        pred_doc=json.loads(args.predictions.read_text(encoding="utf-8"));records=pred_doc.get("records",[])
        preds={r["announcement_id"]:r for r in records}
        if len(preds)!=len(records): raise ValueError("duplicate prediction IDs")
        if set(preds)!={r["announcement_id"] for r in rows}:
            raise ValueError("prediction IDs must exactly match the 150-row development set; missing/extra IDs are forbidden")
        labels=score(rows,preds);clean=score([r for r in rows if r["announcement_id"] not in overlap],preds)
        report["autonomous_metrics"]=labels;report["clean_nonoverlap_metrics"]=clean
        report["scored_round1_overlap_ids"]=sorted(overlap & preds.keys())
        report["extraction_counts"]={"content_quality":dict(collections.Counter(r.get("evidence",{}).get("content_quality") for r in records)),
          "canonical_source_status":dict(collections.Counter(r.get("evidence",{}).get("source_status",{}).get("canonical_status") for r in records)),
          "actionability":dict(collections.Counter(r.get("temporal",{}).get("actionability_status") for r in records)),
          "temporal_status":dict(collections.Counter(r.get("temporal",{}).get("temporal_status") for r in records)),
          "historical_reference":dict(collections.Counter(str(r.get("evidence",{}).get("historical_reference")) for r in records))}
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__": main()
