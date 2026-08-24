# Reminder Push foundation

This migration separates user-owned reminder intent from server-only delivery.
`user_reminder_rules` and `user_push_subscriptions` are authenticated
owner-only tables. `reminder_jobs` and `reminder_deliveries` intentionally have
no authenticated policy; a future server worker must use a protected server
credential and must never expose that credential to the browser.

Only verified future targets may produce jobs: announcement deadlines/events,
official calendar events, task due dates, or an explicit manual date.
Publication dates are never reminder targets. Enabling or editing a rule must
establish a local baseline and must not replay historical announcements.

The canonical scheduler is Supabase `pg_cron` invoking a bounded Edge Function.
The cron-to-function credential belongs in Supabase Vault and the VAPID private
key belongs only in Edge Function secrets. GitHub Actions is limited to manual
smoke checks and recovery; it is not the primary scheduler. This keeps private
reminder rows and privileged credentials in one control plane.

Migration `003` is foundation only and must not be used to activate delivery.
The next CLI-generated additive migration must first add durable target time,
timezone, provenance/revision, preset and baseline fields; strict offset checks;
cross-table owner consistency; scheduled time, bounded retry and lease state;
global endpoint ownership; explicit browser privilege revocation; and durable
dedupe that survives rule/device deactivation. Until that migration, Edge
secrets and hosted extensions are verified, reminder delivery remains disabled.

A foreground-only poller is never an acceptable implementation. Publication
dates are never substituted for verified target dates.

The `reminder-worker` Edge Function requires a separate random
`REMINDER_WORKER_TOKEN` header in addition to the gateway JWT. It reads the
database secret key and VAPID private key only from hosted function secrets,
claims deliveries through a service-role-only lease RPC, and never logs push
endpoints or key material. HTTP 404/410 responses permanently invalidate the
device subscription; transient 408/429/5xx failures use bounded retry, with the
database enforcing the maximum attempt count.

Cron activation is deliberately absent from source migrations. It happens only
after the staging migration, function secrets, deployed Auth A/B RLS, and a real
closed-App delivery smoke test all pass.

