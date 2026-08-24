const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrations = path.join(__dirname, "..", "supabase", "migrations");
const foundation = fs.readFileSync(path.join(migrations, "003_reminder_push_foundation.sql"), "utf8");
const hardeningName = fs.readdirSync(migrations).find((name) => name.endsWith("_reminder_delivery_hardening.sql"));
assert.ok(hardeningName, "official CLI-generated reminder hardening migration is required");
const hardening = fs.readFileSync(path.join(migrations, hardeningName), "utf8");
const sql = foundation + "\n" + hardening;
for (const table of ["user_reminder_rules", "user_push_subscriptions", "reminder_jobs", "reminder_deliveries"]) {
  assert.match(sql, new RegExp("create table if not exists public\\." + table));
  assert.match(sql, new RegExp("alter table public\\." + table + " enable row level security"));
}
assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/);
assert.match(sql, /with check \(\(select auth\.uid\(\)\) = user_id\)/);
assert.match(sql, /-- Jobs and deliveries are server-worker tables/);
assert.match(hardening, /create table if not exists public\.reminder_targets/);
assert.match(hardening, /create schema if not exists private/);
assert.match(hardening, /create or replace function private\.validate_reminder_rule_target/);
assert.doesNotMatch(hardening, /security definer[\s\S]{0,160}public\.validate_reminder_rule_target/);
assert.match(hardening, /grant execute on function public\.valid_reminder_offsets\(integer\[\]\) to authenticated/);
assert.match(hardening, /Publication dates are not valid targets/);
assert.match(hardening, /target_kind = 'manual' and manual_target_at is not null/);
assert.match(hardening, /raise exception 'unverified reminder target'/);
assert.match(hardening, /foreign key \(rule_id, user_id\)/);
assert.match(hardening, /foreign key \(job_id, user_id\)/);
assert.match(hardening, /foreign key \(push_subscription_id, user_id\)/);
assert.match(hardening, /unique \(endpoint\)/);
assert.match(hardening, /attempts integer not null default 0/);
assert.match(hardening, /lease_until timestamptz/);
assert.match(hardening, /next_attempt_at timestamptz/);
assert.match(hardening, /status in \('pending', 'processing', 'sent', 'skipped', 'retry', 'dead', 'cancelled'\)/);
assert.match(hardening, /revoke all on table public\.reminder_jobs from anon, authenticated/);
assert.match(hardening, /revoke all on table public\.reminder_deliveries from anon, authenticated/);
assert.match(hardening, /date-only targets resolve at local midnight/);
console.log("Reminder schema security contract tests passed");

