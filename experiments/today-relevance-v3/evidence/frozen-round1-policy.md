# Review Station relevance rules

These rules are stored as reference configuration only. They do not tune weights, thresholds, or a model.

Every judgment considers the title, announcement content, and necessary attachments. Reassess the current state daily.

## Latest announcements

- Show in the latest area when the announcement is unread and `first_seen_date` is within five days.
- Remove it from the latest area when read or older than five days.
- Read/unread is user-specific state. It is not a global relevance label.

## Today relevance

- `must_show`: recent information directly changes what a user must do. Examples: registration closes within four days, an exam is within seven days, or a clearly urgent school closure/change.
- `useful`: short-term action matters, but it is not urgent yet. Examples: future registration, an event with preparation time, admissions, or applications with enough time remaining.
- `optional`: useful information without a near-term action, such as regulations, awards, and honors.
- `should_hide`: confirmed missing source, broken official source, closed registration, explicitly invalid old-year plans, or a fully superseded rule.
- Hiding from Today never deletes the announcement from the knowledge base. Today visibility and reference knowledge are separate.

## Audience

Support grades 1–3, teachers, schoolwide, and specific-interest audiences. “Students” without a grade restriction means grades 1–3. Admissions/exam content is commonly grade-3 relevant, subject to the actual notice. “Teachers”, “homeroom teachers”, “faculty training”, and retirement notices are teacher-related. “Teachers and students” means both audiences and `schoolwide=true`. Voluntary sign-up that is not mandatory for everyone may use `specific_interest=true`.

## Temporal status

Support `not_started`, `active`, `closing_soon`, `closed`, `expired`, and `uncertain`. Before a registration start is `not_started`; on or between start and deadline is `active`; within four days of the deadline is `closing_soon`; after deadline is `closed`. Exams within seven days may support `must_show`. Use `expired` for invalid rules or plans. Month-precision facts stay in `machine_temporal_spans` / `human_temporal_spans`; do not invent an exact date.

## Reference value after expiry

Expired does not always mean useless. An event is closed for Today, while its rules may still answer future questions. A fully superseded law is obsolete; a partial revision only replaces the superseded portion. Old-year planning is retired when a new-year version exists; age alone is not enough to discard it.

## Machine and human data

- Machine predictions remain in `machine_predictions` and are never ground truth.
- Human decisions remain in `human_reviews`; an untouched field is `unreviewed` even when its value matches a machine prediction.
- Explicitly accepting a prediction marks that field `confirmed`; changing it marks `corrected`.
- Disagreements are stored by field. Set-valued audience/reason differences retain `added` and `removed` members.
- Blind mode does not request machine predictions from the database. Machine review mode requests them explicitly.
