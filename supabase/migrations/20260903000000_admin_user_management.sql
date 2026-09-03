-- Invite-only account management framework.
-- Browser roles have no direct access. The administrator Edge Function verifies
-- the caller using Supabase Auth and performs privileged actions server-side.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz
);

alter table public.app_admins enable row level security;
revoke all on table public.app_admins from anon, authenticated;

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('invite_requested')),
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from anon, authenticated;
