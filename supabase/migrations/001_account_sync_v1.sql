-- Account & Sync V1: user data only. Public announcements stay in GitHub JSON.
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  keyword text not null,
  normalized_keyword text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint user_subscriptions_keyword_nonempty check (length(trim(keyword)) > 0),
  constraint user_subscriptions_normalized_nonempty check (length(trim(normalized_keyword)) > 0),
  unique (user_id, normalized_keyword)
);

create table if not exists public.user_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  announcement_id text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_subscriptions enable row level security;
alter table public.user_reads enable row level security;
alter table public.user_preferences enable row level security;

create policy "subscriptions own rows" on public.user_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reads own rows" on public.user_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "preferences own row" on public.user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.user_subscriptions from anon;
revoke all on public.user_reads from anon;
revoke all on public.user_preferences from anon;
grant select, insert, update, delete on public.user_subscriptions to authenticated;
grant select, insert, update, delete on public.user_reads to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
