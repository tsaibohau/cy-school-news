# Historical reference semantic review v1

Read the official title, body and parsed attachment units directly. No human labels, human primitives, verdicts, ranking scores or human-prepared features may be inference inputs. Machine temporal claims may support dates, but preserve source-year conflicts; do not redo frozen Today predictions.

Apply policy-v1.json. Produce semantic groups, not a whole-record binary reference flag. Each group must give content_kind, reference_class, scope, summary, reason, allowed_questions, limitations, and at least one source_type / filename / locator / exact quote citation. Multiple kinds may coexist. Separate eligibility, procedural rules, old-cycle dates, award/results, one-off notices, teaching resources, regulation text and regulation pointers.

Read annual scope, audience restrictions, revision/effect evidence and missing sources. Lack of dates is not sufficient evidence of a law. Do not assume annual event rules never change. A notification may contain a reusable procedure. An admission roster is not an award roster or proof of competitive strength.

Only output a potential answer plan with source limitations. Never claim exhaustive latest-source search, current legal effect, external link availability, or “this year's announcement is not published” from a frozen sample. Carry unknowns explicitly. Date facts stay bound to their edition. Historic usefulness never promotes Today relevance.

Engine provenance: native Work assistant / exact model identity unverified. This is a distinct exposed-A development analysis, not a rerun or replacement of v3.5 frozen predictions and not a blind validation benchmark.
