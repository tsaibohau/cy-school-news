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
const { spawnSync } = require("node:child_process");

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
function writePreference(method, query) {
  return method === "POST" && String(query || "").includes("on_conflict=")
    ? "resolution=merge-duplicates,return=representation"
    : "return=representation";
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
    headers: headers(token, writePreference(method, query)),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function table(token, name, method, query, body) {
  return jsonRequest(`${base}/rest/v1/${name}${query || ""}`, {
    method,
    headers: headers(token, writePreference(method, query)),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function fixtureUuid(namespace, uid) {
  const hex = crypto.createHash("sha256").update(`${namespace}:${uid}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
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
  for (const name of ["user_reminder_rules", "user_push_subscriptions", "reminder_jobs", "reminder_deliveries"]) {
    const denied = await jsonRequest(`${base}/rest/v1/${name}?select=id`, { headers: { apikey: apiKey } });
    assert.ok(denied.status === 401 || denied.status === 403, `anonymous cannot access ${name}`);
  }
}

async function ownReminderCrud(ctx, marker) {
  const ruleId = fixtureUuid("reminder-rule", ctx.uid);
  const subscriptionId = fixtureUuid("push-subscription", ctx.uid);
  const endpoint = `https://push.invalid/cynews-rls-${fixtureUuid("push-endpoint", ctx.uid)}`;
  const rule = {
    id: ruleId, user_id: ctx.uid, target_kind: "manual", target_id: `manual:${ruleId}`,
    offsets_days: [1], enabled: true, manual_target_at: "2099-01-01T01:00:00+08:00",
    manual_title: `${marker}_REMINDER`, provenance: "manual", source_revision: "manual",
    preset: "single", disabled_at: null, deleted_at: null,
  };
  const subscription = {
    id: subscriptionId, user_id: ctx.uid, endpoint, p256dh: "deployed-fixture-p256dh",
    auth: "deployed-fixture-auth", user_agent: "dedicated-rls-harness",
    active: true, disabled_at: null, invalidated_at: null,
  };
  const createdRule = await table(ctx.token, "user_reminder_rules", "POST", "?on_conflict=id", rule);
  assert.ok(ok(createdRule.status), "own reminder rule upsert succeeds");
  const createdSubscription = await table(ctx.token, "user_push_subscriptions", "POST", "?on_conflict=id", subscription);
  assert.ok(ok(createdSubscription.status), "own push subscription upsert succeeds");
  const readRule = await table(ctx.token, "user_reminder_rules", "GET", `?id=eq.${queryValue(ruleId)}&select=id,user_id,resolved_target_at,resolved_target_title`);
  assert.ok(ok(readRule.status) && Array.isArray(readRule.data) && readRule.data.length === 1,
    "own reminder rule is readable");
  assert.equal(readRule.data[0].user_id, ctx.uid, "verified Auth UID owns reminder rule");
  assert.equal(readRule.data[0].resolved_target_title, `${marker}_REMINDER`, "trigger resolves owner-visible title");
  const updated = await table(ctx.token, "user_reminder_rules", "PATCH", `?id=eq.${queryValue(ruleId)}`,
    { preset: "standard", offsets_days: [3, 1, 0], updated_at: new Date().toISOString() });
  assert.ok(ok(updated.status), "own reminder rule update succeeds");
  return { ruleId, subscriptionId, endpoint, rule, subscription };
}

async function reminderIsolation(ctx, foreign, foreignFixture) {
  for (const [name, id] of [["user_reminder_rules", foreignFixture.ruleId], ["user_push_subscriptions", foreignFixture.subscriptionId]]) {
    const read = await table(ctx.token, name, "GET", `?id=eq.${queryValue(id)}&select=id`);
    assert.ok(ok(read.status) && Array.isArray(read.data) && read.data.length === 0, `cross-user ${name} read is empty`);
    const patch = await table(ctx.token, name, "PATCH", `?id=eq.${queryValue(id)}`, { updated_at: new Date().toISOString() });
    assert.ok(!ok(patch.status) || !Array.isArray(patch.data) || patch.data.length === 0, `cross-user ${name} update is denied`);
  }
  const spoofRule = await table(ctx.token, "user_reminder_rules", "POST", "", {
    ...foreignFixture.rule, id: crypto.randomUUID(), user_id: foreign.uid, target_id: `manual:${crypto.randomUUID()}`,
  });
  assert.ok(!ok(spoofRule.status), "foreign reminder rule owner spoof is rejected");
  const spoofSubscription = await table(ctx.token, "user_push_subscriptions", "POST", "", {
    ...foreignFixture.subscription, id: crypto.randomUUID(), user_id: foreign.uid,
    endpoint: `https://push.invalid/spoof-${crypto.randomUUID()}`,
  });
  assert.ok(!ok(spoofSubscription.status), "foreign push subscription owner spoof is rejected");
  const endpointTransfer = await table(ctx.token, "user_push_subscriptions", "POST", "?on_conflict=endpoint", {
    ...foreignFixture.subscription, id: crypto.randomUUID(), user_id: ctx.uid,
  });
  assert.ok(!ok(endpointTransfer.status), "foreign endpoint cannot silently transfer accounts");
  for (const name of ["reminder_jobs", "reminder_deliveries"]) {
    const denied = await table(ctx.token, name, "GET", "?select=id");
    assert.ok(denied.status === 401 || denied.status === 403, `authenticated browser cannot read ${name}`);
  }
}

async function disableReminderFixture(ctx, fixture) {
  await table(ctx.token, "user_reminder_rules", "PATCH", `?id=eq.${queryValue(fixture.ruleId)}`,
    { enabled: false, disabled_at: new Date().toISOString(), deleted_at: new Date().toISOString() });
  await table(ctx.token, "user_push_subscriptions", "PATCH", `?id=eq.${queryValue(fixture.subscriptionId)}`,
    { active: false, disabled_at: new Date().toISOString() });
}

async function run() {
  const [a, b] = await Promise.all(credentials.map(([email, password]) => signIn(email, password)));
  assert.notEqual(a.uid, b.uid, "dedicated Auth identities must be distinct");
  const marker = `CYNEWS_RLS_ACCEPT_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  let taskA = null;
  let taskB = null;
  let reminderA = null;
  let reminderB = null;
  try {
    taskA = await ownCrud(a, `${marker}_A`);
    taskB = await ownCrud(b, `${marker}_B`);
    await crossIsolation(a, b, taskB);
    await crossIsolation(b, a, taskA);
    reminderA = await ownReminderCrud(a, `${marker}_A`);
    reminderB = await ownReminderCrud(b, `${marker}_B`);
    await reminderIsolation(a, b, reminderB);
    await reminderIsolation(b, a, reminderA);
    await anonymousDenied();
    const accountMatrix = spawnSync(process.execPath, ["tests/test_rls_behavioral.js"], {
      cwd: process.cwd(),
      env: {
        CYNEWS_SUPABASE_URL: base,
        CYNEWS_SUPABASE_ANON_KEY: apiKey,
        CYNEWS_RLS_TOKEN_A: a.token,
        CYNEWS_RLS_TOKEN_B: b.token,
      },
      encoding: "utf8",
    });
    assert.equal(accountMatrix.status, 0,
      `deployed account-table matrix failed: ${String(accountMatrix.stderr || accountMatrix.stdout || "no output").trim()}`);
    console.log("DEPLOYED_RLS_PASS: Auth A/B own CRUD, bidirectional isolation, spoofing, anonymous denial, reminder device isolation, server-ledger denial, and retry idempotency");
  } finally {
    if (reminderA) await disableReminderFixture(a, reminderA);
    if (reminderB) await disableReminderFixture(b, reminderB);
    if (taskA) await task(a.token, "DELETE", `?id=eq.${queryValue(taskA.id)}`);
    if (taskB) await task(b.token, "DELETE", `?id=eq.${queryValue(taskB.id)}`);
  }
}

run().catch((error) => {
  console.error(`DEPLOYED_RLS_FAIL: ${error.message}`);
  process.exitCode = 1;
});

