-- Local acceptance for durable calendar RLS and versioned mutation RPC.
begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'calendar-a@local.test', '', now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'calendar-b@local.test', '', now())
on conflict (id) do nothing;

insert into public.account_access (user_id, status, reviewed_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'approved', now()),
  ('00000000-0000-4000-8000-0000000000b2', 'approved', now())
on conflict (user_id) do update set status = excluded.status, reviewed_at = excluded.reviewed_at;

insert into public.account_capabilities (user_id, capability, enabled)
values
  ('00000000-0000-4000-8000-0000000000a1', 'calendar', true),
  ('00000000-0000-4000-8000-0000000000b2', 'calendar', true)
on conflict (user_id, capability) do update set enabled = true;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-0000000000a1';

select is((select count(*)::int from public.user_calendar_events), 0, 'USER_A starts empty');
select throws_ok($$insert into public.user_calendar_events (id, user_id, title, event_date, last_mutation_id) values ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000a1', 'bypass', '2026-09-16', '10000000-0000-4000-8000-000000000001')$$, '42501', null, 'direct insert is denied');
select is(public.apply_user_calendar_event_mutation('00000000-0000-4000-8000-00000000a001', 0, '10000000-0000-4000-8000-000000000001', 'create', '{"title":"A event","event_date":"2026-09-16","notes":"one"}', null)->>'status', 'applied', 'create applies');
select is((select count(*)::int from public.user_calendar_events), 1, 'USER_A reads own event');
select is((select version from public.user_calendar_events where id = '00000000-0000-4000-8000-00000000a001'), 1::bigint, 'create starts at version one');
select is(public.apply_user_calendar_event_mutation('00000000-0000-4000-8000-00000000a001', 0, '10000000-0000-4000-8000-000000000001', 'create', '{"title":"A event","event_date":"2026-09-16","notes":"one"}', null)->>'status', 'applied', 'lost-response replay is idempotent');
select is((select version from public.user_calendar_events where id = '00000000-0000-4000-8000-00000000a001'), 1::bigint, 'replay does not increment version');
select is(public.apply_user_calendar_event_mutation('00000000-0000-4000-8000-00000000a001', 0, '10000000-0000-4000-8000-000000000002', 'update', '{"title":"stale","event_date":"2026-09-17","notes":""}', null)->>'status', 'conflict', 'stale update conflicts');
select is(public.apply_user_calendar_event_mutation('00000000-0000-4000-8000-00000000a001', 1, '10000000-0000-4000-8000-000000000003', 'update', '{"title":"updated","event_date":"2026-09-17","notes":"two"}', null)->>'status', 'applied', 'matching update applies');
select is((select version from public.user_calendar_events where id = '00000000-0000-4000-8000-00000000a001'), 2::bigint, 'update increments version');
select is((select count(*)::int from public.user_calendar_events where user_id = '00000000-0000-4000-8000-0000000000b2'), 0, 'USER_A cannot see USER_B rows');
select is(public.apply_user_calendar_event_mutation('00000000-0000-4000-8000-00000000a001', 2, '10000000-0000-4000-8000-000000000004', 'delete', '{}', null)->>'status', 'applied', 'delete applies');
select is((select version from public.user_calendar_events where id = '00000000-0000-4000-8000-00000000a001'), 3::bigint, 'delete creates a new version');
select is(public.apply_user_calendar_event_mutation('00000000-0000-4000-8000-00000000a001', 2, '10000000-0000-4000-8000-000000000005', 'update', '{"title":"revive","event_date":"2026-09-18","notes":""}', null)->>'status', 'conflict', 'stale cache cannot revive tombstone');
select isnt((select deleted_at from public.user_calendar_events where id = '00000000-0000-4000-8000-00000000a001'), null, 'tombstone remains deleted');
select is(public.apply_user_calendar_event_mutation('00000000-0000-4000-8000-00000000a010', 0, '10000000-0000-4000-8000-000000000010', 'create', '{"title":"legacy","event_date":"2026-09-20","notes":""}', 'v1:key')->>'status', 'applied', 'legacy event creates');
select is(public.apply_user_calendar_event_mutation('00000000-0000-4000-8000-00000000a011', 0, '10000000-0000-4000-8000-000000000011', 'create', '{"title":"legacy duplicate","event_date":"2026-09-20","notes":""}', 'v1:key')->>'status', 'applied', 'legacy key retry resolves idempotently');
select is((select count(*)::int from public.user_calendar_events where legacy_import_key = 'v1:key'), 1, 'legacy key does not duplicate');

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-0000000000b2';
select is((select count(*)::int from public.user_calendar_events), 0, 'USER_B cannot read USER_A events');
select is(public.apply_user_calendar_event_mutation('00000000-0000-4000-8000-00000000b001', 0, '20000000-0000-4000-8000-000000000001', 'create', '{"title":"B event","event_date":"2026-09-21","notes":""}', null)->>'status', 'applied', 'USER_B creates own event');
select is((select count(*)::int from public.user_calendar_events), 1, 'USER_B reads only own event');
select throws_ok($$update public.user_calendar_events set title = 'bypass' where id = '00000000-0000-4000-8000-00000000b001'$$, '42501', null, 'direct update is denied');

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-0000000000a1';
select is(public.delete_own_user_calendar_events(), 2::bigint, 'cloud delete removes all USER_A calendar rows');
select is((select count(*)::int from public.user_calendar_events), 0, 'USER_A rows are gone');

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-0000000000b2';
select is((select count(*)::int from public.user_calendar_events), 1, 'USER_B row survives USER_A cloud delete');

set local role anon;
select throws_ok($$select count(*) from public.user_calendar_events$$, '42501', null, 'anonymous cannot read calendar rows');
select throws_ok($$select public.delete_own_user_calendar_events()$$, '42501', null, 'anonymous cannot execute cloud delete');

select * from finish();
rollback;
