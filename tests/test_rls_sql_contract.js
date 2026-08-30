"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(repo, "supabase", "tests", "database", "user_tasks_rls.test.sql"), "utf8");
const reminderSql = fs.readFileSync(path.join(repo, "supabase", "tests", "database", "reminder_rls.test.sql"), "utf8");
const migration = fs.readFileSync(path.join(repo, "supabase", "migrations", "0021_user_tasks.sql"), "utf8");
const reminderLeastPrivilege = fs.readFileSync(
  path.join(repo, "supabase", "migrations", "20260830123000_reminder_browser_least_privilege.sql"),
  "utf8"
);

assert.match(sql, /set local role authenticated/);
assert.match(sql, /request\.jwt\.claim\.sub/);
assert.match(sql, /select plan\(25\)/);
assert.match(sql, /USER_A cannot insert with USER_B owner/);
assert.match(sql, /USER_B cannot reassign ownership/);
assert.match(sql, /anonymous cannot read private tasks/);
assert.match(migration, /create policy "tasks own rows"/);
assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
assert.match(migration, /with check/);
assert.match(reminderSql, /select plan\(24\)/);
assert.match(reminderSql, /authenticated cannot hard-delete reminder rules/);
assert.match(reminderSql, /authenticated cannot hard-delete push devices/);
assert.match(reminderSql, /USER_A cannot spoof USER_B owner/);
assert.match(reminderSql, /USER_B cannot deactivate USER_A device/);
assert.match(reminderSql, /endpoint cannot silently transfer from USER_A to USER_B/);
assert.match(reminderSql, /authenticated cannot read delivery ledger/);
assert.match(reminderSql, /anonymous cannot insert reminder rules/);
assert.match(reminderLeastPrivilege, /revoke delete, truncate, references, trigger[\s\S]*user_reminder_rules[\s\S]*authenticated/);
assert.match(reminderLeastPrivilege, /revoke delete, truncate, references, trigger[\s\S]*user_push_subscriptions[\s\S]*authenticated/);
console.log("RLS SQL contract tests passed");
