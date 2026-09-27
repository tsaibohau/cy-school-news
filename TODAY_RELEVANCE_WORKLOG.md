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
