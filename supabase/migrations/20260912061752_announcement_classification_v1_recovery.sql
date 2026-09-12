-- Recovery copy of the classification v1 schema already present in Preview.
-- Do not re-apply this file to that Preview project; it restores version control.

create schema if not exists private;
grant usage on schema private to service_role;

create table if not exists private.announcement_classification (
  announcement_id text primary key,
  title text not null default '',
  school text not null,
  main_category text not null default 'other',
  sub_category text not null default 'other',
  event_types text[] not null default '{}',
  audience text[] not null default '{}',
  topics text[] not null default '{}',
  actions text[] not null default '{}',
  requested_fields text[] not null default '{}',
  available_fields text[] not null default '{}',
  academic_year integer,
  semester integer,
  dates jsonb not null default '{"mentions": [], "publish_date": null}'::jsonb,
  department text,
  location text,
  reference_value text not null default 'NONE',
  classification_confidence numeric not null default 0.000,
  classification_sources text[] not null default '{}',
  classification_version integer not null default 1,
  classification_source_hash text not null,
  matched_aliases text[] not null default '{}',
  unresolved_terms text[] not null default '{}',
  classification_override jsonb,
  override_by uuid references auth.users(id) on delete set null,
  override_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint announcement_classification_id_length check (char_length(announcement_id) between 1 and 180),
  constraint announcement_classification_title_length check (char_length(title) <= 500),
  constraint announcement_classification_school_length check (char_length(school) between 1 and 40),
  constraint announcement_classification_main_category check (main_category in (
    'academic_exam','course_selection','admission','student_affairs','club','competition',
    'event_learning','scholarship','honor_roll','enrollment','administration','rules_policy',
    'campus_service','other'
  )),
  constraint announcement_classification_year check (academic_year is null or academic_year between 80 and 300),
  constraint announcement_classification_semester check (semester is null or semester in (1,2)),
  constraint announcement_classification_dates_object check (jsonb_typeof(dates) = 'object'),
  constraint announcement_classification_reference_value check (reference_value in ('HIGH','MEDIUM','LOW','NONE')),
  constraint announcement_classification_confidence check (classification_confidence between 0 and 1),
  constraint announcement_classification_version check (classification_version between 1 and 100000),
  constraint announcement_classification_override_shape check (
    classification_override is null or jsonb_typeof(classification_override) = 'object'
  ),
  constraint announcement_classification_array_limits check (
    cardinality(event_types) <= 20 and cardinality(audience) <= 20 and cardinality(topics) <= 40
    and cardinality(actions) <= 20 and cardinality(requested_fields) <= 30
    and cardinality(available_fields) <= 30 and cardinality(classification_sources) <= 12
    and cardinality(matched_aliases) <= 30 and cardinality(unresolved_terms) <= 30
  )
);

create index if not exists announcement_classification_confidence_idx
  on private.announcement_classification (classification_version, classification_confidence);
create index if not exists announcement_classification_scope_idx
  on private.announcement_classification (school, main_category, sub_category, academic_year, semester);

create table if not exists private.announcement_classification_alias (
  term text primary key,
  canonical_term text not null,
  status text not null default 'approved',
  classification_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcement_classification_alias_term_length check (char_length(term) between 1 and 80),
  constraint announcement_classification_alias_canonical_length check (char_length(canonical_term) between 1 and 160),
  constraint announcement_classification_alias_status check (status in ('approved','candidate','rejected'))
);

create table if not exists private.announcement_classification_backfill_checkpoint (
  run_id text not null,
  batch_number integer not null,
  batch_key text not null,
  classification_version integer not null,
  status text not null default 'completed',
  record_count integer not null default 0,
  completed_at timestamptz not null default now(),
  primary key (run_id, batch_number),
  constraint announcement_classification_checkpoint_run_length check (char_length(run_id) between 1 and 120),
  constraint announcement_classification_checkpoint_batch check (batch_number between 0 and 1000000),
  constraint announcement_classification_checkpoint_key_length check (char_length(batch_key) between 32 and 128),
  constraint announcement_classification_checkpoint_status check (status in ('completed','failed'))
);

create table if not exists private.announcement_classification_index (
  dimension text not null,
  token text not null,
  announcement_id text not null references private.announcement_classification(announcement_id) on delete cascade,
  classification_version integer not null,
  primary key (dimension, token, announcement_id),
  constraint announcement_classification_index_dimension check (dimension in (
    'school','main_category','sub_category','topic','audience','event_type','action',
    'available_field','academic_year','semester','date'
  )),
  constraint announcement_classification_index_token_length check (char_length(token) between 1 and 180)
);

create index if not exists announcement_classification_index_lookup_idx
  on private.announcement_classification_index (dimension, token, classification_version, announcement_id);

create table if not exists private.announcement_classification_learning_log (
  term text primary key,
  candidate_category text,
  candidate_alias text,
  confidence numeric not null default 0,
  seen_count integer not null default 1,
  last_seen timestamptz not null default now(),
  source text not null default 'classifier',
  constraint announcement_learning_term_length check (char_length(term) between 1 and 120),
  constraint announcement_learning_confidence check (confidence between 0 and 1),
  constraint announcement_learning_seen_count check (seen_count between 1 and 2147483647)
);

alter table private.announcement_classification enable row level security;
alter table private.announcement_classification_alias enable row level security;
alter table private.announcement_classification_backfill_checkpoint enable row level security;
alter table private.announcement_classification_index enable row level security;
alter table private.announcement_classification_learning_log enable row level security;

revoke all on table private.announcement_classification from public, anon, authenticated;
revoke all on table private.announcement_classification_alias from public, anon, authenticated;
revoke all on table private.announcement_classification_backfill_checkpoint from public, anon, authenticated;
revoke all on table private.announcement_classification_index from public, anon, authenticated;
revoke all on table private.announcement_classification_learning_log from public, anon, authenticated;
grant select, insert, update, delete on private.announcement_classification to service_role;
grant select on private.announcement_classification_alias to service_role;
grant select, insert, update, delete on private.announcement_classification_backfill_checkpoint to service_role;
grant select, insert, update, delete on private.announcement_classification_index to service_role;
grant select, insert, update on private.announcement_classification_learning_log to service_role;

insert into private.announcement_classification_alias(term, canonical_term, status, classification_version)
values
  ('一模','第一次模擬考','approved',1),
  ('一段','第一次定期考查','approved',1),
  ('三段','第三次定期考查','approved',1),
  ('二模','第二次模擬考','approved',1),
  ('二段','第二次定期考查','approved',1),
  ('個申','個人申請','approved',1),
  ('寒輔','寒假輔導','approved',1),
  ('微課','微課程','approved',1),
  ('暑輔','暑期輔導','approved',1),
  ('段考','定期考查','approved',1),
  ('繁星','繁星推薦','approved',1),
  ('被當','不及格／補考／重修','approved',1),
  ('跑班','多元選修／跑班','approved',1),
  ('轉社','社團轉社','approved',1),
  ('重補修','重修／補修','approved',1)
on conflict (term) do nothing;

create or replace function public.upsert_announcement_classifications(
  records jsonb, target_run_id text, target_batch_number integer, target_batch_key text
) returns integer
language plpgsql
set search_path to 'pg_catalog', 'private'
as $function$
declare affected integer; prior private.announcement_classification_backfill_checkpoint%rowtype;
begin
  if jsonb_typeof(records)<>'array' or jsonb_array_length(records)>500
     or char_length(btrim(coalesce(target_run_id,''))) not between 1 and 120
     or target_batch_number not between 0 and 1000000
     or char_length(btrim(coalesce(target_batch_key,''))) not between 32 and 128 then
    raise exception 'invalid classification batch' using errcode='22023';
  end if;
  select * into prior from private.announcement_classification_backfill_checkpoint
    where run_id=target_run_id and batch_number=target_batch_number;
  if found then
    if prior.batch_key<>target_batch_key then raise exception 'classification checkpoint conflict' using errcode='23505'; end if;
    return prior.record_count;
  end if;
  if exists (
    select 1 from jsonb_to_recordset(records) as row(announcement_id text,title text,classification jsonb)
    where char_length(btrim(coalesce(row.announcement_id,''))) not between 1 and 180
       or char_length(coalesce(row.title,''))>500
       or jsonb_typeof(row.classification)<>'object'
       or row.classification->>'announcement_id' is distinct from btrim(row.announcement_id)
       or coalesce((row.classification->>'classification_version')::integer,0)<>1
       or coalesce(row.classification->>'main_category','') not in (
         'academic_exam','course_selection','admission','student_affairs','club','competition',
         'event_learning','scholarship','honor_roll','enrollment','administration','rules_policy','campus_service','other')
       or coalesce((row.classification->>'classification_confidence')::numeric,-1) not between 0 and 1
       or jsonb_typeof(row.classification->'event_types')<>'array'
       or jsonb_typeof(row.classification->'audience')<>'array'
       or jsonb_typeof(row.classification->'topics')<>'array'
       or jsonb_typeof(row.classification->'actions')<>'array'
       or jsonb_typeof(row.classification->'available_fields')<>'array'
       or jsonb_typeof(row.classification->'classification_sources')<>'array'
       or jsonb_typeof(row.classification->'dates')<>'object'
  ) then raise exception 'invalid classification record' using errcode='22023'; end if;

  insert into private.announcement_classification as existing(
    announcement_id,title,school,main_category,sub_category,event_types,audience,topics,actions,
    requested_fields,available_fields,academic_year,semester,dates,department,location,reference_value,
    classification_confidence,classification_sources,classification_version,classification_source_hash,
    matched_aliases,unresolved_terms,updated_at)
  select btrim(row.announcement_id),left(coalesce(row.title,''),500),left(row.classification->>'school',40),
    row.classification->>'main_category',left(coalesce(row.classification->>'sub_category','other'),120),
    coalesce(array(select jsonb_array_elements_text(row.classification->'event_types')),'{}'),
    coalesce(array(select jsonb_array_elements_text(row.classification->'audience')),'{}'),
    coalesce(array(select jsonb_array_elements_text(row.classification->'topics')),'{}'),
    coalesce(array(select jsonb_array_elements_text(row.classification->'actions')),'{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(row.classification->'requested_fields','[]'::jsonb))),'{}'),
    coalesce(array(select jsonb_array_elements_text(row.classification->'available_fields')),'{}'),
    nullif(row.classification->>'academic_year','')::integer,nullif(row.classification->>'semester','')::integer,
    row.classification->'dates',nullif(left(coalesce(row.classification->>'department',''),240),''),
    nullif(left(coalesce(row.classification->>'location',''),500),''),
    coalesce(nullif(row.classification->>'reference_value',''),'NONE'),
    (row.classification->>'classification_confidence')::numeric,
    coalesce(array(select jsonb_array_elements_text(row.classification->'classification_sources')),'{}'),
    (row.classification->>'classification_version')::integer,left(row.classification->>'classification_source_hash',160),
    coalesce(array(select jsonb_array_elements_text(coalesce(row.classification->'matched_aliases','[]'::jsonb))),'{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(row.classification->'unresolved_terms','[]'::jsonb))),'{}'),now()
  from jsonb_to_recordset(records) as row(announcement_id text,title text,classification jsonb)
  on conflict(announcement_id) do update set
    title=excluded.title,school=excluded.school,main_category=excluded.main_category,
    sub_category=excluded.sub_category,event_types=excluded.event_types,audience=excluded.audience,
    topics=excluded.topics,actions=excluded.actions,requested_fields=excluded.requested_fields,
    available_fields=excluded.available_fields,academic_year=excluded.academic_year,semester=excluded.semester,
    dates=excluded.dates,department=excluded.department,location=excluded.location,
    reference_value=excluded.reference_value,classification_confidence=excluded.classification_confidence,
    classification_sources=excluded.classification_sources,classification_version=excluded.classification_version,
    classification_source_hash=excluded.classification_source_hash,matched_aliases=excluded.matched_aliases,
    unresolved_terms=excluded.unresolved_terms,updated_at=now();
  get diagnostics affected=row_count;

  delete from private.announcement_classification_index idx
  where idx.announcement_id in (select btrim(row.announcement_id) from jsonb_to_recordset(records) as row(announcement_id text));
  insert into private.announcement_classification_index(dimension,token,announcement_id,classification_version)
  select valueset.dimension,left(valueset.token,180),c.announcement_id,c.classification_version
  from private.announcement_classification c
  join (select btrim(row.announcement_id) id from jsonb_to_recordset(records) as row(announcement_id text)) batch on batch.id=c.announcement_id
  cross join lateral (
    select 'school'::text,c.school::text union all select 'main_category',c.main_category union all
    select 'sub_category',c.sub_category union all select 'academic_year',c.academic_year::text where c.academic_year is not null union all
    select 'semester',c.semester::text where c.semester is not null union all
    select 'topic',value from unnest(c.topics) value union all select 'audience',value from unnest(c.audience) value union all
    select 'event_type',value from unnest(c.event_types) value union all select 'action',value from unnest(c.actions) value union all
    select 'available_field',value from unnest(c.available_fields) value union all
    select 'date',coalesce(mention->>'role','mention')||':'||(mention->>'value')
      from jsonb_array_elements(coalesce(c.dates->'mentions','[]'::jsonb)) mention where coalesce(mention->>'value','')<>''
  ) valueset(dimension,token)
  where char_length(coalesce(valueset.token,'')) between 1 and 180
  on conflict do nothing;

  insert into private.announcement_classification_backfill_checkpoint(
    run_id,batch_number,batch_key,classification_version,status,record_count,completed_at)
  values(target_run_id,target_batch_number,target_batch_key,1,'completed',affected,now());
  return affected;
end;
$function$;

create or replace function public.admin_list_announcement_classifications(
  school_filter text default 'all',
  main_category_filter text default 'all',
  academic_year_filter integer default null,
  confidence_max numeric default null,
  unclassified_only boolean default false,
  page_size integer default 100,
  page_offset integer default 0
) returns table(
  announcement_id text,title text,school text,main_category text,sub_category text,
  academic_year integer,semester integer,classification_confidence numeric,
  classification_sources text[],classification_version integer,data_layer text,total_count bigint
)
language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if auth.uid() is null or not public.is_app_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if page_size not between 1 and 100 or page_offset not between 0 and 100000
     or (confidence_max is not null and confidence_max not between 0 and 1) then
    raise exception 'invalid classification filters' using errcode='22023';
  end if;
  return query
    select c.announcement_id,c.title,c.school,
      coalesce(c.classification_override->>'main_category',c.main_category),
      coalesce(c.classification_override->>'sub_category',c.sub_category),c.academic_year,c.semester,
      c.classification_confidence,c.classification_sources,c.classification_version,
      case when exists(select 1 from private.announcement_archive a where a.announcement_id=c.announcement_id and a.status='ARCHIVED')
        then 'ARCHIVE' else 'ACTIVE' end,count(*) over()
    from private.announcement_classification c
    where (school_filter='all' or c.school=school_filter)
      and (main_category_filter='all' or coalesce(c.classification_override->>'main_category',c.main_category)=main_category_filter)
      and (academic_year_filter is null or c.academic_year=academic_year_filter)
      and (confidence_max is null or c.classification_confidence<=confidence_max)
      and (not unclassified_only or c.main_category='other')
    order by c.classification_confidence,c.announcement_id limit page_size offset page_offset;
end;
$function$;

revoke all on function public.upsert_announcement_classifications(jsonb,text,integer,text) from public, anon, authenticated;
grant execute on function public.upsert_announcement_classifications(jsonb,text,integer,text) to service_role;
revoke all on function public.admin_list_announcement_classifications(text,text,integer,numeric,boolean,integer,integer) from public, anon;
grant execute on function public.admin_list_announcement_classifications(text,text,integer,numeric,boolean,integer,integer) to authenticated, service_role;
