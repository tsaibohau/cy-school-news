"use strict";
const assert = require("node:assert/strict");
const Calendar = require("../docs/calendar-state.js");
const Account = require("../docs/account-sync.js");

function storage() {
  return { data: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; },
    setItem(k, v) { this.data[k] = v; }, removeItem(k) { delete this.data[k]; } };
}

function failingRemovalStorage() {
  const value = storage();
  value.failedRemovals = new Set();
  value.removeItem = function (key) {
    if (this.failedRemovals.has(key)) throw new Error("injected remove failure");
    delete this.data[key];
  };
  return value;
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

const payloadFailureStore = failingRemovalStorage();
payloadFailureStore.setItem(Calendar.LEGACY_KEY, JSON.stringify([
  { id: "old-payload", title: "Payload cleanup", date: "2026-09-03", notes: "" },
]));
const payloadFailureClaim = Calendar.createLegacyClaim(payloadFailureStore, "user-a");
payloadFailureStore.failedRemovals.add(Calendar.LEGACY_KEY);
let failedCleanup = Calendar.confirmLegacy(payloadFailureStore, "user-a", payloadFailureClaim.entries[0].legacy_import_key);
assert.equal(failedCleanup.complete, false, "v1 remove failure cannot report complete");
assert.equal(failedCleanup.cleanup_pending, true);
assert(payloadFailureStore.getItem(Calendar.LEGACY_KEY), "v1 remove failure retains the payload");
assert.equal(Calendar.readClaim(payloadFailureStore).account_id, "user-a", "v1 remove failure retains A ownership");
assert.throws(() => Calendar.createLegacyClaim(payloadFailureStore, "user-b"), /another account/, "B cannot claim after v1 cleanup failure");
payloadFailureStore.failedRemovals.delete(Calendar.LEGACY_KEY);
assert.equal(Calendar.confirmLegacy(payloadFailureStore, "user-a", payloadFailureClaim.entries[0].legacy_import_key).complete, true,
  "A can retry verified cleanup after the storage failure clears");

const claimFailureStore = failingRemovalStorage();
claimFailureStore.setItem(Calendar.LEGACY_KEY, JSON.stringify([
  { id: "old-claim", title: "Claim cleanup", date: "2026-09-04", notes: "" },
]));
const claimFailureClaim = Calendar.createLegacyClaim(claimFailureStore, "user-a");
claimFailureStore.failedRemovals.add(Calendar.LEGACY_CLAIM_KEY);
failedCleanup = Calendar.confirmLegacy(claimFailureStore, "user-a", claimFailureClaim.entries[0].legacy_import_key);
assert.equal(failedCleanup.complete, false, "claim remove failure cannot report complete");
assert.equal(failedCleanup.cleanup_pending, true);
assert.equal(claimFailureStore.getItem(Calendar.LEGACY_KEY), null, "payload is confirmed absent before claim cleanup");
assert.equal(Calendar.readClaim(claimFailureStore).account_id, "user-a", "claim remove failure retains A ownership");
assert.throws(() => Calendar.createLegacyClaim(claimFailureStore, "user-b"), /another account/, "B cannot claim while A cleanup is pending");
claimFailureStore.failedRemovals.delete(Calendar.LEGACY_CLAIM_KEY);
assert.equal(Calendar.confirmLegacy(claimFailureStore, "user-a", claimFailureClaim.entries[0].legacy_import_key).complete, true,
  "claim cleanup retry succeeds only after verified removal");
console.log("Calendar account cache and legacy claim tests passed");
