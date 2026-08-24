-- Atomic worker boundary for the reminder Edge Function. No cron is enabled
-- here; activation remains a separate staging control-plane step.

alter table public.reminder_deliveries
  add column if not exists lease_until timestamptz,
  add column if not exists lease_token uuid,
  add column if not exists response_status integer,
  add column if not exists response_code text;

create or replace function public.claim_reminder_deliveries(
  batch_size integer default 25,
  lease_seconds integer default 90
)
returns table (
  delivery_id uuid,
  delivery_lease_token uuid,
  endpoint text,
  p256dh text,
  auth text,
  target_kind text,
  target_id text,
  target_at timestamptz,
  offset_days integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if batch_size < 1 or batch_size > 100 or lease_seconds < 30 or lease_seconds > 600 then
    raise exception 'invalid worker claim bounds';
  end if;

  update public.reminder_deliveries d
     set status = case when d.attempts >= j.max_attempts then 'dead' else 'retry' end,
         next_attempt_at = case when d.attempts >= j.max_attempts then d.next_attempt_at
                                else now() + make_interval(secs => least(3600, 30 * (2 ^ least(d.attempts, 7)))) end,
         terminal_at = case when d.attempts >= j.max_attempts then now() else null end,
         lease_until = null,
         lease_token = null,
         response_code = 'lease_expired'
    from public.reminder_jobs j
   where d.job_id = j.id
     and d.status = 'processing'
     and d.lease_until < now();

  insert into public.reminder_deliveries (
    job_id, user_id, push_subscription_id, status, next_attempt_at
  )
  select j.id, j.user_id, s.id, 'pending', now()
    from public.reminder_jobs j
    join public.user_reminder_rules r on (r.id, r.user_id) = (j.rule_id, j.user_id)
    join public.user_push_subscriptions s on s.user_id = j.user_id
   where j.status in ('pending', 'retry')
     and j.scheduled_for <= now()
     and j.target_at > now()
     and r.enabled and r.disabled_at is null and r.deleted_at is null
     and s.active and s.disabled_at is null and s.invalidated_at is null
  on conflict (job_id, push_subscription_id) do nothing;

  return query
  with candidates as (
    select d.id
      from public.reminder_deliveries d
      join public.reminder_jobs j on (j.id, j.user_id) = (d.job_id, d.user_id)
      join public.user_push_subscriptions s on (s.id, s.user_id) = (d.push_subscription_id, d.user_id)
     where d.status in ('pending', 'retry')
       and coalesce(d.next_attempt_at, now()) <= now()
       and j.target_at > now()
       and s.active and s.disabled_at is null and s.invalidated_at is null
     order by coalesce(d.next_attempt_at, d.created_at), d.created_at
     for update of d skip locked
     limit batch_size
  ), claimed as (
    update public.reminder_deliveries d
       set status = 'processing',
           attempts = d.attempts + 1,
           last_attempt_at = now(),
           lease_until = now() + make_interval(secs => lease_seconds),
           lease_token = gen_random_uuid()
      from candidates c
     where d.id = c.id
    returning d.*
  )
  select c.id, c.lease_token, s.endpoint, s.p256dh, s.auth,
         r.target_kind, r.target_id, j.target_at, j.offset_days
    from claimed c
    join public.reminder_jobs j on (j.id, j.user_id) = (c.job_id, c.user_id)
    join public.user_reminder_rules r on (r.id, r.user_id) = (j.rule_id, j.user_id)
    join public.user_push_subscriptions s on (s.id, s.user_id) = (c.push_subscription_id, c.user_id);
end;
$$;

revoke all on function public.claim_reminder_deliveries(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_reminder_deliveries(integer, integer) to service_role;

create or replace function public.finish_reminder_delivery(
  delivery_id uuid,
  delivery_lease_token uuid,
  outcome text,
  http_status integer default null,
  error_code text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  changed integer;
begin
  if outcome not in ('sent', 'invalid', 'retry', 'dead') then
    raise exception 'invalid delivery outcome';
  end if;
  update public.reminder_deliveries d
     set status = outcome,
         delivered_at = case when outcome = 'sent' then now() else d.delivered_at end,
         next_attempt_at = case when outcome = 'retry' then now() + make_interval(secs => least(3600, 30 * (2 ^ least(d.attempts, 7)))) else d.next_attempt_at end,
         terminal_at = case when outcome in ('sent', 'invalid', 'dead') then now() else null end,
         lease_until = null,
         lease_token = null,
         response_status = http_status,
         response_code = left(error_code, 120),
         last_error = case when outcome in ('retry', 'dead') then left(error_code, 500) else null end
   where d.id = delivery_id
     and d.status = 'processing'
     and d.lease_token = delivery_lease_token
     and d.lease_until >= now();
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.finish_reminder_delivery(uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.finish_reminder_delivery(uuid, uuid, text, integer, text) to service_role;

create index if not exists reminder_deliveries_worker_claim_idx
  on public.reminder_deliveries (next_attempt_at, created_at)
  where status in ('pending', 'retry');

comment on function public.claim_reminder_deliveries(integer, integer) is
  'Service-role-only atomic claim; browser roles are explicitly revoked.';
