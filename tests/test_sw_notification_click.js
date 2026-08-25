"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "docs", "sw.js"), "utf8");

function harness(windows) {
  const handlers = {};
  const opened = [];
  const context = {
    URL,
    self: {
      registration: { scope: "https://staging.example/app/", showNotification() {} },
      clients: {
        matchAll() { return Promise.resolve(windows); },
        openWindow(url) { opened.push(url); return Promise.resolve({ url }); },
      },
      addEventListener(type, handler) { handlers[type] = handler; },
      skipWaiting() {},
    },
  };
  vm.runInNewContext(source, context);
  return { handlers, opened };
}

async function click(run, url) {
  let pending;
  let closed = false;
  run.handlers.notificationclick({
    notification: { data: { url }, close() { closed = true; } },
    waitUntil(value) { pending = value; },
  });
  await pending;
  assert.equal(closed, true);
}

(async function () {
  const calls = [];
  const existing = {
    navigate(url) { calls.push(["navigate", url]); return Promise.resolve(existing); },
    focus() { calls.push(["focus"]); return Promise.resolve(existing); },
  };
  const active = harness([existing]);
  await click(active, "https://staging.example/app/?tab=today#reminder");
  assert.deepEqual(calls, [["navigate", "https://staging.example/app/?tab=today#reminder"], ["focus"]],
    "existing client navigates to the payload target before focus");
  assert.deepEqual(active.opened, []);

  const external = harness([]);
  await click(external, "https://evil.example/phish");
  assert.deepEqual(external.opened, ["https://staging.example/app/"], "external targets fall back to this PWA scope");

  const token = harness([]);
  await click(token, "https://staging.example/app/?access_token=secret");
  assert.deepEqual(token.opened, ["https://staging.example/app/"], "token-bearing targets are discarded");

  console.log("Service Worker notification click navigation tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
