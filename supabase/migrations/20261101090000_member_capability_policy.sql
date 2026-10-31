-- One feature policy for every regular member, decided by a primary administrator (owner).
-- Replaces per-account feature switches and service levels ("僅課表" / "完整服務").
-- Administrators (owner, co_admin) are not members for this purpose: they keep every feature.
-- All existing RLS policies and protected RPCs call has_account_capability(), so they follow
-- the new policy without being rewritten.

create table if not exists public.member_capabilities (
  capability text primary key,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint member_capabilities_key_check check (
    capability in ('member_content','assistant','timetable','calendar','notifications')
  )
);
alter table public.member_capabilities enable row level security;
revoke all on table public.member_capabilities from public, anon, authenticated;

-- Starting policy: a feature is on when most approved regular members had it on
-- (on when tied, and on when there are no regular members yet).
insert into public.member_capabilities(capability, enabled)
select k.capability, m.total = 0 or m.on_count * 2 >= m.total
from (values ('member_content'),('assistant'),('timetable'),('calendar'),('notifications')) k(capability)
cross join lateral (
  select count(*) as total, count(*) filter (where coalesce(c.enabled, false)) as on_count
  from public.account_access a
  left join public.account_capabilities c on c.user_id = a.user_id and c.capability = k.capability
  where a.status = 'approved'
    and not exists (select 1 from public.app_admins ad where ad.user_id = a.user_id and ad.revoked_at is null)
) m
on conflict (capability) do nothing;

create or replace function public.is_active_app_admin(p_user uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.app_admins ad
    where ad.user_id = p_user and ad.revoked_at is null and ad.admin_role in ('owner','co_admin')
  )
$$;
revoke all on function public.is_active_app_admin(uuid) from public, anon, authenticated;

create or replace function public.has_account_capability(p_capability text)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.account_access a where a.user_id = (select auth.uid()) and a.status = 'approved')
    and p_capability in ('member_content','assistant','timetable','calendar','notifications')
    and (
      public.is_active_app_admin((select auth.uid()))
      or coalesce((select m.enabled from public.member_capabilities m where m.capability = p_capability), false)
    )
$$;
revoke all on function public.has_account_capability(text) from public, anon;
grant execute on function public.has_account_capability(text) to authenticated;

create or replace function public.current_account_capabilities()
returns table(capability text, enabled boolean)
language sql stable security definer set search_path = pg_catalog, public as $$
  select k.capability, public.has_account_capability(k.capability)
  from (values ('assistant'),('calendar'),('member_content'),('notifications'),('timetable')) k(capability)
  where exists (select 1 from public.account_access a where a.user_id = (select auth.uid()) and a.status = 'approved')
  order by k.capability
$$;
revoke all on function public.current_account_capabilities() from public, anon;
grant execute on function public.current_account_capabilities() to authenticated;

-- Administrators read the member policy; only an owner changes it.
create or replace function public.current_member_capabilities()
returns table(capability text, enabled boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or not public.is_app_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  return query select m.capability, m.enabled, m.updated_at from public.member_capabilities m order by m.capability;
end $$;
revoke all on function public.current_member_capabilities() from public, anon;
grant execute on function public.current_member_capabilities() to authenticated;

create or replace function public.owner_set_member_capabilities(next_capabilities jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare actor uuid := auth.uid(); cap text;
begin
  if actor is null or not public.is_app_owner() then raise exception 'owner_required' using errcode = '42501'; end if;
  if jsonb_typeof(next_capabilities) <> 'object' then raise exception 'invalid_capabilities' using errcode = '22023'; end if;
  foreach cap in array array['member_content','assistant','timetable','calendar','notifications'] loop
    insert into public.member_capabilities(capability, enabled, updated_by, updated_at)
    values (cap, coalesce((next_capabilities->>cap)::boolean, false), actor, now())
    on conflict (capability) do update
      set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end loop;
end $$;
revoke all on function public.owner_set_member_capabilities(jsonb) from public, anon;
grant execute on function public.owner_set_member_capabilities(jsonb) to authenticated;

-- Per-account switches are retired; the old rows stay for history but no longer grant anything.
create or replace function public.admin_set_account_capabilities(target_user_id uuid, next_capabilities jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  raise exception 'per_account_capabilities_retired' using errcode = '0A000',
    hint = 'Use owner_set_member_capabilities to set features for all members.';
end $$;
revoke all on function public.admin_set_account_capabilities(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_account_capabilities(uuid, jsonb) to authenticated;

-- Service levels are retired too: every account is "full"; features come from the policy above.
update public.account_access set service_level = 'full' where service_level <> 'full';
create or replace function private.account_access_single_service_level()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.service_level := 'full';
  return new;
end $$;
revoke all on function private.account_access_single_service_level() from public, anon, authenticated;
drop trigger if exists account_access_single_service_level on public.account_access;
create trigger account_access_single_service_level
  before insert or update of service_level on public.account_access
  for each row execute function private.account_access_single_service_level();
