"use strict";
const assert = require("node:assert/strict");
const Auth = require("../docs/account-auth.js");

const calls = [];
const client = {
  rpc(name, args) {
    calls.push({ name, args });
    if (name === "current_account_capabilities") return Promise.resolve({ data: [{ capability: "timetable", enabled: true }], error: null });
    if (name === "admin_account_capabilities") return Promise.resolve({ data: [], error: null });
    return Promise.resolve({ data: null, error: null });
  },
};
const controller = Auth.createController({ client, config: { supabaseUrl: "x", supabaseAnonKey: "y" } });
const map = { member_content: false, assistant: true, timetable: true, calendar: false, notifications: true };

(async function () {
  assert.equal((await controller.getCurrentAccountCapabilities())[0].capability, "timetable");
  await controller.getAdminAccountCapabilities(["user-a", "user-b"]);
  await controller.setAccountCapabilities("user-a", map);
  await controller.updateAccountAccessWithCapabilities("user-a", "approved", map);
  assert.deepEqual(calls.map(call => call.name), [
    "current_account_capabilities", "admin_account_capabilities",
    "admin_set_account_capabilities", "admin_update_account_capabilities_v2",
  ]);
  assert.deepEqual(calls[3].args, { target_user_id: "user-a", next_status: "approved", next_capabilities: map });
  console.log("Capability RPC client contract tests passed");
})().catch(function (error) { console.error(error); process.exitCode = 1; });
