const assert = require("assert");
const Sync = require("../docs/supabase-sync.js");
const Account = require("../docs/account-sync.js");
const Auth = require("../docs/account-auth.js");

function store() {
  return { data: {}, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = v; }, removeItem(k) { delete this.data[k]; } };
}

const calls = [];
const client = {
  currentUid: "user-a",
  auth: { getSession() { return Promise.resolve({ data: { session: this.session() }, error: null }); }, session() { return { user: { id: client.currentUid } }; } },
  from(table) {
    return {
      select() { return this; },
      eq() { return Promise.resolve({ data: table === "user_subscriptions" ? [{ keyword: "X", normalized_keyword: "x" }] : [], error: null }); },
      upsert(rows, options) { calls.push({ table, rows, options }); return Promise.resolve({ data: rows, error: null }); },
    };
  },
};

assert.equal(Sync.requireUid({ user: { id: "u" } }), "u");
assert.throws(() => Sync.requireUid({ user: {} }), /verified session/);
assert.equal(Auth.createController({ config: {} }).isConfigured(), false);
const adapter = Sync.createAdapter(client, { onConflict: { user_subscriptions: "user_id,normalized_keyword" } });
adapter.fetchRemoteState().then(async remote => {
  assert.equal(remote.user_id, "user-a");
  assert.equal(remote.subscriptions[0].keyword, "X");
  await adapter.pushRows("user_subscriptions", [{ user_id: "user-b", id: "server-uuid-a", keyword: "X", createdAt: "2026-01-01T00:00:00Z" }]);
  assert.equal(calls[0].rows[0].user_id, "user-a", "payload cannot override verified session owner");
  assert.equal(calls[0].rows[0].id, undefined, "server UUID is not sync identity");
  assert.equal(calls[0].conflict, undefined);

  await adapter.pushRows("user_subscriptions", [{ keyword: "X", normalized_keyword: "x", createdAt: "2026-01-01T00:00:00Z" }]);
  await adapter.pushRows("user_subscriptions", [{ keyword: "X", normalized_keyword: "x", deleted_at: "2026-02-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z" }]);
  await adapter.pushRows("user_reads", [{ announcement_id: "a", read_at: "2026-01-02T00:00:00Z" }]);
  await adapter.pushRows("user_reads", [{ announcement_id: "a", read_at: "2026-01-02T00:00:00Z" }]);
  await adapter.pushRows("user_preferences", [{ schema_version: 1, preferences: { school: "cysh" } }]);
  await adapter.pushRows("user_preferences", [{ schema_version: 1, preferences: { school: "cysh" } }]);
  const subscriptionCalls = calls.filter(x => x.table === "user_subscriptions");
  assert(subscriptionCalls.slice(1).every(x => x.options.onConflict === Sync.CONFLICT_TARGETS.user_subscriptions));
  assert(subscriptionCalls[2].rows[0].deleted_at, "tombstone uses the same logical subscription row");
  assert.equal(calls.find(x => x.table === "user_reads").options.onConflict, Sync.CONFLICT_TARGETS.user_reads);
  assert.equal(calls.find(x => x.table === "user_preferences").options.onConflict, Sync.CONFLICT_TARGETS.user_preferences);
  assert.notEqual(subscriptionCalls[0].options.onConflict, "user_id");
  assert.equal(adapter.CONFLICT_TARGETS, undefined);

  const outbox = new Account.Outbox(store(), "user-a");
  outbox.enqueue({ type: "subscription.upsert", payload: { keyword: "one", createdAt: "2026-01-01T00:00:00Z" } });
  outbox.enqueue({ type: "subscription.upsert", payload: { keyword: "two", createdAt: "2026-01-01T00:00:00Z" } });
  let sent = 0;
  await assert.rejects(adapter.drain(outbox, async item => {
    sent += 1;
    if (sent === 1) return true;
    throw new Error("temporary failure");
  }), /temporary failure/);
  assert.equal(outbox.pending().length, 1, "successful mutation is acked, failed one remains");

  client.currentUid = "user-b";
  await assert.rejects(adapter.drain(outbox, () => true), /identity changed/);
  assert.equal(outbox.pending().length, 1, "identity change cannot drain A queue as B");
  console.log("Supabase Sync adapter tests passed");
}).catch(error => { console.error(error); process.exitCode = 1; });
