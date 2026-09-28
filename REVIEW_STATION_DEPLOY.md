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
