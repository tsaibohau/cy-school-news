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
      Prefer: "return=representation",
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
function expectForbidden(result, label) {
  assert.ok(!ok(result.status) || !Array.isArray(result.data) || result.data.length === 0, `${label} must be denied or affect zero rows`);
}

async function run() {
  const [a, b] = await Promise.all([userId(tokenA), userId(tokenB)]);
  assert.notEqual(a, b, "RLS acceptance requires two different authenticated users");
  const marker = `rls-acceptance-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const subA = { keyword: marker, normalized_keyword: marker, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null };
  const readA = { announcement_id: marker, read_at: new Date().toISOString() };
  const prefA = { schema_version: 1, preferences: { marker }, updated_at: new Date().toISOString() };
  const own = [
    ["user_subscriptions", subA], ["user_reads", readA], ["user_preferences", prefA],
  ];
  try {
    for (const [table, row] of own) {
      const created = await request(tokenA, table, "POST", "", row);
      assert.ok(ok(created.status), `A can insert own ${table}: ${created.status}`);
    }

    for (const [table, row] of [["user_subscriptions", subA], ["user_reads", readA], ["user_preferences", prefA]]) {
      const spoof = { ...row, user_id: b };
      const result = await request(tokenA, table, "POST", "", spoof);
      expectForbidden(result, `A spoof insert into ${table} as B`);
    }

    for (const table of ["user_subscriptions", "user_reads", "user_preferences"]) {
      const crossRead = await request(tokenB, table, "GET", `?select=*&user_id=eq.${encodeURIComponent(a)}`);
      assert.ok(ok(crossRead.status), `B cross-read request for ${table} must be safe`);
      assert.equal(Array.isArray(crossRead.data) ? crossRead.data.length : -1, 0, `B must not read A ${table}`);
    }

    const ownSub = `?user_id=eq.${encodeURIComponent(a)}&normalized_keyword=eq.${encodeURIComponent(marker)}`;
    const ownRead = `?user_id=eq.${encodeURIComponent(a)}&announcement_id=eq.${encodeURIComponent(marker)}`;
    for (const [table, query] of [["user_subscriptions", ownSub], ["user_reads", ownRead], ["user_preferences", `?user_id=eq.${encodeURIComponent(a)}`]]) {
      const crossUpdate = await request(tokenB, table, "PATCH", query, { preferences: { marker: "spoof" }, updated_at: new Date().toISOString() });
      expectForbidden(crossUpdate, `B cross-update of A ${table}`);
      const crossDelete = await request(tokenB, table, "DELETE", query);
      expectForbidden(crossDelete, `B cross-delete of A ${table}`);
    }

    const repeatedSub = await request(tokenA, "user_subscriptions", "POST", "?on_conflict=user_id%2Cnormalized_keyword", subA);
    assert.ok(ok(repeatedSub.status), "repeated subscription upsert succeeds");
    const repeatedRead = await request(tokenA, "user_reads", "POST", "?on_conflict=user_id,announcement_id", readA);
    assert.ok(ok(repeatedRead.status), "repeated read upsert succeeds");
    const repeatedPref = await request(tokenA, "user_preferences", "PATCH", `?user_id=eq.${encodeURIComponent(a)}`, { preferences: { marker: "second" }, updated_at: new Date().toISOString() });
    assert.ok(ok(repeatedPref.status), "preferences second update succeeds");

    const verify = await request(tokenA, "user_subscriptions", "GET", ownSub);
    assert.equal(Array.isArray(verify.data) ? verify.data.length : -1, 1, "subscription upsert remains one logical row");
    const tombstone = await request(tokenA, "user_subscriptions", "PATCH", ownSub, { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    assert.ok(ok(tombstone.status), "subscription tombstone succeeds");
    console.log(`REAL RLS behavioral acceptance passed for A=${a} and B=${b}`);
  } finally {
    await request(tokenA, "user_subscriptions", "DELETE", ownSub);
    await request(tokenA, "user_reads", "DELETE", ownRead);
    await request(tokenA, "user_preferences", "DELETE", `?user_id=eq.${encodeURIComponent(a)}`);
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
