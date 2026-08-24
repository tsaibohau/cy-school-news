-- Harden the reminder foundation before any scheduler is enabled.
-- This migration is intentionally schema-only: cron, Vault secrets, and the
-- delivery Edge Function are activated separately after deployed validation.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.reminder_targets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('announcement_deadline', 'announcement_event', 'official_calendar_event', 'task_due')),
  target_id text not null,
  target_at timestamptz not null,
  timezone text not null default 'Asia/Taipei',
  provenance text not null check (provenance in ('official_announcement', 'official_attachment', 'official_calendar', 'verified_task_due')),
  source_revision text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (owner_user_id, target_kind, target_id, source_revision),
  unique (id, owner_user_id)
);

alter table public.reminder_targets enable row level security;
revoke all on table public.reminder_targets from anon, authenticated;

create or replace function public.valid_reminder_offsets(offsets integer[])
returns boolean
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
  select cardinality(offsets) between 1 and 8
    and array_position(offsets, null) is null
    and not exists (select 1 from unnest(offsets) value where value < 0 or value > 365)
    and cardinality(offsets) = (select count(distinct value) from unnest(offsets) value)
$$;
revoke all on function public.valid_reminder_offsets(integer[]) from public, anon;
grant execute on function public.valid_reminder_offsets(integer[]) to authenticated;

alter table public.user_reminder_rules
  add column if not exists reminder_target_id uuid references public.reminder_targets(id) on delete restrict,
  add column if not exists manual_target_at timestamptz,
  add column if not exists timezone text not null default 'Asia/Taipei',
  add column if not exists provenance text,
  add column if not exists source_revision text,
  add column if not exists preset text not null default 'single',
  add column if not exists schedule_baseline_at timestamptz not null default now(),
  add column if not exists disabled_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.user_reminder_rules
  drop constraint if exists user_reminder_rules_offsets_days_check,
  add constraint user_reminder_rules_offsets_days_strict_check check (public.valid_reminder_offsets(offsets_days)),
  add constraint user_reminder_rules_preset_check check (preset in ('single', 'standard', 'dense', 'custom')),
  add constraint user_reminder_rules_target_shape_check check (
    (target_kind = 'manual' and manual_target_at is not null and reminder_target_id is null and provenance = 'manual')
    or
    (target_kind <> 'manual' and manual_target_at is null and reminder_target_id is not null)
  ) not valid,
  add constraint user_reminder_rules_id_user_key unique (id, user_id);

-- A trusted catalog row, never a browser-supplied publication date, resolves
-- every automatic reminder target. Task targets must belong to the same user.
create or replace function private.validate_reminder_rule_target()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trusted public.reminder_targets%rowtype;
begin
  if new.target_kind = 'manual' then
    new.provenance := 'manual';
    new.source_revision := coalesce(nullif(new.source_revision, ''), 'manual');
    return new;
  end if;

  select * into trusted from public.reminder_targets
   where id = new.reminder_target_id and active;
  if not found or trusted.target_kind <> new.target_kind or trusted.target_id <> new.target_id then
    raise exception 'unverified reminder target';
  end if;
  if trusted.owner_user_id is not null and trusted.owner_user_id <> new.user_id then
    raise exception 'foreign reminder target';
  end if;
  new.timezone := trusted.timezone;
  new.provenance := trusted.provenance;
  new.source_revision := trusted.source_revision;
  return new;
end;
$$;
revoke all on function private.validate_reminder_rule_target() from public, anon, authenticated;

drop trigger if exists validate_reminder_rule_target on public.user_reminder_rules;
create trigger validate_reminder_rule_target
before insert or update on public.user_reminder_rules
for each row execute function private.validate_reminder_rule_target();

alter table public.user_push_subscriptions
  add column if not exists disabled_at timestamptz,
  add column if not exists invalidated_at timestamptz,
  add column if not exists failure_count integer not null default 0 check (failure_count >= 0),
  add column if not exists last_failure_at timestamptz,
  add constraint user_push_subscriptions_id_user_key unique (id, user_id);

-- One Web Push endpoint cannot silently belong to two accounts.
alter table public.user_push_subscriptions
  drop constraint if exists user_push_subscriptions_user_id_endpoint_key,
  add constraint user_push_subscriptions_endpoint_key unique (endpoint);

-- Replace broad ALL policies with soft-delete-compatible CRUD. Durable rule,
-- subscription, job, and delivery identities must not be erased by clients.
drop policy if exists user_reminder_rules_owner on public.user_reminder_rules;
create policy user_reminder_rules_owner_select on public.user_reminder_rules
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_reminder_rules_owner_insert on public.user_reminder_rules
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_reminder_rules_owner_update on public.user_reminder_rules
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_push_subscriptions_owner on public.user_push_subscriptions;
create policy user_push_subscriptions_owner_select on public.user_push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_push_subscriptions_owner_insert on public.user_push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_push_subscriptions_owner_update on public.user_push_subscriptions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Data API privileges are separate from RLS. Browser clients need only the
-- owner-scoped intent and device tables; internal jobs/ledger stay revoked.
revoke all on table public.user_reminder_rules from anon;
revoke all on table public.user_push_subscriptions from anon;
grant select, insert, update on table public.user_reminder_rules to authenticated;
grant select, insert, update on table public.user_push_subscriptions to authenticated;

alter table public.reminder_jobs
  drop constraint if exists reminder_jobs_rule_id_fkey,
  add column if not exists scheduled_for timestamptz,
  add column if not exists attempts integer not null default 0 check (attempts >= 0),
  add column if not exists max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists lease_until timestamptz,
  add column if not exists lease_token uuid,
  add column if not exists terminal_at timestamptz,
  add constraint reminder_jobs_rule_owner_fkey foreign key (rule_id, user_id)
    references public.user_reminder_rules(id, user_id) on delete restrict,
  add constraint reminder_jobs_id_user_key unique (id, user_id),
  drop constraint if exists reminder_jobs_status_check;

update public.reminder_jobs set status = 'retry' where status = 'failed';
alter table public.reminder_jobs
  add constraint reminder_jobs_status_check check (status in ('pending', 'processing', 'sent', 'skipped', 'retry', 'dead', 'cancelled'));

update public.reminder_jobs
set scheduled_for = target_at - make_interval(days => offset_days),
    next_attempt_at = coalesce(next_attempt_at, target_at - make_interval(days => offset_days))
where scheduled_for is null or next_attempt_at is null;
alter table public.reminder_jobs alter column scheduled_for set not null;
alter table public.reminder_jobs alter column next_attempt_at set not null;

alter table public.reminder_deliveries
  drop constraint if exists reminder_deliveries_job_id_fkey,
  drop constraint if exists reminder_deliveries_push_subscription_id_fkey,
  add column if not exists attempts integer not null default 0 check (attempts >= 0),
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists terminal_at timestamptz,
  add constraint reminder_deliveries_job_owner_fkey foreign key (job_id, user_id)
    references public.reminder_jobs(id, user_id) on delete restrict,
  add constraint reminder_deliveries_subscription_owner_fkey foreign key (push_subscription_id, user_id)
    references public.user_push_subscriptions(id, user_id) on delete restrict,
  drop constraint if exists reminder_deliveries_status_check;

update public.reminder_deliveries set status = 'retry' where status = 'failed';
alter table public.reminder_deliveries
  add constraint reminder_deliveries_status_check check (status in ('pending', 'processing', 'sent', 'invalid', 'retry', 'dead', 'cancelled'));

-- Internal scheduling and delivery state is never exposed to browser roles.
revoke all on table public.reminder_jobs from anon, authenticated;
revoke all on table public.reminder_deliveries from anon, authenticated;

create index if not exists reminder_jobs_worker_due_idx
  on public.reminder_jobs (next_attempt_at, scheduled_for)
  where status in ('pending', 'retry');
create index if not exists reminder_jobs_lease_recovery_idx
  on public.reminder_jobs (lease_until)
  where status = 'processing';
create index if not exists reminder_deliveries_retry_idx
  on public.reminder_deliveries (next_attempt_at)
  where status in ('pending', 'retry');
create index if not exists reminder_targets_lookup_idx
  on public.reminder_targets (target_kind, target_id)
  where active;

create or replace function private.set_reminder_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['reminder_targets', 'user_reminder_rules', 'user_push_subscriptions', 'reminder_jobs']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_reminder_updated_at()', table_name);
  end loop;
end $$;

-- Date-only product semantics: upstream resolvers materialize midnight in the
-- rule timezone (Asia/Taipei by default) into target_at before job generation.
comment on column public.user_reminder_rules.timezone is
  'IANA timezone; date-only targets resolve at local midnight, default Asia/Taipei.';
comment on table public.reminder_targets is
  'Server-owned verified target catalog. Publication dates are not valid targets.';
