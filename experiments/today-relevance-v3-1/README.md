# Candidate v3.1 — autonomous evidence understanding

This is an isolated server-side prototype in `experiments/today-relevance-v3-1/`.
It does not connect to Production, Today, Query, Supabase writes or deployment.
The two stages use an injected structured model provider. **No model provider is
configured in this repository**, so no model results or extraction accuracy are
claimed. The fake provider in tests verifies only the contract.

## Pipeline

`current fetch observation + parsed page + official attachment bytes`
→ canonical source resolver and content-quality filter
→ Stage 1 evidence extraction with exact snippets
→ deterministic date arithmetic and action expiry
→ Stage 2 four-class relevance classification for an explicit user role.

The model input is allowlisted. Human labels, notes, dates, teacher flags, missing
flags, machine predictions and scores are never included. The evaluator loads
human fields only after predictions exist. Dates and audience/action claims need
verbatim source excerpts; mismatched sources, invented citations, invalid dates,
unknown reason codes and chain-of-thought fields are rejected.

## Source and body

`source_resolver.py` makes 404/410 authoritative, maps current network errors to
temporary unreachability and never lets a cache prove a current source is live.
`content_quality.py` distinguishes full/partial text from title-only, boilerplate,
unavailable and uncertain extraction. It is a deterministic heuristic, not an
ML accuracy claim. A live page can be available while its body is only a title.

`attachment_ingest.py` extracts document links from a parsed page and admits only
HTTPS links on the source host or an explicitly trusted host. `official_fetcher.py`
caps bytes/time/redirects and rechecks each redirect against the allowlist. It
does not crawl arbitrary links. `attachment_reader.py` adapts the repository's
bounded PDF/DOCX/XLSX/PPTX and optional image-OCR parser; it also supports XLS
when `xlrd` is installed and DOC when the host provides `antiword`. Unsupported
formats fail closed. The trusted acquisition worker must supply the existing
scraper parser, HTTP session and host allowlist. The present development set
supplies no source body or attachment bytes.

## Evaluation

Run `python3 evaluate.py` for dataset integrity and evidence availability. With a
provider-produced file, run `python3 evaluate.py --predictions predictions.json`.
It reports four-class confusion, Today positive precision/recall, must/useful
recall, hide/optional leakage, teacher/missing extraction diagnostics and citation
validation. It also reports the 141-row sensitivity set after removing 9 IDs that
overlap Round 1. Round 1 output is never fed into inference or tuning.

The current reviewed export contains 150 titles/metadata records, but no body or
attachment content and no adjudicated date/actionability/historical-reference
fields. Those extraction accuracies therefore remain not measurable. A real
autonomous run requires read-only objective source acquisition for the 150 IDs
and a configured server-side model provider. It must not infer with human fields.

Run contract tests from this directory with
`python3 -m unittest -v test_pipeline.py test_attachments.py`.
They do not substitute for end-to-end model evaluation. Candidate v3.1 remains
NOT FROZEN until actual model predictions, citation checks, extraction metrics
and relevance metrics are produced from objective evidence.
