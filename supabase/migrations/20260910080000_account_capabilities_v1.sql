-- Fine-grained member capabilities. Public announcement index remains public.
create table if not exists public.account_capabilities (
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  enabled boolean not null default false,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, capability),
  constraint account_capabilities_capability_check check (capability in ('member_content','assistant','timetable','calendar','notifications'))
);
alter table public.account_capabilities enable row level security;
revoke all on public.account_capabilities from anon, authenticated;
grant select on public.account_capabilities to authenticated;
drop policy if exists account_capabilities_read_own on public.account_capabilities;
create policy account_capabilities_read_own on public.account_capabilities for select to authenticated using (user_id=(select auth.uid()));

create or replace function public.has_account_capability(p_capability text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.account_access a join public.account_capabilities c on c.user_id=a.user_id where a.user_id=(select auth.uid()) and a.status='approved' and c.capability=p_capability and c.enabled=true);
$$;
revoke all on function public.has_account_capability(text) from public;
grant execute on function public.has_account_capability(text) to authenticated;

create or replace function public.current_account_capabilities() returns table(capability text,enabled boolean) language sql stable security definer set search_path=public as $$
 select c.capability,c.enabled from public.account_capabilities c join public.account_access a on a.user_id=c.user_id where c.user_id=(select auth.uid()) and a.status='approved' order by c.capability;
$$;
revoke all on function public.current_account_capabilities() from public;
grant execute on function public.current_account_capabilities() to authenticated;

create or replace function public.admin_set_account_capabilities(target_user_id uuid,next_capabilities jsonb) returns void language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); cap text; allowed constant text[]:=array['member_content','assistant','timetable','calendar','notifications'];
begin
 if actor is null or not public.is_app_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 if not exists(select 1 from public.account_access where user_id=target_user_id) then raise exception 'account_not_found' using errcode='P0002'; end if;
 if exists(select 1 from public.app_admins where user_id=target_user_id and role in ('owner','co_admin')) then raise exception 'admin_capabilities_protected' using errcode='42501'; end if;
 foreach cap in array allowed loop
  insert into public.account_capabilities(user_id,capability,enabled,granted_by,granted_at) values(target_user_id,cap,coalesce((next_capabilities->>cap)::boolean,false),actor,now())
  on conflict(user_id,capability) do update set enabled=excluded.enabled,granted_by=excluded.granted_by,granted_at=excluded.granted_at;
 end loop;
end; $$;
revoke all on function public.admin_set_account_capabilities(uuid,jsonb) from public;
grant execute on function public.admin_set_account_capabilities(uuid,jsonb) to authenticated;

insert into public.account_capabilities(user_id,capability,enabled)
select a.user_id,c.capability,case when a.status<>'approved' then false when a.service_level='full' then true when a.service_level='timetable_only' and c.capability='timetable' then true else false end
from public.account_access a cross join (values('member_content'),('assistant'),('timetable'),('calendar'),('notifications')) c(capability)
on conflict(user_id,capability) do nothing;
