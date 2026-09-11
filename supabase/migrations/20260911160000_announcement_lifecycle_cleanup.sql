-- Administrator-reviewed announcement lifecycle. Tombstones contain metadata
-- only: no article body or attachment text is duplicated here.
create table if not exists private.announcement_lifecycle (
  announcement_id text primary key,
  title text not null default '',
  school text not null default '',
  source_url text not null default '',
  action text not null check (action in ('keep', 'delete')),
  reason text not null check (reason in ('deadline_passed', 'event_ended', 'term_ended', 'replaced')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  related_date date,
  source_hash text not null,
  rule_version integer not null,
  decided_by uuid not null,
  decided_at timestamptz not null default now(),
  constraint announcement_lifecycle_id_length check (char_length(announcement_id) between 1 and 180),
  constraint announcement_lifecycle_title_length check (char_length(title) <= 500),
  constraint announcement_lifecycle_school_length check (char_length(school) <= 40),
  constraint announcement_lifecycle_url_length check (char_length(source_url) <= 2048),
  constraint announcement_lifecycle_hash_length check (char_length(source_hash) between 1 and 160),
  constraint announcement_lifecycle_rule_version check (rule_version between 1 and 100000)
);

create table if not exists private.announcement_cleanup_review_history (
  review_id bigint generated always as identity primary key,
  announcement_id text not null,
  reason text not null check (reason in ('deadline_passed', 'event_ended', 'term_ended', 'replaced')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  result text not null check (result in ('keep', 'delete', 'keep_cancelled')),
  source_hash text not null,
  rule_version integer not null,
  reviewed_by uuid not null,
  reviewed_at timestamptz not null default now()
);

create index if not exists announcement_lifecycle_action_idx
  on private.announcement_lifecycle (action, announcement_id);
create index if not exists announcement_cleanup_history_announcement_idx
  on private.announcement_cleanup_review_history (announcement_id, reviewed_at desc);

alter table private.announcement_lifecycle enable row level security;
alter table private.announcement_cleanup_review_history enable row level security;
revoke all on private.announcement_lifecycle, private.announcement_cleanup_review_history
  from public, anon, authenticated;
grant select, insert, update, delete on private.announcement_lifecycle,
  private.announcement_cleanup_review_history to service_role;
grant usage, select on sequence private.announcement_cleanup_review_history_review_id_seq to service_role;

create or replace function public.announcement_deleted_ids()
returns table(announcement_id text)
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select lifecycle.announcement_id
  from private.announcement_lifecycle lifecycle
  where lifecycle.action = 'delete'
  order by lifecycle.announcement_id
$$;

create or replace function public.admin_list_announcement_cleanup_decisions()
returns table(
  announcement_id text, action text, reason text, confidence text,
  related_date date, source_hash text, rule_version integer, decided_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null or not public.is_app_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return query
    select lifecycle.announcement_id, lifecycle.action, lifecycle.reason,
           lifecycle.confidence, lifecycle.related_date, lifecycle.source_hash,
           lifecycle.rule_version, lifecycle.decided_at
    from private.announcement_lifecycle lifecycle
    order by lifecycle.decided_at desc;
end;
$$;

create or replace function public.admin_review_announcement_cleanup(
  target_announcement_id text,
  target_title text,
  target_school text,
  target_source_url text,
  target_reason text,
  target_confidence text,
  target_related_date date,
  target_source_hash text,
  target_rule_version integer,
  target_action text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not public.is_app_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(target_announcement_id, ''))) not between 1 and 180
     or char_length(coalesce(target_title, '')) > 500
     or char_length(coalesce(target_school, '')) > 40
     or char_length(coalesce(target_source_url, '')) > 2048
     or char_length(coalesce(target_source_hash, '')) not between 1 and 160
     or target_reason not in ('deadline_passed', 'event_ended', 'term_ended', 'replaced')
     or target_confidence not in ('high', 'medium', 'low')
     or target_action not in ('keep', 'delete')
     or target_rule_version not between 1 and 100000 then
    raise exception 'invalid_cleanup_review' using errcode = '22023';
  end if;

  insert into private.announcement_lifecycle as lifecycle
    (announcement_id, title, school, source_url, action, reason, confidence,
     related_date, source_hash, rule_version, decided_by, decided_at)
  values
    (btrim(target_announcement_id), coalesce(target_title, ''), coalesce(target_school, ''),
     coalesce(target_source_url, ''), target_action, target_reason, target_confidence,
     target_related_date, target_source_hash, target_rule_version, actor, now())
  on conflict (announcement_id) do update set
    title = excluded.title, school = excluded.school, source_url = excluded.source_url,
    action = excluded.action, reason = excluded.reason, confidence = excluded.confidence,
    related_date = excluded.related_date, source_hash = excluded.source_hash,
    rule_version = excluded.rule_version, decided_by = excluded.decided_by,
    decided_at = excluded.decided_at;

  insert into private.announcement_cleanup_review_history
    (announcement_id, reason, confidence, result, source_hash, rule_version, reviewed_by)
  values
    (btrim(target_announcement_id), target_reason, target_confidence, target_action,
     target_source_hash, target_rule_version, actor);

  if target_action = 'delete' then
    delete from private.announcement_member_content
    where announcement_id = btrim(target_announcement_id);
  end if;
end;
$$;

create or replace function public.admin_cancel_announcement_keep(target_announcement_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare actor uuid := auth.uid(); prior private.announcement_lifecycle%rowtype;
begin
  if actor is null or not public.is_app_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select * into prior from private.announcement_lifecycle
  where announcement_id = target_announcement_id and action = 'keep';
  if not found then raise exception 'keep_override_not_found' using errcode = 'P0002'; end if;
  delete from private.announcement_lifecycle
  where announcement_id = target_announcement_id and action = 'keep';
  insert into private.announcement_cleanup_review_history
    (announcement_id, reason, confidence, result, source_hash, rule_version, reviewed_by)
  values (prior.announcement_id, prior.reason, prior.confidence, 'keep_cancelled',
          prior.source_hash, prior.rule_version, actor);
end;
$$;

-- Deleted announcements are excluded at every protected read/write boundary.
create or replace function public.member_announcement_index(page_size integer default 200, page_offset integer default 0)
returns table(announcement_id text, summary text, snippet text, source_hash text, updated_at timestamptz)
language plpgsql stable security definer set search_path='pg_catalog','public','private' as $$
begin
  if auth.uid() is null or not public.has_account_capability('member_content') then return; end if;
  if page_size < 1 or page_size > 500 or page_offset < 0 or page_offset > 100000 then raise exception 'invalid announcement page' using errcode='22023'; end if;
  return query
    select c.announcement_id,c.summary,c.snippet,c.source_hash,c.updated_at
    from private.announcement_member_content c
    where not exists (
      select 1 from private.announcement_lifecycle lifecycle
      where lifecycle.announcement_id = c.announcement_id and lifecycle.action = 'delete'
    )
    order by c.announcement_id limit page_size offset page_offset;
end; $$;

create or replace function public.member_announcement_detail(target_announcement_id text)
returns table(announcement_id text, detail jsonb, source_hash text, updated_at timestamptz)
language plpgsql stable security definer set search_path='pg_catalog','public','private' as $$
begin
  if auth.uid() is null or not public.has_account_capability('member_content') then return; end if;
  if target_announcement_id is null or char_length(target_announcement_id)<1 or char_length(target_announcement_id)>180 then raise exception 'invalid announcement id' using errcode='22023'; end if;
  return query
    select c.announcement_id,c.detail,c.source_hash,c.updated_at
    from private.announcement_member_content c
    where c.announcement_id=target_announcement_id
      and not exists (
        select 1 from private.announcement_lifecycle lifecycle
        where lifecycle.announcement_id = c.announcement_id and lifecycle.action = 'delete'
      );
end; $$;

create or replace function public.upsert_announcement_member_content(records jsonb)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
declare affected integer;
begin
  if jsonb_typeof(records) <> 'array' or jsonb_array_length(records) > 500 then
    raise exception 'invalid announcement batch' using errcode = '22023';
  end if;
  insert into private.announcement_member_content as existing
    (announcement_id, summary, snippet, detail, source_hash, updated_at)
  select btrim(row.announcement_id), left(coalesce(row.summary, ''), 1200),
         left(coalesce(row.snippet, ''), 2000), row.detail,
         left(coalesce(row.source_hash, ''), 160), now()
  from jsonb_to_recordset(records) as row(
    announcement_id text, summary text, snippet text, detail jsonb, source_hash text
  )
  where char_length(btrim(coalesce(row.announcement_id, ''))) between 1 and 180
    and not exists (
      select 1 from private.announcement_lifecycle lifecycle
      where lifecycle.announcement_id = btrim(row.announcement_id) and lifecycle.action = 'delete'
    )
  on conflict (announcement_id) do update set
    summary = excluded.summary, snippet = excluded.snippet,
    detail = coalesce(excluded.detail, existing.detail),
    source_hash = case when excluded.detail is null and excluded.source_hash = '' then existing.source_hash else excluded.source_hash end,
    updated_at = excluded.updated_at;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.announcement_deleted_ids() from public;
grant execute on function public.announcement_deleted_ids() to anon, authenticated, service_role;
revoke all on function public.admin_list_announcement_cleanup_decisions() from public, anon;
revoke all on function public.admin_review_announcement_cleanup(text,text,text,text,text,text,date,text,integer,text) from public, anon;
revoke all on function public.admin_cancel_announcement_keep(text) from public, anon;
grant execute on function public.admin_list_announcement_cleanup_decisions(),
  public.admin_review_announcement_cleanup(text,text,text,text,text,text,date,text,integer,text),
  public.admin_cancel_announcement_keep(text) to authenticated;
revoke all on function public.member_announcement_index(integer,integer),
  public.member_announcement_detail(text) from public, anon;
grant execute on function public.member_announcement_index(integer,integer),
  public.member_announcement_detail(text) to authenticated;
revoke all on function public.upsert_announcement_member_content(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_announcement_member_content(jsonb) to service_role;
