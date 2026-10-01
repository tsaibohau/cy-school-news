# Candidate v3.4 Stage 2 semantic policy

Evaluation date stays 2026-10-01; high-one student at the record's school; unread; interests absent; prior actions unknown. Wall-clock execution date never replaces evaluation date.

Stage 1 frozen sources, citations, extracted dates, audience, actionability, temporal state and historical/reference values remain unchanged. Read full frozen body and available attachment units as evidence, not titles alone. Missing/contradictory evidence stays uncertain. Human labels and audit case IDs are never inference inputs. Exact Work engine identity is unverified.

## Independent semantic dimensions

- current_applicability: active, upcoming, mixed, finished, undated, uncertain.
- direct_actionability: required_now, required_soon, available, none, expired, uncertain. Explain whose action and its scope; staff workflow is not automatically student duty.
- opportunity_availability: open, upcoming_available, closed, capacity_unknown, undated_unverified, none, uncertain. Eligibility and opportunity availability are separate.
- operational_reference_value: active_resource, active_rule, current_term_operation, none, historical_only, uncertain. Require source evidence of ongoing use/validity relevant to the persona; archival usefulness alone is insufficient.
- participant_continuation_value: plausible_future_process, confirmed_participant_process, none, uncertain. A future event plus substantive schedule/location/preparation/followup supports conditional relevance after registration closes. Unknown prior actions mean neither enrolled nor not enrolled. A closed opportunity without a continuing process receives no such promotion.
- audience_eligibility: broadly_applicable, niche_but_possible, strong_requirements_unknown, clearly_not_applicable, uncertain. Interest/skill/geography alone does not establish categorical ineligibility. Multiple restrictive membership, means-test, nomination or achievement conditions unknown to the persona must not be presumed satisfied. Known exclusions override general invitations.
- freshness_unread_priority: same_day, recent, stale, unknown. Deterministically derive age only from cited publication date; first_seen is not publication. Recent means age 0..5 inclusive. Freshness promotes an important current persona-relevant announcement, including plausible participant followup, independently of deadline. It does not promote unrelated results, clearly ineligible schemes or every dated optional item.
- important_current: model boolean with source-cited rationale; no title keyword/ID lookup. Significant current operations, meaningful opportunities, actionable changes and participant logistics may qualify; general publicity, voluntary opinion surveys and archival results need not.
- urgent_direct: model boolean with source-cited rationale. A real student duty within five days, relevant exam within seven days, urgent disruption/change or other explained urgency may qualify. Do not infer obligation merely from a future event date.
- residual_reference: boolean: useful reading/history that lacks current operational/opportunity/continuation significance.

Every dimension records cited evidence; uncertainty about persona eligibility is explicitly separate from confidence in interpreting the source. No private chain-of-thought is stored, only structured claims.

## Four labels and precedence

1. Clearly not applicable with no independently applicable component: should_hide. Do not override explicit identity exclusions using freshness or archival utility.
2. Strong restrictive eligibility unknown: optional, unless independent broad operational/duty value exists. Unknown does not mean false; retain the conditions.
3. Important current relevant content + unread supported publication age 0..5: must_show. Also must_show for supported urgent direct duty/disruption, without requiring all cases to have a <=5-day deadline.
4. Useful: active user-accessible institution resource; active rule applicable now; relevant current-term operational information; meaningful open opportunity/upcoming exploration accessible to the persona; or substantive plausible participant continuation while prior_actions is unknown. No declared interest is not a veto. Do not claim capacity or participation is confirmed.
5. Optional: residual/general educational or historical value, niche restricted opportunity under uncertain eligibility, optional opinion participation with no verified current window, or uncertain minor opportunity that has not established current value.
6. Should_hide: fully ended/no ongoing process and no reasonable Today value; explicit persona mismatch; expired-only action without applicable operations or continuation. information_only alone never decides the label.

Current operational relevance takes precedence over past initial deadlines. Registration expiry is not event expiry. Historical/post-expiry values are not Today-positive labels. An old publication may still carry active useful value.

## Development and validation boundary

Batch A human labels are exposed development pilot only. Audit model_error, human_policy_conflict and ambiguous separately. Preserve original reviews and v3.3 predictions. Do not optimize conflict cases or pursue 100% A agreement. No iterative weight/threshold search.

Freeze this policy and implementation hash before B inference. B inputs contain no human truth and no prior relevance label/reason. Produce one B inference pass; audit evidence and policy consistency; freeze output hash before B capability is enabled. After freeze, neither policy nor B predictions change until genuine B review/evaluation. B human result is validation; Round 2 HOLD.
