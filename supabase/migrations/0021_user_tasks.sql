-- Personal Assistant M4: private, account-owned tasks.
-- Public announcements remain static GitHub JSON; this table stores only user data.
create table if not exists public.user_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'open',
  due_date date,
  priority smallint,
  notes text not null default '',
  source_announcement_id text,
  source_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz,
  constraint user_tasks_title_nonempty check (length(trim(title)) > 0),
  constraint user_tasks_status_valid check (status in ('open', 'completed')),
  constraint user_tasks_priority_valid check (priority is null or priority between 0 and 5)
);

alter table public.user_tasks enable row level security;

drop policy if exists "tasks own rows" on public.user_tasks;
create policy "tasks own rows" on public.user_tasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.user_tasks from anon;
grant select, insert, update, delete on public.user_tasks to authenticated;

create index if not exists user_tasks_user_updated_idx
  on public.user_tasks (user_id, updated_at desc);
