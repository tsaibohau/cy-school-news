"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const fn = fs.readFileSync(path.join(root, "supabase", "functions", "request-staging-refresh", "index.ts"), "utf8");
const imports = JSON.parse(fs.readFileSync(path.join(root, "supabase", "functions", "request-staging-refresh", "deno.json"), "utf8"));
const sql = fs.readFileSync(path.join(root, "supabase", "contracts", "staging_refresh_request.sql"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "staging-user-refresh.yml"), "utf8");
const config = fs.readFileSync(path.join(root, "supabase", "config.toml"), "utf8");
const browser = ["app.js", "account-config.js", "account-auth.js"].map(name =>
  fs.readFileSync(path.join(root, "docs", name), "utf8")).join("\n");
const scraperConfig = JSON.parse(fs.readFileSync(path.join(root, "scraper", "config.json"), "utf8"));

assert.match(config, /\[functions\.request-staging-refresh\][\s\S]*verify_jwt = true/);
assert.match(fn, /auth\.getUser\(token\)/, "server must revalidate the ordinary user JWT");
assert.match(fn, /origin !== STAGING_ORIGIN/, "production and unapproved browser origins must be rejected");
assert.match(fn, /x-idempotency-key/);
assert.match(fn, /claim_staging_refresh/);
assert.match(fn, /per_user_cooldown_seconds: 300/);
assert.match(fn, /global_cooldown_seconds: 120/);
assert.match(fn, /GITHUB_REFRESH_TOKEN/);
assert.match(fn, /actions\/workflows\/\$\{WORKFLOW\}\/dispatches/);
assert.match(fn, /ref: "staging"/);
assert.doesNotMatch(fn, /console\.(?:log|error)/, "endpoint must not log identity, token, or dispatch secrets");
assert.doesNotMatch(browser, /GITHUB_REFRESH_TOKEN|api\.github\.com\/repos/, "browser must never contain GitHub credentials or dispatch code");
assert.match(browser, /STAGING_REFRESH_ORIGIN = "https:\/\/cy-school-news-staging\.vercel\.app"/,
  "the server refresh trigger is restricted to the exact staging origin");
assert.match(browser, /accountAuth\.getVerifiedSession\(\)/,
  "browser refresh requires the existing server-verified Supabase session contract");
assert.match(browser, /\/functions\/v1\/request-staging-refresh/);
assert.match(browser, /"x-idempotency-key": window\.crypto\.randomUUID\(\)/);
assert.match(browser, /apikey: endpoint\.anonKey/);
assert.match(browser, /authorization: "Bearer " \+ session\.access_token/);
for (const status of ["accepted", "already_requested", "rate_limited", "unavailable"]) {
  assert.match(browser, new RegExp('"' + status + '"'), "browser must handle " + status);
}
assert.match(browser, /pollPublishedGeneration/);
assert.match(browser, /更新已排程；雲端尚未發布完成/,
  "a bounded polling timeout must not falsely claim that scraping or publishing completed");
for (const specifier of Object.values(imports.imports)) assert.doesNotMatch(specifier, /[\^~*]|@latest$/);

assert.match(sql, /create table if not exists private\.user_refresh_requests/);
assert.match(sql, /enable row level security/);
assert.match(sql, /revoke all on table private\.user_refresh_requests from public, anon, authenticated/);
assert.match(sql, /unique \(user_id, idempotency_key\)/);
assert.match(sql, /pg_advisory_xact_lock/, "rate-limit decision must be concurrency-safe");
assert.match(sql, /'duplicate'::text/);
assert.match(sql, /'rate_limited'::text/);
assert.match(sql, /grant execute on function public\.claim_staging_refresh[\s\S]*to service_role/);
assert.doesNotMatch(sql, /grant execute[\s\S]{0,180}to (?:anon|authenticated)/);

assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /ref: staging/);
assert.match(workflow, /HOT_ONLY: '1'/);
assert.doesNotMatch(workflow, /FETCH_ALL|notify\.py/, "user refresh must neither full-crawl nor send staging ntfy");
assert.match(workflow, /group: staging-user-refresh/);
assert.match(workflow, /cancel-in-progress: false/);
assert.equal(Number(scraperConfig.request_delay_sec) >= 1.5, true, "school request delay invariant remains >= 1.5 seconds");
console.log("Authenticated staging user-refresh security/rate-limit contract tests passed");
