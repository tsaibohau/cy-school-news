-- Keep the internal RLS auto-enable event-trigger function out of the public
-- Data API. The event trigger remains owned/executable by postgres only.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
