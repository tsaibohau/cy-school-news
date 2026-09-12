-- Capability cutover v2. account_access.status remains the outer approval gate;
-- account_capabilities is the only product-feature authorization source.

-- Initialize only missing rows. Existing rows are deliberately never recomputed
-- from the legacy service_level preset.
create or replace function private.initialize_account_capabilities(target_user_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  insert into public.account_capabilities (user_id, capability, enabled)
  select access.user_id, keys.capability,
    case
      when access.service_level = 'timetable_only' then keys.capability = 'timetable'
      else true
    end
  from public.account_access access
  cross join (values
    ('member_content'), ('assistant'), ('timetable'), ('calendar'), ('notifications')
  ) as keys(capability)
  where access.user_id = target_user_id
  on conflict (user_id, capability) do nothing;
$$;
revoke all on function private.initialize_account_capabilities(uuid) from public, anon, authenticated;

select private.initialize_account_capabilities(user_id)
from public.account_access;

create or replace function public.has_account_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.account_access access
    where access.user_id = (select auth.uid())
      and access.status = 'approved'
      and (
        exists (
          select 1 from public.app_admins admin
          where admin.user_id = access.user_id
            and admin.revoked_at is null
            and admin.admin_role in ('owner', 'co_admin')
        )
        or exists (
          select 1 from public.account_capabilities capability
          where capability.user_id = access.user_id
            and capability.capability = p_capability
            and capability.enabled
        )
      )
  );
$$;

create or replace function public.current_account_capabilities()
returns table(capability text, enabled boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with keys(capability) as (values
    ('member_content'), ('assistant'), ('timetable'), ('calendar'), ('notifications')
  )
  select keys.capability::text,
    coalesce((
      access.status = 'approved'
      and (
        admin.user_id is not null
        or coalesce(stored.enabled, false)
      )
    ), false)::boolean as enabled
  from keys
  left join public.account_access access on access.user_id = (select auth.uid())
  left join public.app_admins admin on admin.user_id = access.user_id
    and admin.revoked_at is null and admin.admin_role in ('owner', 'co_admin')
  left join public.account_capabilities stored on stored.user_id = access.user_id
    and stored.capability = keys.capability
  order by keys.capability;
$$;

create or replace function public.admin_account_capabilities(target_user_ids uuid[])
returns table(user_id uuid, capability text, enabled boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return query
    with keys(capability) as (values
      ('member_content'), ('assistant'), ('timetable'), ('calendar'), ('notifications')
    )
    select targets.user_id, keys.capability::text,
      (admin.user_id is not null or coalesce(stored.enabled, false))::boolean
    from unnest(coalesce(target_user_ids, array[]::uuid[])) targets(user_id)
    cross join keys
    left join public.app_admins admin on admin.user_id = targets.user_id
      and admin.revoked_at is null and admin.admin_role in ('owner', 'co_admin')
    left join public.account_capabilities stored on stored.user_id = targets.user_id
      and stored.capability = keys.capability
    order by targets.user_id, keys.capability;
end;
$$;

create or replace function public.admin_update_account_capabilities_v2(
  target_user_id uuid,
  next_status text,
  next_capabilities jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  current_service_level text;
  capability_key text;
begin
  if not public.is_app_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if next_status not in ('approved', 'rejected') then
    raise exception 'invalid account update' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.app_admins
    where user_id = target_user_id and revoked_at is null
  ) then
    raise exception 'admin_capabilities_protected' using errcode = '42501';
  end if;
  if next_status = 'approved' then
    if jsonb_typeof(next_capabilities) is distinct from 'object' then
      raise exception 'complete capability object required' using errcode = '22023';
    end if;
    foreach capability_key in array array['member_content','assistant','timetable','calendar','notifications'] loop
      if not (next_capabilities ? capability_key)
        or jsonb_typeof(next_capabilities -> capability_key) is distinct from 'boolean' then
        raise exception 'complete boolean capability object required' using errcode = '22023';
      end if;
    end loop;
  end if;

  select service_level into current_service_level
  from public.account_access where user_id = target_user_id for update;
  if current_service_level is null then
    raise exception 'account access row not found' using errcode = 'P0002';
  end if;

  perform private.initialize_account_capabilities(target_user_id);

  -- Both calls remain in this RPC transaction. Rejection preserves stored rows;
  -- approval writes the complete five-key set without consulting service_level.
  perform public.admin_update_account(target_user_id, next_status, current_service_level);
  if next_status = 'approved' then
    perform public.admin_set_account_capabilities(target_user_id, next_capabilities);
  end if;
end;
$$;

-- Remove all known legacy permissive policies. Leaving any of these in place
-- would OR with capability policies and silently bypass the cutover.
drop policy if exists approved_subscriptions_select on public.user_subscriptions;
drop policy if exists approved_subscriptions_insert on public.user_subscriptions;
drop policy if exists approved_subscriptions_update on public.user_subscriptions;
drop policy if exists approved_subscriptions_delete on public.user_subscriptions;
drop policy if exists approved_reads_select on public.user_reads;
drop policy if exists approved_reads_insert on public.user_reads;
drop policy if exists approved_reads_update on public.user_reads;
drop policy if exists approved_reads_delete on public.user_reads;
drop policy if exists approved_preferences_select on public.user_preferences;
drop policy if exists approved_preferences_insert on public.user_preferences;
drop policy if exists approved_preferences_update on public.user_preferences;
drop policy if exists approved_preferences_delete on public.user_preferences;
drop policy if exists approved_tasks_select on public.user_tasks;
drop policy if exists approved_tasks_insert on public.user_tasks;
drop policy if exists approved_tasks_update on public.user_tasks;
drop policy if exists approved_tasks_delete on public.user_tasks;

drop policy if exists user_reminder_rules_owner on public.user_reminder_rules;
drop policy if exists user_reminder_rules_owner_select on public.user_reminder_rules;
drop policy if exists user_reminder_rules_owner_insert on public.user_reminder_rules;
drop policy if exists user_reminder_rules_owner_update on public.user_reminder_rules;
drop policy if exists approved_reminder_rules_select on public.user_reminder_rules;
drop policy if exists approved_reminder_rules_insert on public.user_reminder_rules;
drop policy if exists approved_reminder_rules_update on public.user_reminder_rules;
drop policy if exists notifications_reminder_rules_select on public.user_reminder_rules;
drop policy if exists notifications_reminder_rules_insert on public.user_reminder_rules;
drop policy if exists notifications_reminder_rules_update on public.user_reminder_rules;
create policy notifications_reminder_rules_select on public.user_reminder_rules
  for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_account_capability('notifications')));
create policy notifications_reminder_rules_insert on public.user_reminder_rules
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_account_capability('notifications')));
create policy notifications_reminder_rules_update on public.user_reminder_rules
  for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_account_capability('notifications')))
  with check ((select auth.uid()) = user_id and (select public.has_account_capability('notifications')));

drop policy if exists user_push_subscriptions_owner on public.user_push_subscriptions;
drop policy if exists user_push_subscriptions_owner_select on public.user_push_subscriptions;
drop policy if exists user_push_subscriptions_owner_insert on public.user_push_subscriptions;
drop policy if exists user_push_subscriptions_owner_update on public.user_push_subscriptions;
drop policy if exists approved_push_subscriptions_select on public.user_push_subscriptions;
drop policy if exists approved_push_subscriptions_insert on public.user_push_subscriptions;
drop policy if exists approved_push_subscriptions_update on public.user_push_subscriptions;
drop policy if exists notifications_push_subscriptions_select on public.user_push_subscriptions;
drop policy if exists notifications_push_subscriptions_insert on public.user_push_subscriptions;
drop policy if exists notifications_push_subscriptions_update on public.user_push_subscriptions;
create policy notifications_push_subscriptions_select on public.user_push_subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_account_capability('notifications')));
create policy notifications_push_subscriptions_insert on public.user_push_subscriptions
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_account_capability('notifications')));
create policy notifications_push_subscriptions_update on public.user_push_subscriptions
  for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_account_capability('notifications')))
  with check ((select auth.uid()) = user_id and (select public.has_account_capability('notifications')));

revoke all on function public.has_account_capability(text) from public, anon, authenticated;
revoke all on function public.current_account_capabilities() from public, anon, authenticated;
revoke all on function public.admin_account_capabilities(uuid[]) from public, anon, authenticated;
revoke all on function public.admin_set_account_capabilities(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_update_account_capabilities_v2(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.has_account_capability(text) to authenticated;
grant execute on function public.current_account_capabilities() to authenticated;
grant execute on function public.admin_account_capabilities(uuid[]) to authenticated;
grant execute on function public.admin_set_account_capabilities(uuid, jsonb) to authenticated;
grant execute on function public.admin_update_account_capabilities_v2(uuid, text, jsonb) to authenticated;
