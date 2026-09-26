begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at) values
 ('00000000-0000-4000-8000-00000000a001','authenticated','authenticated','owner-a@local.test','',now()),
 ('00000000-0000-4000-8000-00000000b002','authenticated','authenticated','owner-b@local.test','',now()),
 ('00000000-0000-4000-8000-00000000c003','authenticated','authenticated','coadmin@local.test','',now())
on conflict(id) do nothing;
insert into public.account_access(user_id,status,service_level) values
 ('00000000-0000-4000-8000-00000000a001','approved','full'),
 ('00000000-0000-4000-8000-00000000b002','approved','full'),
 ('00000000-0000-4000-8000-00000000c003','approved','full')
on conflict(user_id) do update set status='approved',service_level='full';
insert into public.app_admins(user_id,admin_role,created_by,revoked_at) values
 ('00000000-0000-4000-8000-00000000a001','owner','00000000-0000-4000-8000-00000000a001',null),
 ('00000000-0000-4000-8000-00000000c003','co_admin','00000000-0000-4000-8000-00000000a001',null)
on conflict(user_id) do update set admin_role=excluded.admin_role,revoked_at=null;

set local role anon;
select is((select count(*)::int from public.current_public_capabilities()),5,'anon reads five PUBLIC capabilities');
select ok(not public.has_public_capability('today'),'PUBLIC today defaults to disabled until owner enables it');
select ok(not public.has_public_capability('notifications'),'PUBLIC can never receive personalized notifications');
select throws_ok($$select public.owner_set_public_capabilities('{"calendar":true}'::jsonb)$$,'42501',null,'anon cannot write PUBLIC capabilities');
select throws_ok($$select public.owner_auth_cutover_readiness()$$,'42501',null,'anon cannot inspect owner auth readiness');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-00000000c003';
select throws_ok($$select public.owner_set_public_capabilities('{"calendar":true}'::jsonb)$$,'42501','owner_required','co-admin cannot write PUBLIC capabilities');
select throws_ok($$select public.owner_set_admin_role('00000000-0000-4000-8000-00000000b002','owner')$$,'42501','owner_required','co-admin cannot grant owner');

set local "request.jwt.claim.sub"='00000000-0000-4000-8000-00000000a001';
select lives_ok($$select public.owner_set_public_capabilities('{"calendar":true,"assistant":true}'::jsonb)$$,'owner writes PUBLIC capabilities');
select ok(public.has_public_capability('calendar'),'PUBLIC calendar gate reflects owner write');
select lives_ok($$select public.owner_set_public_capabilities('{"notifications":true,"calendar":true}'::jsonb)$$,'unknown notification request is safely ignored');
select ok(not public.has_public_capability('notifications'),'owner RPC cannot grant PUBLIC notifications');
select lives_ok($$select public.owner_set_admin_role('00000000-0000-4000-8000-00000000b002','owner')$$,'owner grants second owner');
reset role;
select is((select count(*)::int from public.app_admins where admin_role='owner' and revoked_at is null),2,'two active owners are supported');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-00000000b002';
select lives_ok($$select public.owner_set_admin_role('00000000-0000-4000-8000-00000000a001','none')$$,'second owner can downgrade first owner');
reset role;
select is((select count(*)::int from public.app_admins where admin_role='owner' and revoked_at is null),1,'downgrade keeps one active owner');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-00000000b002';
select throws_ok($$select public.owner_set_admin_role('00000000-0000-4000-8000-00000000b002','none')$$,'22023','cannot_change_own_owner_role','owner cannot self-remove');

select * from finish();
rollback;
