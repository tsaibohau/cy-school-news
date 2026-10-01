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
