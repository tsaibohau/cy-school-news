"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const deployed = fs.readFileSync(path.join(__dirname, "test_rls_deployed.js"), "utf8");
const behavioral = fs.readFileSync(path.join(__dirname, "test_rls_behavioral.js"), "utf8");

for (const source of [deployed, behavioral]) {
  assert.match(source, /resolution=merge-duplicates,return=representation/,
    "on_conflict retry must request PostgREST merge-duplicate resolution");
  assert.doesNotMatch(source, /process\.env\.[A-Z0-9_]*SERVICE[A-Z0-9_]*/,
    "behavioral harness must never read a service credential");
}
for (const table of ["user_reminder_rules", "user_push_subscriptions", "reminder_jobs", "reminder_deliveries"]) {
  assert.match(deployed, new RegExp(table), `deployed matrix must cover ${table}`);
}
assert.match(deployed, /foreign endpoint cannot silently transfer accounts/);
assert.match(deployed, /authenticated browser cannot read \$\{name\}/);
assert.match(deployed, /anonymous cannot access \$\{name\}/);
assert.match(deployed, /resolved_target_title/);
assert.match(deployed, /disableReminderFixture/);
assert.doesNotMatch(deployed, /\.\.\.process\.env/,
  "child behavioral harness must receive only its four required values, not every protected secret");
assert.doesNotMatch(deployed, /console\.log\([^)]*(?:token|password|email|uid)/i,
  "deployed harness logs must not expose identity or credentials");
console.log("Deployed dedicated Auth reminder/RLS contract tests passed");
