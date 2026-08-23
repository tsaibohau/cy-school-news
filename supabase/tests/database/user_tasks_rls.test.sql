-- Deterministic local RLS acceptance for public.user_tasks.
-- This file runs inside the local Supabase database test role. It does not
-- use service_role as a behavioral substitute for an authenticated user.
begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

-- Setup is performed before switching to the authenticated role. The tests
-- below exercise the exposed table as two different JWT subjects.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'rls-a@local.test', '', now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'rls-b@local.test', '', now())
on conflict (id) do nothing;

insert into public.user_tasks (id, user_id, title, status, notes)
values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000a1', 'fixture A', 'open', 'local'),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-0000000000b2', 'fixture B', 'open', 'local')
on conflict (id) do update set title = excluded.title, status = excluded.status, deleted_at = null;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-0000000000a1';

select is((select count(*)::int from public.user_tasks), 1, 'USER_A sees only own task');
select lives_ok($$insert into public.user_tasks (id, user_id, title) values ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-0000000000a1', 'created A')$$, 'USER_A inserts own task');
select lives_ok($$update public.user_tasks set title = 'updated A' where id = '00000000-0000-4000-8000-00000000a001'$$, 'USER_A updates own task');
select lives_ok($$update public.user_tasks set status = 'completed', completed_at = now() where id = '00000000-0000-4000-8000-00000000a001'$$, 'USER_A completes own task');
select lives_ok($$update public.user_tasks set status = 'open', completed_at = null where id = '00000000-0000-4000-8000-00000000a001'$$, 'USER_A reopens own task');
select lives_ok($$update public.user_tasks set deleted_at = now() where id = '00000000-0000-4000-8000-00000000a001'$$, 'USER_A tombstones own task');
select lives_ok($$update public.user_tasks set deleted_at = null where id = '00000000-0000-4000-8000-00000000a001'$$, 'USER_A restores own task');
select is((select count(*)::int from public.user_tasks where id = '00000000-0000-4000-8000-00000000b002'), 0, 'USER_A cannot read USER_B task');
select throws_ok($$insert into public.user_tasks (id, user_id, title) values ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-0000000000b2', 'spoof A')$$, '42501', 'USER_A cannot insert with USER_B owner');
select throws_ok($$update public.user_tasks set user_id = '00000000-0000-4000-8000-0000000000b2' where id = '00000000-0000-4000-8000-00000000a001'$$, '42501', 'USER_A cannot reassign ownership');
select is((select count(*)::int from public.user_tasks where id = '00000000-0000-4000-8000-00000000b002'), 0, 'USER_A cross-read remains empty');
select is((select count(*)::int from public.user_tasks where id = '00000000-0000-4000-8000-00000000b002' and title = 'hacked'), 0, 'USER_A cross-update has no effect');

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-0000000000b2';

select is((select count(*)::int from public.user_tasks), 1, 'USER_B sees only own task');
select lives_ok($$insert into public.user_tasks (id, user_id, title) values ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-0000000000b2', 'created B')$$, 'USER_B inserts own task');
select lives_ok($$update public.user_tasks set title = 'updated B' where id = '00000000-0000-4000-8000-00000000b002'$$, 'USER_B updates own task');
select lives_ok($$update public.user_tasks set status = 'completed', completed_at = now() where id = '00000000-0000-4000-8000-00000000b002'$$, 'USER_B completes own task');
select lives_ok($$update public.user_tasks set status = 'open', completed_at = null where id = '00000000-0000-4000-8000-00000000b002'$$, 'USER_B reopens own task');
select lives_ok($$update public.user_tasks set deleted_at = now() where id = '00000000-0000-4000-8000-00000000b002'$$, 'USER_B tombstones own task');
select is((select count(*)::int from public.user_tasks where id = '00000000-0000-4000-8000-00000000a001'), 0, 'USER_B cannot read USER_A task');
select throws_ok($$insert into public.user_tasks (id, user_id, title) values ('00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-0000000000a1', 'spoof B')$$, '42501', 'USER_B cannot insert with USER_A owner');
select throws_ok($$update public.user_tasks set user_id = '00000000-0000-4000-8000-0000000000a1' where id = '00000000-0000-4000-8000-00000000b002'$$, '42501', 'USER_B cannot reassign ownership');
select is((select count(*)::int from public.user_tasks where id = '00000000-0000-4000-8000-00000000a001'), 0, 'USER_B cross-read remains empty');
select is((select count(*)::int from public.user_tasks where id = '00000000-0000-4000-8000-00000000a001' and title = 'hacked'), 0, 'USER_B cross-update has no effect');

set local role anon;
select is((select count(*)::int from public.user_tasks), 0, 'anonymous cannot read private tasks');
select throws_ok($$insert into public.user_tasks (user_id, title) values ('00000000-0000-4000-8000-0000000000a1', 'anonymous')$$, '42501', 'anonymous cannot insert private tasks');

select * from finish();
rollback;
