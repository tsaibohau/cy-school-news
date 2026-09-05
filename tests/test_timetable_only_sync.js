"use strict";
const assert = require("node:assert/strict");
const Sync = require("../docs/supabase-sync.js");

(async function () {
  const reads = [];
  const writes = [];
  const client = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "limited-user" } } }, error: null }) },
    from(table) {
      return {
        select() { reads.push(table); return this; },
        eq() { return Promise.resolve({ data: table === "user_preferences" ? [{ user_id: "limited-user", preferences: { profile: { school_id: "cysh", class_name: "109" } } }] : [], error: null }); },
        upsert(rows) { writes.push({ table, rows }); return Promise.resolve({ data: rows, error: null }); },
        delete() { return this; },
      };
    },
  };
  const adapter = Sync.createAdapter(client, { serviceLevel: "timetable_only" });
  const remote = await adapter.fetchRemoteState();
  assert.deepEqual(reads, ["user_preferences"], "limited accounts only read the profile needed for their timetable");
  assert.deepEqual(remote.subscriptions, []);
  assert.deepEqual(remote.reads, []);
  assert.deepEqual(remote.tasks, []);
  await adapter.pushState({ subscriptions: [{ keyword: "x" }], reads: [{ announcement_id: "a" }], preferences: { preferences: { profile: { class_name: "109" } } }, tasks: [{ title: "hidden" }] });
  assert.deepEqual(writes.map((entry) => entry.table), ["user_preferences"], "limited accounts only write timetable profile settings");
  await assert.rejects(adapter.sendMutation({ account_id: "limited-user", type: "task.upsert", payload: { title: "blocked" } }), /feature unavailable/);
  console.log("Timetable-only behavioral sync tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
