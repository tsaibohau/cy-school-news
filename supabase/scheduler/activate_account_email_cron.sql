-- OWNER-RUN ACTIVATION, not a migration. Delivery stays off until the sender
-- domain and Edge Function secrets have been verified.
-- Required Edge Function secrets:
--   RESEND_API_KEY, ACCOUNT_EMAIL_FROM, ACCOUNT_EMAIL_WORKER_TOKEN
-- Required Vault values:
--   account_email_worker_url, account_email_worker_token

do $$
declare missing_names text[];
begin
  select array_agg(required.name order by required.name)
  into missing_names
  from (values ('account_email_worker_url'), ('account_email_worker_token')) required(name)
  where not exists (
    select 1 from vault.decrypted_secrets secret
    where secret.name = required.name and nullif(secret.decrypted_secret, '') is not null
  );
  if missing_names is not null then
    raise exception 'missing account email scheduler Vault values: %', array_to_string(missing_names, ', ');
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'account-email-worker';

select cron.schedule(
  'account-email-worker',
  '* * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'account_email_worker_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-account-email-worker-token', (select decrypted_secret from vault.decrypted_secrets where name = 'account_email_worker_token')
      ),
      body := '{"batchSize":20}'::jsonb,
      timeout_milliseconds := 20000
    );
  $cron$
);
