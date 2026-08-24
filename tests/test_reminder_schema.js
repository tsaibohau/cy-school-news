const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "003_reminder_push_foundation.sql"), "utf8");
for (const table of ["user_reminder_rules", "user_push_subscriptions", "reminder_jobs", "reminder_deliveries"]) {
  assert.match(sql, new RegExp("create table if not exists public\\." + table));
  assert.match(sql, new RegExp("alter table public\\." + table + " enable row level security"));
}
assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/);
assert.match(sql, /with check \(\(select auth\.uid\(\)\) = user_id\)/);
assert.match(sql, /-- Jobs and deliveries are server-worker tables/);
console.log("Reminder schema security contract tests passed");

