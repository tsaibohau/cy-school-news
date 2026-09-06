-- Account names are login identifiers, while the Auth email stays private and
-- is used only for verification and password recovery.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.account_usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  constraint account_usernames_format check (username ~ '^[a-z][a-z0-9_]{2,31}$')
);

revoke all on table private.account_usernames from public, anon, authenticated;

create or replace function public.claim_account_username(requested_username text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, auth, private
as $$
declare
  uid uuid := auth.uid();
  normalized text := lower(btrim(coalesce(requested_username, '')));
begin
  if uid is null then raise exception 'authenticated user required' using errcode = '28000'; end if;
  if normalized !~ '^[a-z][a-z0-9_]{2,31}$' then raise exception 'invalid username' using errcode = '22023'; end if;
  insert into private.account_usernames (user_id, username)
  values (uid, normalized)
  on conflict (user_id) do update set username = excluded.username
  where private.account_usernames.username = excluded.username;
  if not found then raise exception 'username unavailable' using errcode = '23505'; end if;
  return normalized;
end;
$$;

revoke all on function public.claim_account_username(text) from public, anon;
grant execute on function public.claim_account_username(text) to authenticated;

create or replace function public.username_login_email(requested_username text)
returns text
language sql
security definer
stable
set search_path = pg_catalog, auth, private
as $$
  select u.email
  from private.account_usernames names
  join auth.users u on u.id = names.user_id
  where names.username = lower(btrim(coalesce(requested_username, '')))
    and u.email_confirmed_at is not null
  limit 1
$$;

revoke all on function public.username_login_email(text) from public, anon, authenticated;
grant execute on function public.username_login_email(text) to service_role;
