-- Keep the internal RLS auto-enable event-trigger function out of the public
-- Data API. The event trigger remains owned/executable by postgres only.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;

