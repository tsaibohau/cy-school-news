"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { createHandler } = require("../api/mock-admin.js");
const { loadCorpus } = require("../tools/staging/preview-system-corpus.js");
const root = path.resolve(__dirname, "..");
const settings = { environment: "preview", branch: "codex/admin-full-announcement-csv-20261006", deployment: "unit.invalid", username: "fixture-user", password: "testpw", secret: "x".repeat(64), expiresAt: Date.now() + 3600000 };
const items = [{ id: "cysh-100", school: "cysh", title: "真實資料格式測試", url: "https://example.invalid/source", date: "2026-10-01" }, { id: "cygsh-200", school: "cygsh", title: "歷史資料格式測試", url: "https://example.invalid/source2", date: "2024-01-01" }];
const storage = new Map(), requests = [];
const handler = createHandler({ settings, corpus: () => items });
const context = { console, URL, Set, Map, setTimeout, clearTimeout, location: { host: "unit.invalid" },
  sessionStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
  fetch: async (url, options) => {
    assert(url.startsWith("/api/mock-admin?action="), "no real Auth, Production, or school requests"); requests.push(url);
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: options.method, query: { action: url.split("=")[1] }, headers: { authorization: options.headers.Authorization }, body: options.body }, response);
    return { ok: response.code === 200, json: async () => response.body };
  },
};
context.window = context; vm.createContext(context);
for (const file of ["docs/capability-layer.js", "docs/account-auth.js", "tools/staging/mock-system-auth.js", "docs/supabase-sync.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
(async () => {
  const auth = context.CyNewsAccountAuth.createController();
  assert.equal(auth.isConfigured(), true); assert.equal(await auth.getVerifiedSession(), null);
  await assert.rejects(auth.signInWithIdentifier(settings.username, "wrong"));
  await auth.signInWithIdentifier(settings.username, settings.password);
  assert.equal((await auth.getVerifiedSession()).user.id, "synthetic-owner");
  const access = await auth.getAccountAccess(); assert.equal(access.admin_role, "owner"); assert.equal(access.capabilities.calendar, true);
  const index = await auth.getMemberAnnouncementIndex(); assert.deepEqual(Array.from(index, r => r.announcement_id), items.map(r => r.id));
  assert.equal(await auth.getMemberAnnouncementDetail(items[0].id), null, "missing body is not fabricated");
  const accounts = await auth.getAdminAccounts({}); assert.equal(accounts.length, 1); assert(accounts[0].email.includes("模擬"));
  await auth.updateAccountAccess(accounts[0].user_id, "approved", "full");
  assert.equal((await auth.getAdminAccounts({}))[0].status, "approved");
  await assert.rejects(auth.setAdminRole("real-user-id", "owner"));
  const client = await auth.getClient(), sync = context.CyNewsSupabaseSync.createAdapter(client);
  await sync.fetchRemoteState();
  await sync.pushState({ subscriptions: [{ keyword: "test" }], reads: [], preferences: { preferences: {} }, tasks: [] });
  assert.equal((await sync.fetchRemoteState()).subscriptions.length, 1, "sync is local simulation");
  const data = await context.CyNewsMockAdmin.request("system-export", { ids: items.map(r => r.id) }, (await auth.getVerifiedSession()).access_token);
  assert.equal(data.data_source, "branch_metadata_snapshot"); assert(data.records.every(r => r.detail === null));
  await auth.signOut(); assert.equal(await auth.getVerifiedSession(), null);
  assert(requests.every(url => url.startsWith("/api/mock-admin?action=")));
  const corpus = loadCorpus(), current = JSON.parse(fs.readFileSync(path.join(root, "docs/data/announcements.json"))), archive = JSON.parse(fs.readFileSync(path.join(root, "docs/data/archive.json")));
  const expected = new Set([...current.items, ...archive.items].filter(r => ["cysh", "cygsh"].includes(r.school)).map(r => r.id));
  assert.deepEqual(new Set(corpus.items.map(r => r.id)), expected); assert(corpus.items.length > 12);
  assert(corpus.items.every(r => !r.title.startsWith("【模擬】") && !r.id.includes("-sim-") && !r.body_content && !r.summary));
  console.log("PASS: full app signed mock login, owner/capabilities, real current+history metadata, local-only mutations/sync, explicit missing body");
})().catch(error => { console.error(error); process.exitCode = 1; });
