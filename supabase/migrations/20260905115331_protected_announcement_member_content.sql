-- Announcement summaries and parsed details are member-only data.  The table
-- lives outside the exposed API schema; browsers can only use the two bounded
-- RPCs below, which check the current approval record on every request.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.announcement_member_content (
  announcement_id text primary key,
  summary text not null default '',
  snippet text not null default '',
  detail jsonb,
  source_hash text not null default '',
  updated_at timestamptz not null default now(),
  constraint announcement_member_content_id_length
    check (char_length(announcement_id) between 1 and 180),
  constraint announcement_member_content_summary_length
    check (char_length(summary) <= 1200),
  constraint announcement_member_content_snippet_length
    check (char_length(snippet) <= 2000),
  constraint announcement_member_content_source_hash_length
    check (char_length(source_hash) <= 160)
);

alter table private.announcement_member_content enable row level security;
revoke all on private.announcement_member_content from public, anon, authenticated;
grant select, insert, update, delete on private.announcement_member_content to service_role;

create or replace function public.member_announcement_index(
  page_size integer default 200,
  page_offset integer default 0
)
returns table (
  announcement_id text,
  summary text,
  snippet text,
  source_hash text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.account_access access
    where access.user_id = auth.uid() and access.status = 'approved'
  ) then
    return;
  end if;
  if page_size < 1 or page_size > 500 or page_offset < 0 or page_offset > 100000 then
    raise exception 'invalid announcement page' using errcode = '22023';
  end if;
  return query
    select content.announcement_id, content.summary, content.snippet,
           content.source_hash, content.updated_at
    from private.announcement_member_content content
    order by content.announcement_id
    limit page_size offset page_offset;
end;
$$;

revoke all on function public.member_announcement_index(integer, integer) from public, anon;
grant execute on function public.member_announcement_index(integer, integer) to authenticated;

create or replace function public.member_announcement_detail(target_announcement_id text)
returns table (
  announcement_id text,
  detail jsonb,
  source_hash text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.account_access access
    where access.user_id = auth.uid() and access.status = 'approved'
  ) then
    return;
  end if;
  if target_announcement_id is null
     or char_length(target_announcement_id) < 1
     or char_length(target_announcement_id) > 180 then
    raise exception 'invalid announcement id' using errcode = '22023';
  end if;
  return query
    select content.announcement_id, content.detail, content.source_hash, content.updated_at
    from private.announcement_member_content content
    where content.announcement_id = target_announcement_id;
end;
$$;

revoke all on function public.member_announcement_detail(text) from public, anon;
grant execute on function public.member_announcement_detail(text) to authenticated;

create or replace function public.upsert_announcement_member_content(records jsonb)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
declare
  affected integer;
begin
  if jsonb_typeof(records) <> 'array' or jsonb_array_length(records) > 500 then
    raise exception 'invalid announcement batch' using errcode = '22023';
  end if;
  insert into private.announcement_member_content
    (announcement_id, summary, snippet, detail, source_hash, updated_at)
  select btrim(row.announcement_id), left(coalesce(row.summary, ''), 1200),
         left(coalesce(row.snippet, ''), 2000), row.detail,
         left(coalesce(row.source_hash, ''), 160), now()
  from jsonb_to_recordset(records) as row(
    announcement_id text, summary text, snippet text, detail jsonb, source_hash text
  )
  where char_length(btrim(coalesce(row.announcement_id, ''))) between 1 and 180
  on conflict (announcement_id) do update set
    summary = excluded.summary,
    snippet = excluded.snippet,
    detail = excluded.detail,
    source_hash = excluded.source_hash,
    updated_at = excluded.updated_at;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.upsert_announcement_member_content(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_announcement_member_content(jsonb) to service_role;
