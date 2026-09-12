-- Durable historical announcement archive. Public JSON remains the active
-- metadata transport; lifecycle rows are the authoritative scraper tombstones.
create table if not exists private.announcement_archive (
  announcement_id text primary key,
  status text not null default 'ARCHIVED' check (status in ('ARCHIVED', 'RESTORED')),
  school text not null,
  title text not null,
  original_publish_date date,
  archived_at timestamptz not null default now(),
  archived_by uuid not null,
  restored_at timestamptz,
  restored_by uuid,
  category text not null default '',
  subcategory text not null default '',
  academic_year integer,
  semester integer check (semester in (1, 2) or semester is null),
  department text not null default '',
  source_url text not null default '',
  original_metadata jsonb not null,
  archive_reason text not null,
  expiration_reason text not null,
  reference_value text not null check (reference_value in ('HIGH', 'MEDIUM', 'LOW', 'NONE')),
  validity text not null default 'historical_reference' check (validity = 'historical_reference'),
  superseded_by text,
  summary text not null default '',
  snippet text not null default '',
  detail jsonb,
  content_source_hash text not null default '',
  cleanup_source_hash text not null,
  cleanup_rule_version integer not null,
  updated_at timestamptz not null default now(),
  constraint announcement_archive_id_length check (char_length(announcement_id) between 1 and 180),
  constraint announcement_archive_title_length check (char_length(title) <= 500),
  constraint announcement_archive_school_length check (char_length(school) between 1 and 40),
  constraint announcement_archive_url_length check (char_length(source_url) <= 2048),
  constraint announcement_archive_metadata_shape check (jsonb_typeof(original_metadata) = 'object'),
  constraint announcement_archive_metadata_size check (pg_column_size(original_metadata) <= 1000000),
  constraint announcement_archive_year check (academic_year between 80 and 300 or academic_year is null)
);

create table if not exists private.announcement_archive_attachments (
  announcement_id text not null references private.announcement_archive(announcement_id) on delete cascade,
  attachment_id text not null,
  filename text not null default '',
  source_url text not null default '',
  mime_type text not null default '',
  parsed_content_ref text not null default '',
  original_metadata jsonb not null default '{}'::jsonb,
  primary key (announcement_id, attachment_id),
  constraint announcement_archive_attachment_id_length check (char_length(attachment_id) between 1 and 240),
  constraint announcement_archive_attachment_filename_length check (char_length(filename) <= 500),
  constraint announcement_archive_attachment_url_length check (char_length(source_url) <= 2048),
  constraint announcement_archive_attachment_metadata_shape check (jsonb_typeof(original_metadata) = 'object')
);

-- Reserved for a later, curated HIGH/MEDIUM extraction stage. This migration
-- intentionally creates no summaries, embeddings, vectors, or OCR output.
create table if not exists private.announcement_reference_knowledge (
  knowledge_id bigint generated always as identity primary key,
  announcement_id text not null references private.announcement_archive(announcement_id) on delete cascade,
  source_attachment_id text,
  reference_value text not null check (reference_value in ('HIGH', 'MEDIUM')),
  knowledge_kind text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (announcement_id, source_attachment_id, knowledge_kind)
);

create index if not exists announcement_archive_filters_idx
  on private.announcement_archive (status, school, category, academic_year, semester, reference_value, archived_at desc);
create index if not exists announcement_archive_title_idx
  on private.announcement_archive using gin (to_tsvector('simple', title));
create index if not exists announcement_archive_superseded_idx
  on private.announcement_archive (superseded_by) where superseded_by is not null;
create index if not exists announcement_archive_attachment_parent_idx
  on private.announcement_archive_attachments (announcement_id);
create index if not exists announcement_reference_lookup_idx
  on private.announcement_reference_knowledge (reference_value, announcement_id);

alter table private.announcement_archive enable row level security;
alter table private.announcement_archive_attachments enable row level security;
alter table private.announcement_reference_knowledge enable row level security;
revoke all on private.announcement_archive, private.announcement_archive_attachments,
  private.announcement_reference_knowledge from public, anon, authenticated;
grant select, insert, update, delete on private.announcement_archive,
  private.announcement_archive_attachments, private.announcement_reference_knowledge to service_role;
grant usage, select on sequence private.announcement_reference_knowledge_knowledge_id_seq to service_role;

alter table private.announcement_lifecycle drop constraint if exists announcement_lifecycle_action_check;
alter table private.announcement_lifecycle
  add constraint announcement_lifecycle_action_check check (action in ('keep', 'archive'));
alter table private.announcement_cleanup_review_history drop constraint if exists announcement_cleanup_review_history_result_check;
alter table private.announcement_cleanup_review_history
  add constraint announcement_cleanup_review_history_result_check
  check (result in ('keep', 'archive', 'restore', 'keep_cancelled', 'delete'));

create or replace function public.announcement_deleted_ids()
returns table(announcement_id text)
language sql stable security definer
set search_path = pg_catalog, private
as $$
  select lifecycle.announcement_id
  from private.announcement_lifecycle lifecycle
  where lifecycle.action = 'archive'
  order by lifecycle.announcement_id
$$;

drop function if exists public.admin_review_announcement_cleanup(text,text,text,text,text,text,date,text,integer,text);
create function public.admin_review_announcement_cleanup(
  target_announcement_id text,
  target_title text,
  target_school text,
  target_source_url text,
  target_reason text,
  target_confidence text,
  target_related_date date,
  target_source_hash text,
  target_rule_version integer,
  target_action text,
  target_original_metadata jsonb,
  target_category text default '',
  target_subcategory text default '',
  target_academic_year integer default null,
  target_semester integer default null,
  target_reference_value text default 'NONE',
  target_superseded_by text default null
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid := auth.uid();
  content private.announcement_member_content%rowtype;
  attachment jsonb;
  attachment_number integer;
  normalized_id text := btrim(coalesce(target_announcement_id, ''));
begin
  if actor is null or not public.is_app_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if char_length(normalized_id) not between 1 and 180
     or char_length(coalesce(target_title, '')) > 500
     or char_length(coalesce(target_school, '')) not between 1 and 40
     or char_length(coalesce(target_source_url, '')) > 2048
     or char_length(coalesce(target_source_hash, '')) not between 1 and 160
     or target_reason not in ('deadline_passed', 'event_ended', 'term_ended', 'replaced')
     or target_confidence not in ('high', 'medium', 'low')
     or target_action not in ('keep', 'archive')
     or target_rule_version not between 1 and 100000
     or target_reference_value not in ('HIGH', 'MEDIUM', 'LOW', 'NONE')
     or (target_semester is not null and target_semester not in (1, 2))
     or (target_academic_year is not null and target_academic_year not between 80 and 300)
     or jsonb_typeof(target_original_metadata) <> 'object'
     or target_original_metadata ->> 'id' is distinct from normalized_id
     or pg_column_size(target_original_metadata) > 1000000 then
    raise exception 'invalid_cleanup_review' using errcode = '22023';
  end if;

  if target_action = 'keep' then
    insert into private.announcement_lifecycle as lifecycle
      (announcement_id, title, school, source_url, action, reason, confidence,
       related_date, source_hash, rule_version, decided_by, decided_at)
    values (normalized_id, coalesce(target_title, ''), target_school,
      coalesce(target_source_url, ''), 'keep', target_reason, target_confidence,
      target_related_date, target_source_hash, target_rule_version, actor, now())
    on conflict (announcement_id) do update set
      title=excluded.title, school=excluded.school, source_url=excluded.source_url,
      action=excluded.action, reason=excluded.reason, confidence=excluded.confidence,
      related_date=excluded.related_date, source_hash=excluded.source_hash,
      rule_version=excluded.rule_version, decided_by=excluded.decided_by,
      decided_at=excluded.decided_at;
    insert into private.announcement_cleanup_review_history
      (announcement_id, reason, confidence, result, source_hash, rule_version, reviewed_by)
    values (normalized_id, target_reason, target_confidence, 'keep',
      target_source_hash, target_rule_version, actor);
    return;
  end if;

  select * into content from private.announcement_member_content
  where announcement_id = normalized_id for update;

  insert into private.announcement_archive as archived
    (announcement_id,status,school,title,original_publish_date,archived_at,archived_by,
     restored_at,restored_by,category,subcategory,academic_year,semester,department,
     source_url,original_metadata,archive_reason,expiration_reason,reference_value,
     validity,superseded_by,summary,snippet,detail,content_source_hash,
     cleanup_source_hash,cleanup_rule_version,updated_at)
  values
    (normalized_id,'ARCHIVED',target_school,coalesce(target_title, ''),
     case when coalesce(target_original_metadata->>'date','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       then (target_original_metadata->>'date')::date else null end,
     now(),actor,null,null,left(coalesce(target_category,''),160),
     left(coalesce(target_subcategory,''),160),target_academic_year,target_semester,
     left(coalesce(target_original_metadata->>'department',''),240),
     coalesce(target_source_url,''),target_original_metadata,target_reason,target_reason,
     target_reference_value,'historical_reference',nullif(btrim(coalesce(target_superseded_by,'')),''),
     coalesce(content.summary,''),coalesce(content.snippet,''),content.detail,
     coalesce(content.source_hash,''),target_source_hash,target_rule_version,now())
  on conflict (announcement_id) do update set
    status='ARCHIVED',school=excluded.school,title=excluded.title,
    original_publish_date=excluded.original_publish_date,archived_at=excluded.archived_at,
    archived_by=excluded.archived_by,restored_at=null,restored_by=null,
    category=excluded.category,subcategory=excluded.subcategory,
    academic_year=excluded.academic_year,semester=excluded.semester,
    department=excluded.department,source_url=excluded.source_url,
    original_metadata=excluded.original_metadata,archive_reason=excluded.archive_reason,
    expiration_reason=excluded.expiration_reason,reference_value=excluded.reference_value,
    validity='historical_reference',superseded_by=excluded.superseded_by,
    summary=excluded.summary,snippet=excluded.snippet,detail=excluded.detail,
    content_source_hash=excluded.content_source_hash,
    cleanup_source_hash=excluded.cleanup_source_hash,
    cleanup_rule_version=excluded.cleanup_rule_version,updated_at=now();

  if not exists (select 1 from private.announcement_archive
    where announcement_id=normalized_id and status='ARCHIVED') then
    raise exception 'archive_write_failed';
  end if;

  delete from private.announcement_archive_attachments where announcement_id=normalized_id;
  for attachment, attachment_number in
    select value, ordinality::integer
    from jsonb_array_elements(
      case
        when jsonb_typeof(target_original_metadata->'attachments')='array' then target_original_metadata->'attachments'
        when jsonb_typeof(content.detail->'attachments')='array' then content.detail->'attachments'
        else '[]'::jsonb
      end
    ) with ordinality
  loop
    if jsonb_typeof(attachment) <> 'object' then attachment := jsonb_build_object('filename', attachment #>> '{}'); end if;
    insert into private.announcement_archive_attachments
      (announcement_id,attachment_id,filename,source_url,mime_type,parsed_content_ref,original_metadata)
    values (normalized_id,
      left(coalesce(nullif(attachment->>'id',''),md5(normalized_id || ':' || attachment_number || ':' || attachment::text)),240),
      left(coalesce(attachment->>'filename',attachment->>'name',''),500),
      left(coalesce(attachment->>'source_url',attachment->>'url',''),2048),
      left(coalesce(attachment->>'mime_type',attachment->>'mime',''),160),
      left(coalesce(attachment->>'parsed_content_ref',attachment->>'content_ref',''),500),attachment);
  end loop;

  insert into private.announcement_lifecycle as lifecycle
    (announcement_id,title,school,source_url,action,reason,confidence,related_date,
     source_hash,rule_version,decided_by,decided_at)
  values (normalized_id,coalesce(target_title,''),target_school,coalesce(target_source_url,''),
    'archive',target_reason,target_confidence,target_related_date,target_source_hash,
    target_rule_version,actor,now())
  on conflict (announcement_id) do update set
    title=excluded.title,school=excluded.school,source_url=excluded.source_url,
    action='archive',reason=excluded.reason,confidence=excluded.confidence,
    related_date=excluded.related_date,source_hash=excluded.source_hash,
    rule_version=excluded.rule_version,decided_by=excluded.decided_by,decided_at=excluded.decided_at;

  insert into private.announcement_cleanup_review_history
    (announcement_id,reason,confidence,result,source_hash,rule_version,reviewed_by)
  values (normalized_id,target_reason,target_confidence,'archive',target_source_hash,target_rule_version,actor);

  delete from private.announcement_member_content where announcement_id=normalized_id;
end;
$$;

create or replace function public.admin_list_archived_announcements(
  school_filter text default 'all',
  category_filter text default 'all',
  academic_year_filter integer default null,
  semester_filter integer default null,
  reference_value_filter text default 'all',
  search_text text default '',
  page_size integer default 50,
  page_offset integer default 0
)
returns table(
  announcement_id text, school text, title text, original_publish_date date,
  archived_at timestamptz, category text, subcategory text, academic_year integer,
  semester integer, department text, source_url text, archive_reason text,
  expiration_reason text, reference_value text, validity text, superseded_by text,
  attachment_count bigint, total_count bigint
)
language plpgsql stable security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null or not public.is_app_admin() then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if page_size not between 1 and 100 or page_offset not between 0 and 100000
     or char_length(coalesce(search_text,'')) > 120
     or (reference_value_filter <> 'all' and reference_value_filter not in ('HIGH','MEDIUM','LOW','NONE'))
     or (semester_filter is not null and semester_filter not in (1,2)) then
    raise exception 'invalid_archive_filters' using errcode='22023';
  end if;
  return query
  with filtered as (
    select a.* from private.announcement_archive a
    where a.status='ARCHIVED'
      and (school_filter='all' or a.school=school_filter)
      and (category_filter='all' or a.category=category_filter)
      and (academic_year_filter is null or a.academic_year=academic_year_filter)
      and (semester_filter is null or a.semester=semester_filter)
      and (reference_value_filter='all' or a.reference_value=reference_value_filter)
      and (btrim(coalesce(search_text,''))='' or a.title ilike '%' || btrim(search_text) || '%')
  )
  select f.announcement_id,f.school,f.title,f.original_publish_date,f.archived_at,
    f.category,f.subcategory,f.academic_year,f.semester,f.department,f.source_url,
    f.archive_reason,f.expiration_reason,f.reference_value,f.validity,f.superseded_by,
    (select count(*) from private.announcement_archive_attachments aa where aa.announcement_id=f.announcement_id),
    count(*) over ()
  from filtered f order by f.archived_at desc, f.announcement_id
  limit page_size offset page_offset;
end;
$$;

create or replace function public.admin_restore_archived_announcement(target_announcement_id text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare actor uuid:=auth.uid(); archived private.announcement_archive%rowtype;
begin
  if actor is null or not public.is_app_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  select * into archived from private.announcement_archive
    where announcement_id=btrim(coalesce(target_announcement_id,'')) and status='ARCHIVED' for update;
  if not found then raise exception 'archive_not_found' using errcode='P0002'; end if;
  if archived.original_metadata->>'id' is distinct from archived.announcement_id then
    raise exception 'archive_original_missing';
  end if;

  insert into private.announcement_member_content as active
    (announcement_id,summary,snippet,detail,source_hash,updated_at)
  values (archived.announcement_id,archived.summary,archived.snippet,archived.detail,
    archived.content_source_hash,now())
  on conflict (announcement_id) do update set summary=excluded.summary,snippet=excluded.snippet,
    detail=excluded.detail,source_hash=excluded.source_hash,updated_at=excluded.updated_at;

  delete from private.announcement_lifecycle
    where announcement_id=archived.announcement_id and action='archive';
  if not found then raise exception 'archive_tombstone_missing'; end if;

  update private.announcement_archive set status='RESTORED',restored_at=now(),
    restored_by=actor,updated_at=now() where announcement_id=archived.announcement_id;
  insert into private.announcement_cleanup_review_history
    (announcement_id,reason,confidence,result,source_hash,rule_version,reviewed_by)
  values (archived.announcement_id,archived.expiration_reason,'high','restore',
    archived.cleanup_source_hash,archived.cleanup_rule_version,actor);
  return archived.original_metadata;
end;
$$;

-- Narrow future-facing reference lookup: only curated-value archive records,
-- never a full archive dump. It is intentionally unused by the current assistant.
create or replace function public.member_historical_reference_index(
  school_filter text,
  category_filter text default 'all',
  academic_year_filter integer default null,
  semester_filter integer default null,
  page_size integer default 50,
  page_offset integer default 0
)
returns table(announcement_id text,title text,school text,category text,subcategory text,
  academic_year integer,semester integer,reference_value text,validity text,
  original_publish_date date,source_url text,summary text,snippet text)
language plpgsql stable security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null or not public.has_account_capability('member_content') then return; end if;
  if char_length(coalesce(school_filter,'')) not between 1 and 40
     or page_size not between 1 and 100 or page_offset not between 0 and 100000 then
    raise exception 'invalid_reference_filters' using errcode='22023';
  end if;
  return query select a.announcement_id,a.title,a.school,a.category,a.subcategory,
    a.academic_year,a.semester,a.reference_value,a.validity,a.original_publish_date,
    a.source_url,a.summary,a.snippet
  from private.announcement_archive a
  where a.status='ARCHIVED' and a.school=school_filter
    and (category_filter='all' or a.category=category_filter)
    and (academic_year_filter is null or a.academic_year=academic_year_filter)
    and (semester_filter is null or a.semester=semester_filter)
    and a.reference_value in ('HIGH','MEDIUM')
  order by a.reference_value,a.original_publish_date desc nulls last,a.announcement_id
  limit page_size offset page_offset;
end;
$$;

create or replace function public.member_announcement_index(page_size integer default 200, page_offset integer default 0)
returns table(announcement_id text, summary text, snippet text, source_hash text, updated_at timestamptz)
language plpgsql stable security definer set search_path='pg_catalog','public','private' as $$
begin
  if auth.uid() is null or not public.has_account_capability('member_content') then return; end if;
  if page_size < 1 or page_size > 500 or page_offset < 0 or page_offset > 100000 then raise exception 'invalid announcement page' using errcode='22023'; end if;
  return query select c.announcement_id,c.summary,c.snippet,c.source_hash,c.updated_at
  from private.announcement_member_content c
  where not exists (select 1 from private.announcement_lifecycle l where l.announcement_id=c.announcement_id and l.action='archive')
  order by c.announcement_id limit page_size offset page_offset;
end; $$;

create or replace function public.member_announcement_detail(target_announcement_id text)
returns table(announcement_id text, detail jsonb, source_hash text, updated_at timestamptz)
language plpgsql stable security definer set search_path='pg_catalog','public','private' as $$
begin
  if auth.uid() is null or not public.has_account_capability('member_content') then return; end if;
  if target_announcement_id is null or char_length(target_announcement_id)<1 or char_length(target_announcement_id)>180 then raise exception 'invalid announcement id' using errcode='22023'; end if;
  return query select c.announcement_id,c.detail,c.source_hash,c.updated_at
  from private.announcement_member_content c where c.announcement_id=target_announcement_id
    and not exists (select 1 from private.announcement_lifecycle l where l.announcement_id=c.announcement_id and l.action='archive');
end; $$;

create or replace function public.upsert_announcement_member_content(records jsonb)
returns integer language plpgsql security invoker set search_path=pg_catalog,private as $$
declare affected integer;
begin
  if jsonb_typeof(records)<>'array' or jsonb_array_length(records)>500 then raise exception 'invalid announcement batch' using errcode='22023'; end if;
  insert into private.announcement_member_content as existing
    (announcement_id,summary,snippet,detail,source_hash,updated_at)
  select btrim(row.announcement_id),left(coalesce(row.summary,''),1200),left(coalesce(row.snippet,''),2000),
    row.detail,left(coalesce(row.source_hash,''),160),now()
  from jsonb_to_recordset(records) as row(announcement_id text,summary text,snippet text,detail jsonb,source_hash text)
  where char_length(btrim(coalesce(row.announcement_id,''))) between 1 and 180
    and not exists (select 1 from private.announcement_lifecycle l where l.announcement_id=btrim(row.announcement_id) and l.action='archive')
  on conflict (announcement_id) do update set summary=excluded.summary,snippet=excluded.snippet,
    detail=coalesce(excluded.detail,existing.detail),
    source_hash=case when excluded.detail is null and excluded.source_hash='' then existing.source_hash else excluded.source_hash end,
    updated_at=excluded.updated_at;
  get diagnostics affected=row_count; return affected;
end; $$;

revoke all on function public.admin_review_announcement_cleanup(text,text,text,text,text,text,date,text,integer,text,jsonb,text,text,integer,integer,text,text),
  public.admin_list_archived_announcements(text,text,integer,integer,text,text,integer,integer),
  public.admin_restore_archived_announcement(text),
  public.member_historical_reference_index(text,text,integer,integer,integer,integer) from public,anon;
grant execute on function public.admin_review_announcement_cleanup(text,text,text,text,text,text,date,text,integer,text,jsonb,text,text,integer,integer,text,text),
  public.admin_list_archived_announcements(text,text,integer,integer,text,text,integer,integer),
  public.admin_restore_archived_announcement(text) to authenticated;
grant execute on function public.member_historical_reference_index(text,text,integer,integer,integer,integer) to authenticated;
revoke all on function public.upsert_announcement_member_content(jsonb) from public,anon,authenticated;
grant execute on function public.upsert_announcement_member_content(jsonb) to service_role;
