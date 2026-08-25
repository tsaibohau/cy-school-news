const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "scheduler", "activate_reminder_cron.sql"), "utf8");
assert.match(sql, /STAGING OWNER-RUN ACTIVATION, not a migration/);
assert.match(sql, /cron\.schedule\(/);
assert.match(sql, /'\* \* \* \* \*'/);
assert.match(sql, /net\.http_post\(/);
assert.match(sql, /vault\.decrypted_secrets/);
assert.match(sql, /Authorization', 'Bearer '/);
assert.match(sql, /x-reminder-worker-token/);
assert.match(sql, /timeout_milliseconds := 20000/);
assert.match(sql, /cron\.unschedule\(jobid\)/);
assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]+\./, "no JWT may be committed");
assert.doesNotMatch(sql, /VAPID_PRIVATE_KEY\s*=/, "no VAPID private key may be committed");
console.log("Reminder scheduler activation contract tests passed");
