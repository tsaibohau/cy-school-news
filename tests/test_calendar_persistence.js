"use strict";
const assert = require("node:assert/strict");
const Calendar = require("../docs/calendar-state.js");
const Account = require("../docs/account-sync.js");

function storage() {
  return { data: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; },
    setItem(k, v) { this.data[k] = v; }, removeItem(k) { delete this.data[k]; } };
}

const store = storage();
const aEvent = Calendar.applyMutation([], "calendar.create", {
  id: "10000000-0000-4000-8000-000000000001", mutation_id: "20000000-0000-4000-8000-000000000001",
  title: "A", event_date: "2026-08-22", notes: "", expected_version: 0,
}, "2026-08-20T00:00:00Z");
Calendar.saveCache(store, "user-a", aEvent);
Calendar.saveCache(store, "user-b", []);
Calendar.saveCache(store, "anonymous", [{ id: "anonymous-event", title: "Anon", date: "2026-08-23", notes: "" }]);
assert.equal(Calendar.loadCache(store, "user-a").length, 1);
assert.equal(Calendar.loadCache(store, "user-b").length, 0);
assert.equal(Calendar.loadCache(store, "anonymous")[0].title, "Anon");
assert.notEqual(Calendar.cacheKey("user-a"), Calendar.cacheKey("user-b"));

const offline = new Account.Outbox(store, "user-a");
const queued = offline.enqueue({ id: "calendar-offline-1", type: "calendar.update", payload: {
  id: aEvent[0].id, expected_version: 1, mutation_id: "20000000-0000-4000-8000-000000000009",
  title: "A offline", event_date: "2026-08-24", notes: "queued",
} });
assert.equal(new Account.Outbox(store, "user-a").pending().length, 1, "offline queue survives reload");
assert.equal(new Account.Outbox(store, "user-b").pending().length, 0, "B cannot drain A offline queue");
new Account.Outbox(store, "user-a").ack([queued.id], "2026-08-25T00:00:00Z", "user-a");
assert.equal(new Account.Outbox(store, "user-a").pending().length, 0, "online confirmation clears only the acknowledged mutation");

store.setItem(Calendar.LEGACY_KEY, JSON.stringify([
  { id: "old-1", title: "Legacy one", date: "2026-09-01", notes: "one" },
  { id: "old-2", title: "Legacy two", date: "2026-09-02", notes: "two" },
]));
assert.equal(Calendar.readClaim(store), null, "legacy data is never automatically claimed");
const claim = Calendar.createLegacyClaim(store, "user-a");
assert.equal(claim.account_id, "user-a");
assert.equal(claim.entries.length, 2);
assert.throws(() => Calendar.createLegacyClaim(store, "user-b"), /another account/);
assert.equal(Calendar.claimForAccount(store, "user-b"), null, "B cannot inspect A claim");
assert.equal(Calendar.createLegacyClaim(store, "user-a").payload_hash, claim.payload_hash, "claim retry is idempotent");
assert.equal(new Set(claim.entries.map(x => x.legacy_import_key)).size, 2);

let confirmation = Calendar.confirmLegacy(store, "user-a", claim.entries[0].legacy_import_key);
assert.equal(confirmation.complete, false);
assert(store.getItem(Calendar.LEGACY_KEY), "partial failure retains the v1 payload");
assert(Calendar.readClaim(store), "partial failure retains ownership claim");
confirmation = Calendar.confirmLegacy(store, "user-a", claim.entries[0].legacy_import_key);
assert.equal(confirmation.complete, false, "confirmation retry is idempotent");
confirmation = Calendar.confirmLegacy(store, "user-a", claim.entries[1].legacy_import_key);
assert.equal(confirmation.complete, true);
assert.equal(store.getItem(Calendar.LEGACY_KEY), null, "all cloud confirmations clear v1 payload");
assert.equal(Calendar.readClaim(store), null, "all cloud confirmations clear active claim");
assert(store.getItem(Calendar.LEGACY_RECEIPT_PREFIX + "user-a"), "completion receipt remains durable");
console.log("Calendar account cache and legacy claim tests passed");
