-- Browser sessions may manage reminder intent and device state, but durable
-- identities are soft-disabled by the application and must not be erased.
-- GRANT is additive, so revoke privileges that may survive older migrations.

revoke delete, truncate, references, trigger
  on table public.user_reminder_rules
  from authenticated;

revoke delete, truncate, references, trigger
  on table public.user_push_subscriptions
  from authenticated;

revoke all
  on table public.user_reminder_rules, public.user_push_subscriptions
  from anon;

grant select, insert, update
  on table public.user_reminder_rules, public.user_push_subscriptions
  to authenticated;
