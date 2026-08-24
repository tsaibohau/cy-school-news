"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(repo, "supabase", "tests", "database", "user_tasks_rls.test.sql"), "utf8");
const migration = fs.readFileSync(path.join(repo, "supabase", "migrations", "0021_user_tasks.sql"), "utf8");

assert.match(sql, /set local role authenticated/);
assert.match(sql, /request\.jwt\.claim\.sub/);
assert.match(sql, /select plan\(25\)/);
assert.match(sql, /USER_A cannot insert with USER_B owner/);
assert.match(sql, /USER_B cannot reassign ownership/);
assert.match(sql, /anonymous cannot read private tasks/);
assert.match(migration, /create policy "tasks own rows"/);
assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
assert.match(migration, /with check/);
console.log("RLS SQL contract tests passed");
