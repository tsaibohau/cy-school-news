-- Role-level acceptance test for the member-content SECURITY INVOKER API.
-- All fixture writes are rolled back.
begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

select ok(
  has_schema_privilege('service_role', 'private', 'USAGE'),
  'service_role has USAGE on private schema'
);
select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anon has no USAGE on private schema'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated has no USAGE on private schema'
);
select ok(
  has_function_privilege('service_role', 'public.upsert_announcement_member_content(jsonb)', 'EXECUTE'),
  'service_role can execute member-content upsert'
);
select ok(
  not has_function_privilege('anon', 'public.upsert_announcement_member_content(jsonb)', 'EXECUTE'),
  'anon cannot execute member-content upsert'
);
select ok(
  not has_function_privilege('authenticated', 'public.upsert_announcement_member_content(jsonb)', 'EXECUTE'),
  'authenticated cannot execute member-content upsert'
);

set local role service_role;
select lives_ok(
  $$select public.upsert_announcement_member_content(
    '[{"announcement_id":"__permission_test__","summary":"test","snippet":"test","detail":null,"source_hash":"test"}]'::jsonb
  )$$,
  'service_role can invoke SECURITY INVOKER upsert'
);

set local role anon;
select throws_ok(
  $$select count(*) from private.announcement_member_content$$,
  '42501', null,
  'anon cannot directly read member-content table'
);

set local role authenticated;
select throws_ok(
  $$select count(*) from private.announcement_member_content$$,
  '42501', null,
  'authenticated cannot directly read member-content table'
);

reset role;
select * from finish();
rollback;
