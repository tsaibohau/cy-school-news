# RLS acceptance v2

The previous Google USER_A/USER_B browser flow is retired as the routine RLS
test. It was an OAuth and browser-lifecycle test, not a deterministic database
test, and it repeatedly failed because of callback origins, session hydration,
tab lifetime, and stale companion state.

## Layer 1: local policy tests

`supabase/tests/database/user_tasks_rls.test.sql` runs against the local
Supabase stack with pgTAP. It switches between the `authenticated` role and
two JWT subjects, then checks own-row CRUD, completion/reopen, tombstone,
cross-user reads/writes, ownership spoofing, and anonymous denial.

`.github/workflows/rls-local.yml` runs the migration reset and pgTAP matrix on
changes to migrations or the test contract. It never contacts the hosted
project and never uses `service_role` as behavioral evidence.

## Layer 2: deployed dedicated Auth users

The deployed test uses two dedicated non-production-purpose Auth identities
with email/password sign-in. Their credentials are injected only through
protected CI secrets. The test obtains ordinary user sessions and exercises
the hosted Data API with each user's bearer token. Provisioning may require a
server-side admin secret, but the CRUD, RLS, spoof, and cleanup assertions
never use that privilege.

The test reports only PASS/FAIL and sanitized counts. It never prints email,
UID, access token, refresh token, or password.

## Layer 3: optional Google smoke

Google is tested only for normal login, callback return, and explicit
`prompt=select_account` account switching. It is not a recurring RLS gate.

## Invariants

- Ownership is always the verified Supabase session UID.
- `user_id` from a caller payload is ignored or rejected.
- Anonymous users cannot access private rows.
- Account outboxes remain UID-scoped and generation-guarded.
- Disposable fixtures use a reserved prefix and are cleaned only by their own
  authenticated owner.
- Production Site URL and Google callback are not changed for testing.
