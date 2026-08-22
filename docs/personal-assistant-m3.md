# Personal Assistant V1 — M3 Profile and Relevance

## Profile storage

M3 reuses public.user_preferences.preferences to avoid a new table and
migration. The profile is optional and is versioned inside the existing
account-owned preference row:

    {
      "profile": {
        "schema_version": 1,
        "school_id": "cysh",
        "grade_level": 1,
        "class_name": "109",
        "interests": ["物理"],
        "tracked_categories": ["競賽"],
        "tracked_keywords": ["物理競賽"]
      }
    }

grade_level is the Taiwan senior-high semantic year: 1, 2, or 3.
Every field is optional. No sensitive identity data is collected.

The existing Supabase adapter removes caller-provided user_id and derives
ownership from the verified session.user.id. Account lifecycle namespaces
continue to be cyNews.accountState.v1:<UID>.

## Relevance

docs/relevance.js is deterministic and offline. It first extracts
conservative audience evidence:

- 高一 / 一年級 / 高一新生
- 高二 / 二年級
- 高三 / 三年級
- 全校
- class numbers only when followed by 班, or an explicit bounded range
  followed by 班

Bare numeric strings such as 101 or 101-116 are not class evidence.
Raw announcement fields are never mutated; extracted audience is a separate
derived value.

Strong rules are school, grade, and class matches. Medium rules are tracked
keywords, tracked categories, and interests. Results preserve rule,
source-field, matched-value, and user-facing label. Low relevance never
removes an announcement from the full corpus.

## UI

The existing mobile 我的 tab contains subscriptions, account controls, and
the optional 我的資料 form. Profile writes are blocked until a verified
account reaches ACCOUNT_READY; anonymous profile data is not persisted.
