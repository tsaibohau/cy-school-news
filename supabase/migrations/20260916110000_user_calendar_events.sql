-- Durable, account-owned calendar events. Browser writes use the versioned RPC;
-- the exposed table grants authenticated users read-only access to their rows.
create table public.user_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  event_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_mutation_id uuid not null,
  legacy_import_key text,
  constraint user_calendar_events_title_check check (char_length(btrim(title)) between 1 and 80),
  constraint user_calendar_events_notes_check check (char_length(notes) <= 240),
  constraint user_calendar_events_version_check check (version > 0),
  constraint user_calendar_events_legacy_import_key_check check (legacy_import_key is null or char_length(legacy_import_key) between 1 and 200)
);

create index user_calendar_events_user_updated_idx
  on public.user_calendar_events (user_id, updated_at);
create index user_calendar_events_user_active_date_idx
  on public.user_calendar_events (user_id, event_date)
  where deleted_at is null;
create unique index user_calendar_events_user_legacy_key_uidx
  on public.user_calendar_events (user_id, legacy_import_key)
  where legacy_import_key is not null;

alter table public.user_calendar_events enable row level security;
revoke all on public.user_calendar_events from public, anon, authenticated;
grant select on public.user_calendar_events to authenticated;

create policy user_calendar_events_select_own
on public.user_calendar_events
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and (select public.has_account_capability('calendar'))
);

create or replace function public.apply_user_calendar_event_mutation(
  p_id uuid,
  p_expected_version bigint,
  p_mutation_id uuid,
  p_operation text,
  p_payload jsonb,
  p_legacy_import_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_calendar_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_title text := btrim(coalesce(p_payload ->> 'title', ''));
  v_event_date date;
  v_notes text := btrim(coalesce(p_payload ->> 'notes', ''));
begin
  if v_uid is null or not public.has_account_capability('calendar') then
    raise exception 'calendar_access_required' using errcode = '42501';
  end if;
  if p_id is null or p_mutation_id is null or p_operation not in ('create', 'update', 'delete') then
    raise exception 'invalid_calendar_mutation' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'invalid_expected_version' using errcode = '22023';
  end if;

  select * into v_row
  from public.user_calendar_events
  where id = p_id and user_id = v_uid
  for update;

  if found and v_row.last_mutation_id = p_mutation_id then
    return jsonb_build_object('status', 'applied', 'replay', true, 'event', to_jsonb(v_row));
  end if;

  if p_operation = 'create' then
    if p_expected_version <> 0 then
      return jsonb_build_object('status', 'conflict', 'reason', 'expected_version', 'event', case when v_row.id is null then null else to_jsonb(v_row) end);
    end if;
    if found then
      return jsonb_build_object('status', 'conflict', 'reason', 'already_exists', 'event', to_jsonb(v_row));
    end if;
    if p_legacy_import_key is not null then
      select * into v_row
      from public.user_calendar_events
      where user_id = v_uid and legacy_import_key = p_legacy_import_key
      for update;
      if found then
        return jsonb_build_object('status', 'applied', 'replay', true, 'event', to_jsonb(v_row));
      end if;
    end if;
    begin
      v_event_date := (p_payload ->> 'event_date')::date;
    exception when others then
      raise exception 'invalid_event_date' using errcode = '22023';
    end;
    if char_length(v_title) not between 1 and 80 or char_length(v_notes) > 240 then
      raise exception 'invalid_calendar_event' using errcode = '22023';
    end if;
    begin
      insert into public.user_calendar_events (
        id, user_id, title, event_date, notes, created_at, updated_at,
        deleted_at, version, last_mutation_id, legacy_import_key
      ) values (
        p_id, v_uid, v_title, v_event_date, v_notes, v_now, v_now,
        null, 1, p_mutation_id, p_legacy_import_key
      ) returning * into v_row;
    exception when unique_violation then
      -- A concurrent replay may pass the initial lookup before the first
      -- request commits. Resolve the winning canonical row after the unique
      -- index wait instead of surfacing a duplicate-key error to the outbox.
      select * into v_row
      from public.user_calendar_events
      where user_id = v_uid
        and (id = p_id or (p_legacy_import_key is not null and legacy_import_key = p_legacy_import_key))
      order by (id = p_id) desc
      limit 1
      for update;
      if found and (v_row.last_mutation_id = p_mutation_id or
          (p_legacy_import_key is not null and v_row.legacy_import_key = p_legacy_import_key)) then
        return jsonb_build_object('status', 'applied', 'replay', true, 'event', to_jsonb(v_row));
      end if;
      return jsonb_build_object('status', 'conflict', 'reason', 'already_exists',
        'event', case when v_row.id is null then null else to_jsonb(v_row) end);
    end;
    return jsonb_build_object('status', 'applied', 'replay', false, 'event', to_jsonb(v_row));
  end if;

  if not found then
    return jsonb_build_object('status', 'conflict', 'reason', 'not_found', 'event', null);
  end if;
  if v_row.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict', 'reason', 'stale_version', 'event', to_jsonb(v_row));
  end if;
  if v_row.deleted_at is not null then
    return jsonb_build_object('status', 'conflict', 'reason', 'tombstoned', 'event', to_jsonb(v_row));
  end if;

  if p_operation = 'delete' then
    update public.user_calendar_events
    set deleted_at = v_now, updated_at = v_now, version = version + 1,
        last_mutation_id = p_mutation_id
    where id = p_id and user_id = v_uid
    returning * into v_row;
  else
    begin
      v_event_date := (p_payload ->> 'event_date')::date;
    exception when others then
      raise exception 'invalid_event_date' using errcode = '22023';
    end;
    if char_length(v_title) not between 1 and 80 or char_length(v_notes) > 240 then
      raise exception 'invalid_calendar_event' using errcode = '22023';
    end if;
    update public.user_calendar_events
    set title = v_title, event_date = v_event_date, notes = v_notes,
        updated_at = v_now, version = version + 1,
        last_mutation_id = p_mutation_id
    where id = p_id and user_id = v_uid and deleted_at is null
    returning * into v_row;
  end if;
  return jsonb_build_object('status', 'applied', 'replay', false, 'event', to_jsonb(v_row));
end;
$$;

create or replace function public.delete_own_user_calendar_events()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count bigint;
begin
  if v_uid is null then
    raise exception 'authenticated_account_required' using errcode = '42501';
  end if;
  delete from public.user_calendar_events where user_id = v_uid;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.apply_user_calendar_event_mutation(uuid, bigint, uuid, text, jsonb, text) from public, anon;
revoke all on function public.delete_own_user_calendar_events() from public, anon;
grant execute on function public.apply_user_calendar_event_mutation(uuid, bigint, uuid, text, jsonb, text) to authenticated;
grant execute on function public.delete_own_user_calendar_events() to authenticated;
