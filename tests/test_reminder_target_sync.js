const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "supabase");
const source = fs.readFileSync(path.join(root, "functions", "reminder-target-sync", "index.ts"), "utf8");
const config = fs.readFileSync(path.join(root, "config.toml"), "utf8");
const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "scrape-hourly.yml"), "utf8");

assert.match(config, /\[functions\.reminder-target-sync\]/);
assert.equal((config.match(/\[functions\.reminder-target-sync\]/g) || []).length, 1,
  "Supabase config must define reminder-target-sync exactly once");
assert.match(source, /REMINDER_TARGET_SYNC_TOKEN/);
assert.match(source, /SUPABASE_SECRET_KEYS/);
assert.match(source, /owner_user_id", null/);
assert.match(source, /new Date\(row\.target_at\) > new Date\(\)/);
assert.match(source, /\.neq\("source_revision", target\.source_revision\)/);
assert.doesNotMatch(source, /console\.(?:log|error)/);
assert.match(workflow, /REMINDER_TARGET_SYNC_NOT_CONFIGURED/);
assert.match(workflow, /--data-binary @docs\/data\/reminder-targets\.json/);
assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE/);
assert.doesNotMatch(workflow, /if:\s*\$\{\{\s*secrets\./);
console.log("Reminder target server-sync security contract tests passed");
