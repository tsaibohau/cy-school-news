-- PostgreSQL stores auth.users.email as varchar(255). Cast it to the text type
-- declared by the RPC so the administrator review list can be returned.
create or replace function public.admin_list_account_access()
returns table(user_id uuid, email text, status text, requested_at timestamptz, reviewed_at timestamptz)
language plpgsql stable security definer
set search_path = pg_catalog, auth, public
as $$
begin
  if not public.is_app_admin() then raise exception 'admin required' using errcode = '42501'; end if;
  return query
    select aa.user_id, u.email::text, aa.status::text, aa.requested_at, aa.reviewed_at
    from public.account_access aa
    join auth.users u on u.id = aa.user_id
    order by case aa.status when 'pending' then 0 else 1 end, aa.requested_at asc;
end;
$$;

revoke all on function public.admin_list_account_access() from public, anon;
grant execute on function public.admin_list_account_access() to authenticated;
