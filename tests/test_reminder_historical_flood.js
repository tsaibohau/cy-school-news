const assert = require("node:assert/strict");
const Rules = require("../docs/reminder-rules.js");
const Today = require("../docs/today.js");

const enabledLate = Rules.createRule(
  { kind: "announcement_deadline", id: "future", date: "2026-09-10" },
  [30, 7, 3, 1, 0],
  "2026-09-08T12:00:00+08:00",
);
assert.deepEqual(Rules.scheduleDates(enabledLate, "2026-09-08").map(row => row.offset_days), [1, 0],
  "enabling reminders never replays offsets that elapsed before the baseline");

const historical = Rules.createRule(
  { kind: "announcement_event", id: "past", date: "2026-01-10" }, [7, 1, 0], "2026-09-08T00:00:00+08:00",
);
assert.deepEqual(Rules.scheduleDates(historical, "2026-09-08"), [], "past targets never materialize jobs");

const projection = Today.build({
  today: "2026-09-08",
  reminderRules: [
    Object.assign({ id: "future", title: "未來截止", enabled: true }, enabledLate),
    Object.assign({ id: "past", title: "歷史活動", enabled: true }, historical),
    { id: "publication", title: "發布日", enabled: true, target_kind: "publication_date", target_date: "2026-09-09", offsets_days: [0] },
    { id: "deleted", title: "已刪除", enabled: true, deleted_at: "2026-09-08T00:00:00Z", target_kind: "manual", target_date: "2026-09-09", offsets_days: [0] },
  ],
});
assert.deepEqual(projection.upcomingReminders.map(row => row.title), ["未來截止", "未來截止"]);

const changedContext = Today.build({
  today: "2026-09-08",
  profile: { school_id: "cygsh" },
  announcementItems: [{ id: "old", publication_date: "2020-01-01" }],
  reminderRules: [Object.assign({ id: "future", title: "未來截止", enabled: true }, enabledLate)],
});
assert.deepEqual(changedContext.upcomingReminders, projection.upcomingReminders,
  "profile and keyword context cannot replay reminder jobs");

console.log("Reminder historical flood protection tests passed");
