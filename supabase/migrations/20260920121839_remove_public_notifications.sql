-- Personalized notifications require an authenticated account and durable UID.
-- They must never be granted to the shared PUBLIC authorization principal.
delete from public.public_capabilities where capability = 'notifications';

alter table public.public_capabilities
  drop constraint if exists public_capabilities_key_check;
alter table public.public_capabilities
  add constraint public_capabilities_key_check check (
    capability in ('member_content','assistant','timetable','calendar')
  );

create or replace function public.owner_set_public_capabilities(next_capabilities jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare actor uuid := auth.uid(); cap text;
begin
  if actor is null or not public.is_app_owner() then raise exception 'owner_required' using errcode='42501'; end if;
  if jsonb_typeof(next_capabilities) <> 'object' then raise exception 'invalid_capabilities' using errcode='22023'; end if;
  foreach cap in array array['member_content','assistant','timetable','calendar'] loop
    insert into public.public_capabilities(capability,enabled,updated_by,updated_at)
    values(cap,coalesce((next_capabilities->>cap)::boolean,false),actor,now())
    on conflict(capability) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end loop;
end $$;
revoke all on function public.owner_set_public_capabilities(jsonb) from public, anon;
grant execute on function public.owner_set_public_capabilities(jsonb) to authenticated;
