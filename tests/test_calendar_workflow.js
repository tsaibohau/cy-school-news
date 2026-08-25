"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "calendar-daily.yml"), "utf8");

assert.match(workflow, /cron: '1 23 \* \* \*'/, "daily frequency must remain unchanged");
assert.match(workflow, /permissions:\s*\n\s*contents: write/);
assert.match(workflow, /group: calendar-daily/);
assert.match(workflow, /cancel-in-progress: false/);

const discover = workflow.indexOf("python scraper/schoolcal.py discover");
const build = workflow.indexOf("python scraper/schoolcal.py build");
const targets = workflow.indexOf("python scraper/reminder_targets.py");
const notify = workflow.indexOf("python scraper/schoolcal.py notify");
const commit = workflow.indexOf("git commit -m");
assert(discover >= 0 && discover < build && build < targets && targets < notify && notify < commit,
  "calendar data must be validated and projected before notification/commit");

for (const file of [
  "docs/data/calendar-source-status.json",
  "docs/data/official-calendar-events.json",
  "docs/data/calendar-events.json",
  "docs/data/reminder-targets.json",
  "docs/calendar.ics",
]) assert(workflow.includes(file), "calendar workflow must persist " + file);

assert.doesNotMatch(workflow, /scraper\/scrape\.py|docs\/data\/announcements\.json|docs\/data\/archive\.json/,
  "calendar workflow must not scrape or commit announcement data");
assert.doesNotMatch(workflow, /service_role|SUPABASE_SERVICE_ROLE|VAPID_PRIVATE/,
  "calendar workflow must not expose unrelated server secrets");
console.log("Calendar daily cloud persistence contract passed");
