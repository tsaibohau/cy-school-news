const assert = require("assert");
const Sync = require("../docs/account-sync.js");
const Supabase = require("../docs/supabase-sync.js");

function store() {
  return { data: {}, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = v; }, removeItem(k) { delete this.data[k]; } };
}
const anonymous = { subscriptions: [{ keyword: "匿名基線", updated_at: "2026-08-01T00:00:00Z" }], reads: [], preferences: { schema_version: 1, preferences: {} } };
const storage = store();
let lifecycle = new Sync.AccountLifecycle(anonymous, storage);
lifecycle.applyMutation("subscription.upsert", { keyword: "匿名新增", createdAt: "2026-08-01T01:00:00Z" });
const a = lifecycle.login("uid-a", { subscriptions: [{ keyword: "A-only", updated_at: "2026-08-02T00:00:00Z" }], reads: [], preferences: {} });
assert(a.subscriptions.some(x => x.keyword === "匿名基線"));
assert(a.subscriptions.some(x => x.keyword === "匿名新增"), "anonymous mutations persist before first adoption");
lifecycle.applyMutation("subscription.upsert", { keyword: "A-local", createdAt: "2026-08-03T00:00:00Z" });
assert(lifecycle.state().subscriptions.some(x => x.keyword === "A-local"), "local A mutation persists in the A namespace");
lifecycle.logout();
const b = lifecycle.login("uid-b", { subscriptions: [], reads: [], preferences: {} });
assert(!b.subscriptions.some(x => x.keyword === "A-only"));
assert(!b.subscriptions.some(x => x.keyword === "A-local"));
assert(!b.subscriptions.some(x => x.keyword === "匿名基線"));
assert(storage.getItem(Sync.STATE_KEY_PREFIX + "uid-a"));
assert(storage.getItem(Sync.STATE_KEY_PREFIX + "uid-b"));
assert.equal(JSON.parse(storage.getItem(Sync.META_KEY)).adopted_account_id, "uid-a");

const aOutbox = new Sync.Outbox(storage, "uid-a");
aOutbox.enqueue({ type: "subscription.upsert", payload: { keyword: "A-queued" } });
assert.equal(new Sync.Outbox(storage, "uid-b").pending().length, 0);

let current = true;
const client = {
  auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "uid-a" } } }, error: null }) },
  from() { return { select() { return { eq: () => Promise.resolve({ data: [], error: null }) }; }, upsert() { return Promise.resolve({ data: [], error: null }); } }; },
};
const guarded = Supabase.createAdapter(client, { isCurrent: () => current });
current = false;
(async function () {
  await assert.rejects(guarded.fetchRemoteState(), /superseded/);
  await assert.rejects(guarded.pushState({ subscriptions: [], reads: [], preferences: null }), /superseded/);
  const app = require("fs").readFileSync(require("path").join(__dirname, "..", "docs", "app.js"), "utf8");
  assert(app.includes("clearAccountOwnedView();"));
  assert(app.includes("requestedUid !== uid"));
  assert(app.includes("new window.CyNewsAccountSync.Outbox(localStorage, readyUid)"));
  assert(app.includes('accountPhase = "ACCOUNT_RESOLVING"'));
  assert(app.includes('accountPhase = "MERGING"'));
  assert(app.includes('accountPhase = "ACCOUNT_READY"'));
  console.log("Account Switch V3 isolation tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
