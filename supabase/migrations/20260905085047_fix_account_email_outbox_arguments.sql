-- Keep input names distinct from outbox column names so registration triggers
-- can enqueue email safely.
drop function if exists private.queue_account_email(text, text, text, jsonb);

create function private.queue_account_email(
  p_event_key text,
  p_recipient_email text,
  p_template text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if p_event_key is null or length(p_event_key) > 180 then
    raise exception 'invalid email event key' using errcode = '22023';
  end if;
  if p_recipient_email is null or length(p_recipient_email) > 254 then
    raise exception 'invalid email recipient' using errcode = '22023';
  end if;
  insert into private.account_email_outbox (event_key, recipient_email, template, payload)
  values (p_event_key, lower(p_recipient_email), p_template, coalesce(p_payload, '{}'::jsonb))
  on conflict (event_key) do nothing;
end;
$$;

revoke all on function private.queue_account_email(text, text, text, jsonb) from public, anon, authenticated;
