# Personal Assistant staging

## Durable architecture

- Repository: `tsaibohau/cy-school-news`
- Feature integration: `feature/personal-assistant-v1`
- Staging promotion branch: `staging`
- Vercel project: `cy-school-news-staging`
- Vercel project ID: `prj_m1Bv7bl7wjEDjiVPidQUAJE7YVyQ`
- Vercel Production Branch: `staging`
- Stable origin: `https://cy-school-news-staging.vercel.app/`
- Production remains GitHub Pages from `main`.
- The staging source configuration (`docs/account-config.js`) points to the dedicated Preview Supabase project `ebezqanvmgsgtatsbssn`. It does not share the former `oppdhtnepjagdwovndra` configuration. Production Auth settings must be verified separately before promotion; do not copy a Preview backend into production by assuming they are interchangeable.

Vercel builds `dist-staging` with `node tools/build-staging.js`. The output is temporary and ignored by Git. The build copies the approved `docs` snapshot, then adds noindex headers/meta, a visible staging banner, a staging-specific manifest, and the query-gated acceptance harness. It never runs the scraper or rewrites generated announcement data.

Every staging build derives one content revision for its HTML, CSS, JavaScript, harness and Service Worker cache. Staging navigation is network-first (with an offline shell fallback), so an installed PWA cannot combine an old HTML shell with newer scripts. This is staging-only; production cache versions remain governed by its own release process.

## OAuth configuration

The stable staging return URL is `https://cy-school-news-staging.vercel.app/`. For the dedicated Preview backend, Google's Supabase callback is `https://ebezqanvmgsgtatsbssn.supabase.co/auth/v1/callback`; it is not the old shared-project callback or a direct Google-to-Vercel callback. The provider's current Site URL and redirect allowlist require provider-side verification; this source file is not evidence that those settings are deployed. Per-commit Vercel URLs and wildcard redirects are deliberately rejected.

## Promotion

1. Fetch `main`, feature, and `staging`.
2. Merge current `origin/main` into feature, preserving main's Action-owned generated data.
3. Run the full Node/Python/data/secret suite.
4. Push feature and verify its remote head.
5. Promote the reviewed feature head to `staging` without rewriting shared history.
6. Verify Vercel's deployed commit equals `origin/staging` before authenticated acceptance.

If Git reports unrelated histories, first inspect `git rev-parse --is-shallow-repository`. Fetch complete history before drawing conclusions about ancestry. Fetch explicit `main:refs/remotes/origin/main` and `staging:refs/remotes/origin/staging` refspecs when the local clone only tracks an old feature branch. Never fix this with force-push or `--allow-unrelated-histories`.

## REAL user_tasks A/B acceptance

Open `/?acceptance=user-tasks`. The harness is absent from the production source and fails closed on any origin other than the fixed staging origin. It uses real verified Supabase sessions and reports only `USER_A`/`USER_B` and sanitized PASS/BLOCKED status. Tokens and UIDs remain in JavaScript memory; session storage contains only disposable run/task/mutation identifiers.

Fixtures use the reserved `CYNEWS_RLS_ACCEPT_` prefix. Each session deletes only its own task row. One exact A-scoped outbox mutation is acknowledged; the rest of the real outbox is untouched. If the companion USER_A session expires, acceptance is blocked rather than bypassed.

## Rollback

Rollback the Vercel staging deployment or revert the `staging` branch. If Auth redirect behavior is implicated, remove only the exact staging Additional Redirect URL. Do not change the production Site URL, Google callback, database schema, RLS, or historical announcement data.
