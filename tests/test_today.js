const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Today = require("../docs/today.js");
const Tasks = require("../docs/task-state.js");

assert.equal(Today.dueLabel("2026-09-05", "2026-09-05"), "今天截止");
assert.equal(Today.dueLabel("2026-09-05", "2026-09-06"), "明天截止");
assert.equal(Today.dueLabel("2026-09-05", "2026-09-04"), "已逾期");
const result = Today.build({
  today: "2026-09-05",
  officialEvents: [{ id: "exam", title: "段考", start_date: "2026-09-05", end_date: "2026-09-06", provenance: "official_school_calendar" }],
  announcementItems: [{ id: "a", title: "競賽", school: "cysh", calendar_events: [{ kind: "deadline", date: "2026-09-07", provenance: "announcement_deadline" }] }],
  tasks: [Tasks.normalize({ id: "t", title: "繳資料", due_date: "2026-09-08", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" })],
  relevance: () => ({ reasons: [{ rule: "school_match" }] }),
  reminderRules: [
    { id: "r1", title: "繳資料提醒", target_kind: "task_due", target_id: "t", target_date: "2026-09-08", offsets_days: [7, 3, 1, 0], schedule_baseline_at: "2026-09-05T08:00:00+08:00", enabled: true },
    { id: "bad", title: "公告發布", target_kind: "publication_date", target_id: "a", target_date: "2026-09-06", offsets_days: [0], enabled: true },
  ],
  days: 7,
});
assert.equal(result.todayEvents.length, 1, "range event appears on the first date");
assert.equal(result.upcoming.length, 0, "the event range is active today, not upcoming");
assert.equal(result.deadlines.length, 2, "verified deadline and task are both projected");
assert.equal(result.relevantAnnouncements.length, 1);
assert.deepEqual(result.upcomingReminders.map(row => row.date), ["2026-09-05", "2026-09-07", "2026-09-08"], "Today projects only reminders after the rule baseline");
assert.ok(result.upcomingReminders.every(row => row.target_kind !== "publication_date"), "publication date never becomes a reminder");
assert.equal(Today.rangeDates("2026-09-05", "2026-09-06").length, 2);
const app = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");
assert.match(app, /reminderRules:\s*state\.reminderRules/, "Today receives the account's reminder rules");
assert.match(app, /notificationEnabled:\s*typeof Notification !== "undefined" && Notification\.permission === "granted"/,
  "subscription notification status reflects this browser's actual permission");
console.log("Today projection tests passed");
