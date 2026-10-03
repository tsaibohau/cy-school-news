# Recovered offline classifier v0.3

Recovered on 2026-10-03 from user-supplied Claude repair. These bytes are a replacement recovery artifact, not a claim that the lost ChatGPT version was recovered.

- Target branch: codex/today-relevance-ranking-v3. Production impact: NONE.
- Original 112 tests remain lost. The supplied 52 rule tests passed locally on Python 3.12.
- All three Python files match supplied SHA256SUMS. Only upload filenames were normalized.
- 日前 and 日以前 include the deadline day; 早於 and 未滿 exclude it.
- Conflicting 全校/other-grade wording remains uncertain; 協助宣導 is a relay instruction.
- Deadline without a start remains unresolved by design.
- No acquisition, API inference, review queue, database writes, deployment, or main merge performed.

Run from this directory:

```bash
sha256sum -c SHA256SUMS
python -m unittest discover -s tests -v
python offline_classifier.py announcements.json --as-of 2026-10-03
python evaluate.py <output-directory>/predictions.json gold.json
```

Real-announcement evaluation has NOT RUN. API predictions are comparison outputs, not gold truth: gold labels require human verification with the same as-of date and audience. Review unresolved proportion and dangerous_hides before considering API replacement. Rule-test success does not establish real accuracy.
