-- Add approval decisions to the existing administrator audit log.
alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_action_check;

alter table public.admin_audit_log
  add constraint admin_audit_log_action_check
  check (action in ('account_approved', 'account_rejected'));
