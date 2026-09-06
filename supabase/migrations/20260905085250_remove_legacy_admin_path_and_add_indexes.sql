-- The legacy review RPC predates role separation and could let a co-admin
-- change another administrator's access state. Remove that bypass entirely.
revoke all on function public.admin_review_account(uuid, text) from public, anon, authenticated;
drop function public.admin_review_account(uuid, text);

-- Keep filtered account administration responsive as the user count grows.
create index if not exists account_access_status_requested_idx
  on public.account_access (status, requested_at desc);
create index if not exists account_access_service_level_idx
  on public.account_access (service_level);
create index if not exists account_access_reviewed_by_idx
  on public.account_access (reviewed_by) where reviewed_by is not null;
create index if not exists app_admins_created_by_idx
  on public.app_admins (created_by) where created_by is not null;
create index if not exists admin_audit_log_actor_created_idx
  on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_log_target_created_idx
  on public.admin_audit_log (target_user_id, created_at desc) where target_user_id is not null;
create index if not exists account_email_outbox_pending_idx
  on private.account_email_outbox (created_at, claimed_at)
  where sent_at is null and attempts < 5;
