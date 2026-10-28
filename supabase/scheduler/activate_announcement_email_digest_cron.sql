-- OWNER-RUN ACTIVATION, not a migration. Email digests stay off until the
-- sender domain and Edge Function secrets have been verified.
-- Required Edge Function secrets:
--   RESEND_API_KEY, EMAIL_DIGEST_FROM (or ACCOUNT_EMAIL_FROM),
--   EMAIL_DIGEST_WORKER_TOKEN, EMAIL_DIGEST_UNSUBSCRIBE_SECRET,
--   EMAIL_DIGEST_FUNCTION_URL
-- Optional: EMAIL_DIGEST_SCHOOLS (default cysh,cygsh), EMAIL_DIGEST_DAILY_HOUR
--   (Taipei hour, default 7), EMAIL_DIGEST_DAILY_CAP (default 90)
-- Required Vault values:
--   email_digest_worker_url, email_digest_worker_token
-- Runs once an hour at minute 23 (after the hourly scrape commit lands).

do $$
declare missing_names text[];
begin
  select array_agg(required.name order by required.name)
  into missing_names
  from (values ('email_digest_worker_url'), ('email_digest_worker_token')) required(name)
  where not exists (
    select 1 from vault.decrypted_secrets secret
    where secret.name = required.name and nullif(secret.decrypted_secret, '') is not null
  );
  if missing_names is not null then
    raise exception 'missing email digest scheduler Vault values: %', array_to_string(missing_names, ', ');
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'announcement-email-digest';

select cron.schedule(
  'announcement-email-digest',
  '23 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'email_digest_worker_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-email-digest-worker-token', (select decrypted_secret from vault.decrypted_secrets where name = 'email_digest_worker_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
