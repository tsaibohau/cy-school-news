begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at) values
 ('00000000-0000-4000-8000-0000000d0001','authenticated','authenticated','policy-owner@local.test','',now()),
 ('00000000-0000-4000-8000-0000000d0002','authenticated','authenticated','policy-coadmin@local.test','',now()),
 ('00000000-0000-4000-8000-0000000d0003','authenticated','authenticated','policy-member@local.test','',now()),
 ('00000000-0000-4000-8000-0000000d0004','authenticated','authenticated','policy-pending@local.test','',now())
on conflict(id) do nothing;
insert into public.account_access(user_id,status,service_level) values
 ('00000000-0000-4000-8000-0000000d0001','approved','full'),
 ('00000000-0000-4000-8000-0000000d0002','approved','full'),
 ('00000000-0000-4000-8000-0000000d0003','approved','full'),
 ('00000000-0000-4000-8000-0000000d0004','pending','full')
on conflict(user_id) do update set status=excluded.status;
insert into public.app_admins(user_id,admin_role,created_by,revoked_at) values
 ('00000000-0000-4000-8000-0000000d0001','owner','00000000-0000-4000-8000-0000000d0001',null),
 ('00000000-0000-4000-8000-0000000d0002','co_admin','00000000-0000-4000-8000-0000000d0001',null)
on conflict(user_id) do update set admin_role=excluded.admin_role,revoked_at=null;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-0000000d0001';
select lives_ok($$select public.owner_set_member_capabilities('{"member_content":true,"timetable":true,"notifications":true}'::jsonb)$$,'owner sets the member policy');

set local "request.jwt.claim.sub"='00000000-0000-4000-8000-0000000d0003';
select ok(not public.has_account_capability('calendar'),'member follows the policy: calendar off');
select ok(public.has_account_capability('timetable'),'member follows the policy: timetable on');
select is((select count(*)::int from public.current_account_capabilities()),5,'member sees all five features with their state');
select throws_ok($$insert into public.user_tasks(user_id,title) values ('00000000-0000-4000-8000-0000000d0003','x')$$,'42501',null,'RLS follows the member policy');
select throws_ok($$select * from public.current_member_capabilities()$$,'42501','admin_required','member cannot read the policy list');
select throws_ok($$select public.admin_set_account_capabilities('00000000-0000-4000-8000-0000000d0003','{"calendar":true}'::jsonb)$$,'0A000','per_account_capabilities_retired','per-account switches are retired');

set local "request.jwt.claim.sub"='00000000-0000-4000-8000-0000000d0002';
select ok(public.has_account_capability('calendar') and public.has_account_capability('assistant'),'co-admin keeps every feature');
select is((select count(*)::int from public.current_member_capabilities()),5,'co-admin reads the policy');
select throws_ok($$select public.owner_set_member_capabilities('{"calendar":true}'::jsonb)$$,'42501','owner_required','co-admin cannot change the policy');

set local "request.jwt.claim.sub"='00000000-0000-4000-8000-0000000d0001';
select ok(public.has_account_capability('assistant'),'owner keeps features the members do not have');

set local "request.jwt.claim.sub"='00000000-0000-4000-8000-0000000d0004';
select ok(not public.has_account_capability('timetable'),'pending accounts get nothing');

reset role;
update public.account_access set service_level='timetable_only' where user_id='00000000-0000-4000-8000-0000000d0003';
select is((select service_level from public.account_access where user_id='00000000-0000-4000-8000-0000000d0003'),'full','service levels are retired');

select * from finish();
rollback;
