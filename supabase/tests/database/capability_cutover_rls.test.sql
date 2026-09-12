begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','owner@local.test','',now()),
  ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','coadmin@local.test','',now()),
  ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','member@local.test','',now()),
  ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','target@local.test','',now())
on conflict (id) do nothing;

insert into public.account_access (user_id, status, service_level, reviewed_at)
values
  ('10000000-0000-4000-8000-000000000001','approved','full',now()),
  ('10000000-0000-4000-8000-000000000002','approved','full',now()),
  ('10000000-0000-4000-8000-000000000003','approved','full',now()),
  ('10000000-0000-4000-8000-000000000004','approved','full',now())
on conflict (user_id) do update set status=excluded.status, service_level=excluded.service_level;

insert into public.app_admins (user_id, admin_role, created_by)
values
  ('10000000-0000-4000-8000-000000000001','owner','10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002','co_admin','10000000-0000-4000-8000-000000000001')
on conflict (user_id) do update set admin_role=excluded.admin_role, revoked_at=null;

delete from public.account_capabilities where user_id in (
  '10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004'
);
insert into public.account_capabilities (user_id, capability, enabled)
values
  ('10000000-0000-4000-8000-000000000002','assistant',false),
  ('10000000-0000-4000-8000-000000000003','assistant',true),
  ('10000000-0000-4000-8000-000000000003','notifications',false),
  ('10000000-0000-4000-8000-000000000004','assistant',false)
on conflict (user_id, capability) do update set enabled=excluded.enabled;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.current_account_capabilities() where enabled), 5, 'owner effective capabilities are full');
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.current_account_capabilities() where enabled), 5, 'co-admin effective capabilities are full');
reset role;
update public.app_admins set revoked_at=now() where user_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
select ok(not public.has_account_capability('assistant'), 'admin downgrade restores the stored disabled capability');
reset role;
select is((select enabled from public.account_capabilities where user_id='10000000-0000-4000-8000-000000000002' and capability='assistant'), false, 'admin downgrade does not recompute the stored capability');
update public.app_admins set revoked_at=null where user_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select ok(public.has_account_capability('assistant'), 'member receives stored assistant capability');
select ok(not public.has_account_capability('notifications'), 'member does not inherit notifications from full service level');

reset role;
update public.account_access set service_level='timetable_only' where user_id='10000000-0000-4000-8000-000000000003';
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select ok(public.has_account_capability('assistant'), 'service level changes do not overwrite stored capabilities');

reset role;
select private.initialize_account_capabilities('10000000-0000-4000-8000-000000000004');
select is((select enabled from public.account_capabilities where user_id='10000000-0000-4000-8000-000000000004' and capability='assistant'), false, 'initializer preserves an existing row');
select is((select count(*)::int from public.account_capabilities where user_id='10000000-0000-4000-8000-000000000004'), 5, 'initializer fills only missing rows');

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select lives_ok($$select public.admin_update_account_capabilities_v2(
  '10000000-0000-4000-8000-000000000004','approved',
  '{"member_content":true,"assistant":false,"timetable":true,"calendar":false,"notifications":false}'::jsonb
)$$, 'atomic approval succeeds');
reset role;
select is((select status from public.account_access where user_id='10000000-0000-4000-8000-000000000004'), 'approved', 'atomic approval updates status');
select is((select count(*)::int from public.account_capabilities where user_id='10000000-0000-4000-8000-000000000004' and enabled), 2, 'atomic approval writes enabled capability matrix');
select is((select count(*)::int from public.account_capabilities where user_id='10000000-0000-4000-8000-000000000004' and not enabled), 3, 'atomic approval writes disabled capability matrix');
select is((select service_level from public.account_access where user_id='10000000-0000-4000-8000-000000000004'), 'full', 'atomic approval does not reinterpret service level');

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select lives_ok($$select public.admin_update_account_capabilities_v2('10000000-0000-4000-8000-000000000004','rejected','{}'::jsonb)$$, 'atomic rejection succeeds without rewriting capabilities');
reset role;
select is((select count(*)::int from public.account_capabilities where user_id='10000000-0000-4000-8000-000000000004' and enabled), 2, 'rejection preserves stored capabilities');
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select throws_ok($$select public.admin_update_account_capabilities_v2(
  '10000000-0000-4000-8000-000000000002','approved',
  '{"member_content":true,"assistant":true,"timetable":true,"calendar":true,"notifications":true}'::jsonb
)$$, '42501', null, 'owner and co-admin targets are protected');

reset role;
insert into public.user_reminder_rules (id,user_id,target_kind,target_id,manual_target_at,provenance,source_revision)
values ('10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000003','manual','capability:test',now()+interval '1 day','manual','test');
insert into public.user_push_subscriptions (id,user_id,endpoint,p256dh,auth)
values ('10000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000003','https://push.example/capability','key','auth');
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.user_reminder_rules), 0, 'notifications=false hides own reminder rules');
select is((select count(*)::int from public.user_push_subscriptions), 0, 'notifications=false hides own push subscriptions');
reset role;
update public.account_capabilities set enabled=true where user_id='10000000-0000-4000-8000-000000000003' and capability='notifications';
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.user_reminder_rules), 1, 'notifications=true allows own reminder rules');
select is((select count(*)::int from public.user_push_subscriptions), 1, 'notifications=true allows own push subscriptions');

reset role;
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='user_reminder_rules'), 3, 'reminder table has only three capability policies');
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='user_reminder_rules' and (policyname like 'approved_%' or policyname like '%_owner%')), 0, 'no legacy reminder policy remains to OR-bypass capability');
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='user_push_subscriptions'), 3, 'push table has only three capability policies');
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='user_push_subscriptions' and (policyname like 'approved_%' or policyname like '%_owner%')), 0, 'no legacy push policy remains to OR-bypass capability');
select ok(not exists (
  select 1
  from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  where procedure.oid='public.admin_update_account_capabilities_v2(uuid,text,jsonb)'::regprocedure
    and privilege.grantee=0 and privilege.privilege_type='EXECUTE'
), 'atomic RPC has no PUBLIC execute grant');
select ok(not has_function_privilege('anon','public.admin_update_account_capabilities_v2(uuid,text,jsonb)','execute'), 'anon cannot execute atomic RPC');
select ok(has_function_privilege('authenticated','public.admin_update_account_capabilities_v2(uuid,text,jsonb)','execute'), 'authenticated can execute atomic RPC');
select ok((select proconfig @> array['search_path=pg_catalog, public, private'] from pg_proc where oid='public.admin_update_account_capabilities_v2(uuid,text,jsonb)'::regprocedure), 'atomic RPC fixes search_path');
select ok(not has_function_privilege('authenticated','private.initialize_account_capabilities(uuid)','execute'), 'initializer is not exposed to authenticated clients');

select * from finish();
rollback;
