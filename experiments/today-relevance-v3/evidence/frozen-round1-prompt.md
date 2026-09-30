# Round 1 baseline prompt — frozen v1

This prompt defines a machine-only baseline for the 60-record `round_001` validation queue. It is not a training prompt for human labels. Do not write any `human_*` fields.

## Evidence

For each record, judge using its title, source metadata, `as_of`, captured official page body when available, and attachment names/links. Open or extract an attachment only when the decision depends on information not present in the page body. Record unavailable or failed evidence as such; never infer its contents. If the page body is unavailable, do not say it was read. If a necessary attachment is not inspected, leave dependent dates and fields uncertain.

Use only the evidence provided for the record. Use the explicit `as_of` date. An old publication date does not by itself make an announcement irrelevant. Category alone does not determine importance.

## Independent judgments

For every record, independently predict:

- Today importance: `must_show`, `useful`, `optional`, or `should_hide`.
- Affected audience: zero or more of `grade_1`, `grade_2`, `grade_3`, `teacher`, `all_students`, `uncertain`.
- Teacher relation: `true`, `false`, or `uncertain`.
- Announcement type: `notice`, `regulation`, `event`, `application`, `result`, `administrative`, `other`, or `uncertain`.
- Regulatory basis: `yes`, `no`, or `uncertain`.
- Official source availability: `source_available`, `announcement_missing`, or `source_uncertain`; set `machine_announcement_missing` to `true`, `false`, or `uncertain`. A temporary fetch failure is not proof that the announcement is missing.
- Temporal status: `not_started`, `active`, `closing_soon`, `closed`, `expired`, or `uncertain`.
- Post-expiry reference value: `yes`, `no`, or `uncertain`.
- Exact supported dates only: `deadline_date`, `event_date`, `application_start`, `application_end`, `effective_until`. Preserve month/year-only facts in `machine_temporal_spans` with their actual precision. Never invent a day.
- `long_lived_information` as `true`, `false`, or `null` when evidence is insufficient.
- Importance confidence from 0.00 to 1.00.

Use `must_show` only for a near-term action or event with meaningful impact. Use `useful` for relevant upcoming action with time to prepare. Use `optional` for low-urgency reference, general information, results, or niche notices. Use `should_hide` for confirmed invalid, expired, broken, superseded, or otherwise non-actionable material. Keep audience breadth separate from importance.

## Reason codes

Use only codes present in `REASON_TAXONOMY.json`. Store the applicable codes in `machine_reasons` and group-specific arrays in `prediction_metadata`: `machine_availability_reasons`, `machine_temporal_reasons`, `machine_post_expiry_reasons`, `machine_audience_reasons`, `machine_action_reasons`, and `machine_importance_reasons`. Do not write free-form rationales as reason codes.

## Frozen baseline boundaries

This baseline uses the unchanged Review Station relevance policy and this prompt version. Do not tune weights, thresholds, scoring, calibration, or prompts during this run. `weight_version` stays null if no numeric weight version exists. Predictions remain machine-only; they are not ground truth and are not training-eligible.

## Output

Return one prediction per exact `announcement_id`. Do not emit human fields, reviewer notes, or inferred evidence. Validate enum values, dates, and reason codes before saving.
