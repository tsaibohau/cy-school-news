# Personal Assistant V1 — M4 Task Design Proposal

M4 is intentionally not migrated in the M3 cycle. Tasks remain a separate
domain object from Calendar user events.

## Table

`public.user_tasks`

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `title text not null`
- `status text not null default 'open'` with `open` / `completed`
- `due_date date`
- `priority smallint`
- `notes text not null default ''`
- `source_announcement_id text`
- `source_event_id text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `completed_at timestamptz`

The intended uniqueness key is `id`; updates and deletes address the same
user-owned logical row. Source links are references only and do not copy the
public announcement corpus into Supabase.

## RLS and adapter rules

Enable RLS and use one policy family:

    using (auth.uid() = user_id)
    with check (auth.uid() = user_id)

Revoke anonymous access. Grant authenticated CRUD only. The adapter must
discard caller-provided user_id and force the UID from the verified Supabase
session. M4 requires real USER_A / USER_B behavioral acceptance before any
migration is applied.

## Product behavior

Create, edit, complete, reopen, delete, reload, and cross-device sync are
required. “加入待辦” is an explicit user-confirmed action. A verified
announcement deadline may prefill due_date; publication date may never be
used as a due date. Calendar user events are not automatically converted to
tasks.
