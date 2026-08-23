const assert = require("node:assert/strict");
const Tasks = require("../docs/task-state.js");

const base = { id: "task-a", title: "繳資料", due_date: "2026-09-05", priority: 3, notes: "紙本", created_at: "2026-08-20T00:00:00Z", updated_at: "2026-08-20T00:00:00Z" };
assert.equal(Tasks.normalize(base).status, "open");
assert.match(Tasks.idFor("announcement:a1"), /^[0-9a-f-]{36}$/);
assert.equal(Tasks.verifiedDeadline({ id: "x", date: "2026-08-01", calendar_events: [{ kind: "deadline", date: "2026-09-03", provenance: "announcement_deadline" }] }), "2026-09-03");
assert.equal(Tasks.verifiedDeadline({ id: "x", date: "2026-09-03", calendar_events: [{ kind: "deadline", date: "2026-09-03" }] }), null, "unprovenanced deadline is not trusted");
assert.equal(Tasks.fromAnnouncement({ id: "a1", title: "報名", date: "2026-08-20" }).due_date, null, "publication date is never a task deadline");
assert.equal(Tasks.fromAnnouncement({ id: "a2", title: "報名", date: "2026-08-20", calendar_events: [{ kind: "deadline", date: "2026-09-04", provenance: "verified_announcement_deadline" }] }).due_date, "2026-09-04");

let rows = Tasks.applyMutation([], "task.create", base, "2026-08-20T00:00:00Z");
rows = Tasks.applyMutation(rows, "task.complete", { id: "task-a" }, "2026-08-21T00:00:00Z");
assert.equal(Tasks.visible(rows)[0].status, "completed");
rows = Tasks.applyMutation(rows, "task.reopen", { id: "task-a" }, "2026-08-22T00:00:00Z");
assert.equal(Tasks.sortOpen(rows)[0].id, "task-a");
rows = Tasks.applyMutation(rows, "task.delete", { id: "task-a" }, "2026-08-23T00:00:00Z");
assert.equal(Tasks.visible(rows).length, 0);
assert.equal(Tasks.merge(rows, [{ ...base, updated_at: "2026-08-19T00:00:00Z" }])[0].deleted_at, "2026-08-23T00:00:00Z", "newer tombstone wins retry");

const duplicate = Tasks.merge([{ ...base, title: "old", updated_at: "2026-08-20T00:00:00Z" }], [{ ...base, title: "new", updated_at: "2026-08-21T00:00:00Z" }]);
assert.equal(duplicate.length, 1);
assert.equal(duplicate[0].title, "new");
console.log("Task state tests passed");
