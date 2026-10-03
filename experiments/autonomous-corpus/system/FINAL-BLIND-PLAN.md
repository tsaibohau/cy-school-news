# Offline candidate — development, not frozen for blind validation

User instruction 2026-10-03: external model services are refused permanently.
The former paid adapter has been removed. runner.py invokes offline.py, using
Python standard library only. It makes zero network calls and downloads no model.
No credentials, billing or external inference configuration is required.

This is symbolic contextual text analysis: machine-detected keyword families,
local clauses, explicit audience restrictions, dates/ranges, immediate-publication
start, deterministic urgency, negation and partial historical reference. It is
NOT a pretrained general language model or model-weight training. Every answer is
computed by code; no Work assistant annotation or human-prepared feature input.

Supported input is frozen raw source corpus with as_of/persona/records; each record
has title/date/body_content/metadata_content/attachment_content. Quote evidence
retains filename/locator/raw text. Raw attachments and bodies remain immutable.
PDF binding-line cleaning continues to be display-only, in existing pdf-display.js.
One paragraph can output both reusable rules and cycle-only dates.

Run:
python experiments/autonomous-corpus/system/runner.py --corpus PRIVATE_SOURCE.json --out PRIVATE_NEW_OUTPUT.json

The output is immutable by exclusive creation. Save it only in private scratch or
Training Storage; never repository/static/public Actions artifacts. Outputs have
code/corpus hashes, dates/windows, Today/urgency, reference groups, citations and
visible unknowns. Ineligible grade/teacher persona overrides registration urgency.
The first-year student persona is currently the only supported persona.

Readiness is DEVELOPMENT ONLY. Eleven synthetic tests cover date boundaries,
explicit closing time, 即日起, publication year, missing start, audience override,
teacher coordination, grade ranges, negation, multiple attachment windows, partial
reference, expiry and human-feature exclusion. These are control checks, not human
semantic evidence and not a claim that all natural-language constructions work.

Known limitations: Chinese numeral dates, month-shorthand ranges, cross-paragraph
application periods, qualifiers/negation and advanced recurring-year context may
not parse. Date purpose in crowded contexts is heuristic. Unknown qualifications
are surfaced; positive results with unknown audience still need quality assessment.
General resources/participant continuation are not yet a comprehensive Today
policy. This lightweight candidate must NOT be presented as having inherited the
previous assistant's 37/37 confirmations or having passed full autonomous review.

Next: run on already exposed development sources without assistant authoring
answers; inspect machine structural metrics and human disagreements/coverage;
fix generic rules; freeze exact code, policy, persona and Taiwan as-of time only
after readiness review. Then authorize code to acquire genuinely new sources with
all old corpus/reviewed IDs and content hashes excluded. This latest user request
already authorizes alternative development; no further provider approval needed.

New final test has not started. Original v3.5 corpus/output/raw blind scores remain
unchanged; Round2 B stays sealed. Future full-blind UI must show original sources
only, hiding all machine date extractions/urgency/importance/reference/reasons until
original human export is saved immutably. No assistant judges the new test notices.
Production is read-only; no main merge, deploy, Production write or query change.
