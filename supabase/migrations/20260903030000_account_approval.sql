-- Open registration with administrator approval.
-- Every Auth user receives a server-controlled access state. User metadata is never
-- used for authorization.

create table if not exists public.account_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

alter table public.account_access enable row level security;
revoke all on table public.account_access from anon, authenticated;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.register_pending_account()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.account_access (user_id, status)
  values (new.id, 'pending')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.register_pending_account() from public;

drop trigger if exists account_access_after_auth_user on auth.users;
create trigger account_access_after_auth_user
after insert on auth.users
for each row execute function private.register_pending_account();

insert into public.account_access (user_id, status)
select id, 'pending' from auth.users
on conflict (user_id) do nothing;

create or replace function private.current_account_is_approved()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.account_access
    where user_id = (select auth.uid())
      and status = 'approved'
  );
$$;

revoke all on function private.current_account_is_approved() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_account_is_approved() to authenticated;

alter policy "preferences own row" on public.user_preferences
  using ((auth.uid() = user_id) and (select private.current_account_is_approved()))
  with check ((auth.uid() = user_id) and (select private.current_account_is_approved()));

alter policy "reads own rows" on public.user_reads
  using ((auth.uid() = user_id) and (select private.current_account_is_approved()))
  with check ((auth.uid() = user_id) and (select private.current_account_is_approved()));

alter policy "subscriptions own rows" on public.user_subscriptions
  using ((auth.uid() = user_id) and (select private.current_account_is_approved()))
  with check ((auth.uid() = user_id) and (select private.current_account_is_approved()));

alter policy "tasks own rows" on public.user_tasks
  using (((select auth.uid()) = user_id) and (select private.current_account_is_approved()))
  with check (((select auth.uid()) = user_id) and (select private.current_account_is_approved()));

alter policy "user_push_subscriptions_owner_select" on public.user_push_subscriptions
  using (((select auth.uid()) = user_id) and (select private.current_account_is_approved()));

alter policy "user_push_subscriptions_owner_insert" on public.user_push_subscriptions
  with check (((select auth.uid()) = user_id) and (select private.current_account_is_approved()));

alter policy "user_push_subscriptions_owner_update" on public.user_push_subscriptions
  using (((select auth.uid()) = user_id) and (select private.current_account_is_approved()))
  with check (((select auth.uid()) = user_id) and (select private.current_account_is_approved()));

alter policy "user_reminder_rules_owner_select" on public.user_reminder_rules
  using (((select auth.uid()) = user_id) and (select private.current_account_is_approved()));

alter policy "user_reminder_rules_owner_insert" on public.user_reminder_rules
  with check (((select auth.uid()) = user_id) and (select private.current_account_is_approved()));

alter policy "user_reminder_rules_owner_update" on public.user_reminder_rules
  using (((select auth.uid()) = user_id) and (select private.current_account_is_approved()))
  with check (((select auth.uid()) = user_id) and (select private.current_account_is_approved()));
