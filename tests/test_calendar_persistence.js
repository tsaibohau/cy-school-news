"use strict";
const assert = require("node:assert/strict");
const CalendarState = require("../docs/calendar-state.js");

const store = new Map();
const key = "cyNews.calendarEvents.v1";
const read = () => CalendarState.normalize(JSON.parse(store.get(key) || "[]"));
const write = rows => store.set(key, JSON.stringify(CalendarState.normalize(rows)));

const stableId = "user:browser-regression";
write(CalendarState.upsert([], { id: stableId, title: "Original", date: "2026-08-22", notes: "note" }));
assert.deepEqual(read(), [{ id: stableId, title: "Original", date: "2026-08-22", notes: "note" }]);

write(CalendarState.upsert(read(), { id: stableId, title: "Edited", date: "2026-08-24", notes: "updated" }));
assert.deepEqual(read(), [{ id: stableId, title: "Edited", date: "2026-08-24", notes: "updated" }]);
assert.equal(read()[0].id, stableId);

write(CalendarState.remove(read(), stableId));
assert.deepEqual(read(), []);
assert.deepEqual(CalendarState.normalize(JSON.parse(store.get(key))), []);
console.log("Calendar persistence lifecycle tests passed");
