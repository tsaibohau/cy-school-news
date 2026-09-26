"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repo = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(repo, "docs", "index.html"), "utf8");
const calendarTag = 'src="calendar-state.js?v=44"';
const accountTag = 'src="account-sync.js?v=56"';
const appTag = 'src="app.js?v=94"';

assert(index.indexOf(calendarTag) >= 0, "calendar-state.js must be loaded");
assert(index.indexOf(calendarTag) < index.indexOf(accountTag), "calendar-state.js must load before account-sync.js");
assert(index.indexOf(accountTag) < index.indexOf(appTag), "account-sync.js must load before app.js");

function storage() {
  return {
    data: {},
    getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null; },
    setItem(key, value) { this.data[key] = value; },
    removeItem(key) { delete this.data[key]; },
  };
}

const browser = { console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set };
browser.window = browser;
browser.globalThis = browser;
const context = vm.createContext(browser);

// Deliberately omit module, exports and require: this is the browser path.
vm.runInContext(fs.readFileSync(path.join(repo, "docs", "calendar-state.js"), "utf8"), context, { filename: "calendar-state.js" });
vm.runInContext(fs.readFileSync(path.join(repo, "docs", "account-sync.js"), "utf8"), context, { filename: "account-sync.js" });

assert(browser.CyNewsCalendarState, "Calendar State is published globally before Account Sync initializes");
assert(browser.CyNewsAccountSync, "Account Sync initializes without a Node require fallback");

const store = storage();
const lifecycle = new browser.CyNewsAccountSync.AccountLifecycle(null, store);
const id = "51000000-0000-4000-8000-000000000001";

let state = lifecycle.applyMutation("calendar.create", {
  id, mutation_id: "52000000-0000-4000-8000-000000000001", expected_version: 0,
  title: "Anonymous event", event_date: "2026-09-16", notes: "local",
});
assert.equal(state.calendar_events.length, 1, "anonymous calendar.create succeeds in the browser path");
assert(store.getItem("cyNews.calendarEvents.v2:anonymous"), "anonymous event is persisted locally");

state = lifecycle.applyMutation("calendar.update", {
  id, mutation_id: "52000000-0000-4000-8000-000000000002", expected_version: 1,
  title: "Edited event", event_date: "2026-09-17", notes: "edited",
});
assert.equal(state.calendar_events[0].title, "Edited event", "calendar.update succeeds");

state = lifecycle.applyMutation("calendar.delete", {
  id, mutation_id: "52000000-0000-4000-8000-000000000003", expected_version: 2,
});
assert(state.calendar_events[0].deleted_at, "calendar.delete creates a tombstone");

lifecycle.login("browser-user", { calendar_events: [] });
const accountId = "51000000-0000-4000-8000-000000000002";
lifecycle.applyMutation("calendar.create", {
  id: accountId, mutation_id: "52000000-0000-4000-8000-000000000004", expected_version: 0,
  title: "Account event", event_date: "2026-09-18", notes: "queued",
});
const outbox = new browser.CyNewsAccountSync.Outbox(store, "browser-user");
outbox.enqueue({
  type: "calendar.create", payload: {
    id: accountId, mutation_id: "52000000-0000-4000-8000-000000000004", expected_version: 0,
    title: "Account event", event_date: "2026-09-18", notes: "queued",
  },
});
assert.equal(outbox.pending().length, 1, "logged-in calendar mutation can enter the account-scoped queue");

console.log("Calendar browser load-order contract passed");
