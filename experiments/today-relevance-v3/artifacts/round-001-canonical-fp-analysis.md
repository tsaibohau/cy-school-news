# Round 1 canonical FP analysis / Candidate v3 checkpoint

Date: 2026-09-30. Branch: codex/today-relevance-ranking-v3. Production impact: NONE.

## Gate and baseline identity

Read-only Training project sshovpnepgswzvjwjuyz, snapshot c7db661b-181a-4cd3-b869-b39f7edb3048. Verified original60/re-review13/adjudication5/canonical60/machine60. Canonical unique60, outside frozen manifest0. Canonical labels3/6/31/20; provenance47/8/5. Frozen run 47aa4ea2-9b74-4471-a44f-3edda89cf3ed, as_of2026-09-28. Prompt SHA256 00bbd2d060f8624a822b5a1beb95373c4437f93aed16f372a65b3edd8c72fecd, policy SHA256 d8b44936e2c27317044baa251ccd9141478b395b019564fbe01d56f71cef9913; exact archived files match run metadata hashes.

Confusion rows (machine columns must/useful/optional/hide): must=[1,2,0,0], useful=[0,6,0,0], optional=[0,8,19,4], hide=[0,6,5,9]. Precision9/23=39.1%; recall9/9=100%; FP14/FN0; hide leakage6/20. No scorer was executed on Round1.

**Important verified discrepancy:** frozen Round1 is a prompt-based baseline, weight_version=NULL, not deterministic v2 numeric scorer. Actual remote v2 HEAD is ec7c1b3d0c22d1e95df694e44aeab56efb9dd9b6 and remote docs/relevance.js has only profile relevance, no todayScore. Historical local v2 has frozenForBlindValidation=false. Therefore requested A “frozen numeric policy” cannot be reproduced on dev150: A below is explicitly archived numeric policy, not a fabricated frozen result. No edits to v2 branch or docs/ entrypoints.

## FP patterns

Group A6: missing confirmed by both humans5/6; one closed deadline6 days before evaluation. Frozen observations:404 four, timeout one, reachable/title-only one. All six machine temporal=uncertain. Two 404 rows claim source_available despite fetch_failed; other 404 rows downgrade to uncertainty. Availability exists as an independent prediction field, but there is no enforced eligibility gate in the frozen prompt execution. Not a measurable “penalty too low” diagnosis: no numeric weights existed. Confidence0.54–0.67 did not change useful labels.

Group B8: human low urgency/reference/specific audience rather than missing. Four machine temporal unclear, four active. Three machine long_lived=true; all8 machine exact dates absent. Ongoing validity, rights/admissions categories or action words were used as relevance proxies without a concrete today/action/user requirement. Canonical adjudication affects only cysh-136634 in this FP group; do not replace original fields with final fields silently.

Reason comparison: temporal_unclear9/14 FP; teacher_primary4/14; machine source_uncertain3/14, yet positive all14. Human not_urgent appears4/8 optional; reference evidence3+ long-lived4/8. Action_required occurs in several human optional rows too: action_required alone is not a positive ground truth. Reasons are descriptive signals, not causal weight attributions.

## Actual primitives and failure boundaries

1. **Availability:** frozen prompt explicitly says confirmed broken/missing => hide, but does not impose a mechanical cross-field consistency constraint. 404-to-available contradictions are extraction/mapping failure evidence. Archived numeric v2 excludes only announcement_missing===true or lifecycle missing/archived/tombstoned; it ignores HTTP, content_availability, source status and observation age. Unknown source is neutral except prompt confidence. New isolated adapter maps404/410/confirmed_missing to eligibility and preserves timeouts as uncertainty. Stale cache cannot be assessed without timestamp/freshness provenance, so no hard stale-cache rule is claimed verified.
2. **Temporal:** prompt requires closed/expired hide but all6 leakage temporal uncertain; uncertain is not urgent yet useful was retained. Numeric v2 only consumes verified exact deadline/event and narrow title parsers, not temporal_status. deadline||event means passed signup can suppress an independently future event; dateValue accepts normalized invalid dates; regex selects the first date in title rather than always binding to the action. Candidate adds strict dates and cue-linked year-qualified observations, allows separately supported future action, and does not award unknown a bonus. Full parser replacement, application start/end, precision spans and attachment evidence remain unresolved, not silently treated as verified.
3. **Age × long-lived:** archived numeric policy substitutes first_seen for publication, clamps future dates to age0 and has no long-lived interaction. first_seen is discovery, not publication recency. Candidate E removes false publication freshness on missing publication, separates reference-without-action from Today, retains old items with explicit future action rather than blanket old suppression. Existing weights reused, no +5/-10 tuning. This correction has serious dev recall loss; not accepted/frozen. Age31–90 missing-publication cannot be classified as age31–90; JSON carries both null publication age and discovery age. Valid reference stays searchable; Query unchanged.
4. **Audience:** profile scorer audience extraction detects grades/classes/all_school but not teacher/niche/participant. Archived v2 teacher_related=true applies universal-25 including mixed student+teacher. Candidate extraction returns who-is-affected separately; policy excludes only explicit teacher-only for explicit student role, not teacher_related globally. Unknown role never inherits student suppression; teacher mode is tested. Student cue in a teacher-training title can be misleading; body/audience role extraction remains incomplete. No niche blanket suppression and no human affected audience input.
5. **Priority:** stable cysh-136717 human event10/1, frozen machine event_upcoming but event_date null; cysh-136735 machine temporal_unclear and no dates. Both remain positive; urgency/date extraction is the primitive gap. Grade-specific impact alone is not urgency. event<=7 / deadline<=4–5 need correct date type; generic promotion, emergency, exam and action requirements need coverage. Unread/latest is per-user and absent here; never convert first_seen into global urgency. No announcement-ID rules.
6. **Content quality:** cysh-136634/136689/136717/136735 “complete” extracts are duplicated title/controls, not substantive body. HTTP200 and extractor complete != sufficient evidence. Necessary attachments were not opened; don't invent hidden dates. This is a critical independent evidence-quality primitive gap.

## Development integrity and evaluation contract

Correct artifact: 01-manual-ranking-label-view-2026-09-26-reviewed.json; SHA256 ef9e17463360b34cc804753ba31cf9877289a6052966dd59b1fae75352a7a542; rows150/unique150/labels18,36,26,70; 22 teacher flags and29 missing flags. The per-record reviewed boolean is true only46, but human_label is filled150 and user checkpoint authoritative; preserve bytes unchanged, do not filter46. Labels are outcome-only; human teacher/missing flags withheld from primary scorer. Objective title/category/school/date fields are allowlisted. No Round1 input in evaluate.cjs. as_of9/25;75/school; student role, grade unknown; threshold45 and top10/school unchanged. Sampling was score-aware, not representative of production prevalence. These are displayed positive retrieval metrics, NOT four-class recall or comparable to Round1 useful classification.

Historical v2 replay admitting human flags:20 displayed,6must/12useful/2optional/0hide; P90%, R33.3%, must R33.3%, useful R33.3%. A primary objective-only replay:20,7/10/2/1; P85%, R31.5%. Difference is human-derived flags, not a changed model.

## Ablations (predefined, no weight/threshold search)

A archived numeric baseline; B availability; C temporal; D audience; E age×long-lived; F availability+temporal; G all corrections. A does not mean frozen prompt replay.

| 實驗 | 顯示 | Positive P | Positive R | must R | useful R | hide leakage | optional leakage | ΔP / ΔR / Δ顯示 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| A | 20 | 85.0% | 31.5% | 38.9% | 27.8% | 1.4% | 7.7% | 0.0pp / 0.0pp / 0 |
| B | 20 | 85.0% | 31.5% | 38.9% | 27.8% | 1.4% | 7.7% | 0.0pp / 0.0pp / 0 |
| C | 20 | 85.0% | 31.5% | 38.9% | 27.8% | 1.4% | 7.7% | 0.0pp / 0.0pp / 0 |
| D | 20 | 90.0% | 33.3% | 38.9% | 30.6% | 0.0% | 7.7% | 5.0pp / 1.9pp / 0 |
| E | 13 | 92.3% | 22.2% | 38.9% | 13.9% | 0.0% | 3.8% | 7.3pp / -9.3pp / -7 |
| F | 20 | 85.0% | 31.5% | 38.9% | 27.8% | 1.4% | 7.7% | 0.0pp / 0.0pp / 0 |
| G | 13 | 92.3% | 22.2% | 38.9% | 13.9% | 0.0% | 3.8% | 7.3pp / -9.3pp / -7 |

All raw counts, all metrics' deltas and per-ID scores/exclusion reasons are in development-150-ablation.json. Availability observations=0 and content bodies=0 in dev artifact; B=no-op is an absent-signal result, NOT evidence availability suppression has no value. Oracle diagnostic separately injects29 human missing flags: no change in top10 metrics (those rows already outside top10); not a deployable result or a claim of predictive skill. Temporal C changes below-cap eligibility but no top10 metrics; top-k can mask primitive effects.

Combined G:13 displayed7must/5useful/1optional/0hide; P92.3%, R22.2%, must R38.9%, useful R13.9%. Compared A: P+7.3pp, R-9.3pp, useful R-13.9pp, hide leakage-1.4pp, optional leakage-3.8pp, displayed-7. This loses5 true positives; does NOT justify freeze. D-only improves precision to90%, R33.3%, no must drop, but isn't selected as successful Candidate based on Round1 and cannot validate availability corrections.

## Decision and next allowed checkpoint

**Candidate v3 = NOT FROZEN.** Prototype and reproducible ablations saved, not deployed or connected to official Today/Query. Reasons: G useful recall halves; objective source/content evidence absent on dev150; no frozen numerical v2 artifact; date and semantic body quality gaps remain. Do not tune until these primitive gaps are resolved on development evidence; do not fabricate missing observations from human flags. Future fresh blind validation is required only after a defensible freeze; no Round2 created. Round1 stays diagnostic, no retrospective scorer rerun, no tuning loop or success/generalization claim.

All frozen evidence before/after full-row hashes are audited; no database writes, schema/RLS changes, model weight/threshold changes, main merge, Production deployment/migration. Only isolated experiment feature/policy code changes. Human batch maximum15, one at a time; no batch created this turn.

## Per-record evidence

### B: cygsh-146037 — 特殊選才持續放榜中

放榜結果／低急迫性；正文只有36字標題導覽，machine admission_impact + temporal_unclear → useful，human not_urgent。

- School=cygsh; published=unknown; age_days=unknown; first_seen_age=49（不是 publication age）。
- category=升學; source_category=校園活動; source=https://www.cygsh.cy.edu.tw/p/406-1013-146037,r786.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=complete, HTTP=200, body_chars=36。
- Machine=useful; confidence=0.57; availability=source_available; missing=false; temporal=uncertain; reasons=admission_impact, temporal_unclear, audience_unclear。
- Canonical=optional; provenance=original_review。
- Original human evidence: {"human_label":"optional","human_notes":"","human_reasons":["not_urgent"],"human_event_date":null,"human_availability":"source_available","human_deadline_date":null,"human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":[],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_reviewed_fields":["human_label","human_affected_audience","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_long_lived_information","human_post_expiry_reference_value"],"human_teacher_related":"false","human_temporal_status":"uncertain","human_audience_reasons":[],"human_regulatory_basis":"no","human_temporal_reasons":[],"human_affected_audience":["all_students"],"human_announcement_type":"result","human_application_start":null,"human_importance_reasons":["not_urgent"],"human_post_expiry_reasons":[],"human_announcement_missing":false,"human_availability_reasons":[],"human_long_lived_information":true,"human_post_expiry_reference_value":"yes"}
- Re-review evidence: null
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[],"long_lived":false,"post_expiry_reference":"yes"}

### B: cygsh-174287 — 【漏洞預警】ASUS RT-AX55無線路由器存在安全漏洞(CVE-2023-39780)，請儘速確認並進行修補

漏洞修補有 action，但受影響設備／使用者未辨識；非所有學生當日需採取行動。CVE年份不是公告日期。human action_required 不代表 must/useful。

- School=cygsh; published=unknown; age_days=unknown; first_seen_age=48（不是 publication age）。
- category=一般; source_category=資訊安全訊息; source=https://www.cygsh.cy.edu.tw/p/406-1013-174287,r742.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=complete, HTTP=200, body_chars=183。
- Machine=useful; confidence=0.68; availability=source_available; missing=false; temporal=uncertain; reasons=rights_impact, old_but_valid, temporal_unclear, teacher_primary。
- Canonical=optional; provenance=original_review。
- Original human evidence: {"human_label":"optional","human_notes":"","human_reasons":["action_required"],"human_event_date":null,"human_availability":"source_available","human_deadline_date":null,"human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":["action_required"],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_reviewed_fields":["human_label","human_affected_audience","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_long_lived_information","human_post_expiry_reference_value"],"human_teacher_related":"true","human_temporal_status":"uncertain","human_audience_reasons":[],"human_regulatory_basis":"no","human_temporal_reasons":[],"human_affected_audience":["all_students","teacher"],"human_announcement_type":"notice","human_application_start":null,"human_importance_reasons":[],"human_post_expiry_reasons":[],"human_announcement_missing":false,"human_availability_reasons":[],"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Re-review evidence: null
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[],"long_lived":false,"post_expiry_reference":"yes"}

### B: cygsh-184378 — 【公告】德明科技大學提供其夥伴高中學校免費試用udn讀書館電子書庫一年期

2026全年電子書試用仍有效，但 human niche/participant/not_urgent；old_but_valid / long_lived 是 validity，不等於 Today urgency。

- School=cygsh; published=2026-01-01; age_days=270; first_seen_age=48（不是 publication age）。
- category=一般; source_category=圖書館公告; source=https://www.cygsh.cy.edu.tw/p/406-1013-184378,r1177.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=complete, HTTP=200, body_chars=221。
- Machine=useful; confidence=0.9; availability=source_available; missing=false; temporal=active; reasons=old_but_valid, long_lived, broad_student_relevance。
- Canonical=optional; provenance=original_review。
- Original human evidence: {"human_label":"optional","human_notes":"","human_reasons":["participant_specific","niche_audience","not_urgent"],"human_event_date":"2026-12-31","human_availability":"source_available","human_deadline_date":"2026-01-01","human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":[],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":"2026-12-31","human_effective_until":null,"human_reviewed_fields":["human_label","human_affected_audience","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_deadline_date","human_event_date","human_application_start","human_application_end","human_long_lived_information","human_post_expiry_reference_value"],"human_teacher_related":"uncertain","human_temporal_status":"active","human_audience_reasons":["participant_specific","niche_audience"],"human_regulatory_basis":"no","human_temporal_reasons":[],"human_affected_audience":["all_students"],"human_announcement_type":"notice","human_application_start":"2026-01-01","human_importance_reasons":["not_urgent"],"human_post_expiry_reasons":[],"human_announcement_missing":false,"human_availability_reasons":[],"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Re-review evidence: null
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":"2026-12-31","spans":[{"end":{"value":"2026-12-31","precision":"day"},"kind":"ebook_trial","start":{"value":"2026-01-01","precision":"day"}}],"long_lived":false,"post_expiry_reference":"yes"}

### B: cygsh-186262 — 【轉知】【115學年度高中人才培育計畫】全台各校簡章/報名時間/考試科目彙整

人才培育簡章連結彙整，machine admission_impact；human old_but_valid/historical_reference。沒有當前可執行日期，應區分資訊索引與當期申請。

- School=cygsh; published=unknown; age_days=unknown; first_seen_age=45（不是 publication age）。
- category=招生編班; source_category=最新消息; source=https://www.cygsh.cy.edu.tw/p/406-1013-186262,r508.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=complete, HTTP=200, body_chars=842。
- Machine=useful; confidence=0.74; availability=source_available; missing=false; temporal=uncertain; reasons=admission_impact, temporal_unclear, participant_specific。
- Canonical=optional; provenance=original_review。
- Original human evidence: {"human_label":"optional","human_notes":"","human_reasons":["old_but_valid","historical_reference"],"human_event_date":null,"human_availability":"source_available","human_deadline_date":null,"human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":[],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_reviewed_fields":["human_label","human_affected_audience","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_long_lived_information","human_post_expiry_reference_value"],"human_teacher_related":"true","human_temporal_status":"uncertain","human_audience_reasons":[],"human_regulatory_basis":"no","human_temporal_reasons":["old_but_valid"],"human_affected_audience":["all_students"],"human_announcement_type":"other","human_application_start":null,"human_importance_reasons":[],"human_post_expiry_reasons":["historical_reference"],"human_announcement_missing":false,"human_availability_reasons":[],"human_long_lived_information":true,"human_post_expiry_reference_value":"yes"}
- Re-review evidence: null
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[],"long_lived":false,"post_expiry_reference":"yes"}

### B: cygsh-186317 — 【轉知】嘉義市政府辦理「運動部全民運動署推廣與辦理兒童及少年運動教學安全保障機制計畫」

教練專業課程、10/31場次；human optional/not_urgent/niche，machine upcoming/teacher/action。Who/when不是廣泛今日重要性的充分條件。

- School=cygsh; published=unknown; age_days=unknown; first_seen_age=37（不是 publication age）。
- category=一般; source_category=藝能科; source=https://www.cygsh.cy.edu.tw/p/406-1013-186317,r677.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=complete, HTTP=200, body_chars=474。
- Machine=useful; confidence=0.76; availability=source_available; missing=false; temporal=active; reasons=event_upcoming, teacher_primary, action_required。
- Canonical=optional; provenance=original_review。
- Original human evidence: {"human_label":"optional","human_notes":"","human_reasons":["niche_audience","registration_required","not_urgent"],"human_event_date":null,"human_availability":"source_available","human_deadline_date":"2026-10-31","human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":["registration_required"],"human_machine_review":{},"human_temporal_spans":[{"end_month":"2026-10","start_month":"2026-09"}],"human_application_end":"2026-10-31","human_effective_until":null,"human_reviewed_fields":["human_affected_audience","human_label","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_deadline_date","human_event_date","human_application_start","human_application_end","human_long_lived_information","human_post_expiry_reference_value","human_temporal_spans"],"human_teacher_related":"uncertain","human_temporal_status":"active","human_audience_reasons":["niche_audience"],"human_regulatory_basis":"yes","human_temporal_reasons":[],"human_affected_audience":["all_students"],"human_announcement_type":"application","human_application_start":"2026-09-05","human_importance_reasons":["not_urgent"],"human_post_expiry_reasons":[],"human_announcement_missing":false,"human_availability_reasons":[],"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Re-review evidence: null
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[{"end":{"value":"2026-10-31","precision":"day"},"kind":"session","start":{"value":"2026-10-31","precision":"day"}}],"long_lived":false,"post_expiry_reference":"no"}

### B: cysh-133890 — 教育部性別平等教育委員會受理學生提案流程

長期提案流程；human rules/reference/not_urgent，machine rights/action/long_lived。流程存在不等於今天有個人待辦。

- School=cysh; published=2025-12-11; age_days=291; first_seen_age=47（不是 publication age）。
- category=一般; source_category=校園訊息; source=https://www.cysh.cy.edu.tw/p/406-1008-133890,r12.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=complete, HTTP=200, body_chars=164。
- Machine=useful; confidence=0.73; availability=source_available; missing=false; temporal=active; reasons=long_lived, rules_still_relevant, rights_impact, action_required。
- Canonical=optional; provenance=original_review。
- Original human evidence: {"human_label":"optional","human_notes":"","human_reasons":["niche_audience","not_urgent","rules_still_relevant","historical_reference"],"human_event_date":null,"human_availability":"source_available","human_deadline_date":null,"human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":[],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_reviewed_fields":["human_label","human_affected_audience","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_long_lived_information","human_post_expiry_reference_value"],"human_teacher_related":"true","human_temporal_status":"uncertain","human_audience_reasons":["niche_audience"],"human_regulatory_basis":"no","human_temporal_reasons":[],"human_affected_audience":["all_students","teacher"],"human_announcement_type":"regulation","human_application_start":null,"human_importance_reasons":["not_urgent"],"human_post_expiry_reasons":["rules_still_relevant","historical_reference"],"human_announcement_missing":false,"human_availability_reasons":[],"human_long_lived_information":true,"human_post_expiry_reference_value":"yes"}
- Re-review evidence: null
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[],"long_lived":true,"post_expiry_reference":"yes"}

### B: cysh-134074 — 中小學使用「生成式人工智慧」注意事項2.0

AI使用規範、教師與學生附件；human reference/long_lived。machine broad+rules → useful，欠缺 near-term action。

- School=cysh; published=2026-01-05; age_days=266; first_seen_age=48（不是 publication age）。
- category=一般; source_category=使用規範; source=https://www.cysh.cy.edu.tw/p/406-1008-134074,r31.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=complete, HTTP=200, body_chars=179。
- Machine=useful; confidence=0.69; availability=source_available; missing=false; temporal=active; reasons=long_lived, rules_still_relevant, broad_student_relevance。
- Canonical=optional; provenance=original_review。
- Original human evidence: {"human_label":"optional","human_notes":"","human_reasons":["action_required"],"human_event_date":null,"human_availability":"source_available","human_deadline_date":null,"human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":["action_required"],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_reviewed_fields":["human_label","human_affected_audience","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_long_lived_information","human_post_expiry_reference_value"],"human_teacher_related":"uncertain","human_temporal_status":"uncertain","human_audience_reasons":[],"human_regulatory_basis":"yes","human_temporal_reasons":[],"human_affected_audience":["all_students"],"human_announcement_type":"regulation","human_application_start":null,"human_importance_reasons":[],"human_post_expiry_reasons":[],"human_announcement_missing":false,"human_availability_reasons":[],"human_long_lived_information":true,"human_post_expiry_reference_value":"yes"}
- Re-review evidence: null
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[],"long_lived":true,"post_expiry_reference":"yes"}

### B: cysh-136634 — 社團博覽會暨社團選填志願通知(含社團簡介、選填操作流程)

最終 adjudicated optional；Human A must、B optional。Final rationale 指9/30社博已結束但選填未到，deadline10/12。保留所有時間差異，不倒灌最終日期到 frozen machine。

- School=cysh; published=2026-09-21; age_days=7; first_seen_age=7（不是 publication age）。
- category=升學; source_category=校園訊息; source=https://www.cysh.cy.edu.tw/p/406-1008-136634,r12.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=complete, HTTP=200, body_chars=99。
- Machine=useful; confidence=0.76; availability=source_available; missing=false; temporal=uncertain; reasons=action_required, broad_student_relevance, temporal_unclear。
- Canonical=optional; provenance=adjudicated。
- Original human evidence: {"human_label":"must_show","human_notes":"","human_reasons":["action_required","event_upcoming","rules_still_relevant","historical_reference"],"human_event_date":null,"human_availability":"source_available","human_deadline_date":null,"human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":["action_required"],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":"2026-10-12","human_effective_until":"2026-10-12","human_reviewed_fields":["human_label","human_affected_audience","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_effective_until","human_application_start","human_application_end","human_temporal_spans","human_long_lived_information","human_post_expiry_reference_value"],"human_teacher_related":"false","human_temporal_status":"not_started","human_audience_reasons":[],"human_regulatory_basis":"yes","human_temporal_reasons":["event_upcoming"],"human_affected_audience":["all_students"],"human_announcement_type":"notice","human_application_start":"2026-10-05","human_importance_reasons":[],"human_post_expiry_reasons":["rules_still_relevant","historical_reference"],"human_announcement_missing":false,"human_availability_reasons":[],"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Re-review evidence: {"human_label":"optional","human_notes":"","human_reasons":["action_required","registration_required"],"human_event_date":null,"human_availability":"source_available","human_deadline_date":"2026-10-12","human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_teacher_related":"false","human_temporal_status":"active","human_regulatory_basis":"no","human_affected_audience":["all_students"],"human_announcement_type":"application","human_application_start":null,"human_announcement_missing":false,"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Adjudication evidence: {"final_label":"optional","final_notes":"","final_reasons":["action_required","event_upcoming"],"final_event_date":null,"final_deadline_date":"2026-10-12","final_application_end":null,"final_effective_until":null,"final_temporal_status":"active","adjudication_rationale":"今天9/30的社博結束，但選填的時間還沒到","final_affected_audience":["all_students"],"final_application_start":null}
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[],"long_lived":false,"post_expiry_reference":"no"}

### A: cygsh-185508 — 【轉知】國立屏東科技大學115學年度四技進修部單獨招生訊息

人工兩次確認 missing；frozen source 只有 SSL timeout，不能把 timeout 自動等同不存在。machine source_uncertain 但 useful：uncertainty 沒有阻止 Today positive。

- School=cygsh; published=unknown; age_days=unknown; first_seen_age=48（不是 publication age）。
- category=招生編班; source_category=教務處公告; source=https://www.cygsh.cy.edu.tw/p/406-1013-185508,r817.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=source_check_failed, HTTP=none, body_chars=0。
- Machine=useful; confidence=0.57; availability=source_uncertain; missing=uncertain; temporal=uncertain; reasons=admission_impact, source_uncertain, insufficient_source, temporal_unclear。
- Canonical=should_hide; provenance=rereview_agreement。
- Original human evidence: {"human_label":"should_hide","human_notes":"","human_reasons":["announcement_missing","grade_specific"],"human_event_date":null,"human_availability":"announcement_missing","human_deadline_date":null,"human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":[],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_reviewed_fields":["human_label","human_teacher_related","human_affected_audience","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_long_lived_information","human_post_expiry_reference_value"],"human_teacher_related":"false","human_temporal_status":"uncertain","human_audience_reasons":["grade_specific"],"human_regulatory_basis":"no","human_temporal_reasons":[],"human_affected_audience":["grade_3"],"human_announcement_type":"application","human_application_start":null,"human_importance_reasons":[],"human_post_expiry_reasons":[],"human_announcement_missing":true,"human_availability_reasons":["announcement_missing"],"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Re-review evidence: {"human_label":"should_hide","human_notes":"","human_reasons":["announcement_missing"],"human_event_date":null,"human_availability":"announcement_missing","human_deadline_date":null,"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_teacher_related":"false","human_temporal_status":"closed","human_regulatory_basis":"no","human_affected_audience":["grade_3"],"human_announcement_type":"notice","human_application_start":null,"human_announcement_missing":true,"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[],"long_lived":false,"post_expiry_reference":"uncertain"}

### A: cygsh-186006 — 【轉知】嘉義縣立永慶高級中學函轉「提升自信表達力－面試實戰技巧」工作坊，歡迎有興趣的同學報名參加。

執行前 HTTP 404；prediction metadata fetch_failed，卻 source_available / missing=false。availability 內部矛盾且仍 useful。

- School=cygsh; published=unknown; age_days=unknown; first_seen_age=49（不是 publication age）。
- category=升學; source_category=研習活動; source=https://www.cygsh.cy.edu.tw/p/406-1013-186006,r508.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=source_check_failed, HTTP=404, body_chars=0。
- Machine=useful; confidence=0.55; availability=source_available; missing=false; temporal=uncertain; reasons=admission_impact, temporal_unclear, participant_specific。
- Canonical=should_hide; provenance=rereview_agreement。
- Original human evidence: {"human_label":"should_hide","human_notes":"","human_reasons":["announcement_missing"],"human_event_date":null,"human_availability":"announcement_missing","human_deadline_date":null,"human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":[],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_reviewed_fields":["human_label","human_affected_audience","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_long_lived_information","human_post_expiry_reference_value"],"human_teacher_related":"true","human_temporal_status":"uncertain","human_audience_reasons":[],"human_regulatory_basis":"no","human_temporal_reasons":[],"human_affected_audience":["all_students"],"human_announcement_type":"application","human_application_start":null,"human_importance_reasons":[],"human_post_expiry_reasons":[],"human_announcement_missing":true,"human_availability_reasons":["announcement_missing"],"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Re-review evidence: {"human_label":"should_hide","human_notes":"","human_reasons":["niche_audience","announcement_missing"],"human_event_date":null,"human_availability":"announcement_missing","human_deadline_date":null,"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_teacher_related":"false","human_temporal_status":"closed","human_regulatory_basis":"no","human_affected_audience":["all_students"],"human_announcement_type":"notice","human_application_start":null,"human_announcement_missing":true,"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[],"long_lived":false,"post_expiry_reference":"uncertain"}

### A: cygsh-186059 — 【轉知】衛生福利部辦理「115年性暴力防治專業人員刑法教 育訓練」簡章1份

同樣 HTTP 404 → fetch_failed，卻 source_available / missing=false；teacher/rights impact 不能越過來源失效。

- School=cygsh; published=unknown; age_days=unknown; first_seen_age=49（不是 publication age）。
- category=招生編班; source_category=學務處公告; source=https://www.cygsh.cy.edu.tw/p/406-1013-186059,r508.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=source_check_failed, HTTP=404, body_chars=0。
- Machine=useful; confidence=0.58; availability=source_available; missing=false; temporal=uncertain; reasons=teacher_primary, temporal_unclear, rights_impact。
- Canonical=should_hide; provenance=rereview_agreement。
- Original human evidence: {"human_label":"should_hide","human_notes":"","human_reasons":["announcement_missing"],"human_event_date":null,"human_availability":"announcement_missing","human_deadline_date":null,"human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":[],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_reviewed_fields":["human_label","human_affected_audience","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_long_lived_information","human_post_expiry_reference_value"],"human_teacher_related":"uncertain","human_temporal_status":"uncertain","human_audience_reasons":[],"human_regulatory_basis":"no","human_temporal_reasons":[],"human_affected_audience":["all_students"],"human_announcement_type":"application","human_application_start":null,"human_importance_reasons":[],"human_post_expiry_reasons":[],"human_announcement_missing":true,"human_availability_reasons":["announcement_missing"],"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Re-review evidence: {"human_label":"should_hide","human_notes":"","human_reasons":["announcement_missing"],"human_event_date":null,"human_availability":"announcement_missing","human_deadline_date":null,"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_teacher_related":"false","human_temporal_status":"expired","human_regulatory_basis":"no","human_affected_audience":["teacher"],"human_announcement_type":"notice","human_application_start":null,"human_announcement_missing":true,"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[],"long_lived":false,"post_expiry_reference":"uncertain"}

### A: cygsh-186201 — 【教師研習】115年國中教育會考命題研習會

HTTP 404 被弱化為 source_uncertain；teacher_primary + useful，不是 numeric penalty 太低（本 run 沒有 weights）。

- School=cygsh; published=unknown; age_days=unknown; first_seen_age=48（不是 publication age）。
- category=段考考試; source_category=研習活動; source=https://www.cygsh.cy.edu.tw/p/406-1013-186201,r548.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=source_check_failed, HTTP=404, body_chars=0。
- Machine=useful; confidence=0.54; availability=source_uncertain; missing=uncertain; temporal=uncertain; reasons=teacher_primary, source_uncertain, insufficient_source。
- Canonical=should_hide; provenance=rereview_agreement。
- Original human evidence: {"human_label":"should_hide","human_notes":"","human_reasons":["announcement_missing","link_invalid"],"human_event_date":null,"human_availability":"announcement_missing","human_deadline_date":null,"human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":[],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_reviewed_fields":["human_label","human_affected_audience","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_long_lived_information","human_post_expiry_reference_value"],"human_teacher_related":"true","human_temporal_status":"expired","human_audience_reasons":[],"human_regulatory_basis":"no","human_temporal_reasons":[],"human_affected_audience":["teacher"],"human_announcement_type":"notice","human_application_start":null,"human_importance_reasons":[],"human_post_expiry_reasons":[],"human_announcement_missing":true,"human_availability_reasons":["announcement_missing","link_invalid"],"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Re-review evidence: {"human_label":"should_hide","human_notes":"","human_reasons":["announcement_missing"],"human_event_date":null,"human_availability":"announcement_missing","human_deadline_date":null,"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_teacher_related":"true","human_temporal_status":"closed","human_regulatory_basis":"no","human_affected_audience":["all_students"],"human_announcement_type":"notice","human_application_start":null,"human_announcement_missing":true,"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[],"long_lived":false,"post_expiry_reference":"uncertain"}

### A: cygsh-186306 — 【轉知】2026第23屆民雄文教盃全國音樂比賽

HTTP 404 + temporal_unclear；兩次 human label hide、missing=true。每年活動的參考價值不能復活不存在的當期公告。

- School=cygsh; published=2026-08-12; age_days=47; first_seen_age=39（不是 publication age）。
- category=競賽; source_category=最新消息; source=https://www.cygsh.cy.edu.tw/p/406-1013-186306,r508.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=source_check_failed, HTTP=404, body_chars=0。
- Machine=useful; confidence=0.63; availability=source_uncertain; missing=uncertain; temporal=uncertain; reasons=general_activity, temporal_unclear, source_uncertain。
- Canonical=should_hide; provenance=rereview_agreement。
- Original human evidence: {"human_label":"should_hide","human_notes":"民雄盃每年都有，但是公告已經不存在所以不列入有用","human_reasons":["niche_audience","participant_specific","deadline_passed"],"human_event_date":null,"human_availability":"announcement_missing","human_deadline_date":null,"human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":[],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_reviewed_fields":["human_label","human_affected_audience","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_long_lived_information","human_post_expiry_reference_value","human_notes"],"human_teacher_related":"false","human_temporal_status":"closed","human_audience_reasons":["niche_audience","participant_specific"],"human_regulatory_basis":"no","human_temporal_reasons":["deadline_passed"],"human_affected_audience":["all_students"],"human_announcement_type":"event","human_application_start":null,"human_importance_reasons":[],"human_post_expiry_reasons":[],"human_announcement_missing":true,"human_availability_reasons":[],"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Re-review evidence: {"human_label":"should_hide","human_notes":"那是一個每年都有的活動，但公告已經不見，如果有找到相同的活動並且公告存在可以將其辦法列入參考（但日期不會相同可以抓大概）","human_reasons":["niche_audience","registration_required"],"human_event_date":null,"human_availability":"announcement_missing","human_deadline_date":null,"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_teacher_related":"false","human_temporal_status":"closed","human_regulatory_basis":"no","human_affected_audience":["all_students"],"human_announcement_type":"application","human_application_start":null,"human_announcement_missing":true,"human_long_lived_information":false,"human_post_expiry_reference_value":"yes"}
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[],"long_lived":false,"post_expiry_reference":"uncertain"}

### A: cysh-136689 — 轉知115年度數位/網路性別暴力防治短影音暨海報繪畫比賽

Human deadline=2026-09-22，兩次 closed；machine exact dates 全空。HTML complete 只有重複標題／字體控制，不能當實質正文完整。

- School=cysh; published=2026-09-21; age_days=7; first_seen_age=7（不是 publication age）。
- category=競賽; source_category=宣導事項; source=https://www.cysh.cy.edu.tw/p/406-1008-136689,r21.php。
- Snapshot content=metadata_only, source=not_checked; frozen observation=complete, HTTP=200, body_chars=99。
- Machine=useful; confidence=0.67; availability=source_available; missing=false; temporal=uncertain; reasons=general_activity, temporal_unclear, participant_specific。
- Canonical=should_hide; provenance=rereview_agreement。
- Original human evidence: {"human_label":"should_hide","human_notes":"","human_reasons":["action_required","niche_audience"],"human_event_date":null,"human_availability":"source_available","human_deadline_date":"2026-09-22","human_reason_review":{"added":[],"rejected":[],"confirmed":[]},"human_action_reasons":["action_required"],"human_machine_review":{},"human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_reviewed_fields":["human_label","human_affected_audience","human_teacher_related","human_announcement_type","human_regulatory_basis","human_temporal_status","human_availability","human_announcement_missing","reason_chips","human_deadline_date","human_long_lived_information","human_post_expiry_reference_value"],"human_teacher_related":"true","human_temporal_status":"closed","human_audience_reasons":["niche_audience"],"human_regulatory_basis":"no","human_temporal_reasons":[],"human_affected_audience":["all_students"],"human_announcement_type":"event","human_application_start":null,"human_importance_reasons":[],"human_post_expiry_reasons":[],"human_announcement_missing":false,"human_availability_reasons":[],"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Re-review evidence: {"human_label":"should_hide","human_notes":"","human_reasons":["event_passed"],"human_event_date":null,"human_availability":"source_available","human_deadline_date":"2026-09-22","human_temporal_spans":[],"human_application_end":null,"human_effective_until":null,"human_teacher_related":"false","human_temporal_status":"closed","human_regulatory_basis":"no","human_affected_audience":["all_students"],"human_announcement_type":"event","human_application_start":null,"human_announcement_missing":false,"human_long_lived_information":false,"human_post_expiry_reference_value":"no"}
- Adjudication evidence: null
- Machine dates/spans: {"deadline":null,"event":null,"application_start":null,"application_end":null,"effective_until":null,"spans":[],"long_lived":false,"post_expiry_reference":"no"}

