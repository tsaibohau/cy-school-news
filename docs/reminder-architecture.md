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

The remaining delivery gate is a server-side Web Push worker with VAPID. A
foreground-only poller is not an acceptable implementation. The scheduler
decision is deferred until the protected worker secret path is verified.

