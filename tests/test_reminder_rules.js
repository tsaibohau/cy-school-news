const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "..", "docs", "reminder-rules.js"), "utf8");
const context = { console, globalThis: {} };
vm.runInNewContext(source, context);
const api = context.globalThis.CyNewsReminderRules;
assert.deepEqual(Array.from(api.PRESETS.standard), [3, 1, 0]);
assert.equal(api.normalizeTarget({ kind: "manual", id: "m1", date: "2026-09-05" }).date, "2026-09-05");
assert.equal(api.normalizeTarget({ kind: "publication_date", id: "x", date: "2026-09-05" }), null);
assert.equal(api.createRule({ kind: "task_due", id: "t1", date: "2026-09-05" }, [1, 1, -1, 500], "2026-08-24T00:00:00Z").offsets_days.join(","), "1");
assert.equal(api.createRule({ kind: "announcement_deadline", id: "a1", date: "2026-09-05" }, [], null), null);
console.log("Reminder target, provenance and baseline tests passed");

