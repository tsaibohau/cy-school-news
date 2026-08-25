const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "supabase");
const worker = fs.readFileSync(path.join(root, "functions", "reminder-worker", "index.ts"), "utf8");
const config = fs.readFileSync(path.join(root, "config.toml"), "utf8");
const imports = JSON.parse(fs.readFileSync(path.join(root, "functions", "reminder-worker", "deno.json"), "utf8"));

assert.match(config, /\[functions\.reminder-worker\]/);
assert.match(worker, /REMINDER_WORKER_TOKEN/);
assert.match(worker, /SUPABASE_SECRET_KEYS/);
assert.match(worker, /VAPID_PRIVATE_KEY/);
assert.doesNotMatch(worker, /console\.(?:log|error)/);
assert.match(worker, /status === 404 \|\| status === 410/);
assert.match(worker, /status === 408 \|\| status === 429/);
assert.match(worker, /claim_reminder_deliveries/);
assert.match(worker, /finish_reminder_delivery/);
assert.match(worker, /delivery\.target_title/);
assert.match(worker, /url: delivery\.source_url \|\| "\.\/"/);
assert.match(worker, /tag: `reminder:\$\{delivery\.delivery_id\}`/);
assert.match(worker, /timeout: 15000/);
for (const specifier of Object.values(imports.imports)) {
  assert.doesNotMatch(specifier, /[\^~*]|@latest$/);
}
console.log("Reminder worker security and payload contract tests passed");
