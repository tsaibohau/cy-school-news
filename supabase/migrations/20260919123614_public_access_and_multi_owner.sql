-- PUBLIC is an authorization principal backed by the anon database role. It
-- is deliberately not an auth.users row.
create table public.public_capabilities (
  capability text primary key,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint public_capabilities_key_check check (
    capability in ('member_content','assistant','timetable','calendar','notifications')
  )
);

alter table public.public_capabilities enable row level security;
revoke all on table public.public_capabilities from public, anon, authenticated;

insert into public.public_capabilities(capability, enabled)
values ('member_content',false),('assistant',false),('timetable',false),('calendar',false),('notifications',false);

create function public.has_public_capability(p_capability text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce((select enabled from public.public_capabilities where capability=p_capability),false)
$$;
revoke all on function public.has_public_capability(text) from public;
grant execute on function public.has_public_capability(text) to anon, authenticated;

create function public.current_public_capabilities()
returns table(capability text, enabled boolean)
language sql stable security definer set search_path = pg_catalog, public as $$
  select p.capability,p.enabled from public.public_capabilities p order by p.capability
$$;
revoke all on function public.current_public_capabilities() from public;
grant execute on function public.current_public_capabilities() to anon, authenticated;

create function public.owner_set_public_capabilities(next_capabilities jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare actor uuid := auth.uid(); cap text;
begin
  if actor is null or not public.is_app_owner() then raise exception 'owner_required' using errcode='42501'; end if;
  if jsonb_typeof(next_capabilities) <> 'object' then raise exception 'invalid_capabilities' using errcode='22023'; end if;
  foreach cap in array array['member_content','assistant','timetable','calendar','notifications'] loop
    insert into public.public_capabilities(capability,enabled,updated_by,updated_at)
    values(cap,coalesce((next_capabilities->>cap)::boolean,false),actor,now())
    on conflict(capability) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end loop;
end $$;
revoke all on function public.owner_set_public_capabilities(jsonb) from public, anon;
grant execute on function public.owner_set_public_capabilities(jsonb) to authenticated;

-- Multiple active owners are required for a second primary administrator.
drop index if exists public.app_admins_one_active_owner;
alter table public.admin_audit_log drop constraint if exists admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check check (action in (
  'invite_requested','account_approved','account_rejected','access_reapplied','service_changed',
  'coadmin_granted','coadmin_revoked','owner_granted','owner_revoked'
));
alter table private.account_email_outbox drop constraint if exists account_email_outbox_template_check;
alter table private.account_email_outbox add constraint account_email_outbox_template_check check (template in (
  'registration_notice','access_approved','access_rejected','access_reapplied','service_changed',
  'coadmin_granted','coadmin_revoked','owner_granted','owner_revoked'
));

create or replace function public.owner_set_admin_role(target_user_id uuid, next_role text)
returns void language plpgsql security definer
set search_path = pg_catalog, auth, public, private as $$
declare actor uuid:=auth.uid(); target_email text; previous_role text;
begin
  if actor is null or not public.is_app_owner() then raise exception 'owner_required' using errcode='42501'; end if;
  if target_user_id is null or target_user_id=actor then raise exception 'cannot_change_own_owner_role' using errcode='22023'; end if;
  if next_role not in ('owner','co_admin','none') then raise exception 'invalid_administrator_role' using errcode='22023'; end if;
  select u.email::text,a.admin_role into target_email,previous_role from auth.users u
    left join public.app_admins a on a.user_id=u.id and a.revoked_at is null where u.id=target_user_id;
  if target_email is null then raise exception 'account_not_found' using errcode='P0002'; end if;
  if next_role in ('owner','co_admin') and not exists (
    select 1 from public.account_access where user_id=target_user_id and status='approved'
  ) then raise exception 'account_must_be_approved' using errcode='22023'; end if;
  if next_role='none' and previous_role is null then raise exception 'active_administrator_not_found' using errcode='P0002'; end if;
  if next_role='none' and previous_role='owner' and
     (select count(*) from public.app_admins where admin_role='owner' and revoked_at is null) <= 1
  then raise exception 'last_owner_cannot_be_removed' using errcode='42501'; end if;
  if next_role='none' then
    update public.app_admins set revoked_at=now() where user_id=target_user_id and revoked_at is null;
  else
    insert into public.app_admins(user_id,admin_role,created_by,revoked_at)
    values(target_user_id,next_role,actor,null)
    on conflict(user_id) do update set admin_role=excluded.admin_role,created_by=excluded.created_by,revoked_at=null;
    update public.account_access set service_level='full' where user_id=target_user_id;
  end if;
  insert into public.admin_audit_log(actor_id,action,target_user_id,target_email) values(
    actor,case when next_role='owner' then 'owner_granted' when previous_role='owner' then 'owner_revoked'
               when next_role='co_admin' then 'coadmin_granted' else 'coadmin_revoked' end,
    target_user_id,target_email);
  perform private.queue_account_email(
    'admin-role:'||target_user_id::text||':'||txid_current()::text,target_email,
    case when next_role='owner' then 'owner_granted' when previous_role='owner' then 'owner_revoked'
         when next_role='co_admin' then 'coadmin_granted' else 'coadmin_revoked' end,'{}'::jsonb);
end $$;
revoke all on function public.owner_set_admin_role(uuid,text) from public, anon;
grant execute on function public.owner_set_admin_role(uuid,text) to authenticated;

-- Rollout gate: Google UI/provider removal is unsafe while any active owner
-- lacks a non-Google identity. This RPC is read-only and owner-only.
create function public.owner_auth_cutover_readiness()
returns table(active_owner_count bigint, owners_with_non_google_identity bigint, ready boolean)
language plpgsql stable security definer set search_path = pg_catalog, auth, public as $$
begin
  if auth.uid() is null or not public.is_app_owner() then raise exception 'owner_required' using errcode='42501'; end if;
  return query select count(*)::bigint,
    count(*) filter (where exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider<>'google'))::bigint,
    bool_and(exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider<>'google'))
  from public.app_admins a where a.admin_role='owner' and a.revoked_at is null;
end $$;
revoke all on function public.owner_auth_cutover_readiness() from public, anon;
grant execute on function public.owner_auth_cutover_readiness() to authenticated;

-- Protected content is the existing server-backed PUBLIC-capable feature.
-- Unknown URLs/RPC calls still pass through this database gate.
create or replace function public.member_announcement_index(page_size integer default 200,page_offset integer default 0)
returns table(announcement_id text,summary text,snippet text,source_hash text,updated_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
begin
  if not ((auth.uid() is null and public.has_public_capability('member_content')) or
          (auth.uid() is not null and public.has_account_capability('member_content'))) then return; end if;
  if page_size<1 or page_size>500 or page_offset<0 or page_offset>100000 then raise exception 'invalid_announcement_page' using errcode='22023'; end if;
  return query select c.announcement_id,c.summary,c.snippet,c.source_hash,c.updated_at
  from private.announcement_member_content c
  where not exists(select 1 from private.announcement_lifecycle l where l.announcement_id=c.announcement_id and l.action='archive')
  order by c.announcement_id limit page_size offset page_offset;
end $$;

create or replace function public.member_announcement_detail(target_announcement_id text)
returns table(announcement_id text,detail jsonb,source_hash text,updated_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
begin
  if not ((auth.uid() is null and public.has_public_capability('member_content')) or
          (auth.uid() is not null and public.has_account_capability('member_content'))) then return; end if;
  if target_announcement_id is null or char_length(target_announcement_id) not between 1 and 180 then raise exception 'invalid_announcement_id' using errcode='22023'; end if;
  return query select c.announcement_id,c.detail,c.source_hash,c.updated_at
  from private.announcement_member_content c where c.announcement_id=target_announcement_id
    and not exists(select 1 from private.announcement_lifecycle l where l.announcement_id=c.announcement_id and l.action='archive');
end $$;
revoke all on function public.member_announcement_index(integer,integer),public.member_announcement_detail(text) from public;
grant execute on function public.member_announcement_index(integer,integer),public.member_announcement_detail(text) to anon, authenticated;
