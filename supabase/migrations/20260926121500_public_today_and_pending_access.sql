-- PUBLIC capabilities are an access floor shared by anonymous, pending,
-- rejected, and approved sessions. "today" controls the public dashboard;
-- it does not grant writes to private tasks, calendar events, or notifications.
alter table public.public_capabilities
  drop constraint if exists public_capabilities_key_check;
alter table public.public_capabilities
  add constraint public_capabilities_key_check check (
    capability in ('member_content','assistant','timetable','calendar','today')
  );

insert into public.public_capabilities(capability, enabled)
values ('today', false)
on conflict (capability) do nothing;

create or replace function public.owner_set_public_capabilities(next_capabilities jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare actor uuid := auth.uid(); cap text;
begin
  if actor is null or not public.is_app_owner() then raise exception 'owner_required' using errcode='42501'; end if;
  if jsonb_typeof(next_capabilities) <> 'object' then raise exception 'invalid_capabilities' using errcode='22023'; end if;
  foreach cap in array array['member_content','assistant','timetable','calendar','today'] loop
    insert into public.public_capabilities(capability,enabled,updated_by,updated_at)
    values(cap,coalesce((next_capabilities->>cap)::boolean,false),actor,now())
    on conflict(capability) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end loop;
end $$;
revoke all on function public.owner_set_public_capabilities(jsonb) from public, anon;
grant execute on function public.owner_set_public_capabilities(jsonb) to authenticated;

-- Signed-in users retain the PUBLIC read floor. Account capability grants can
-- add access after approval, but pending status must not remove public reads.
create or replace function public.member_announcement_index(page_size integer default 200,page_offset integer default 0)
returns table(announcement_id text,summary text,snippet text,source_hash text,updated_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
begin
  if not (public.has_public_capability('member_content') or
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
  if not (public.has_public_capability('member_content') or
          (auth.uid() is not null and public.has_account_capability('member_content'))) then return; end if;
  if target_announcement_id is null or char_length(target_announcement_id) not between 1 and 180 then raise exception 'invalid_announcement_id' using errcode='22023'; end if;
  return query select c.announcement_id,c.detail,c.source_hash,c.updated_at
  from private.announcement_member_content c where c.announcement_id=target_announcement_id
    and not exists(select 1 from private.announcement_lifecycle l where l.announcement_id=c.announcement_id and l.action='archive');
end $$;
revoke all on function public.member_announcement_index(integer,integer), public.member_announcement_detail(text) from public;
grant execute on function public.member_announcement_index(integer,integer), public.member_announcement_detail(text) to anon, authenticated;
