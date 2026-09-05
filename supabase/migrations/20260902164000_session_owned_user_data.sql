-- Let authenticated sessions own rows without trusting a browser-supplied user_id.
-- RLS policies still reject an explicit user_id belonging to any other account.
alter table public.user_subscriptions
  alter column user_id set default auth.uid();

alter table public.user_reads
  alter column user_id set default auth.uid();

alter table public.user_preferences
  alter column user_id set default auth.uid();

alter table public.user_tasks
  alter column user_id set default auth.uid();
