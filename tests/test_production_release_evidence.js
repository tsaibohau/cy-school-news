"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const status = JSON.parse(fs.readFileSync(path.join(root, "docs/legal-compliance.json"), "utf8"));
const evidence = fs.readFileSync(path.join(root, "docs/production-release-evidence.md"), "utf8");
const rlsGuide = fs.readFileSync(path.join(root, "docs/rls-acceptance-v2.md"), "utf8");

assert.equal(status.production_ready, false, "release evidence cannot silently mark production ready");
assert.equal(status.technical_controls.deployed_http_two_session_rls_pass, false,
  "deployed HTTP RLS remains blocked until protected CI records a pass");
assert.match(status.production_blockers[0], /dedicated non-production Auth users/,
  "the blocker must describe the actual dedicated-Auth harness");
assert.match(evidence, /tests\/test_rls_deployed\.js/);
assert.match(evidence, /30 天 tombstone／365 天閱讀紀錄/);
assert.match(evidence, /不把 Google OAuth 切換帳號測試當成 RLS 證據/);
assert.match(rlsGuide, /Google is tested only.*not a recurring RLS gate/s);
console.log("Production release evidence contract tests passed");
