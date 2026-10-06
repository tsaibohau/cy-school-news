"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const Core = require("../tools/staging/mock-admin-core.js"), CSV = require("../tools/staging/announcement-csv.js");
const { createHandler } = require("../api/mock-admin.js");
const { createHandler: realHandler } = require("../api/admin-announcement-export.js");
const now = Date.parse("2026-10-06T13:00:00Z");
// Synthetic test credentials only; deployment passwords never appear in Git.
const settings = { environment: "preview", branch: Core.BRANCH, deployment: "test-deployment.invalid", username: "fixture-user", password: "fixture-password-only", secret: "x".repeat(64), expiresAt: now + 86400000 };
function response() { return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(v) { this.code = v; return this; }, json(v) { this.body = v; return this; } }; }
async function request(action, body = {}, token = "", config = settings, clock = now) {
  const res = response(); await createHandler({ settings: config, now: () => clock })({ method: "POST", query: { action }, headers: { authorization: token ? "Bearer " + token : "" }, body }, res); return res;
}
(async () => {
  assert.equal((await request("login", { username: settings.username, password: "wrong" })).code, 401);
  assert.equal((await request("catalog")).code, 401);
  for (const environment of ["production", "development", undefined]) assert.equal((await request("login", {}, "", { ...settings, environment })).code, 404);
  assert.equal((await request("login", {}, "", { ...settings, branch: "main" })).code, 404);
  assert.equal((await request("login", {}, "", { ...settings, secret: undefined })).code, 404);
  const login = await request("login", { username: settings.username, password: settings.password });
  assert.equal(login.code, 200); assert(!JSON.stringify(login.body).includes(settings.password));
  const token = login.body.token;
  assert.equal((await request("session", {}, token)).body.role, "owner");
  assert.equal((await request("session", {}, token + "bad")).code, 401);
  assert.equal((await request("session", {}, token, { ...settings, deployment: "another-deployment.invalid" })).code, 401);
  assert.equal((await request("session", {}, token, settings, now + 2 * 3600000)).code, 401);
  assert.equal((await request("login", {}, "", settings, settings.expiresAt)).code, 401);
  const catalog = await request("catalog", {}, token); assert.equal(catalog.body.items.length, 12);
  const ids = catalog.body.items.slice(0, 8).map(r => r.id), exported = await request("export", { ids }, token);
  assert.equal(exported.code, 200); assert.deepEqual(exported.body.records.map(r => r.id), ids);
  assert.equal(exported.body.data_source, "simulated");
  assert(CSV.csv(exported.body.records, "now").includes('"simulated"'));
  assert.equal((await request("export", { ids: ["cysh-real"] }, token)).code, 400);
  assert.equal((await request("export", { ids: [ids[0], ids[0]] }, token)).code, 400);
  assert.equal((await request("export", { ids: catalog.body.items.map(r => r.id) }, token)).code, 400);
  const res = response(); let touched = false;
  await realHandler({ fetch: () => { touched = true; throw new Error("must not call Supabase"); } })({ method: "POST", headers: { authorization: "Bearer " + token }, body: { ids } }, res);
  assert.equal(res.code, 403); assert.equal(touched, false);
  const page = fs.readFileSync(path.join(__dirname, "../tools/staging/mock-admin.html"), "utf8");
  assert(page.includes("connect-src 'self'")); assert(!page.includes("account-config.js")); assert(!page.includes("app.js")); assert(!page.includes("supabase"));
  const api = fs.readFileSync(path.join(__dirname, "../api/mock-admin.js"), "utf8"); assert(!api.includes("fetch("));
  console.log("PASS: mock credentials, owner session, expiry, deployment/branch/production isolation, synthetic export, zero database calls");
})().catch(error => { console.error(error); process.exitCode = 1; });
