-- Additive reminder foundation. Delivery state stays device/server scoped;
-- no browser-accessible table receives service credentials.
create table if not exists public.user_reminder_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('announcement_deadline', 'announcement_event', 'official_calendar_event', 'task_due', 'manual')),
  target_id text not null,
  offsets_days integer[] not null default '{1}' check (cardinality(offsets_days) between 1 and 8),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_kind, target_id)
);

create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table if not exists public.reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.user_reminder_rules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  target_at timestamptz not null,
  offset_days integer not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_id, offset_days, target_at)
);

create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.reminder_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  push_subscription_id uuid not null references public.user_push_subscriptions(id) on delete cascade,
  delivered_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'invalid', 'failed')),
  last_error text,
  created_at timestamptz not null default now(),
  unique (job_id, push_subscription_id)
);

alter table public.user_reminder_rules enable row level security;
alter table public.user_push_subscriptions enable row level security;
alter table public.reminder_jobs enable row level security;
alter table public.reminder_deliveries enable row level security;

create policy user_reminder_rules_owner on public.user_reminder_rules
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_push_subscriptions_owner on public.user_push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Jobs and deliveries are server-worker tables. No authenticated policy is
-- granted, so ordinary browser sessions cannot read or mutate them.

