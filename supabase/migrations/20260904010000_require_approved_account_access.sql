-- Account approval is an authorization rule, not only a UI state.  An
-- authenticated account must be approved before it can access private data.
create or replace function public.has_approved_account()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.account_access access
       where access.user_id = auth.uid()
         and access.status = 'approved'
     )
$$;

revoke all on function public.has_approved_account() from public, anon;
grant execute on function public.has_approved_account() to authenticated;

-- Replace the ownership-only policies.  The explicit operation policies keep
-- grants, ownership, and approval requirements legible in one place.
drop policy if exists "subscriptions own rows" on public.user_subscriptions;
drop policy if exists "reads own rows" on public.user_reads;
drop policy if exists "preferences own row" on public.user_preferences;
drop policy if exists "tasks own rows" on public.user_tasks;
drop policy if exists user_reminder_rules_owner on public.user_reminder_rules;
drop policy if exists user_reminder_rules_owner_select on public.user_reminder_rules;
drop policy if exists user_reminder_rules_owner_insert on public.user_reminder_rules;
drop policy if exists user_reminder_rules_owner_update on public.user_reminder_rules;
drop policy if exists user_push_subscriptions_owner on public.user_push_subscriptions;
drop policy if exists user_push_subscriptions_owner_select on public.user_push_subscriptions;
drop policy if exists user_push_subscriptions_owner_insert on public.user_push_subscriptions;
drop policy if exists user_push_subscriptions_owner_update on public.user_push_subscriptions;

create policy approved_subscriptions_select on public.user_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_subscriptions_insert on public.user_subscriptions for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_subscriptions_update on public.user_subscriptions for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()))
  with check ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_subscriptions_delete on public.user_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()));

create policy approved_reads_select on public.user_reads for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_reads_insert on public.user_reads for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_reads_update on public.user_reads for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()))
  with check ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_reads_delete on public.user_reads for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()));

create policy approved_preferences_select on public.user_preferences for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_preferences_insert on public.user_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_preferences_update on public.user_preferences for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()))
  with check ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_preferences_delete on public.user_preferences for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()));

create policy approved_tasks_select on public.user_tasks for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_tasks_insert on public.user_tasks for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_tasks_update on public.user_tasks for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()))
  with check ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_tasks_delete on public.user_tasks for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()));

create policy approved_reminder_rules_select on public.user_reminder_rules for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_reminder_rules_insert on public.user_reminder_rules for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_reminder_rules_update on public.user_reminder_rules for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()))
  with check ((select auth.uid()) = user_id and (select public.has_approved_account()));

create policy approved_push_subscriptions_select on public.user_push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_push_subscriptions_insert on public.user_push_subscriptions for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_approved_account()));
create policy approved_push_subscriptions_update on public.user_push_subscriptions for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_approved_account()))
  with check ((select auth.uid()) = user_id and (select public.has_approved_account()));
