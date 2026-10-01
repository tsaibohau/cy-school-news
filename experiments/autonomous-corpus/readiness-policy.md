# Prospective v3.4 pilot decision policy

This policy is set before semantic outputs and human labels. It is a pilot gate for starting a larger Round 2, not a Production quality claim or a fitted ranking threshold. Round 1 outcomes are not inputs.

Infrastructure gates: frozen 30 unique records (15 per school); meaningful captured content; immutable hashes; private Storage read-back; at least five body-only and five parsed-attachment records independently rebuilt offline; no human primitive inference inputs; all 30 predictions frozen before review.

Evidence gates: every important claim cites a real frozen source and location; no invented filename/quotation/date; unresolved coverage gaps/conflicts explicitly marked; publication date not replaced by first_seen; expiry does not imply completed action; reference value does not imply Today positive. Structural audit alone cannot prove semantic fidelity. Inspect any flagged extraction/source contradictions separately from human relevance labels.

Human review proceeds in two fixed 15-record batches, with no more than 15 requested at once. Any Batch A prompt/logic change converts A to development pilot and requires fresh predictions frozen before untouched Batch B opens. Do not rerun after seeing B answers.

For a provisional READY FOR ROUND 2 VALIDATION recommendation, combined untouched validation must meet: exact four-class agreement >=75%; positive precision >=80%; positive recall >=70%; must_show positive recall >=80%; zero should_hide positive leakage; uncertain human labels <=10%. Report exact-class recalls too. At least five human positives, two must_show and five should_hide records are needed for these rates to be informative. Missing denominators mean inconclusive, not a pass. Report numerator/denominator and small-sample uncertainty instead of claiming general reliability.

A systematic, source-supported semantic failure yields NOT READY — MODEL LIMITATION IDENTIFIED with its failure examples. If only human labels are pending, keep candidate NOT FROZEN / HUMAN VALIDATION PENDING; do not invent a model limitation or claim completed blind results.

No Round 2 is created before acquisition/evidence/reduced-human-workload gates and pilot validation support feasibility, and the candidate prompt/tools are frozen. A future Round 2 must exclude development 150, Round 1 60 and this pilot 30 IDs.
