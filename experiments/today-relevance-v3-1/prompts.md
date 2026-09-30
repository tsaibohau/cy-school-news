# Autonomous evidence-first model tasks

The application must provide a structured-output provider on a trusted server. It
must not place credentials in browser code. The repository currently has no model
provider configured; `pipeline.py` is an injection contract, not a fake model.

## Stage 1: facts only

Read all supplied evidence sources: title, available official body and every
successfully parsed attachment. Treat metadata, event dates and deadlines as
different facts. Do not infer an exact day from a school year or bare month/day.
Identify affected grades, teachers, schoolwide scope, actions, current action
status, temporal state, long-lived rules and historical reference value. Keep
reference value independent from current urgency. If a source is absent, say so.
Every date, audience, action or status claim must have an `evidence` item with the
exact source name and an excerpt copied verbatim from that source. Do not provide
private chain-of-thought. Return only the object in `evidence.schema.json`.

## Stage 2: relevance label

Use only Stage 1 structured evidence, deterministic date calculations and the
explicit minimal user role/read state supplied by the server. Return
one of the four labels in `relevance.schema.json`. `must_show` requires meaningful
near-term user action, emergency, exam, direct change or fresh important unread
item. `useful` means a real action remains open but is not urgent today.
`optional` means useful information without current urgency, including references.
`should_hide` means there is no current value for this user, an action is expired,
an activity passed, or a source is confirmed missing with no reliable alternate.
Historical reference can make a closed item `optional`; it does not turn an expired
registration into an open one. Audience breadth is not the same as importance.
Return concise reason codes and factor confidences only; no chain-of-thought.
