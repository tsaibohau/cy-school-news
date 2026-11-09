-- 私有 bucket：存放「非公開學校」的爬蟲資料（公開倉庫之外）。
-- 只有嘉中（cysh）可以公開；其他學校的資料只給聯席管理員以上（owner、co_admin）。
--
-- 為什麼這樣設計：
--   * bucket 為 private（public = false），匿名網址讀取一律拒絕。
--   * storage.objects 只有一條 SELECT policy，且僅限 authenticated + 現役 owner/co_admin。
--   * 不建立 insert/update/delete policy：寫入只由 Edge Function restricted-data-sync 以
--     service role 進行（service role 會略過 RLS），一般登入者與匿名者都無法寫入。
--   * is_active_app_admin() 依本專案慣例撤銷了 authenticated 的 execute 權限；RLS 運算式以呼叫者
--     權限執行，直接呼叫會 permission denied，所以包一層 security definer 的 can_read_restricted_data()，
--     內部才呼叫 is_active_app_admin((select auth.uid()))。search_path 已固定。

insert into storage.buckets (id, name, public, file_size_limit)
values ('restricted-data', 'restricted-data', false, 8388608)
on conflict (id) do update
  set public = false,
      file_size_limit = 8388608;

create or replace function public.can_read_restricted_data()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_active_app_admin((select auth.uid()))
$$;

revoke all on function public.can_read_restricted_data() from public, anon;
grant execute on function public.can_read_restricted_data() to authenticated;

drop policy if exists "restricted_data_admin_select" on storage.objects;
create policy "restricted_data_admin_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'restricted-data'
    and public.can_read_restricted_data()
  );
