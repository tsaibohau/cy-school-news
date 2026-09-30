# Candidate v3.2 Autonomous Evidence Benchmark

## Decision

**Candidate v3.2 = NOT FROZEN**

The benchmark does not demonstrate autonomous reading of announcement bodies or attachments: none of the 150 records had body or attachment evidence valid at `evaluation_as_of = 2026-09-25`. Work Luna ran a blinded title/metadata-only inference on 138 of the 141 eligible non-overlap records. Three records were withheld before inference due to pre-inference exposure. The nine Round 1 overlaps were not included in primary metrics.

## Corpus and blind integrity

| Measure | Result |
|---|---:|
| Reviewed development corpus | 150 |
| Round 1 overlap, diagnostic only | 9 |
| Expected primary non-overlap | 141 |
| Inferred clean primary | 138 |
| Withheld before inference | 3 |
| Historical body available / partial | 0 / 0 |
| Historical attachments available / parsed | 0 / 0 |
| Historical source observations at or before as-of | 0 |
| Post-as-of Training observations | 19 rows / 9 IDs, excluded |
| Live official URLs opened after as-of | 12: 5 HTTP 200, 7 HTTP 404; diagnostic only |

Three exclusions: one record whose human label was exposed during dataset structure inspection, one whose live page body was opened before inference, and one whose live 404 was observed before inference. No Round 1 overlap entered primary metrics. Outputs were frozen and SHA-256 verified before the human-truth join. No later live fetch content entered the inference input.

## Autonomous inference

Work Luna itself produced structured evidence and relevance outputs in batches; no external semantic provider or API was used. Since the corpus contained only titles and objective metadata, all 138 predictions are low-evidence and all cite title/metadata. No body or attachment parsing could be exercised. The live 2026-09-30 pages and Training observations from 2026-09-28 were kept as post-as-of diagnostics.

## Primary four-class ranking, n = 138

Human counts in this clean subset: must_show 16, useful 34, optional 24, should_hide 64.

| Human \\ Model | must_show | useful | optional | should_hide |
|---|---:|---:|---:|---:|
| must_show | 1 | 10 | 5 | 0 |
| useful | 0 | 14 | 17 | 3 |
| optional | 0 | 1 | 9 | 14 |
| should_hide | 0 | 11 | 22 | 31 |

| Class | Precision | Recall |
|---|---:|---:|
| must_show | 100.0% (1/1) | 6.25% (1/16) |
| useful | 38.89% (14/36) | 41.18% (14/34) |
| optional | 16.98% (9/53) | 37.50% (9/24) |
| should_hide | 64.58% (31/48) | 48.44% (31/64) |

Today-positive (must_show + useful): precision **67.57% (25/37)**, recall **50.00% (25/50)**, displayed **37/138**, false positives **12**, false negatives **25**. Should-hide leakage was **11/64 = 17.19%**; optional-to-positive leakage was **1/24 = 4.17%**. Overall four-class accuracy was 39.86%.

### Subgroups (descriptive)

| Subgroup | n | Positive precision | Positive recall | should_hide leakage |
|---|---:|---:|---:|---:|
| CYGSH | 69 | 72.73% | 50.00% | 5/32 = 15.63% |
| CYSH | 69 | 60.00% | 50.00% | 6/32 = 18.75% |
| Age 0–7 days | 30 | 91.67% | 52.38% | 0/5 |
| Age 8–30 days | 47 | 60.00% | 52.17% | 8/16 = 50.00% |
| Age 31–90 days | 61 | 40.00% | 33.33% | 3/43 = 6.98% |

Age uses the fixture's first_seen_date relative to the frozen as-of date. Categories are included in the machine-readable ranking evaluation; categories with fewer than 10 rows are marked descriptive only. The source/body/attachment/evidence-confidence subgroups all collapse to the same metadata-only, low-confidence cohort.

## Extraction evaluation

The reviewed development fixture has human truth for teacher_related and announcement_missing, but no human ground truth for dates, audience, temporal status, actionability, or historical reference. Exact date, audience, temporal, historical-reference and actionability accuracy are therefore **not evaluable**, not zero.

- **Date extraction outputs:** 14 normalized date claims across 13 records; every claim has a title-source evidence citation. This is a count of extracted claims, not an accuracy score.
- **Teacher-related:** precision 86.67%, recall 65.00%, F1 74.29%; the model abstained on 89.13% of records (123/138), with no predicted false values.
- **Source/missing:** human marked 27 records missing. Model emitted no `missing_confirmed` predictions and abstained on all 138; missing recall 0%, source-status coverage 0%.

## Evidence quality audit

- 815 evidence citations were checked.
- 0 title citations failed exact substring anchoring against the blind input.
- 0 citations claimed an unavailable source type; 0 attachment citations or invented attachment references.
- 0 post-as-of evidence references in primary output.
- 0 `missing_confirmed` + `full` content contradictions.
- All 14 date claims had a title-source citation. This is a structural citation check; semantic entailment cannot be verified from absent historical bodies and attachments. Therefore a semantic hallucination rate is **not estimable** from this corpus.

## Autonomous vs limited oracle diagnostic

The only valid oracle diagnostic available uses post-inference human `announcement_missing` and `teacher_related` flags to suppress those records. It is not full-oracle evaluation and must not be treated as production capability.

| Measure | Autonomous | Limited oracle | Delta |
|---|---:|---:|---:|
| Positive precision | 67.57% | 72.73% | +5.16 pp |
| Positive recall | 50.00% | 48.00% | −2.00 pp |
| should_hide leakage | 17.19% | 12.50% | −4.69 pp |
| optional-to-positive leakage | 4.17% | 4.17% | 0 pp |
| must_show recall | 6.25% | 6.25% | 0 pp |
| useful recall | 41.18% | 38.24% | −2.94 pp |
| displayed | 37 | 33 | −4 |

This limited gap suggests source-missing and teacher-impact extraction/policy may matter, but does not isolate a complete autonomous reasoning gap because most primitive truth is absent.

## Human intervention estimate

**138/138 = 100% flagged.** All 138 inputs had low evidence confidence. This is an evidence-coverage failure signal for the title-only corpus, not an estimate for a functioning body-and-attachment pipeline.

## Previously known Round 1 FP patterns

The 14 Round 1 false-positive examples were not part of the clean 138-row primary inference set. They were not used for prompt tuning or re-inference. Whether v3.2 independently corrects the 404/missing, expired, result-announcement, device-specific action, historical-reference, niche-course, or timing-gap patterns is **not assessed**.

## Freeze gate

Not met. Historical content coverage is 0%; attachment reading was not tested; source-status recall is 0%; must_show recall is 6.25%; useful recall is 41.18%; intervention rate is 100%; and the requested extraction primitives lack direct development truth. There was no post-as-of leakage into the primary blind inference, but these results are insufficient to freeze a full autonomous evidence system.

## Scope and reproducibility

- Branch: `codex/today-relevance-ranking-v3`
- Frozen input SHA-256: `5e5202593eacd748fbee2249d94efaef883e11da167d7394b4253298820428e3`
- Evidence output SHA-256: `93eb470a5a703a2ace22ebbc56eff89a0c783126bbab9d10e479ccdb6eccf487`
- Relevance output SHA-256: `39b28fc70f37d5dea0a278eba5dd0ce38103069751efa64f9fb0250bbab0b6fb`
- Training Supabase: read-only; no data changes.
- Round 1 scorer: not rerun.
- Round 1 labels / evidence / frozen predictions: unchanged.
- Production, Today, query policy, and main: unchanged.
- No Round 2 or human review queue created.
