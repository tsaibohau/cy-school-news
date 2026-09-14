begin;
create extension if not exists pgtap with schema extensions;
select plan(91);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','owner@local.test','',now()),
  ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','coadmin@local.test','',now()),
  ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','member@local.test','',now()),
  ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','target@local.test','',now()),
  ('10000000-0000-4000-8000-000000000005','authenticated','authenticated','initializer@local.test','',now())
on conflict (id) do nothing;

insert into public.account_access (user_id, status, service_level, reviewed_at)
values
  ('10000000-0000-4000-8000-000000000001','approved','full',now()),
  ('10000000-0000-4000-8000-000000000002','approved','full',now()),
  ('10000000-0000-4000-8000-000000000003','approved','full',now()),
  ('10000000-0000-4000-8000-000000000004','pending','full',null),
  ('10000000-0000-4000-8000-000000000005','approved','full',now())
on conflict (user_id) do update set status=excluded.status, service_level=excluded.service_level;

insert into public.app_admins (user_id, admin_role, created_by)
values
  ('10000000-0000-4000-8000-000000000001','owner','10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002','co_admin','10000000-0000-4000-8000-000000000001')
on conflict (user_id) do update set admin_role=excluded.admin_role, revoked_at=null;

delete from public.account_capabilities where user_id in (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005'
);
insert into public.account_capabilities (user_id, capability, enabled)
values
  ('10000000-0000-4000-8000-000000000002','assistant',false),
  ('10000000-0000-4000-8000-000000000003','assistant',true),
  ('10000000-0000-4000-8000-000000000003','notifications',false),
  ('10000000-0000-4000-8000-000000000004','member_content',false),
  ('10000000-0000-4000-8000-000000000004','assistant',true),
  ('10000000-0000-4000-8000-000000000004','timetable',false),
  ('10000000-0000-4000-8000-000000000004','calendar',true),
  ('10000000-0000-4000-8000-000000000004','notifications',false),
  ('10000000-0000-4000-8000-000000000005','assistant',false)
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
select private.initialize_account_capabilities('10000000-0000-4000-8000-000000000005');
select is((select enabled from public.account_capabilities where user_id='10000000-0000-4000-8000-000000000005' and capability='assistant'), false, 'initializer preserves an existing row');
select is((select count(*)::int from public.account_capabilities where user_id='10000000-0000-4000-8000-000000000005'), 5, 'initializer fills only missing rows');

create temporary table atomic_capabilities_before on commit drop as
select capability, enabled
from public.account_capabilities
where user_id='10000000-0000-4000-8000-000000000004';

create function pg_temp.fail_target_capability_write()
returns trigger
language plpgsql
as $$
begin
  if new.user_id='10000000-0000-4000-8000-000000000004'
    and new.capability='member_content' then
    if (select status from public.account_access where user_id=new.user_id) <> 'approved' then
      raise exception 'status_not_updated_before_capability_write';
    end if;
    raise exception 'test_capability_write_failure' using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger fail_target_capability_write
before update on public.account_capabilities
for each row execute function pg_temp.fail_target_capability_write();

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select throws_ok($$select public.admin_update_account_capabilities_v2(
  '10000000-0000-4000-8000-000000000004','approved',
  '{"member_content":true,"assistant":false,"timetable":true,"calendar":false,"notifications":true}'::jsonb
)$$, 'P0001', 'test_capability_write_failure', 'atomic approval propagates a real capability-write exception after status update begins');
reset role;
select is((select status from public.account_access where user_id='10000000-0000-4000-8000-000000000004'), 'pending', 'failed atomic approval restores the exact pending status');
select results_eq(
  $$select capability, enabled from public.account_capabilities where user_id='10000000-0000-4000-8000-000000000004' order by capability$$,
  $$select capability, enabled from atomic_capabilities_before order by capability$$,
  'failed atomic approval preserves all five prior capability values without partial update'
);
select is((select count(*)::int from public.account_capabilities where user_id='10000000-0000-4000-8000-000000000004'), 5, 'failed atomic approval leaves exactly the original five capability rows');
drop trigger fail_target_capability_write on public.account_capabilities;
drop function pg_temp.fail_target_capability_write();

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
insert into public.user_subscriptions (id,user_id,keyword,normalized_keyword)
values ('10000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000003','protected subscription','protected-subscription');
insert into public.user_reads (user_id,announcement_id)
values ('10000000-0000-4000-8000-000000000003','protected-read');
insert into public.user_tasks (id,user_id,title)
values ('10000000-0000-4000-8000-000000000203','10000000-0000-4000-8000-000000000003','protected task');
insert into public.account_capabilities (user_id,capability,enabled)
select '10000000-0000-4000-8000-000000000003'::uuid, key.capability, false
from (values ('member_content'),('assistant'),('timetable'),('calendar'),('notifications')) key(capability)
on conflict (user_id,capability) do update set enabled=false;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.user_subscriptions), 0, 'notifications=false hides own subscriptions despite approved status');
select throws_ok($$insert into public.user_subscriptions (id,user_id,keyword,normalized_keyword) values
  ('10000000-0000-4000-8000-000000000211','10000000-0000-4000-8000-000000000003','blocked insert','blocked-insert')$$,
  '42501', null, 'notifications=false blocks subscription insert');
select results_eq(
  $$update public.user_subscriptions set keyword='blocked update' where id='10000000-0000-4000-8000-000000000201' returning id$$,
  $$select null::uuid where false$$,
  'notifications=false blocks subscription update'
);
reset role;
update public.account_capabilities set enabled=true where user_id='10000000-0000-4000-8000-000000000003' and capability='notifications';
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.user_subscriptions), 1, 'notifications=true restores subscription read');
select lives_ok($$insert into public.user_subscriptions (id,user_id,keyword,normalized_keyword) values
  ('10000000-0000-4000-8000-000000000211','10000000-0000-4000-8000-000000000003','allowed insert','allowed-insert')$$,
  'notifications=true restores subscription insert');
select results_eq(
  $$update public.user_subscriptions set keyword='allowed update' where id='10000000-0000-4000-8000-000000000201' returning keyword$$,
  $$values ('allowed update'::text)$$,
  'notifications=true restores subscription update'
);

select is((select count(*)::int from public.user_reads), 0, 'member_content=false hides own reads despite approved status');
select throws_ok($$insert into public.user_reads (user_id,announcement_id) values
  ('10000000-0000-4000-8000-000000000003','blocked-read-insert')$$,
  '42501', null, 'member_content=false blocks read-state insert');
select results_eq(
  $$update public.user_reads set read_at=now() where announcement_id='protected-read' returning announcement_id$$,
  $$select null::text where false$$,
  'member_content=false blocks read-state update'
);
reset role;
update public.account_capabilities set enabled=true where user_id='10000000-0000-4000-8000-000000000003' and capability='member_content';
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.user_reads), 1, 'member_content=true restores read-state read');
select lives_ok($$insert into public.user_reads (user_id,announcement_id) values
  ('10000000-0000-4000-8000-000000000003','allowed-read-insert')$$,
  'member_content=true restores read-state insert');
select results_eq(
  $$update public.user_reads set read_at=now() where announcement_id='protected-read' returning announcement_id$$,
  $$values ('protected-read'::text)$$,
  'member_content=true restores read-state update'
);

select is((select count(*)::int from public.user_tasks), 0, 'calendar=false hides own tasks despite approved status');
select throws_ok($$insert into public.user_tasks (id,user_id,title) values
  ('10000000-0000-4000-8000-000000000213','10000000-0000-4000-8000-000000000003','blocked task insert')$$,
  '42501', null, 'calendar=false blocks task insert');
select results_eq(
  $$update public.user_tasks set title='blocked task update' where id='10000000-0000-4000-8000-000000000203' returning id$$,
  $$select null::uuid where false$$,
  'calendar=false blocks task update'
);
reset role;
update public.account_capabilities set enabled=true where user_id='10000000-0000-4000-8000-000000000003' and capability='calendar';
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.user_tasks), 1, 'calendar=true restores task read');
select lives_ok($$insert into public.user_tasks (id,user_id,title) values
  ('10000000-0000-4000-8000-000000000213','10000000-0000-4000-8000-000000000003','allowed task insert')$$,
  'calendar=true restores task insert');
select results_eq(
  $$update public.user_tasks set title='allowed task update' where id='10000000-0000-4000-8000-000000000203' returning title$$,
  $$values ('allowed task update'::text)$$,
  'calendar=true restores task update'
);

reset role;
update public.account_capabilities set enabled=false
where user_id='10000000-0000-4000-8000-000000000003'
  and capability in ('assistant','timetable','calendar','notifications');
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select throws_ok($$insert into public.user_preferences (user_id,schema_version,preferences) values
  ('10000000-0000-4000-8000-000000000003',1,'{"blocked":true}'::jsonb)$$,
  '42501', null, 'all personal capabilities false blocks preferences insert');
reset role;
insert into public.user_preferences (user_id,schema_version,preferences)
values ('10000000-0000-4000-8000-000000000003',1,'{"seeded":true}'::jsonb);
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.user_preferences), 0, 'all personal capabilities false hides own preferences despite approved status');
select results_eq(
  $$update public.user_preferences set schema_version=2 where user_id='10000000-0000-4000-8000-000000000003' returning user_id$$,
  $$select null::uuid where false$$,
  'all personal capabilities false blocks preferences update'
);
reset role;
delete from public.user_preferences where user_id='10000000-0000-4000-8000-000000000003';
update public.account_capabilities set enabled=true where user_id='10000000-0000-4000-8000-000000000003' and capability='assistant';
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select lives_ok($$insert into public.user_preferences (user_id,schema_version,preferences) values
  ('10000000-0000-4000-8000-000000000003',1,'{"allowed":true}'::jsonb)$$,
  'one personal capability restores preferences insert');
select is((select count(*)::int from public.user_preferences), 1, 'one personal capability restores preferences read');
select results_eq(
  $$update public.user_preferences set schema_version=2 where user_id='10000000-0000-4000-8000-000000000003' returning schema_version$$,
  $$values (2)$$,
  'one personal capability restores preferences update'
);

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

select results_eq(
  $$select policyname from pg_policies where schemaname='public' and tablename='user_subscriptions' order by policyname$$,
  $$values ('subscriptions own rows'::name)$$,
  'subscriptions final policy set contains only the capability policy'
);
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='user_subscriptions' and (policyname like 'approved_%' or policyname like '%_owner%')), 0, 'no legacy subscription policy remains to OR-bypass capability');
select results_eq(
  $$select policyname from pg_policies where schemaname='public' and tablename='user_reads' order by policyname$$,
  $$values ('reads own rows'::name)$$,
  'reads final policy set contains only the capability policy'
);
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='user_reads' and (policyname like 'approved_%' or policyname like '%_owner%')), 0, 'no legacy reads policy remains to OR-bypass capability');
select results_eq(
  $$select policyname from pg_policies where schemaname='public' and tablename='user_tasks' order by policyname$$,
  $$values ('tasks own rows'::name)$$,
  'tasks final policy set contains only the capability policy'
);
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='user_tasks' and (policyname like 'approved_%' or policyname like '%_owner%')), 0, 'no legacy task policy remains to OR-bypass capability');
select results_eq(
  $$select policyname from pg_policies where schemaname='public' and tablename='user_preferences' order by policyname$$,
  $$values ('preferences own row'::name)$$,
  'preferences final policy set contains only the capability policy'
);
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='user_preferences' and (policyname like 'approved_%' or policyname like '%_owner%')), 0, 'no legacy preferences policy remains to OR-bypass capability');

select ok((select prosecdef from pg_proc where oid='public.has_account_capability(text)'::regprocedure), 'has_account_capability is SECURITY DEFINER');
select ok((select proconfig = array['search_path=pg_catalog, public'] from pg_proc where oid='public.has_account_capability(text)'::regprocedure), 'has_account_capability fixes its exact search_path');
select ok(not exists (
  select 1 from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  where procedure.oid='public.has_account_capability(text)'::regprocedure and privilege.grantee=0 and privilege.privilege_type='EXECUTE'
), 'has_account_capability has no PUBLIC execute grant');
select ok(not has_function_privilege('anon','public.has_account_capability(text)','execute'), 'anon cannot execute has_account_capability');
select ok(has_function_privilege('authenticated','public.has_account_capability(text)','execute'), 'authenticated can execute has_account_capability');

select ok((select prosecdef from pg_proc where oid='public.current_account_capabilities()'::regprocedure), 'current_account_capabilities is SECURITY DEFINER');
select ok((select proconfig = array['search_path=pg_catalog, public'] from pg_proc where oid='public.current_account_capabilities()'::regprocedure), 'current_account_capabilities fixes its exact search_path');
select ok(not exists (
  select 1 from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  where procedure.oid='public.current_account_capabilities()'::regprocedure and privilege.grantee=0 and privilege.privilege_type='EXECUTE'
), 'current_account_capabilities has no PUBLIC execute grant');
select ok(not has_function_privilege('anon','public.current_account_capabilities()','execute'), 'anon cannot execute current_account_capabilities');
select ok(has_function_privilege('authenticated','public.current_account_capabilities()','execute'), 'authenticated can execute current_account_capabilities');

select ok((select prosecdef from pg_proc where oid='public.admin_account_capabilities(uuid[])'::regprocedure), 'admin_account_capabilities is SECURITY DEFINER');
select ok((select proconfig = array['search_path=pg_catalog, public'] from pg_proc where oid='public.admin_account_capabilities(uuid[])'::regprocedure), 'admin_account_capabilities fixes its exact search_path');
select ok(not exists (
  select 1 from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  where procedure.oid='public.admin_account_capabilities(uuid[])'::regprocedure and privilege.grantee=0 and privilege.privilege_type='EXECUTE'
), 'admin_account_capabilities has no PUBLIC execute grant');
select ok(not has_function_privilege('anon','public.admin_account_capabilities(uuid[])','execute'), 'anon cannot execute admin_account_capabilities');
select ok(has_function_privilege('authenticated','public.admin_account_capabilities(uuid[])','execute'), 'authenticated can execute admin_account_capabilities');

select ok((select prosecdef from pg_proc where oid='public.admin_set_account_capabilities(uuid,jsonb)'::regprocedure), 'admin_set_account_capabilities is SECURITY DEFINER');
select ok((select proconfig = array['search_path=pg_catalog, public'] from pg_proc where oid='public.admin_set_account_capabilities(uuid,jsonb)'::regprocedure), 'admin_set_account_capabilities fixes its exact search_path');
select ok(not exists (
  select 1 from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  where procedure.oid='public.admin_set_account_capabilities(uuid,jsonb)'::regprocedure and privilege.grantee=0 and privilege.privilege_type='EXECUTE'
), 'admin_set_account_capabilities has no PUBLIC execute grant');
select ok(not has_function_privilege('anon','public.admin_set_account_capabilities(uuid,jsonb)','execute'), 'anon cannot execute admin_set_account_capabilities');
select ok(has_function_privilege('authenticated','public.admin_set_account_capabilities(uuid,jsonb)','execute'), 'authenticated can execute admin_set_account_capabilities');

select ok((select prosecdef from pg_proc where oid='public.admin_update_account_capabilities_v2(uuid,text,jsonb)'::regprocedure), 'atomic RPC is SECURITY DEFINER');
select ok((select proconfig = array['search_path=pg_catalog, public, private'] from pg_proc where oid='public.admin_update_account_capabilities_v2(uuid,text,jsonb)'::regprocedure), 'atomic RPC fixes its exact search_path');
select ok(not exists (
  select 1
  from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  where procedure.oid='public.admin_update_account_capabilities_v2(uuid,text,jsonb)'::regprocedure
    and privilege.grantee=0 and privilege.privilege_type='EXECUTE'
), 'atomic RPC has no PUBLIC execute grant');
select ok(not has_function_privilege('anon','public.admin_update_account_capabilities_v2(uuid,text,jsonb)','execute'), 'anon cannot execute atomic RPC');
select ok(has_function_privilege('authenticated','public.admin_update_account_capabilities_v2(uuid,text,jsonb)','execute'), 'authenticated can execute atomic RPC');

select ok((select prosecdef from pg_proc where oid='private.initialize_account_capabilities(uuid)'::regprocedure), 'initializer is SECURITY DEFINER');
select ok((select proconfig = array['search_path=pg_catalog, public, private'] from pg_proc where oid='private.initialize_account_capabilities(uuid)'::regprocedure), 'initializer fixes its exact search_path');
select ok(not exists (
  select 1 from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  where procedure.oid='private.initialize_account_capabilities(uuid)'::regprocedure and privilege.grantee=0 and privilege.privilege_type='EXECUTE'
), 'initializer has no PUBLIC execute grant');
select ok(not has_function_privilege('anon','private.initialize_account_capabilities(uuid)','execute'), 'anon cannot execute initializer');
select ok(not has_function_privilege('authenticated','private.initialize_account_capabilities(uuid)','execute'), 'initializer is not exposed to authenticated clients');

select * from finish();
rollback;
