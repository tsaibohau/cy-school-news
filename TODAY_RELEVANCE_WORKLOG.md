# Today Relevance Ranking Worklog

## Purpose

Durable handoff for the Today relevance /「今天」ranking workstream. This document records confirmed history and the current safe checkpoint. Verify repository state before acting on this handoff.

## Source of truth

- The Production site is the sole source of truth for current product behavior.
- `PROJECT_LEDGER.md` is deprecated for this workstream and must not be used to determine its current state.
- Local or uncommitted candidate code does not establish Production behavior.

## Confirmed timeline

1. Initially, 75 announcements were sampled at random.
2. Manual inspection found that the sample was biased toward 嘉義女中.
3. The sample was expanded to 150 items, adding items from other schools.
4. Two separate human-review markers were added: `teacher_related` and `announcement_missing` (announcement unreadable or nonexistent).
5. Manual review of all 150 development items was completed.
6. The next work instruction after manual review failed and was not completed. Do not assume its planned work succeeded.
7. A new Work session performed read-only recovery.

## Reviewed 150 development set

Confirmed reviewed label distribution:

- `must_show` = 18
- `useful` = 36
- `optional` = 26
- `should_hide` = 70

The reviewed labels are ground truth and must not be replaced or overwritten by a conflicting dataset.

## Previous Work local recovery state

The following were observed in a previous Work environment only:

- Local branch: `codex/today-relevance-ranking`
- Local HEAD: `d8e5a337e8fd660b593c5bb33a3a366642b7d856`
- At that time, local HEAD matched `origin/main`
- Dirty worktree: `/workspace/scratch/6ba30abc5a1f/cy-school-news-relevance`

This is historical local / ephemeral recovery state. It is not evidence that a GitHub remote branch named `codex/today-relevance-ranking` exists or existed.

## Dirty candidate implementation observed during recovery

The uncommitted candidate implementation was reported to include:

- `docs/relevance.js`
- `docs/today.js`
- `TodayRankingPolicy`
- `QueryRankingPolicy`
- scoped suppression
- missing eligibility handling

These were candidate changes in a dirty worktree, not Production behavior. They are not recorded here as completed, committed, calibrated, frozen, or deployed.

## Validation state

- Threshold `35` is an existing candidate value, not a final threshold.
- Candidate calibration: not confirmed complete.
- Candidate policy freeze: not confirmed complete.
- The old blind set of 75 and development set of 150 share 30 IDs; the old blind set is not an independent validation set.
- A new independent blind dataset: not confirmed complete.
- Blind scorer: not run.
- Query `published` blocker: **UNVERIFIED**.
- `v2` / `v3` are concepts for ranking-policy experiments, not evidence of completed artifacts.

## Current safe checkpoint

**150 筆 development dataset 已完成人工複查。**

No work planned after manual review is considered complete unless separately verified. Candidate calibration and policy freeze remain unconfirmed, and an independent blind dataset remains unconfirmed. Blind scoring is prohibited until a new blind dataset is confirmed and:

`blind IDs ∩ development IDs = 0`

is explicitly verified.

## Hard rules

1. Preserve the reviewed 150 human labels.
2. Use the Production site as the sole product truth source; do not use `PROJECT_LEDGER.md` for current status.
3. Treat the previous `codex/today-relevance-ranking` branch and dirty worktree only as historical local recovery observations.
4. Do not infer calibration, policy freeze, blind-set creation, or validation from candidate code or prior plans.
5. Do not run a blind scorer until the independent blind/development ID intersection is verified to be zero.
6. Do not use blind results to tune a candidate policy.
7. Keep Query `published` blocker status **UNVERIFIED** unless direct new evidence resolves it.
8. Do not deploy or alter Production as part of recovery or documentation work.


## 2026-09-27 new Work session checkpoint

### Confirmed facts
- Read this worklog from codex/today-relevance-worklog; did not consult PROJECT_LEDGER.md.
- GitHub main HEAD at session start: ec7c1b3d0c22d1e95df694e44aeab56efb9dd9b6.
- Read Production at https://tsaibohau.github.io/cy-school-news/. Anonymous Today showed deadlines/events and an empty personalized relevance section asking for profile setup.
- Production Today uses CyNewsToday.build; its relevance list sorts profile relevance results and caps at 10. Query policy was not changed.
- Correct reviewed development artifact: /workspace/scratch/967bd5223805/upload/01-manual-ranking-label-view-2026-09-26-reviewed.json. Verified 150 records, 150 unique IDs, labels 18/36/26/70, and teacher_related plus announcement_missing. Final human_label values were not changed.
- Historical dirty worktree exists at /workspace/scratch/6ba30abc5a1f/cy-school-news-relevance and was inspected read-only.
- New GitHub branch codex/today-relevance-ranking-v2 was created from main; fresh local worktree is /workspace/scratch/f00296df367f/today-relevance-ranking-v2.

### Baseline evaluation
- Current GitHub-main docs/relevance.js + docs/today.js were run against two per-school, unknown-grade development slates at as_of 2026-09-25, capped at 10 per school.
- Baseline: 20 displayed (2 must_show, 2 useful, 4 optional, 12 should_hide); must_show recall 11.1%; useful recall 5.6%; positive recall 7.4%; precision 20.0%; should_hide leakage 17.1%; optional display rate 15.4%.
- A separate replay of the live 4,123-item active Production corpus yielded 20 visible items across the two school profiles, 8 intersecting the reviewed set; these are not substituted for development-slate baseline metrics.

### Local candidate work; not frozen
- Local uncommitted code adds Today-only score components for importance, audience, time, and eligibility. teacher_related is a soft audience adjustment; confirmed missing is an eligibility exclusion. Query scoring is unchanged.
- Preliminary v2 metrics after generic explicit-deadline parsing: 20 displayed (5 must_show, 12 useful, 2 optional, 1 should_hide); recalls 27.8% / 33.3% / 31.5%; precision 85.0%; should_hide leakage 1.4%; optional display rate 7.7%.
- Remaining false positive: a lapsed remediation registration title with a parenthetical date range not handled by the parser. False-negative review and group breakdowns remain incomplete.
- node tests/test_relevance.js and node tests/test_today.js passed after the deadline parser change.
- Candidate policy is not frozen. Threshold 45 is provisional; code is not committed.
- A 100-row blind sample was generated before freeze and removed. It is not a valid blind dataset. Blind scorer, metrics, prediction, and label generation were not run.
- Ranking branch has no code commit; base is ec7c1b3d0c22d1e95df694e44aeab56efb9dd9b6. No Production deploy, migration, database write, or main merge occurred. Production impact: NONE.

### Next safe checkpoint
1. Finish development-only group breakdown and false-negative review; resolve generic date-range handling without title-specific rules.
2. Rerun tests and development evaluator; freeze only after evidence, then commit and record SHA.
3. Only after freeze, build a new blind sample from a fresh Production snapshot, verify both schools and blind/development intersection = 0, and keep scorer not run.


## 2026-09-27 development error / subgroup / threshold checkpoint

### Confirmed inputs and evaluation harness
- Re-read and verified the reviewed development artifact at `/workspace/scratch/967bd5223805/upload/01-manual-ranking-label-view-2026-09-26-reviewed.json`: 150 records, 150 unique announcement IDs, label totals must_show=18, useful=36, optional=26, should_hide=70; teacher_related and announcement_missing are present. No human label was edited in this work session.
- The evaluator creates **two contexts**, not ten: CYSH and CYGSH. Each context receives all 75 reviewed rows for that school, unknown grade, as_of=2026-09-25; displayed results are capped at 10/context. Total displayed=20 is the sum of the two contexts. There are zero duplicate displayed IDs across contexts.
- Candidate input pools are selected by school only. Pool construction does not inspect human_label, predictions, output score, threshold, or ranking position. The candidate's intended output selection does use eligibility, score >= threshold, descending score / ascending ID tie-break, and max 10/context. This is the ranking being evaluated, not a pre-filter of the 150-row candidate pool.
- Baseline calls current-main Today.build/current-main relevance. Same-school current relevance priorities tie; Today.build preserves the reviewed artifact's input order in ties, so baseline top-10 per school is sensitive to sample order.
- Upstream development sample construction is score-aware: the existing sampling audit at `/workspace/scratch/6ba30abc5a1f/cy-school-news-relevance/artifacts/manual-ranking-sampling-audit-2026-09-26.json` records balanced school coverage, date/category coverage, old score-band coverage and inclusion of all known title-boost examples; `human_labels_filled=0`. Thus no human-label leakage is found in the evaluation harness, but this development set is not a prevalence-representative random sample and must not be described as a Production performance estimate.
- Denominators are exact: must_show recall uses 18; useful recall uses 36; combined positive recall uses 54; precision uses all displayed rows (20 at threshold 45); should_hide leakage uses 70; optional display rate uses 26. The evaluator emits the four raw displayed/total label counts, so all percentages are reproducible from counts.

### Raw development slate metrics
All figures below are for the reviewed 150-row, two-school development slates only; they are not Production ranking metrics.

| Run | Displayed | must_show | useful | optional | should_hide |
|---|---:|---:|---:|---:|---:|
| Baseline | 20 | 2/18 | 2/36 | 4/26 | 12/70 |
| Candidate threshold 45, final local state | 20 | 6/18 | 12/36 | 2/26 | 0/70 |

- Baseline: must_show recall 11.1%; useful recall 5.6%; positive recall 4/54=7.4%; displayed precision 4/20=20.0%; should_hide leakage 12/70=17.1%; optional display rate 4/26=15.4%.
- Candidate final: must_show recall 6/18=33.3%; useful recall 12/36=33.3%; positive recall 18/54=33.3%; precision 18/20=90.0%; should_hide leakage 0/70=0%; optional display rate 2/26=7.7%.

### Error analysis
- Final candidate false negatives: 36 positives (13 must_show, 23 useful). By primary omission class:
  - Below threshold: 23 (16 score <40; 7 score 42–44). IDs: cygsh-169126, cygsh-179665, cygsh-186366, cygsh-186576, cygsh-186585, cygsh-186592, cygsh-186609, cygsh-186622, cygsh-186623, cygsh-186639, cygsh-186640, cygsh-186661, cygsh-186714, cysh-133405, cysh-133929, cysh-136187, cysh-136540, cysh-136592, cysh-136609, cysh-136617, cysh-136629, cysh-136693, cysh-136735.
  - Capacity/rank cutoff despite eligible score >=45: 13 (all ranked 11th or lower in their school). IDs: cygsh-173270, cygsh-185870, cygsh-186419, cygsh-186420, cygsh-186450, cygsh-186484, cygsh-186582, cygsh-186621, cygsh-186663, cygsh-186713, cysh-136417, cysh-136523, cysh-136733.
- Overlapping failure patterns (counts can overlap): six positive items are older than 30 days (cygsh-169126, cygsh-179665, cygsh-185870, cysh-133405, cysh-133929, cysh-136187); six positive teacher_related=true items are all unshown (cygsh-186609, cygsh-186622, cygsh-186661, cysh-136617, cysh-136693, cysh-136735); seven positives have score 42–44 and are below threshold. Six teacher-related positives comprise one must_show and five useful. The policy uses the flag only as a soft audience component (-25), never as a hard eligibility rule, but its observed effect is currently equivalent to zero teacher_related=true display (0/6 positive and 0/22 total flagged records), which needs resolution or stronger rationale before freeze.
- Date missing/ambiguity: zero development rows lack both published_date and first_seen_date (sampling audit: 75 use each date source); so missing-date subgroup is empty. No false-negative positive has announcement_missing=true. All 29 announcement_missing=true rows are should_hide and are excluded by eligibility.
- Importance/category signal weakness appears across below-threshold positives, especially category 一般 (10 FN), 研習活動 (6 FN), and 社團 (3 FN). Examples include recent general items scoring 38–44. This is a broad signal coverage issue; no title-specific rule was added.
- Deadline/event extraction example: cygsh-186623 has a title date 2026-11-13 not currently parsed as a temporal event; it scores 38 as category 一般. cygsh-173270 has a recognized 2026-10-05 application end date, score 54, but is rank 11 and misses the 10-item cap.
- Final false positives among non-positive labels are both optional (not should_hide): cysh-136571, category 段考考試, score 60, age 15–30 days; cygsh-186696, category 升學, score 60, age 0–1 day. Both are explainable as category importance outweighing lower human importance; neither is teacher-only or known unavailable. Final should_hide leakage is zero.

### Generalizable date-primitive changes and measured effect
- Observed failure class: year-qualified date ranges on actionable registration notices were not being treated as temporal eligibility; prior output showed cysh-135952 (should_hide, 7/20–7/21 remediation registration) in Today after its dates had passed.
- Primitive change: generic date-range end extraction for titles with an explicit ROC/Gregorian year and registration/application/remediation cues; expired end dates now fail eligibility with an explainable temporal/eligibility reason. This is not title- or school-specific.
- Observed failure class: date-before-application text such as “2026年…9/30前自行完成線上申請” did not yield a deadline, leaving a must_show scholarship outside the display cutoff.
- Primitive change: parse month/day deadlines followed by application/registration language when the title explicitly supplies the year. No label or threshold was changed.
- Before date primitive changes (previous verified candidate): 20 displayed = 5 must_show, 12 useful, 2 optional, 1 should_hide; positive recall 31.5%, precision 85.0%, should_hide leakage 1.4%.
- After range-end handling: cysh-135952 is suppressed and cysh-136366 (useful) enters; counts become 5/13/2/0, positive recall 33.3%, precision 90.0%, leakage 0%.
- After date-before-deadline handling: cygsh-186451 (must_show, Sep 30 deadline) enters and cygsh-186713 (useful) is displaced by the school cap; counts become 6/12/2/0, positive recall remains 33.3%, must_show recall rises from 27.8% to 33.3%, useful recall falls from 36.1% to 33.3%, precision remains 90%, leakage remains zero.
- Human labels were not modified.

### Candidate threshold robustness (same final primitives)
| Threshold | Displayed | must_show | useful | Positive recall | Precision | Optional display | should_hide leakage |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 35 | 20 | 6/18 (33.3%) | 12/36 (33.3%) | 18/54 (33.3%) | 90.0% | 2/26 (7.7%) | 0/70 |
| 40 | 20 | 6/18 (33.3%) | 12/36 (33.3%) | 18/54 (33.3%) | 90.0% | 2/26 (7.7%) | 0/70 |
| 42 | 20 | 6/18 (33.3%) | 12/36 (33.3%) | 18/54 (33.3%) | 90.0% | 2/26 (7.7%) | 0/70 |
| 44 | 20 | 6/18 (33.3%) | 12/36 (33.3%) | 18/54 (33.3%) | 90.0% | 2/26 (7.7%) | 0/70 |
| 45 | 20 | 6/18 (33.3%) | 12/36 (33.3%) | 18/54 (33.3%) | 90.0% | 2/26 (7.7%) | 0/70 |
| 46 | 20 | 6/18 (33.3%) | 12/36 (33.3%) | 18/54 (33.3%) | 90.0% | 2/26 (7.7%) | 0/70 |
| 48 | 20 | 6/18 (33.3%) | 12/36 (33.3%) | 18/54 (33.3%) | 90.0% | 2/26 (7.7%) | 0/70 |
| 50 | 20 | 6/18 (33.3%) | 12/36 (33.3%) | 18/54 (33.3%) | 90.0% | 2/26 (7.7%) | 0/70 |
| 55 | 19 | 6/18 (33.3%) | 11/36 (30.6%) | 17/54 (31.5%) | 89.5% | 2/26 (7.7%) | 0/70 |

- Stable results from 35–50 are a top-10-per-school capacity plateau; they do not establish a uniquely optimal threshold. Threshold 55 removes one useful row; no cliff-like collapse near 45 was observed.

### Final candidate primitive specification (local and not frozen)
- Eligibility: exclude announcement_missing=true; lifecycle missing/archived/tombstoned; school mismatch unless all-school audience. Expired extracted/verifiable deadline or event end date is ineligible unless a verified valid_until still covers as_of.
- Suppression reasons: structured `announcement_unavailable`, `school_mismatch`, `deadline_passed`, `verified_date_passed`.
- Importance: category weights: 段考考試28; 升學22; 獎助學金22; 招生編班20; 競賽18; 社團12; 研習活動10; 榮譽榜8; 行政公告8; 一般6; unknown category 0. Action cue adds 12; importance multiplier=1.
- Audience: school match +20; explicit grade match +8; teacher_related=true adds -25 as a soft audience adjustment. The latter is not an importance label or hard suppression.
- Temporal: age <=7d +18; <=30d +12; <=90d +4; <=180d -10; >180d -20; unknown date -4 and confidence 0.65. Verified deadline/event within 0–3d +24, 4–7d +16; passed date is handled by eligibility.
- Missing metadata: unrecognized category gives 0 importance; no school match contribution when school is absent; missing date receives the -4 fallback. Threshold 45; maximum 10 displayed per school context.
- Today only. Query policy and Query `published` blocker remain unchanged/UNVERIFIED.

### Validation and freeze decision
- `node tests/test_relevance.js`: passed.
- `node tests/test_today.js`: passed.
- Development evaluator completed with raw confusion counts and subgroup output; `git diff --check`: passed.
- No title-specific/school-specific rule and no human-label edit.
- Freeze gate decision: **NOT READY TO FREEZE**. Main blocker is 12/18 must_show missed (6/18 recall), with 36/54 total positive FN; 13 positives are outside per-school top-10 and 23 are below threshold. The 0/6 teacher-related positive display outcome, score-aware development sample design, and some missing event-date recognition remain unresolved. The observed threshold plateau also means a threshold value is not independently justified by these metrics.
- Current ranking branch: `codex/today-relevance-ranking-v2`, local dirty candidate based on `ec7c1b3d0c22d1e95df694e44aeab56efb9dd9b6`; no ranking code commit SHA exists and policy is not frozen. Candidate code/tests/evaluator remain local on that branch.
- No new blind dataset was created. Blind scorer = NOT RUN. Production deployment, migration, DB edits, and main merge = NONE; Production impact = NONE.

### Next safe checkpoint
Continue development-only review of the 36 false negatives, especially audience signal treatment, category coverage and temporal/event-date representation. Preserve reviewed labels. Do not freeze unless the must_show miss pattern and teacher-related subgroup outcome have an adequate, explainable resolution. Do not create a blind dataset or run any blind scorer in this checkpoint.


### Full reviewed-150 candidate subgroup raw counts (threshold 45)
Label tuple order in the tables is must_show / useful / optional / should_hide. Each cell is `displayed / subgroup total`. Small groups are retained as raw counts; percentages from tiny strata should not be treated as precise.

| School | n | must_show | useful | optional | should_hide | Displayed |
|---|---:|---:|---:|---:|---:|---:|
| CYGSH | 75 | 2/10 | 6/22 | 1/6 | 0/37 | 10 |
| CYSH | 75 | 3/8 | 6/14 | 1/20 | 0/33 | 10 |

| Announcement age as of 2026-09-25 | n | must_show | useful | optional | should_hide | Displayed |
|---|---:|---:|---:|---:|---:|---:|
| 0–1 days | 9 | 1/2 | 3/6 | 1/1 | 0/0 | 5 |
| 2–3 days | 15 | 2/2 | 4/6 | 0/2 | 0/5 | 6 |
| 4–7 days | 10 | 2/3 | 4/6 | 0/0 | 0/1 | 6 |
| 8–14 days | 20 | 0/3 | 0/8 | 0/6 | 0/3 | 0 |
| 15–30 days | 30 | 1/7 | 1/5 | 1/4 | 0/14 | 3 |
| >30 days | 66 | 0/1 | 0/5 | 0/13 | 0/47 | 0 |
| missing date | 0 | 0/0 | 0/0 | 0/0 | 0/0 | 0 |

| Category | n | must_show | useful | optional | should_hide | Displayed |
|---|---:|---:|---:|---:|---:|---:|
| 一般 | 23 | 0/3 | 1/8 | 0/6 | 0/6 | 1 |
| 升學 | 25 | 2/4 | 4/5 | 1/4 | 0/12 | 7 |
| 招生編班 | 9 | 0/1 | 1/5 | 0/1 | 0/2 | 1 |
| 榮譽榜 | 7 | 0/0 | 0/0 | 0/5 | 0/2 | 0 |
| 段考考試 | 9 | 1/2 | 0/0 | 1/1 | 0/6 | 2 |
| 獎助學金 | 17 | 3/4 | 1/2 | 0/2 | 0/9 | 4 |
| 研習活動 | 12 | 0/1 | 0/5 | 0/2 | 0/4 | 0 |
| 社團 | 15 | 0/2 | 0/1 | 0/0 | 0/12 | 0 |
| 競賽 | 22 | 0/1 | 5/9 | 0/0 | 0/12 | 5 |
| 行政公告 | 11 | 0/0 | 0/1 | 0/5 | 0/5 | 0 |

| teacher_related | n | must_show | useful | optional | should_hide | Displayed |
|---|---:|---:|---:|---:|---:|---:|
| false | 128 | 6/17 | 12/31 | 2/21 | 0/59 | 20 |
| true | 22 | 0/1 | 0/5 | 0/5 | 0/11 | 0 |
| null/unknown | 0 | 0/0 | 0/0 | 0/0 | 0/0 | 0 |

| announcement_missing | n | must_show | useful | optional | should_hide | Displayed |
|---|---:|---:|---:|---:|---:|---:|
| false | 121 | 6/18 | 12/36 | 2/26 | 0/41 | 20 |
| true | 29 | 0/0 | 0/0 | 0/0 | 0/29 | 0 |
| null | 0 | 0/0 | 0/0 | 0/0 | 0/0 | 0 |

All subgroup counts above sum to the full 150-row reviewed development set. Category labels and teacher_related/announcement_missing flags remain independent fields.
