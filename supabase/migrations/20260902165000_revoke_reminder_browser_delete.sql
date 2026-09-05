-- Browser clients retire reminder identities by updating their disabled/deleted state.
-- The foundation migration granted DELETE before the durable-identity policy existed.
revoke delete on table public.user_reminder_rules from authenticated;
revoke delete on table public.user_push_subscriptions from authenticated;
