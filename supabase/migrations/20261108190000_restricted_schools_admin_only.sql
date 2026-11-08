-- 只有嘉中（cysh）公開；其他學校（含嘉女）的會員內文只給聯席管理員以上（owner、co_admin）。
-- 公告編號以學校代號開頭（cysh-…、cygsh-…），以前綴判斷學校。

create or replace function public.can_view_school_content(p_announcement_id text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select coalesce(p_announcement_id, '') like 'cysh-%'
    or public.is_active_app_admin((select auth.uid()))
$$;

revoke all on function public.can_view_school_content(text) from public;
grant execute on function public.can_view_school_content(text) to anon, authenticated;

create or replace function public.member_announcement_detail(target_announcement_id text)
returns table(announcement_id text, detail jsonb, source_hash text, updated_at timestamp with time zone)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if not ((auth.uid() is null and public.has_public_capability('member_content')) or
          (auth.uid() is not null and public.has_account_capability('member_content'))) then return; end if;
  if target_announcement_id is null or char_length(target_announcement_id) not between 1 and 180 then raise exception 'invalid_announcement_id' using errcode='22023'; end if;
  if not public.can_view_school_content(target_announcement_id) then return; end if;
  return query select c.announcement_id,c.detail,c.source_hash,c.updated_at
  from private.announcement_member_content c where c.announcement_id=target_announcement_id
    and not exists(select 1 from private.announcement_lifecycle l where l.announcement_id=c.announcement_id and l.action='archive');
end $function$;

create or replace function public.member_announcement_index(page_size integer default 200, page_offset integer default 0)
returns table(announcement_id text, summary text, snippet text, source_hash text, updated_at timestamp with time zone)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  admin_view boolean := public.is_active_app_admin(auth.uid());
begin
  if not ((auth.uid() is null and public.has_public_capability('member_content')) or
          (auth.uid() is not null and public.has_account_capability('member_content'))) then return; end if;
  if page_size<1 or page_size>500 or page_offset<0 or page_offset>100000 then raise exception 'invalid_announcement_page' using errcode='22023'; end if;
  return query select c.announcement_id,c.summary,c.snippet,c.source_hash,c.updated_at
  from private.announcement_member_content c
  where (admin_view or c.announcement_id like 'cysh-%')
    and not exists(select 1 from private.announcement_lifecycle l where l.announcement_id=c.announcement_id and l.action='archive')
  order by c.announcement_id limit page_size offset page_offset;
end $function$;

create or replace function public.member_historical_reference_index(school_filter text, category_filter text default 'all', academic_year_filter integer default null, semester_filter integer default null, page_size integer default 50, page_offset integer default 0)
returns table(announcement_id text, title text, school text, category text, subcategory text, academic_year integer, semester integer, reference_value text, validity text, original_publish_date date, source_url text, summary text, snippet text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if auth.uid() is null or not public.has_account_capability('member_content') then return; end if;
  if char_length(coalesce(school_filter,'')) not between 1 and 40
     or page_size not between 1 and 100 or page_offset not between 0 and 100000 then
    raise exception 'invalid_reference_filters' using errcode='22023';
  end if;
  if school_filter <> 'cysh' and not public.is_active_app_admin(auth.uid()) then return; end if;
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
$function$;
