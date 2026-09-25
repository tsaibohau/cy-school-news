"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const addEvent = { hidden: true };
const tabCalendar = { hidden: true };
const nodes = { addEvent, tabCalendar };
const document = {
  readyState: "loading",
  addEventListener() {},
  getElementById(id) { return nodes[id] || null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
let access = { status: "approved", admin_role: "none" };
let memberCalendar = true;
const client = { rpc(name) {
  if (name === "current_public_capabilities") return Promise.resolve({ data: [{ capability: "calendar", enabled: true }] });
  if (name === "current_account_capabilities") return Promise.resolve({ data: [{ capability: "calendar", enabled: memberCalendar }] });
  throw new Error("Unexpected RPC: " + name);
} };
const root = { document, setTimeout: (fn) => fn() };
root.window = root;
root.CyNewsAccountAuth = { createController() { return {
  getClient: () => Promise.resolve(client),
  getAccountAccess: () => Promise.resolve(access),
}; } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "docs", "capability-layer.js"), "utf8"), root);

(async () => {
  const controller = root.CyNewsAccountAuth.createController();
  await controller.getPublicCapabilities();
  assert.equal(tabCalendar.hidden, false, "public calendar remains readable");
  assert.equal(addEvent.hidden, true, "visitor cannot see event creation even with PUBLIC calendar enabled");

  root.CyNewsCapabilities.setAuthenticated(true);
  await controller.getAccountAccess();
  assert.equal(addEvent.hidden, false, "approved member with calendar access can add events");

  memberCalendar = false;
  await controller.getAccountAccess();
  assert.equal(addEvent.hidden, true, "revoking calendar capability removes event creation");

  memberCalendar = true;
  access = { status: "pending", admin_role: "none" };
  await controller.getAccountAccess();
  assert.equal(addEvent.hidden, true, "unapproved account cannot create events");

  root.CyNewsCapabilities.setAuthenticated(false);
  assert.equal(tabCalendar.hidden, false, "signing out retains public calendar reading");
  assert.equal(addEvent.hidden, true, "signing out hides event creation");
  console.log("PUBLIC calendar read-only / member event controls passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
