# Authenticated staging refresh

The staging refresh button must never call GitHub directly. Its server chain is:

`verified Supabase user → request-staging-refresh Edge Function → atomic private
rate-limit ledger → GitHub workflow_dispatch → hot-source scrape → staging data
commit → Vercel staging deployment`.

The Edge Function accepts only the stable staging origin and a currently valid
Supabase user JWT, revalidated with `auth.getUser()`. A caller-generated UUIDv4
idempotency key makes network retries return the existing decision. The private
database ledger serializes decisions and enforces a five-minute per-user and
two-minute global cooldown. Browser roles receive no table access and no RPC
execution permission.

`GITHUB_REFRESH_TOKEN` is an Edge Function secret. It must be a fine-grained,
repository-scoped credential with only the permission required to dispatch
Actions. It is never placed in Git, Vercel output, frontend configuration,
response bodies, or logs. The workflow itself receives a sanitized request ID,
checks out only `staging`, fetches only configured hot sources, retains the
school request delay of at least 1.5 seconds, sends no ntfy notification, and
commits only Actions-owned generated files.

`supabase/contracts/staging_refresh_request.sql` is a reviewed schema contract,
not an applied migration. Before live activation, generate the official
additive migration through the Supabase CLI workflow, validate it on an
isolated staging database with pgTAP/Auth A/B, deploy the function with JWT
verification enabled, and provision `GITHUB_REFRESH_TOKEN` in protected Edge
Function secrets. Until all four are complete, the UI must report refresh as
unavailable rather than falling back to a browser GitHub token.
