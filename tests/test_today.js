const assert = require("node:assert/strict");
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
  days: 7,
});
assert.equal(result.todayEvents.length, 1, "range event appears on the first date");
assert.equal(result.upcoming.length, 0, "the event range is active today, not upcoming");
assert.equal(result.deadlines.length, 2, "verified deadline and task are both projected");
assert.equal(result.relevantAnnouncements.length, 1);
assert.equal(Today.rangeDates("2026-09-05", "2026-09-06").length, 2);
console.log("Today projection tests passed");
