-- Reduce authenticated access to the row operations used by the web client.
-- Apply only after the feature Preview and dedicated-session RLS check pass.

revoke all on table public.user_subscriptions from anon;
revoke all on table public.user_reads from anon;
revoke all on table public.user_preferences from anon;
revoke all on table public.user_tasks from anon;

revoke truncate, references, trigger on table public.user_subscriptions from authenticated;
revoke truncate, references, trigger on table public.user_reads from authenticated;
revoke truncate, references, trigger on table public.user_preferences from authenticated;
revoke truncate, references, trigger on table public.user_tasks from authenticated;

alter policy "subscriptions own rows" on public.user_subscriptions
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "reads own rows" on public.user_reads
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "preferences own row" on public.user_preferences
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "tasks own rows" on public.user_tasks
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
