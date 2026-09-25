"use strict";
const assert = require("node:assert/strict");
const Store = require("../docs/calendar-state.js");

const createMutation = {
  id: "10000000-0000-4000-8000-000000000001",
  mutation_id: "20000000-0000-4000-8000-000000000001",
  title: "Original", event_date: "2026-08-22", notes: "one", expected_version: 0,
};
const created = Store.applyMutation([], "calendar.create", createMutation, "2026-08-20T00:00:00Z");
assert.equal(created.length, 1);
assert.equal(created[0].version, 1);
assert.equal(created[0].last_mutation_id, createMutation.mutation_id);

const edited = Store.applyMutation(created, "calendar.update", {
  id: createMutation.id, mutation_id: "20000000-0000-4000-8000-000000000002",
  title: "Edited", event_date: "2026-08-23", notes: "two", expected_version: 1,
}, "2026-08-21T00:00:00Z");
assert.equal(edited[0].title, "Edited");
assert.equal(edited[0].version, 2);

const deleted = Store.applyMutation(edited, "calendar.delete", {
  id: createMutation.id, mutation_id: "20000000-0000-4000-8000-000000000003", expected_version: 2,
}, "2026-08-22T00:00:00Z");
assert.equal(Store.visible(deleted).length, 0);
assert.equal(deleted[0].version, 3);

const staleLive = Object.assign({}, edited[0], { version: 2, deleted_at: null });
assert.equal(Store.merge([staleLive], deleted)[0].deleted_at, "2026-08-22T00:00:00Z", "newer tombstone wins");
assert.equal(Store.merge(deleted, [Object.assign({}, deleted[0], { deleted_at: null })])[0].deleted_at, "2026-08-22T00:00:00Z", "tombstone wins equal version");
assert.equal(Store.normalize([{ title: "Legacy", date: "2026-08-24" }])[0].id, "user:legacy:0:2026-08-24:Legacy");
assert.match(Store.stableUuid("same"), /^[0-9a-f-]{36}$/);
assert.equal(Store.stableUuid("same"), Store.stableUuid("same"));
console.log("Calendar durable state tests passed");
