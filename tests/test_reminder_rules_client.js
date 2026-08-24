const assert = require("node:assert/strict");
const Rules = require("../docs/reminder-rules.js");

assert.deepEqual(Rules.offsetsFor("single"), [1]);
assert.deepEqual(Rules.offsetsFor("standard"), [3, 1, 0]);
assert.deepEqual(Rules.offsetsFor("dense"), [7, 3, 1, 0]);
assert.deepEqual(Rules.offsetsFor("custom", "0, 5,2,5"), [5, 2, 0]);
assert.throws(() => Rules.offsetsFor("custom", "x,-1,999"), /1 to 8/);
assert.equal(Rules.nextReminderTime(null, [1]), null, "missing verified date has no reminder");
assert.equal(Rules.nextReminderTime("2026-09-10", [3, 1, 0], new Date("2026-09-06T00:00:00+08:00")).toISOString(), "2026-09-06T16:00:00.000Z");

async function run() {
  let captured;
  const client = { from(table) {
    assert.equal(table, "user_reminder_rules");
    return { upsert(row, options) { captured = { row, options }; return Promise.resolve({ error: null }); } };
  } };
  const auth = {
    getVerifiedSession() { return Promise.resolve({ user: { id: "verified-owner" }, access_token: "token" }); },
    getClient() { return Promise.resolve(client); },
  };
  const adapter = Rules.createAdapter({ auth });
  const task = { id: "123e4567-e89b-42d3-a456-426614174000", due_date: "2099-09-10" };
  await adapter.upsertTask(task, "standard");
  assert.equal(captured.row.user_id, "verified-owner");
  assert.equal(captured.row.target_kind, "task_due");
  assert.equal(captured.row.target_id, task.id);
  assert.equal(captured.row.reminder_target_id, null, "database must resolve trusted task target");
  assert.deepEqual(captured.row.offsets_days, [3, 1, 0]);
  assert.equal(captured.options.onConflict, "user_id,target_kind,target_id");
  await assert.rejects(adapter.upsertTask({ id: task.id, due_date: null }, "single"), /verified due date/);
  await adapter.upsertManual("announcement:a1:manual", "2099-10-01", "single");
  assert.equal(captured.row.user_id, "verified-owner");
  assert.equal(captured.row.target_kind, "manual");
  assert.equal(captured.row.target_id, "announcement:a1:manual");
  assert.equal(captured.row.reminder_target_id, null);
  assert.equal(captured.row.manual_target_at, "2099-09-30T16:00:00.000Z");
  assert.equal(captured.row.provenance, "manual");
  assert.deepEqual(captured.row.offsets_days, [1]);
  await assert.rejects(adapter.upsertManual("announcement:a1:manual", "2020-01-01", "single"), /future date/);
  await assert.rejects(adapter.upsertManual("", "2099-10-01", "single"), /future date/);
  console.log("Reminder rule preset, verified identity and task-target tests passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
