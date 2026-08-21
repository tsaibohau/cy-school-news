# Account & Sync V2

V2 adds an optional, lazy Supabase Auth/Sync bridge. Public announcement browsing and Local Notification V3 do not require Supabase.

## Identity boundary

The only authenticated account identity accepted by the client is `session.user.id` returned by `supabase.auth.getSession()`. Email input, URL parameters, DOM values, localStorage claims, and caller-provided UUIDs are never account owners.

`docs/account-auth.js` pins `@supabase/supabase-js` to `2.112.3` and loads it only when account functions are used. `docs/supabase-sync.js` receives the verified client by injection and re-checks the session UID before every write and outbox item.

## Configuration

Copy `docs/account-config.example.js` to an untracked local configuration only after provisioning a dedicated Free-tier project. Configure exact redirects:

- `https://tsaibohau.github.io/cy-school-news/`
- `http://127.0.0.1:8266/`

Never put service-role keys, database passwords, access tokens, refresh tokens, or magic-link URLs in the repository or custom local state.

## Sync behavior

- anonymous use remains fully functional when Supabase is unavailable;
- first account adoption merges the durable anonymous baseline, persisted account state, and remote state once;
- remote subscriptions arriving on a device receive a local notification baseline of “now”, preventing historical notification floods;
- tombstones are pushed as subscription rows with `deleted_at` and are not resurrected by stale devices;
- reads remain monotonic and preferences use deterministic timestamp merging;
- only successfully sent outbox mutations are acknowledged; failures remain pending;
- a session UID change aborts the remaining queue and cannot send A's queue under B.

## Security status

The migration and adapter are prepared, but no dedicated Supabase project is configured in this repository. Therefore real schema inspection, behavioral RLS tests, Magic Link delivery, and real-browser account E2E remain unexecuted and must not be reported as PASS.
