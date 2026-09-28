# Human Review Station Preview

This branch packages the existing Review UI v0.2 as a standalone static Vercel Preview. It is based on `main`; all Review Station hosting changes are confined to this branch.

## Import settings

- Repository: `tsaibohau/cy-school-news`
- Branch: `codex/human-review-station-host`
- Root directory: `/`
- Framework preset: `Other`
- Build command and output directory: configured in `vercel.json`
- Environment variables: none

The build script copies only `index.html`, `cloud_review.js`, and `station-config.js` into `dist-review-station`. Other repository files are not included in the deployed output.

## Backend and authentication

The browser connects only to the Training project `cy-school-news-training` (`sshovpnepgswzvjwjuyz`) with its publishable key. Review data is still read and written through Supabase Auth and RLS. The frontend contains no service key or Production project credential.

Round 1 is blind-only in this station. The machine-review mode selector option is removed, and the client defaults to blind mode. Do not send an OTP or Magic Link until the actual Vercel Preview URL is known and has been added to the Training Supabase Auth Site URL / Redirect URLs. The existing sign-in screen uses email OTP code entry.

The site entry is `/`. Its `index.html` loads the existing client adapter on every load and calls `getSession()` to restore an existing Auth session. No extra callback route is required.


## Canonical review workflow

This Vercel-hosted Review Station is the canonical human-review surface for subsequent rounds.

- Do not create a new review website for each labeling round.
- Human review answers are persisted to Training Supabase.
- After a round is completed and locked, prepare the next round in Training Supabase and expose that queue through this same Review Station.
- Keep machine predictions and human labels separate.
- Blind rounds must not query or expose machine predictions.
- Authentication is Magic Link only. Do not show or require a numeric OTP/code input in the Review Station UI.
- The browser may request a Magic Link with `signInWithOtp`, but the user completes sign-in by clicking the email link and returning to the station.
- Keep the client-side resend cooldown to reduce accidental Auth rate-limit hits.
- Gate A snapshot/predictions remain frozen unless a later round explicitly creates a new version.
- Never write review/training data to Production Supabase.

Current validated Training backend:
- project: `cy-school-news-training`
- ref: `sshovpnepgswzvjwjuyz`

Round 1 frozen snapshot:
- `c7db661b-181a-4cd3-b869-b39f7edb3048`

Round 1 blind queue:
- 60 announcements


## Authentication and queue behavior

- Primary sign-in is Email + password.
- Magic Link remains available only as a fallback/recovery path.
- An already signed-in approved reviewer can set or change the account password from the Review Station.
- Do not reintroduce numeric OTP/code entry UI.
- After an approved reviewer session is established, automatically load the frozen blind-review queue for the configured snapshot.
- Keep the manual “載入／恢復複查佇列” control only as a recovery/reload action.
- Do not load the full snapshot as the human-labeling queue. Round 1 remains the 60 announcement IDs stored in `manifest.review_queue.announcement_ids`.
- Subsequent rounds should be written to Training Supabase and surfaced through this same Review Station rather than creating another review site.
