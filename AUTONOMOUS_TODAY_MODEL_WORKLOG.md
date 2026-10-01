# Autonomous Today model experiment worklog

Production is read-only and remains the sole product truth. This file records experiment execution only.

## 2026-10-01 phase 0: recovery and isolated environment
- Base: codex/today-relevance-ranking-v3 at 9d176e78f14cab487af69f6f3462090f79aa99d0.
- New branch: codex/autonomous-corpus-acquisition.
- Smoke workflow commit: 837ac1c9742f5319a3e075941e21a429153236f9.
- GitHub-hosted run 36819515543 passed: CYSH index HTTP 200 (55962 bytes), CYGSH index HTTP 200 (38520 bytes).
- Local official-site acquisition was not retried.
- Existing frozen Round 1 evidence/predictions were not opened or modified.
- No Production writes, main merge, or Production deployment.

## 2026-10-01 phase 1: private storage and secretless runner authorization
- Training project identity confirmed: sshovpnepgswzvjwjuyz, cy-school-news-training.
- Private Storage bucket: autonomous-corpus-private; no Storage policies grant anon/authenticated access.
- Training-only control tables: autonomous_allowed_commits, autonomous_backend_access; RLS enabled and all public/browser grants revoked.
- Edge Function: autonomous-corpus-gateway version 2. Gateway custom authentication verifies GitHub OIDC signature, issuer, audience, numeric repository/owner IDs, branch, workflow path, push event and allowlisted commit with expiry.
- Service-role key remains solely in Supabase's built-in Edge environment. No repository secret was created.
- Scoped 48-hour backend control token generated inside Training Vault; plaintext was not returned to Work or browser.
- Backend initialization returned private=true. Invalid bearer token returned 401.
- Current Supabase changelog and Storage/OIDC official docs checked.
- No existing Review or Production deployment configuration changed. Any branch Preview contains only existing public code; private corpus is never a static asset.

## Phase 2 execution
- Runner captures detail bytes/rendered DOM, rediscovers current attachment links, downloads with same-session fallback, parses PDF/DOCX/XLSX/PPTX/DOC/XLS/images and performs selective PDF OCR.
- SHA-256 is verified by private backend upload read-back.
- Candidate selection: 30 per school, deterministic round-robin of date/category/source-attachment strata; no labels/scores.
- Evaluation date fixed before acquisition/inference: 2026-10-01. Persona: unread, first-year student at each record's school, no declared interests, prior actions unknown.
- Content gate requires meaningful body or meaningful parsed attachment. Failed download/parse does not count as content.
- Offline extraction is rerun from captured bytes for every parsed source before freeze.
- Frozen selection requires 15 per school plus at least five body-only and five attachment-rich records.
- Next decision: inspect private run report, extend metadata-selected pool if coverage is insufficient, otherwise freeze blind semantic outputs before creating human review.
- Public logs contain IDs, counts and hashes only. No Actions artifact upload.

## 2026-10-01 phase 2 initial runner correction
- Runner 36820176306 installed all parsers and passed every existing scraper parser test.
- Candidate selection initially excluded missing publication dates and failed the 60-count invariant before any official detail fetch.
- Correction: preserve an explicit unknown-date stratum, sorting by source first_seen and ID without claiming first_seen is publication date.
- Local deterministic selection now verifies 30 CYSH + 30 CYGSH with unique IDs. Title-only/noise-only and cross-domain safety probes passed.
- Next decision: rerun acquisition; no human intervention needed.

## 2026-10-01 phase 2 live capture and phase 3 tooling
- Current acquisition run: 36820362487, commit 8cdef0ddee200f4db3c1271b3f78054c4ec944de.
- CYSH raw detail, body, PDF and DOCX objects have been uploaded/read-back SHA verified. Parsed sources rerun offline identically. Body-only source captured too.
- First CYGSH dated candidate returns school-provided not-found page (captured privately), correctly FAIL; runner continues remaining source-metadata candidates.
- Created offline benchmark/citation evaluator and semantic prompt. Structural citation audit explicitly does not claim to prove semantic correctness.
- Generic five-button Review UI drafted; no corpus or model answers embedded, no queue published. Future read capability is limited to one immutable <=15 batch through backend; no direct browser Storage access.
- Workflow trigger narrowed to acquisition code/dependencies/explicit trigger so checkpoint/tooling commits do not refetch official sources.
- Vercel connector cannot see existing projects/deployments. Browser dashboard has sign-in wall, but GitHub commit check output exposed the existing Preview hostname; direct Preview successfully opened without login. No Vercel authentication required for static verification.
- Candidate remains NOT FROZEN. No semantic inference yet. Next: await runner completion, inspect private freeze report, then run Work semantic inference.

## 2026-10-01T06:16:17Z phase 2 quality correction and corrected freeze
- Independent replay initially matched hashes but exposed repeated CYSH navigation content. This proved reproducibility alone was insufficient for content correctness.
- Preliminary corpus db5cc48753a26ba18d87e55105141f5197361c956eea1281c4b2813c805af353 is INVALIDATED_CONTENT_GATE. Its private objects remain immutable; no model inference or human review occurred on it.
- Corrected the RulingDigital body locator to article-scoped editors and removed header/footer containers. Added title-only/navigation-only regression probes.
- Downloaded all 60 captured raw HTML sources from private Storage and re-extracted offline with networking blocked. No official sites were contacted from Work.
- Corrected PASS pool: 42 (CYSH 21, CYGSH 21). 24 body extractions corrected; selection changes are solely objective acquisition quality corrections before inference, not model/human outcomes.
- Corrected frozen corpus: 30 (15 per school), meaningful body 19, parsed attachment-rich 21, body-only 9.
- Corrected corpus path: runs/36820362487/article-scoped-v2/frozen-corpus.json.
- SHA-256: 0535de250b79a284cd9aa89f0a74fbe46da48e5c6f8e3a21a26389c161078a88.
- Uploaded 30 corrected body objects and corpus; private backend download/read-back SHA checks passed.
- Independent Work process replayed five body-only and five attachment-rich records across both schools, with socket/request networking disabled, all hashes identical. Attachment extraction was also repeated in pinned runner.
- Official article publication metadata is captured separately as raw evidence, not confused with index first_seen or model primitives.
- Fixed corpus IDs and content hashes may not change based on model results. Next: direct Work semantic inference for all 30; output freeze/audit before human queue publication.

## 2026-10-01T06:31:34Z phase 4: autonomous semantic output freeze
- Native Work assistant read all 30 frozen records' captured body, article metadata and available parsed attachment units. No human truth or human primitives were inference inputs. Requested Luna identity is not verifiable in this runtime; engine is recorded transparently as native Work assistant, not claimed as Luna.
- Immutable private model output: runs/36820362487/frozen-model-output.json, SHA-256 60d59dd38d11882d416b9dac2974283dacdc54fa3f8c2aa8edc860e85bbc8ca4. Private upload/read-back verified.
- Citation audit: 30 outputs, 127 source/location/quotation checks, 64 date claims, zero structural errors. Day offsets computed deterministically from 2026-10-01. Five source/OCR contradictions have explicit resolutions; CYGSH corrected 45-minute writing versus old general exit rule remains a rule-scope limitation, not an invented resolved policy.
- Distribution: must_show 2, useful 5, optional 12, should_hide 11. Actions: expired 4, information_only 10, available_later 11, required_soon 5. Reference: limited 9, useful_reference 14, long_term_reference 7.
- Expired registration is separate from future event; current-term room assignment remains reference; first-year scholarship exclusions are read from attachments; expired does not imply persona completed.
- Frozen A/B queues are fixed school-interleaved splits of 15 each, derived after predictions freeze and stripped of model labels/evidence/confidence. Both private read-back verified. B has no enabled access capability.
- Human relevance results are pending, so agreement/precision/recall/leakage are undefined. No Round 2 set has been created. Candidate architecture NOT FROZEN / HUMAN VALIDATION PENDING; prediction artifact FROZEN.
- Next: publish A-only Review Preview, verify actual link/UI and await only 15 final labels.
