"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Capabilities = require("../docs/capability-layer.js");
const Sync = require("../docs/supabase-sync.js");

const custom = { member_content: true, assistant: false, timetable: true, calendar: false, notifications: true };
assert.deepEqual(Capabilities.normalize(custom), custom);
assert.deepEqual(Capabilities.effective({ status: "pending" }, custom), Capabilities.empty(), "status is the outer gate");
assert.deepEqual(Capabilities.effective({ status: "approved", is_admin: true, admin_role: "owner" }, custom), Capabilities.full());
assert.deepEqual(Capabilities.effective({ status: "approved", is_admin: true, admin_role: "co_admin" }, custom), Capabilities.full());
assert.deepEqual(Capabilities.effective({ status: "approved", is_admin: false }, custom), custom);
assert.equal(Capabilities.allowsTab(custom, "assistant"), false);
assert.equal(Capabilities.allowsTab(custom, "timetable"), true);
assert.equal(Capabilities.allowsTab(custom, "calendar"), false);
assert.equal(Capabilities.allowsTab(custom, "latest"), true);
assert.match(Capabilities.summary(custom), /會員摘要/);

const noAccessClient = {
  auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "cap-user" } } }, error: null }) },
  from() { throw new Error("no capability must not reach a table"); },
};
Sync.createAdapter(noAccessClient).fetchRemoteState().then(function (remote) {
  assert.deepEqual(remote, { user_id: "cap-user", subscriptions: [], reads: [], preferences: null, tasks: [] });
}).catch(function (error) { console.error(error); process.exitCode = 1; });

const app = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");
const layer = fs.readFileSync(path.join(__dirname, "..", "docs", "capability-layer.js"), "utf8");
assert.doesNotMatch(app, /service_level|serviceLevel|isTimetableOnly|hasFullService|applyServiceAccess/);
assert.doesNotMatch(layer, /MutationObserver|defineProperty|__CYNEWS_SET_CAPABILITIES/);
assert.match(app, /getCurrentAccountCapabilities/);
assert.match(app, /getAdminAccountCapabilities/);
assert.match(app, /updateAccountAccessWithCapabilities/);
console.log("Capability matrix and frontend cutover contract tests passed");
