create or replace function public.admin_account_capabilities(target_user_ids uuid[])
returns table(user_id uuid, capability text, enabled boolean)
language plpgsql stable security definer set search_path=pg_catalog,public
as $$ begin
 if not public.is_app_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 return query select c.user_id,c.capability,c.enabled from public.account_capabilities c where c.user_id=any(target_user_ids) order by c.user_id,c.capability;
end $$;
revoke all on function public.admin_account_capabilities(uuid[]) from public,anon;
grant execute on function public.admin_account_capabilities(uuid[]) to authenticated;

drop policy if exists "subscriptions own rows" on public.user_subscriptions;
create policy "subscriptions own rows" on public.user_subscriptions for all to authenticated
 using ((select auth.uid())=user_id and public.has_account_capability('notifications'))
 with check ((select auth.uid())=user_id and public.has_account_capability('notifications'));

drop policy if exists "reads own rows" on public.user_reads;
create policy "reads own rows" on public.user_reads for all to authenticated
 using ((select auth.uid())=user_id and public.has_account_capability('member_content'))
 with check ((select auth.uid())=user_id and public.has_account_capability('member_content'));

drop policy if exists "preferences own row" on public.user_preferences;
create policy "preferences own row" on public.user_preferences for all to authenticated
 using ((select auth.uid())=user_id and (public.has_account_capability('assistant') or public.has_account_capability('timetable') or public.has_account_capability('calendar') or public.has_account_capability('notifications')))
 with check ((select auth.uid())=user_id and (public.has_account_capability('assistant') or public.has_account_capability('timetable') or public.has_account_capability('calendar') or public.has_account_capability('notifications')));

drop policy if exists "tasks own rows" on public.user_tasks;
create policy "tasks own rows" on public.user_tasks for all to authenticated
 using ((select auth.uid())=user_id and public.has_account_capability('calendar'))
 with check ((select auth.uid())=user_id and public.has_account_capability('calendar'));
