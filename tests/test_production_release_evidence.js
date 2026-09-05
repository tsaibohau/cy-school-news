"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const root = path.join(__dirname, "..");
const status = JSON.parse(fs.readFileSync(path.join(root, "docs/legal-compliance.json"), "utf8"));
const evidence = fs.readFileSync(path.join(root, "docs/production-release-evidence.md"), "utf8");
const rlsGuide = fs.readFileSync(path.join(root, "docs/rls-acceptance-v2.md"), "utf8");
const gate = path.join(root, "tools/check-legal-compliance.js");

function run(args) {
  return cp.spawnSync(process.execPath, [gate, ...args], { cwd: root, encoding: "utf8" });
}

assert.equal(status.schema_version, 2);
assert.deepEqual(Object.keys(status.release_profiles), ["public_core", "student_core", "account_personalization", "password_auth", "reminders"]);
assert.equal(status.requirements.retention_policy_enforced.state, "block");
assert.match(status.requirements.retention_policy_enforced.message, /site policy limits, not universal statutory periods/);
assert.equal(status.requirements.source_rights_scope_review.state, "review");
assert.equal(status.requirements.qualified_taiwan_legal_review.category, "risk_policy");

const preview = run([]);
assert.equal(preview.status, 0, preview.stderr);
assert.match(preview.stdout, /Compliance schema and preview controls passed/);

const allProduction = run(["--production"]);
assert.equal(allProduction.status, 2);
assert.match(allProduction.stderr, /PRODUCTION_BLOCKED/);

const publicCore = run(["--production", "--profile=public_core"]);
assert.equal(publicCore.status, 3);
assert.match(publicCore.stderr, /PRODUCTION_REVIEW_REQUIRED/);
assert.doesNotMatch(publicCore.stderr, /deployed_http_rls|leaked_password|reminder_schema/,
  "public-only releases must not inherit unrelated account, password or reminder blockers");

const acknowledgedPublicCore = run(["--production", "--profile=public_core", "--acknowledge-review"]);
assert.equal(acknowledgedPublicCore.status, 0, acknowledgedPublicCore.stderr);
assert.match(acknowledgedPublicCore.stdout, /Scoped production technical gate passed/);
assert.match(acknowledgedPublicCore.stderr, /not a legal opinion/);

const studentCore = run(["--production", "--profile=student_core"]);
assert.equal(studentCore.status, 3);
assert.match(studentCore.stderr, /PRODUCTION_REVIEW_REQUIRED/);
assert.doesNotMatch(studentCore.stderr, /deployed_http_rls|leaked_password|reminder_schema/);

const accounts = run(["--production", "--profile=account_personalization", "--acknowledge-review"]);
assert.equal(accounts.status, 2, "manual acknowledgement must never bypass technical blockers");
assert.match(accounts.stderr, /deployed_http_rls/);

assert.match(evidence, /tests\/test_rls_deployed\.js/);
assert.match(evidence, /30 天 tombstone／365 天閱讀紀錄/);
assert.match(evidence, /不把 Google OAuth 切換帳號測試當成 RLS 證據/);
assert.match(evidence, /不會自動從網站移除其他功能/,
  "scoped evaluation must not be mistaken for artifact feature isolation");
assert.match(rlsGuide, /Google is tested only.*not a recurring RLS gate/s);
console.log("Scoped production release evidence contract tests passed");
