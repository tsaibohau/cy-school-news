"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const cron = fs.readFileSync(path.join(root, "supabase", "scheduler", "activate_reminder_cron.sql"), "utf8");
const worker = fs.readFileSync(path.join(root, "supabase", "functions", "reminder-worker", "index.ts"), "utf8");
const sw = fs.readFileSync(path.join(root, "docs", "sw.js"), "utf8");
const config = fs.readFileSync(path.join(root, "supabase", "config.toml"), "utf8");

assert.match(cron, /cron\.schedule\(/, "server scheduler must exist outside the App");
assert.match(cron, /net\.http_post\(/, "cron must invoke the protected server worker");
assert.match(worker, /claim_reminder_deliveries/, "worker must claim due deliveries from the database");
assert.match(worker, /webpush\.sendNotification/, "worker must call the Web Push service");
assert.match(worker, /finish_reminder_delivery/, "worker must durably finalize retry/dedupe state");
assert.match(sw, /addEventListener\("push"/, "Service Worker must receive push while no page is open");
assert.match(sw, /registration\.showNotification/, "Service Worker must display the notification");
assert.match(sw, /addEventListener\("notificationclick"/, "Service Worker must handle notification clicks");
assert.match(config, /\[functions\.reminder-worker\][\s\S]*verify_jwt = true/,
  "worker gateway must verify its protected caller JWT");
assert.doesNotMatch(cron + worker, /docs\/app\.js|window\.|document\.|localStorage|setInterval/,
  "server delivery must not depend on foreground App state or polling");
assert.doesNotMatch(fs.readFileSync(path.join(root, "docs", "account-config.js"), "utf8"), /VAPID_PRIVATE_KEY/,
  "VAPID private key must never enter frontend configuration");
console.log("Closed-App Web Push architecture contract tests passed");
