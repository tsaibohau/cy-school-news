"use strict";

const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "cy-school-news-student-core-"));

try {
  cp.execFileSync(process.execPath, [path.join(root, "tools", "build-public-core.js")], {
    cwd: root,
    env: { ...process.env, CYNEWS_STUDENT_CORE_OUTPUT: output },
    stdio: "pipe",
  });

  const index = fs.readFileSync(path.join(output, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(output, "student-core-app.js"), "utf8");
  const profile = JSON.parse(fs.readFileSync(path.join(output, "release-profile.json"), "utf8"));
  const data = JSON.parse(fs.readFileSync(path.join(output, "data", "public-announcements.json"), "utf8"));
  const rootFiles = new Set(fs.readdirSync(output));

  const timetable = JSON.parse(fs.readFileSync(path.join(output, "data", "public-timetables.json"), "utf8"));
  const calendar = JSON.parse(fs.readFileSync(path.join(output, "data", "public-calendar.json"), "utf8"));

  assert.equal(profile.profile, "student_core");
  assert.equal(profile.candidate, true);
  assert.deepEqual(profile.disabled_features, ["accounts", "personalization", "password_auth", "reminders", "local_full_text", "attachments"]);
  assert(rootFiles.has("student-core-app.js"));
  assert(!rootFiles.has("app.js"));
  assert(!rootFiles.has("account-auth.js"));
  assert(!rootFiles.has("account-config.js"));
  assert(!rootFiles.has("supabase-sync.js"));
  assert(!rootFiles.has("push-subscription.js"));
  assert(!rootFiles.has("reminder-rules.js"));
  assert(!rootFiles.has("task-state.js"));
  assert(!rootFiles.has("assistant-qa.js"));
  assert(!fs.existsSync(path.join(output, "data", "details")));
  assert(!fs.existsSync(path.join(output, "data", "reminder-targets.json")));
  assert(!fs.existsSync(path.join(output, "data", "class-timetables.json")));

  assert.doesNotMatch(index, /id="(?:account|password|profile|reminder|task)|src="(?:account|supabase|push-subscription|reminder|task)/i);
  assert.doesNotMatch(app, /localStorage|sessionStorage|new\s+Notification|navigator\.serviceWorker|supabase\.co|CyNewsAccount|signIn|signUp/i);
  assert.match(index, /公告、課表、問校務與行事曆可以直接使用/);
  assert.match(index, /id="timetableClass"/);
  assert.match(index, /今天課表/);

  assert.equal(data.release_profile, "student_core");
  assert(data.items.length > 100, "candidate should include a useful announcement index");
  const keys = ["id", "school", "school_name", "title", "url", "date", "source_category", "category", "summary"];
  const allowedHosts = new Set(["www.cysh.cy.edu.tw", "www.cygsh.cy.edu.tw", "rpage.fjsh.cy.edu.tw"]);
  for (const item of data.items) {
    assert.deepEqual(Object.keys(item), keys);
    assert(allowedHosts.has(new URL(item.url).hostname));
    assert.equal(new URL(item.url).protocol, "https:");
    assert(item.summary.length <= 220);
    assert.equal("snippet" in item, false);
    assert.equal("detail_ref" in item, false);
    assert.equal("calendar_events" in item, false);
  }

  assert.equal(timetable.schema_version, 1);
  assert(timetable.timetables.some((row) => row.school_id === "cysh" && row.classes.some((classRow) => classRow.class_name === "109")));
  assert(timetable.timetables.every((row) => allowedHosts.has(new URL(row.source_url).hostname)));
  assert(calendar.events.length > 0);
  assert(calendar.events.every((row) => allowedHosts.has(new URL(row.source_url).hostname)));
  assert(calendar.events.every((row) => Object.keys(row).join(",") === "id,school_id,title,start_date,end_date,source_url"));

  const legalGate = cp.spawnSync(process.execPath, [path.join(root, "tools", "check-legal-compliance.js"), "--production", "--profile=student_core"], { cwd: root, encoding: "utf8" });
  assert.equal(legalGate.status, 3, "candidate must remain review-required until rights review is recorded");
  assert.match(legalGate.stderr, /PRODUCTION_REVIEW_REQUIRED/);
  assert.doesNotMatch(legalGate.stderr, /PRODUCTION_BLOCKED/);
  console.log("Student-core feature and isolation contract tests passed");
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
