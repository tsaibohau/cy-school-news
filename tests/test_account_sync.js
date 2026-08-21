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

// Invalid timestamps never beat valid timestamps; deletion wins exact ties and
// the final stable JSON tie-break makes merge order irrelevant.
const tieLive = { keyword: "x", updated_at: "2026-01-03T00:00:00Z", value: "a" };
const tieDelete = { keyword: "x", updated_at: "2026-01-03T00:00:00Z", deleted_at: "2026-01-03T00:00:00Z" };
assert.equal(Sync.mergeSubscriptions([tieLive], [tieDelete])[0].deleted_at, tieDelete.deleted_at);
assert.deepEqual(
  Sync.mergeSubscriptions([tieLive], [tieDelete]),
  Sync.mergeSubscriptions([tieDelete], [tieLive])
);
assert.equal(Sync.mergeSubscriptions([{ keyword: "y", updated_at: "bad" }], [{ keyword: "y", updated_at: "2026-01-04T00:00:00Z" }])[0].updated_at, "2026-01-04T00:00:00Z");
assert.equal(Sync.mergeReads([{ announcement_id: "r", read_at: "bad" }], [{ announcement_id: "r", read_at: "2026-01-04T00:00:00Z" }])[0].read_at, "2026-01-04T00:00:00Z");
assert.deepEqual(
  Sync.mergeSubscriptions([{ keyword: "z", updated_at: "bad", value: "b" }], [{ keyword: "z", updated_at: "bad", value: "a" }]),
  Sync.mergeSubscriptions([{ keyword: "z", updated_at: "bad", value: "a" }], [{ keyword: "z", updated_at: "bad", value: "b" }])
);

const aOutbox = new Sync.Outbox(store, "user-a");
const bOutbox = new Sync.Outbox(store, "user-b");
const aMutation = aOutbox.enqueue({ type: "subscription.upsert", payload: { keyword: "a" } });
assert.equal(aMutation.account_id, "user-a");
assert.equal(bOutbox.pending().length, 0);
assert.throws(() => bOutbox.enqueue({ account_id: "user-a", type: "bad" }), /account mismatch/);
assert.throws(() => aOutbox.ack([aMutation.id], "2026-01-04T00:00:00Z", "user-b"), /account mismatch/);
assert.equal(aOutbox.pending().length, 1);
assert.equal(aOutbox.ack([aMutation.id], "2026-01-04T00:00:00Z").pending.length, 0);

const legacyStore = { data: { "cyNews.accountSync.v1": JSON.stringify({ account_id: "", pending: [{ id: "legacy" }] }) }, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = v; } };
assert.equal(new Sync.Outbox(legacyStore).pending()[0].account_id, Sync.ANONYMOUS_ACCOUNT);
assert.equal(aOutbox.ack([aMutation.id], "2026-01-04T00:00:00Z").pending.length, 0);

const anonymous = {
  subscriptions: [{ keyword: "匿名", updated_at: "2026-01-01T00:00:00Z" }],
  reads: [{ announcement_id: "anon-read", read_at: "2026-01-01T00:00:00Z" }],
  preferences: { updated_at: "2026-01-01T00:00:00Z", preferences: { school: "cysh" } },
};
const lifecycle = new Sync.AccountLifecycle(anonymous);
const notificationState = JSON.stringify({ version: 3, notifiedIds: ["n1"], notifiedThrough: "2026-01-01T00:00:00Z" });
store.setItem("cyNews.notificationState", notificationState);
const aState = lifecycle.login("user-a", { subscriptions: [{ keyword: "A", updated_at: "2026-01-02T00:00:00Z" }] });
assert(aState.subscriptions.some(x => x.keyword === "匿名"));
assert(aState.subscriptions.some(x => x.keyword === "A"));
lifecycle.logout();
assert(lifecycle.state().subscriptions.some(x => x.keyword === "匿名"));
assert(!lifecycle.state().subscriptions.some(x => x.keyword === "A"));
const bState = lifecycle.login("user-b");
assert(!bState.subscriptions.some(x => x.keyword === "A"));
lifecycle.logout();
const aAgain = lifecycle.login("user-a");
assert(aAgain.subscriptions.some(x => x.keyword === "A"));
assert.equal(store.getItem("cyNews.notificationState"), notificationState);

console.log("Account Sync V1.1 core tests passed");
