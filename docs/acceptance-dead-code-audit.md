# Acceptance infrastructure audit

This audit retires the five-hour Google A/B procedure as a routine database
test. Google remains only an optional OAuth UX smoke test.

| Path / symbol | Decision | Evidence / reason |
|---|---|---|
| `tests/test_rls_sql_contract.js` | KEEP | Verifies the local pgTAP contract and optimized ownership policy form. |
| `supabase/tests/database/user_tasks_rls.test.sql` | KEEP | Deterministic authenticated-role behavior matrix for local Postgres. |
| `tests/test_rls_deployed.js` | KEEP | Deployed Auth email/password harness; uses ordinary user JWTs, never service role. |
| `.github/workflows/rls-deployed.yml` | KEEP | Manual protected-secret workflow; no credentials in repository. |
| `tools/staging/acceptance-user-tasks.js` | DEFER | Retain until deployed replacement runs with dedicated Auth secrets, then remove or reduce to a sanitized launcher. |
| `tools/staging/acceptance-companion.html` | DEFER | Retain until replacement passes; it is not part of the new routine harness. |
| `tests/test_rls_behavioral.js` | DEFER | Historical token-env harness; do not delete before the deployed replacement has a green run. |
| `BroadcastChannel` / companion channel code | DEFER | Historical UX acceptance only; no new RLS harness depends on it. Remove only after runtime/reference scan and replacement PASS. |
| OAuth account-switch code | KEEP | Product UX path, not a database acceptance mechanism. |
| Account namespace / generation guards | KEEP | Required product security boundary and covered by existing account tests. |

No service-role bypass, credential fixture, browser session, or OAuth token was
found in the new harnesses. Cleanup remains intentionally gated on the first
successful dedicated-user deployed run.

