# Today relevance Candidate v3: offline diagnostic checkpoint

Branch: `codex/today-relevance-ranking-v3`. Status: **NOT FROZEN**.

This directory is not connected to `docs/`, official Today, Query, or deployment builds.
No network, Supabase writes, migrations, human queue or browser code.

Run from this directory:

```sh
node test_candidate.cjs
node evaluate.cjs
```

The reviewed development fixture is byte-preserved. Primary predictions use only
allowlisted objective metadata. Human labels are used only to evaluate outputs.
Human missing flags are admitted only in explicitly named oracle diagnostics;
the historical-v2 compatibility metric deliberately reproduces the old evaluator's
use of human teacher and missing flags and is not a deployable performance estimate.

`vendor/archived-v2-relevance.cjs` is the historical **local, unfrozen** candidate,
not frozen Round1 machine baseline. The remote v2 branch at checkpoint contains
no numeric candidate. Exact Round1 prompt/policy copies in `evidence/` match the
frozen machine_run hashes. No Round1 scorer is executed by any script here.

All thresholds, category weights and score magnitudes remain archived v2 values.
Experiments only change evidence mapping, eligibility and primitive interactions.
The combined candidate loses useful recall and must NOT proceed to blind validation.
See the analysis report and ablation artifact for limitations and raw counts.

No Round2 created. Future manual batches <=15; publish one batch at a time.
