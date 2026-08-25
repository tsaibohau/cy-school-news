# Reminder Push foundation

This migration separates user-owned reminder intent from server-only delivery.
`user_reminder_rules` and `user_push_subscriptions` are authenticated
owner-only tables. `reminder_jobs` and `reminder_deliveries` intentionally have
no authenticated policy; the server worker uses a protected server credential
that is never exposed to the browser.

Only verified future targets may produce jobs: announcement deadlines/events,
official calendar events, task due dates, or an explicit manual date.
Publication dates are never reminder targets. Enabling or editing a rule must
establish a local baseline and must not replay historical announcements.

The canonical scheduler is Supabase `pg_cron` invoking a bounded Edge Function.
The cron-to-function credential belongs in Supabase Vault and the VAPID private
key belongs only in Edge Function secrets. GitHub Actions is limited to manual
smoke checks and recovery; it is not the primary scheduler. This keeps private
reminder rows and privileged credentials in one control plane.

The activation contract is checked in at
`supabase/scheduler/activate_reminder_cron.sql`. It is deliberately not a
migration: applying schema must never accidentally start delivery. An owner
first deploys and validates the migrations and function, provisions the named
Vault values and Edge Function secrets through protected provider controls,
then runs the activation script once in the staging project. The script replaces
only the named reminder cron job, so activation is repeatable without creating
overlapping schedules.

Migration `003` is foundation only and must not be used to activate delivery.
The additive hardening and worker-RPC migrations add durable target time,
timezone, provenance/revision, preset and baseline fields; strict offset checks;
cross-table owner consistency; scheduled time, bounded retry and lease state;
global endpoint ownership; explicit browser privilege revocation; and durable
dedupe that survives rule/device deactivation. Delivery remains disabled until
those migrations, Edge secrets, hosted extensions, and staging RLS are verified.

A foreground-only poller is never an acceptable implementation. Publication
dates are never substituted for verified target dates.

The `reminder-worker` Edge Function requires a separate random
`REMINDER_WORKER_TOKEN` header in addition to the gateway JWT. It reads the
database secret key and VAPID private key only from hosted function secrets,
claims deliveries through a service-role-only lease RPC, and never logs push
endpoints or key material. HTTP 404/410 responses permanently invalidate the
device subscription; transient 408/429/5xx failures use bounded retry, with the
database enforcing the maximum attempt count.

The worker includes the trusted source URL in notification data when one exists;
the Service Worker may use it for a click action. Manual and task reminders fall
back to the app root. Each Web Push request has a bounded network timeout, so one
unresponsive push service cannot consume the whole worker invocation.

Cron activation is deliberately absent from source migrations. It happens only
after the staging migration, function secrets, deployed Auth A/B RLS, and a real
closed-App delivery smoke test all pass.

