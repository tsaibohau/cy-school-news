-- Schema contract for the staging refresh endpoint.
-- Promote through the Supabase CLI migration workflow before deploying the
-- Edge Function. This file is not itself an applied migration.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.user_refresh_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  status text not null default 'accepted' check (status in ('accepted', 'dispatched', 'dispatch_failed')),
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  safe_error_code text,
  unique (user_id, idempotency_key)
);
alter table private.user_refresh_requests enable row level security;
revoke all on table private.user_refresh_requests from public, anon, authenticated;

create index if not exists user_refresh_requests_user_created_idx
  on private.user_refresh_requests (user_id, created_at desc);
create index if not exists user_refresh_requests_created_idx
  on private.user_refresh_requests (created_at desc);

create or replace function public.claim_staging_refresh(
  requested_user_id uuid,
  requested_idempotency_key uuid,
  per_user_cooldown_seconds integer default 300,
  global_cooldown_seconds integer default 120
)
returns table (request_id uuid, decision text, retry_after_seconds integer)
language plpgsql
security invoker
set search_path = private, pg_catalog, pg_temp
as $$
declare
  existing private.user_refresh_requests%rowtype;
  last_user_at timestamptz;
  last_global_at timestamptz;
  wait_seconds integer;
begin
  if per_user_cooldown_seconds < 60 or per_user_cooldown_seconds > 3600
     or global_cooldown_seconds < 30 or global_cooldown_seconds > 900 then
    raise exception 'invalid refresh cooldown bounds';
  end if;

  perform pg_advisory_xact_lock(20260825, 1);
  perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text, 20260825));

  select * into existing from private.user_refresh_requests
   where user_id = requested_user_id and idempotency_key = requested_idempotency_key;
  if found then
    return query select existing.id, 'duplicate'::text, 0;
    return;
  end if;

  select max(created_at) into last_user_at from private.user_refresh_requests
   where user_id = requested_user_id;
  select max(created_at) into last_global_at from private.user_refresh_requests;
  wait_seconds := greatest(
    coalesce(ceil(extract(epoch from last_user_at + make_interval(secs => per_user_cooldown_seconds) - now()))::integer, 0),
    coalesce(ceil(extract(epoch from last_global_at + make_interval(secs => global_cooldown_seconds) - now()))::integer, 0)
  );
  if wait_seconds > 0 then
    return query select null::uuid, 'rate_limited'::text, wait_seconds;
    return;
  end if;

  insert into private.user_refresh_requests (user_id, idempotency_key)
  values (requested_user_id, requested_idempotency_key)
  returning id into request_id;
  decision := 'accepted';
  retry_after_seconds := 0;
  return next;
end;
$$;
revoke all on function public.claim_staging_refresh(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_staging_refresh(uuid, uuid, integer, integer) to service_role;

create or replace function public.finish_staging_refresh_dispatch(
  refresh_request_id uuid,
  dispatch_succeeded boolean,
  safe_error_code text default null
)
returns boolean
language plpgsql
security invoker
set search_path = private, pg_catalog, pg_temp
as $$
begin
  update private.user_refresh_requests
     set status = case when dispatch_succeeded then 'dispatched' else 'dispatch_failed' end,
         dispatched_at = case when dispatch_succeeded then now() else null end,
         safe_error_code = case when dispatch_succeeded then null else left(safe_error_code, 80) end
   where id = refresh_request_id and status = 'accepted';
  return found;
end;
$$;
revoke all on function public.finish_staging_refresh_dispatch(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.finish_staging_refresh_dispatch(uuid, boolean, text) to service_role;
