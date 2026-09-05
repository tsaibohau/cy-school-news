-- The auth.users trigger function must never be callable through the Data API.
revoke all on function public.create_pending_account_access() from public, anon, authenticated;
