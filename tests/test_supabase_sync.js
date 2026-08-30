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
const unauthorizedClient = {
  auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "user-a" } } }, error: null }) },
  from(table) {
    return {
      select() { return this; },
      eq() {
        return table === "user_subscriptions"
          ? Promise.reject(new Error("401 unauthorized"))
          : Promise.resolve({ data: [], error: null });
      },
    };
  },
};
assert.rejects(
  Sync.createAdapter(unauthorizedClient).fetchRemoteState(),
  /401 unauthorized/,
  "one unauthorized table read fails the coherent fetch; it cannot become empty account state"
);
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
  await adapter.pushRows("user_preferences", [{ schema_version: 1, preferences: { school: "cysh" }, updated_at: null }]);
  await adapter.pushRows("user_preferences", [{ schema_version: 1, preferences: { school: "cysh" }, updated_at: "2026-02-01T00:00:00Z" }]);
  await adapter.pushRows("user_tasks", [{ id: "task-a", user_id: "user-b", title: "A task", due_date: "2026-09-05", updated_at: "2026-02-01T00:00:00Z" }]);
  const taskCall = calls.find(x => x.table === "user_tasks");
  assert.equal(taskCall.rows[0].user_id, "user-a", "task payload cannot override verified session owner");
  assert.match(taskCall.rows[0].id, /^[0-9a-f-]{36}$/i, "task adapter emits a database-safe stable UUID");
  assert.equal(taskCall.options.onConflict, Sync.CONFLICT_TARGETS.user_tasks);
  const preferenceCalls = calls.filter(x => x.table === "user_preferences");
  assert(preferenceCalls.every(x => x.rows[0].updated_at), "preferences upsert never sends null/undefined updated_at");
  assert.equal(preferenceCalls[1].rows[0].updated_at, "2026-02-01T00:00:00Z", "normalized preference push preserves timestamp");
  const firstLoginLifecycle = new Account.AccountLifecycle(
    { subscriptions: [], reads: [], preferences: { schema_version: 1, preferences: {} } },
    store()
  );
  const firstLoginState = firstLoginLifecycle.login("user-a", { subscriptions: [], reads: [], preferences: null });
  await adapter.pushState(firstLoginState);
  const firstLoginPreference = calls.filter(x => x.table === "user_preferences").pop().rows[0];
  assert.match(firstLoginPreference.updated_at, /^\d{4}-\d{2}-\d{2}T/, "first login with empty remote pushes a valid timestamp");
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

  const deletedTables = [];
  const deletionClient = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "user-a" } } }, error: null }) },
    from(table) {
      return {
        delete() { return this; },
        eq(column, uid) {
          deletedTables.push({ table, column, uid });
          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  };
  const deletionResult = await Sync.createAdapter(deletionClient).deleteOwnData();
  assert.deepEqual(deletionResult, Sync.TABLES_ORDER);
  assert.deepEqual(deletedTables.map(x => x.table), Sync.TABLES_ORDER, "all current account-owned tables are deleted");
  assert(deletedTables.every(x => x.column === "user_id" && x.uid === "user-a"), "deletion is scoped to the verified session owner");
  console.log("Supabase Sync adapter tests passed");
}).catch(error => { console.error(error); process.exitCode = 1; });
