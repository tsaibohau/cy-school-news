# Personal Assistant staging

## Durable architecture

- Repository: `tsaibohau/cy-school-news`
- Feature integration: `feature/personal-assistant-v1`
- Staging promotion branch: `staging`
- Vercel project: `cy-school-news-staging`
- Stable origin: `https://cy-school-news-staging.vercel.app/`
- Production remains GitHub Pages from `main`.
- Supabase project remains `oppdhtnepjagdwovndra`; staging has no RLS bypass.

Vercel builds `dist-staging` with `node tools/build-staging.js`. The output is temporary and ignored by Git. The build copies the approved `docs` snapshot, then adds noindex headers/meta, a visible staging banner, a staging-specific manifest, and the query-gated acceptance harness. It never runs the scraper or rewrites generated announcement data.

## OAuth configuration

Supabase Site URL stays `https://tsaibohau.github.io/cy-school-news/`. The only staging Auth change is the exact Additional Redirect URL `https://cy-school-news-staging.vercel.app/`. Google continues to return to Supabase at `https://oppdhtnepjagdwovndra.supabase.co/auth/v1/callback`; do not add a Google redirect directly to Vercel. Per-commit Vercel URLs and wildcard redirects are deliberately rejected.

## Promotion

1. Fetch `main`, feature, and `staging`.
2. Merge current `origin/main` into feature, preserving main's Action-owned generated data.
3. Run the full Node/Python/data/secret suite.
4. Push feature and verify its remote head.
5. Promote the reviewed feature head to `staging` without rewriting shared history.
6. Verify Vercel's deployed commit equals `origin/staging` before authenticated acceptance.

## REAL user_tasks A/B acceptance

Open `/?acceptance=user-tasks`. The harness is absent from the production source and fails closed on any origin other than the fixed staging origin. It uses real verified Supabase sessions and reports only `USER_A`/`USER_B` and sanitized PASS/BLOCKED status. Tokens and UIDs remain in JavaScript memory; session storage contains only disposable run/task/mutation identifiers.

Fixtures use the reserved `CYNEWS_RLS_ACCEPT_` prefix. Each session deletes only its own task row. One exact A-scoped outbox mutation is acknowledged; the rest of the real outbox is untouched. If the companion USER_A session expires, acceptance is blocked rather than bypassed.

## Rollback

Rollback the Vercel staging deployment or revert the `staging` branch. If Auth redirect behavior is implicated, remove only the exact staging Additional Redirect URL. Do not change the production Site URL, Google callback, database schema, RLS, or historical announcement data.
