/*
 * Deployed RLS acceptance using two dedicated Supabase Auth users.
 *
 * Required protected environment variables:
 *   CYNEWS_SUPABASE_URL
 *   CYNEWS_SUPABASE_PUBLISHABLE_KEY (or CYNEWS_SUPABASE_ANON_KEY)
 *   CYNEWS_RLS_EMAIL_A / CYNEWS_RLS_PASSWORD_A
 *   CYNEWS_RLS_EMAIL_B / CYNEWS_RLS_PASSWORD_B
 *
 * This test never prints credentials, email, UID, tokens, or row payloads.
 * Provisioning is intentionally separate from behavioral verification.
 */
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const base = String(process.env.CYNEWS_SUPABASE_URL || "").replace(/\/$/, "");
const apiKey = process.env.CYNEWS_SUPABASE_PUBLISHABLE_KEY || process.env.CYNEWS_SUPABASE_ANON_KEY || "";
const credentials = [
  [process.env.CYNEWS_RLS_EMAIL_A, process.env.CYNEWS_RLS_PASSWORD_A],
  [process.env.CYNEWS_RLS_EMAIL_B, process.env.CYNEWS_RLS_PASSWORD_B],
];

if (!base || !apiKey || credentials.some(([email, password]) => !email || !password)) {
  console.error("BLOCKED_EXTERNAL_AUTH: dedicated staging Auth credentials are not injected");
  process.exit(2);
}

function ok(status) { return status >= 200 && status < 300; }
function queryValue(value) { return encodeURIComponent(value); }
function headers(token, prefer) {
  return { apikey: apiKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: prefer || "return=representation" };
}

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  let data = null;
  try { data = await response.json(); } catch (_) {}
  return { status: response.status, data };
}

async function signIn(email, password) {
  const result = await jsonRequest(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.ok(ok(result.status) && result.data && result.data.access_token && result.data.user && result.data.user.id,
    "dedicated Auth user must produce a verified authenticated session");
  return { token: result.data.access_token, uid: result.data.user.id };
}

async function task(token, method, query, body) {
  return jsonRequest(`${base}/rest/v1/user_tasks${query || ""}`, {
    method,
    headers: headers(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function ownCrud(ctx, marker) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = { id, user_id: ctx.uid, title: `${marker}_OPEN`, status: "open", due_date: "2099-01-01", priority: 3, notes: "disposable deployed RLS fixture", created_at: now, updated_at: now, completed_at: null, deleted_at: null };
  const own = `?id=eq.${queryValue(id)}`;
  const created = await task(ctx.token, "POST", "?on_conflict=id", row);
  assert.ok(ok(created.status), "own task insert succeeds");
  const repeated = await task(ctx.token, "POST", "?on_conflict=id", { ...row, title: `${marker}_RETRY` });
  assert.ok(ok(repeated.status), "same task retry succeeds");
  const read = await task(ctx.token, "GET", own + "&select=id,title,status,deleted_at");
  assert.ok(ok(read.status) && Array.isArray(read.data) && read.data.length === 1, "repeated task mutation remains one row");
  assert.equal(read.data[0].id, id, "own task read returns the same logical row");
  for (const body of [
    { title: `${marker}_UPDATED`, updated_at: new Date().toISOString() },
    { status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { status: "open", completed_at: null, updated_at: new Date().toISOString() },
    { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { deleted_at: null, updated_at: new Date().toISOString() },
  ]) {
    const updated = await task(ctx.token, "PATCH", own, body);
    assert.ok(ok(updated.status), "own task update path succeeds");
  }
  return { id, row };
}

async function crossIsolation(ctx, foreign, foreignTask) {
  const target = `?id=eq.${queryValue(foreignTask.id)}`;
  const read = await task(ctx.token, "GET", target + "&select=id,title");
  assert.ok(ok(read.status) && Array.isArray(read.data) && read.data.length === 0, "cross-user read is empty");
  const patch = await task(ctx.token, "PATCH", target, { title: "CYNEWS_FORBIDDEN", updated_at: new Date().toISOString() });
  assert.ok(!ok(patch.status) || !Array.isArray(patch.data) || patch.data.length === 0, "cross-user update cannot affect a row");
  const remove = await task(ctx.token, "DELETE", target);
  assert.ok(!ok(remove.status) || !Array.isArray(remove.data) || remove.data.length === 0, "cross-user delete cannot affect a row");
  const spoof = await task(ctx.token, "POST", "", { ...foreignTask.row, id: crypto.randomUUID(), user_id: foreign.uid, title: "CYNEWS_FORBIDDEN_SPOOF" });
  assert.ok(!ok(spoof.status), "foreign user_id insert is rejected");
  const ownership = await task(ctx.token, "PATCH", `?id=eq.${queryValue(foreignTask.id)}`, { user_id: foreign.uid });
  assert.ok(!ok(ownership.status) || !Array.isArray(ownership.data) || ownership.data.length === 0, "ownership reassignment is rejected");
}

async function anonymousDenied() {
  const result = await jsonRequest(`${base}/rest/v1/user_tasks?select=id`, { headers: { apikey: apiKey } });
  assert.ok(result.status === 401 || result.status === 403, "anonymous cannot access user_tasks");
}

async function run() {
  const [a, b] = await Promise.all(credentials.map(([email, password]) => signIn(email, password)));
  assert.notEqual(a.uid, b.uid, "dedicated Auth identities must be distinct");
  const marker = `CYNEWS_RLS_ACCEPT_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  let taskA = null;
  let taskB = null;
  try {
    taskA = await ownCrud(a, `${marker}_A`);
    taskB = await ownCrud(b, `${marker}_B`);
    await crossIsolation(a, b, taskB);
    await crossIsolation(b, a, taskA);
    await anonymousDenied();
    console.log("DEPLOYED_RLS_PASS: USER_A/USER_B own CRUD, isolation, spoofing, anonymous denial, and idempotency");
  } finally {
    if (taskA) await task(a.token, "DELETE", `?id=eq.${queryValue(taskA.id)}`);
    if (taskB) await task(b.token, "DELETE", `?id=eq.${queryValue(taskB.id)}`);
  }
}

run().catch((error) => {
  console.error(`DEPLOYED_RLS_FAIL: ${error.message}`);
  process.exitCode = 1;
});

