-- STAGING OWNER-RUN ACTIVATION, not a migration.
-- Prerequisites: pg_cron + pg_net enabled, reminder-worker deployed, and these
-- values provisioned in Supabase Vault without pasting them into this file:
--   reminder_worker_url       full HTTPS Edge Function URL
--   reminder_worker_jwt       protected JWT accepted by the function gateway
--   reminder_worker_token     independent random worker token

do $$
declare
  missing_names text[];
begin
  select array_agg(required.name order by required.name)
    into missing_names
    from (values
      ('reminder_worker_url'),
      ('reminder_worker_jwt'),
      ('reminder_worker_token')
    ) required(name)
   where not exists (
     select 1 from vault.decrypted_secrets secret
      where secret.name = required.name and nullif(secret.decrypted_secret, '') is not null
   );
  if missing_names is not null then
    raise exception 'missing reminder scheduler Vault values: %', array_to_string(missing_names, ', ');
  end if;
end
$$;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'personal-assistant-reminder-worker';

select cron.schedule(
  'personal-assistant-reminder-worker',
  '* * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_worker_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_worker_jwt'),
        'x-reminder-worker-token', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_worker_token')
      ),
      body := '{"batchSize":25}'::jsonb,
      timeout_milliseconds := 20000
    );
  $cron$
);
