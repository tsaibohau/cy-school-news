/*
 * REAL Account A/B RLS acceptance.
 *
 * Run only with two dedicated test-user access tokens:
 *   CYNEWS_SUPABASE_URL=https://<project>.supabase.co
 *   CYNEWS_SUPABASE_ANON_KEY=<public anon key>
 *   CYNEWS_RLS_TOKEN_A=<access token for test user A>
 *   CYNEWS_RLS_TOKEN_B=<access token for test user B>
 *
 * The harness creates uniquely named rows and deletes only those rows through
 * the owning token. It never uses service_role and never reads secrets from the
 * repository.
 */
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const base = String(process.env.CYNEWS_SUPABASE_URL || "").replace(/\/$/, "");
const anonKey = process.env.CYNEWS_SUPABASE_ANON_KEY || "";
const tokenA = process.env.CYNEWS_RLS_TOKEN_A || "";
const tokenB = process.env.CYNEWS_RLS_TOKEN_B || "";
if (!base || !anonKey || !tokenA || !tokenB) {
  console.error("RLS behavioral gate requires CYNEWS_SUPABASE_URL, CYNEWS_SUPABASE_ANON_KEY, CYNEWS_RLS_TOKEN_A and CYNEWS_RLS_TOKEN_B.");
  process.exit(2);
}

async function request(token, table, method, query, body) {
  const response = await fetch(`${base}/rest/v1/${table}${query || ""}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" && String(query || "").includes("on_conflict=")
        ? "resolution=merge-duplicates,return=representation"
        : "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch (_) {}
  return { status: response.status, data };
}

async function userId(token) {
  const response = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200, "both RLS tokens must be valid authenticated sessions");
  return (await response.json()).id;
}

function ok(status) { return status >= 200 && status < 300; }
function expectWriteDenied(result, label) {
  assert.ok(!ok(result.status), `${label} must return a non-2xx response`);
}
function expectForbidden(result, label) {
  assert.ok(!ok(result.status) || !Array.isArray(result.data) || result.data.length === 0, `${label} must be denied or affect zero rows`);
}

async function run() {
  const [a, b] = await Promise.all([userId(tokenA), userId(tokenB)]);
  assert.notEqual(a, b, "RLS acceptance requires two different authenticated users");
  const marker = `rls-acceptance-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const subA = { keyword: `${marker}-a`, normalized_keyword: `${marker}-a`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null };
  const subB = { keyword: `${marker}-b`, normalized_keyword: `${marker}-b`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null };
  const readA = { announcement_id: `${marker}-a`, read_at: new Date().toISOString() };
  const readB = { announcement_id: `${marker}-b`, read_at: new Date().toISOString() };
  const prefA = { schema_version: 1, preferences: { marker: `${marker}-a` }, updated_at: new Date().toISOString() };
  const prefB = { schema_version: 1, preferences: { marker: `${marker}-b` }, updated_at: new Date().toISOString() };
  const taskA = { id: crypto.randomUUID(), title: `${marker}-task-a`, status: "open", due_date: "2099-01-01", priority: 3, notes: "A", updated_at: new Date().toISOString() };
  const taskB = { id: crypto.randomUUID(), title: `${marker}-task-b`, status: "open", due_date: "2099-01-02", priority: 3, notes: "B", updated_at: new Date().toISOString() };
  const rowsA = [["user_subscriptions", subA], ["user_reads", readA], ["user_preferences", prefA], ["user_tasks", taskA]];
  const rowsB = [["user_subscriptions", subB], ["user_reads", readB], ["user_preferences", prefB], ["user_tasks", taskB]];
  const queries = {
    user_subscriptions: (uid, row) => `?user_id=eq.${encodeURIComponent(uid)}&normalized_keyword=eq.${encodeURIComponent(row.normalized_keyword)}`,
    user_reads: (uid, row) => `?user_id=eq.${encodeURIComponent(uid)}&announcement_id=eq.${encodeURIComponent(row.announcement_id)}`,
    user_preferences: uid => `?user_id=eq.${encodeURIComponent(uid)}`,
    user_tasks: (uid, row) => `?user_id=eq.${encodeURIComponent(uid)}&id=eq.${encodeURIComponent(row.id)}`,
  };
  let ownSub = queries.user_subscriptions(a, subA);
  let ownRead = queries.user_reads(a, readA);
  let ownTask = queries.user_tasks(a, taskA);
  try {
    for (const [owner, rows] of [["A", rowsA], ["B", rowsB]]) {
      const token = owner === "A" ? tokenA : tokenB;
      for (const [table, row] of rows) {
        const created = await request(token, table, "POST", "", row);
        assert.ok(ok(created.status), `${owner} can insert own ${table}: ${created.status}`);
      }
    }

    for (const [table, row] of rowsA) {
      const spoof = { ...row, user_id: b };
      const result = await request(tokenA, table, "POST", "", spoof);
      expectWriteDenied(result, `A spoof insert into ${table} as B`);
    }
    for (const [table, row] of rowsB) {
      const spoof = { ...row, user_id: a };
      const result = await request(tokenB, table, "POST", "", spoof);
      expectWriteDenied(result, `B spoof insert into ${table} as A`);
    }

    for (const table of ["user_subscriptions", "user_reads", "user_preferences", "user_tasks"]) {
      for (const [token, other, label] of [[tokenB, a, "B must not read A"], [tokenA, b, "A must not read B"]]) {
        const crossRead = await request(token, table, "GET", `?select=*&user_id=eq.${encodeURIComponent(other)}`);
        assert.ok(ok(crossRead.status), `${label} ${table} request must be safe`);
        assert.equal(Array.isArray(crossRead.data) ? crossRead.data.length : -1, 0, `${label} ${table}`);
      }
    }

    for (const [table, row] of rowsA) {
      const query = queries[table](a, row);
      expectForbidden(await request(tokenB, table, "PATCH", query, { updated_at: new Date().toISOString() }), `B cross-update of A ${table}`);
      expectForbidden(await request(tokenB, table, "DELETE", query), `B cross-delete of A ${table}`);
    }
    for (const [table, row] of rowsB) {
      const query = queries[table](b, row);
      expectForbidden(await request(tokenA, table, "PATCH", query, { updated_at: new Date().toISOString() }), `A cross-update of B ${table}`);
      expectForbidden(await request(tokenA, table, "DELETE", query), `A cross-delete of B ${table}`);
    }

    ownSub = queries.user_subscriptions(a, subA);
    ownRead = queries.user_reads(a, readA);
    const repeatedSub = await request(tokenA, "user_subscriptions", "POST", "?on_conflict=user_id,normalized_keyword", subA);
    assert.ok(ok(repeatedSub.status), "repeated subscription upsert succeeds");
    const repeatedRead = await request(tokenA, "user_reads", "POST", "?on_conflict=user_id,announcement_id", readA);
    assert.ok(ok(repeatedRead.status), "repeated read upsert succeeds");
    const repeatedPref = await request(tokenA, "user_preferences", "PATCH", `?user_id=eq.${encodeURIComponent(a)}`, { preferences: { marker: "second" }, updated_at: new Date().toISOString() });
    assert.ok(ok(repeatedPref.status), "preferences second update succeeds");

    ownTask = queries.user_tasks(a, taskA);
    const repeatedTask = await request(tokenA, "user_tasks", "POST", "?on_conflict=id", { ...taskA, title: `${marker}-task-a-updated` });
    assert.ok(ok(repeatedTask.status), "repeated task upsert succeeds");
    const taskUpdated = await request(tokenA, "user_tasks", "PATCH", ownTask, { status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    assert.ok(ok(taskUpdated.status), "task complete/update succeeds");
    const taskVerify = await request(tokenA, "user_tasks", "GET", ownTask);
    assert.equal(Array.isArray(taskVerify.data) ? taskVerify.data.length : -1, 1, "task upsert remains one logical row");
    const taskReopen = await request(tokenA, "user_tasks", "PATCH", ownTask, { status: "open", completed_at: null, updated_at: new Date().toISOString() });
    assert.ok(ok(taskReopen.status), "task reopen succeeds");

    const verify = await request(tokenA, "user_subscriptions", "GET", ownSub);
    assert.equal(Array.isArray(verify.data) ? verify.data.length : -1, 1, "subscription upsert remains one logical row");
    const tombstone = await request(tokenA, "user_subscriptions", "PATCH", ownSub, { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    assert.ok(ok(tombstone.status), "subscription tombstone succeeds");
    console.log("REAL RLS behavioral acceptance passed for USER_A and USER_B");
  } finally {
    await request(tokenA, "user_subscriptions", "DELETE", ownSub);
    await request(tokenA, "user_reads", "DELETE", ownRead);
    await request(tokenA, "user_preferences", "DELETE", queries.user_preferences(a));
    await request(tokenA, "user_tasks", "DELETE", queries.user_tasks(a, taskA));
    await request(tokenB, "user_subscriptions", "DELETE", queries.user_subscriptions(b, subB));
    await request(tokenB, "user_reads", "DELETE", queries.user_reads(b, readB));
    await request(tokenB, "user_preferences", "DELETE", queries.user_preferences(b));
    await request(tokenB, "user_tasks", "DELETE", queries.user_tasks(b, taskB));
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
