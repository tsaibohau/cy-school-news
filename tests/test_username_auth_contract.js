const assert = require("assert");
const fs = require("fs");
const path = require("path");

const migration = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20260831000000_username_password_login.sql"), "utf8");
const fn = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "username-auth", "index.ts"), "utf8");
const config = fs.readFileSync(path.join(__dirname, "..", "supabase", "config.toml"), "utf8");

assert.match(migration, /create table if not exists private\.account_usernames/i);
assert.match(migration, /revoke all on table private\.account_usernames from public, anon, authenticated/i);
assert.match(migration, /revoke all on function public\.username_login_email\(text\) from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.username_login_email\(text\) to service_role/i);
assert.match(migration, /grant execute on function public\.claim_account_username\(text\) to authenticated/i);
assert.doesNotMatch(fn, /console\.log|SUPABASE_SERVICE_ROLE_KEY[^\n]*Response/i);
assert.match(fn, /invalid_credentials/);
assert.match(fn, /https:\/\/cy-school-news-staging\.vercel\.app/);
assert.match(fn, /https:\/\/tsaibohau\.github\.io/);
assert.match(fn, /allowedOrigins\.has\(origin\)/);
assert.doesNotMatch(fn, /access-control-allow-origin": "\*"/);
assert.match(config, /\[functions\.username-auth\][\s\S]*verify_jwt = false/);
console.log("Username/password auth contract tests passed");
