-- Deterministic local RLS acceptance for reminder intent/device tables.
begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'reminder-a@local.test', '', now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'reminder-b@local.test', '', now())
on conflict (id) do nothing;

insert into public.reminder_targets (
  id, owner_user_id, target_kind, target_id, target_at, title, source_url,
  provenance, source_revision
) values (
  '00000000-0000-4000-8000-00000000d001', null,
  'announcement_deadline', 'announcement:fixture:deadline', now() + interval '30 days',
  'future fixture', 'https://school.example/fixture', 'official_announcement', 'fixture-v1'
) on conflict (id) do nothing;

insert into public.user_reminder_rules (
  id, user_id, target_kind, target_id, reminder_target_id, offsets_days,
  provenance, source_revision
) values
  ('00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-0000000000a1',
   'announcement_deadline', 'announcement:fixture:deadline', '00000000-0000-4000-8000-00000000d001', '{3,1,0}',
   'official_announcement', 'fixture-v1'),
  ('00000000-0000-4000-8000-00000000b102', '00000000-0000-4000-8000-0000000000b2',
   'announcement_deadline', 'announcement:fixture:deadline', '00000000-0000-4000-8000-00000000d001', '{1}',
   'official_announcement', 'fixture-v1')
on conflict (id) do nothing;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-0000000000a1';

select is((select count(*)::int from public.user_reminder_rules), 1, 'USER_A sees only own rule');
select lives_ok($$insert into public.user_reminder_rules
  (id, user_id, target_kind, target_id, manual_target_at, provenance, source_revision)
  values ('00000000-0000-4000-8000-00000000a103', '00000000-0000-4000-8000-0000000000a1',
  'manual', 'manual:a', now() + interval '2 days', 'manual', 'manual')$$, 'USER_A inserts own manual rule');
select lives_ok($$update public.user_reminder_rules set preset = 'standard', offsets_days = '{3,1,0}'
  where id = '00000000-0000-4000-8000-00000000a103'$$, 'USER_A updates own rule');
select is((select count(*)::int from public.user_reminder_rules where id = '00000000-0000-4000-8000-00000000b102'), 0,
  'USER_A cannot read USER_B rule');
select throws_ok($$insert into public.user_reminder_rules
  (user_id, target_kind, target_id, manual_target_at, provenance, source_revision)
  values ('00000000-0000-4000-8000-0000000000b2', 'manual', 'spoof:a', now() + interval '2 days', 'manual', 'manual')$$,
  '42501', null, 'USER_A cannot spoof USER_B owner');
select throws_ok($$update public.user_reminder_rules set user_id = '00000000-0000-4000-8000-0000000000b2'
  where id = '00000000-0000-4000-8000-00000000a103'$$, '42501', null, 'USER_A cannot reassign rule owner');
select is((with changed as (update public.user_reminder_rules set enabled = false
  where id = '00000000-0000-4000-8000-00000000b102' returning 1) select count(*)::int from changed), 0,
  'USER_A cannot update USER_B rule');
select lives_ok($$insert into public.user_push_subscriptions
  (id, user_id, endpoint, p256dh, auth) values
  ('00000000-0000-4000-8000-00000000a201', '00000000-0000-4000-8000-0000000000a1',
   'https://push.example/device-a', 'key-a', 'auth-a')$$, 'USER_A inserts own device');
select throws_ok($$insert into public.user_push_subscriptions
  (user_id, endpoint, p256dh, auth) values
  ('00000000-0000-4000-8000-0000000000b2', 'https://push.example/spoof', 'key', 'auth')$$,
  '42501', null, 'USER_A cannot spoof USER_B device');
select throws_ok($$select count(*) from public.reminder_jobs$$, '42501', null, 'authenticated cannot read jobs');
select throws_ok($$select count(*) from public.reminder_deliveries$$, '42501', null, 'authenticated cannot read delivery ledger');
select throws_ok($$delete from public.user_reminder_rules where id = '00000000-0000-4000-8000-00000000a103'$$,
  '42501', null, 'browser cannot erase durable rule identity');

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-0000000000b2';

select is((select count(*)::int from public.user_reminder_rules), 1, 'USER_B sees only own rule');
select lives_ok($$insert into public.user_reminder_rules
  (id, user_id, target_kind, target_id, manual_target_at, provenance, source_revision)
  values ('00000000-0000-4000-8000-00000000b103', '00000000-0000-4000-8000-0000000000b2',
  'manual', 'manual:b', now() + interval '3 days', 'manual', 'manual')$$, 'USER_B inserts own manual rule');
select is((select count(*)::int from public.user_reminder_rules where id = '00000000-0000-4000-8000-00000000a101'), 0,
  'USER_B cannot read USER_A rule');
select throws_ok($$insert into public.user_reminder_rules
  (user_id, target_kind, target_id, manual_target_at, provenance, source_revision)
  values ('00000000-0000-4000-8000-0000000000a1', 'manual', 'spoof:b', now() + interval '2 days', 'manual', 'manual')$$,
  '42501', null, 'USER_B cannot spoof USER_A owner');
select lives_ok($$insert into public.user_push_subscriptions
  (id, user_id, endpoint, p256dh, auth) values
  ('00000000-0000-4000-8000-00000000b201', '00000000-0000-4000-8000-0000000000b2',
   'https://push.example/device-b', 'key-b', 'auth-b')$$, 'USER_B inserts own device');
select throws_ok($$insert into public.user_push_subscriptions
  (user_id, endpoint, p256dh, auth) values
  ('00000000-0000-4000-8000-0000000000b2', 'https://push.example/device-a', 'key-b', 'auth-b')$$,
  '23505', null, 'endpoint cannot silently transfer from USER_A to USER_B');
select is((with changed as (update public.user_push_subscriptions set active = false
  where id = '00000000-0000-4000-8000-00000000a201' returning 1) select count(*)::int from changed), 0,
  'USER_B cannot deactivate USER_A device');

set local role anon;
select throws_ok($$select count(*) from public.user_reminder_rules$$, '42501', null, 'anonymous cannot read reminder rules');
select throws_ok($$select count(*) from public.user_push_subscriptions$$, '42501', null, 'anonymous cannot read push devices');
select throws_ok($$insert into public.user_reminder_rules
  (user_id, target_kind, target_id, manual_target_at, provenance, source_revision)
  values ('00000000-0000-4000-8000-0000000000a1', 'manual', 'anon', now() + interval '1 day', 'manual', 'manual')$$,
  '42501', null, 'anonymous cannot insert reminder rules');

select * from finish();
rollback;
