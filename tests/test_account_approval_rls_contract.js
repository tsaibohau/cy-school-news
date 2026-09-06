"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20260904010000_require_approved_account_access.sql"), "utf8");

assert.match(migration, /function public\.has_approved_account\(\)/);
assert.match(migration, /security definer/);
assert.match(migration, /access\.status = 'approved'/);
assert.match(migration, /revoke all on function public\.has_approved_account\(\) from public, anon/);
assert.match(migration, /grant execute on function public\.has_approved_account\(\) to authenticated/);

for (const table of ["user_subscriptions", "user_reads", "user_preferences", "user_tasks", "user_reminder_rules", "user_push_subscriptions"]) {
  assert.match(migration, new RegExp("on public\\." + table), table + " must have an approval-gated policy");
}
assert.equal((migration.match(/create policy approved_/g) || []).length, 22,
  "every browser-accessible owner operation must have an explicit approval-gated policy");
console.log("Account approval RLS contract tests passed");
