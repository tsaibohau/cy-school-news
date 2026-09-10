-- Remove legacy permissive RLS policies so fine-grained capability policies are authoritative.

-- Notifications
DROP POLICY IF EXISTS approved_subscriptions_select ON public.user_subscriptions;
DROP POLICY IF EXISTS approved_subscriptions_insert ON public.user_subscriptions;
DROP POLICY IF EXISTS approved_subscriptions_update ON public.user_subscriptions;
DROP POLICY IF EXISTS approved_subscriptions_delete ON public.user_subscriptions;

-- Member announcement read-state
DROP POLICY IF EXISTS approved_reads_select ON public.user_reads;
DROP POLICY IF EXISTS approved_reads_insert ON public.user_reads;
DROP POLICY IF EXISTS approved_reads_update ON public.user_reads;
DROP POLICY IF EXISTS approved_reads_delete ON public.user_reads;

-- Calendar/task data
DROP POLICY IF EXISTS approved_tasks_select ON public.user_tasks;
DROP POLICY IF EXISTS approved_tasks_insert ON public.user_tasks;
DROP POLICY IF EXISTS approved_tasks_update ON public.user_tasks;
DROP POLICY IF EXISTS approved_tasks_delete ON public.user_tasks;

-- Shared personal preferences: access remains available when at least one personal capability is enabled.
DROP POLICY IF EXISTS approved_preferences_select ON public.user_preferences;
DROP POLICY IF EXISTS approved_preferences_insert ON public.user_preferences;
DROP POLICY IF EXISTS approved_preferences_update ON public.user_preferences;
DROP POLICY IF EXISTS approved_preferences_delete ON public.user_preferences;
