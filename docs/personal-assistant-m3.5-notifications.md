# Personal Assistant V1 — M3.5 Personalized Notifications

Personalized delivery layers on top of Notification V3. Notification V3 is
not rewritten and remains responsible for browser permission, fresh-network
gating, bounded IDs, monotonic keyword watermarking, and device-local state.

## Eligibility

A personalized candidate requires all of:

1. the item is from the fresh recent network response;
2. the active account has personalized notifications enabled;
3. the active profile has context;
4. the item has deterministic `strong` relevance evidence;
5. the announcement ID is not already in local notifiedIds.

Strong evidence is an explicit school, grade, or class match. Weak or
ambiguous numeric text does not qualify. Keyword subscriptions continue to
work when no profile exists.

## Baselines and account boundaries

Personalized watermark baselines are device-local and account-scoped:

    cyNews.personalizedThrough.v1:<account-id>

Profile creation, edits, and enabling personalized notifications establish a
new local baseline. Existing announcements therefore do not flood the
device. The normal keyword `notifiedThrough` watermark is not advanced by a
personalized-only delivery.

Switching accounts clears the active profile and personalization context
before remote resolution. The new account projects its own profile and
baseline only after verified session UID resolution. Anonymous state has no
authenticated profile personalization.

## Deduplication

Keyword and personalized candidates are unioned by announcement ID before a
browser notification is created. One announcement therefore produces at
most one notification per device, even when both rules match.

After successful browser delivery, keyword candidates update the existing
Notification V3 state and personalized candidates update only
`personalizedThrough` plus the shared bounded `notifiedIds`. Failed browser
delivery updates neither.

The synced account preference is stored in
`user_preferences.preferences.notification_preferences.personalized`.
Browser permission, delivery history, notified IDs, watermarks, and Service
Worker state remain device-local.
