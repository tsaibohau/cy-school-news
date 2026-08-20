const assert = require("assert");
const Sync = require("../docs/account-sync.js");

const store = {
  data: {},
  getItem(k) { return this.data[k] || null; },
  setItem(k, v) { this.data[k] = v; },
};

assert.equal(Sync.normalizeKeyword("  段考  "), "段考");
const merged = Sync.mergeSubscriptions([
  { keyword: "段考", updated_at: "2026-01-01T00:00:00Z" },
], [
  { keyword: "段考", normalized_keyword: "段考", deleted_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
  { keyword: "社團", updated_at: "2026-01-02T00:00:00Z" },
]);
assert.equal(merged.length, 2);
assert.equal(merged.find(x => x.normalized_keyword === "段考").deleted_at, "2026-01-02T00:00:00Z");

const reads = Sync.mergeReads(
  [{ announcement_id: "a", read_at: "2026-01-01T00:00:00Z" }],
  [{ announcement_id: "a", read_at: "2026-01-02T00:00:00Z" }, { announcement_id: "b", read_at: "2026-01-01T00:00:00Z" }]
);
assert.equal(reads.length, 2);
assert.equal(reads.find(x => x.announcement_id === "a").read_at, "2026-01-02T00:00:00Z");

const outbox = new Sync.Outbox(store);
const mutation = outbox.enqueue({ type: "subscription.upsert", payload: { keyword: "段考" } });
assert.equal(outbox.load().pending.length, 1);
outbox.ack([mutation.id], "2026-01-03T00:00:00Z");
assert.equal(outbox.load().pending.length, 0);
assert.equal(outbox.load().last_sync_at, "2026-01-03T00:00:00Z");

const account = Sync.mergeAccountState(
  { subscriptions: [], reads: [], preferences: { updated_at: "2026-01-01T00:00:00Z", preferences: { school: "cysh" } } },
  { subscriptions: [], reads: [], preferences: { updated_at: "2026-01-02T00:00:00Z", preferences: { school: "cygsh" } } }
);
assert.equal(account.preferences.preferences.school, "cygsh");
console.log("Account Sync V1 core tests passed");
