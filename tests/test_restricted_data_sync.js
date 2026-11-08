const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const fnDir = path.join(root, "supabase", "functions", "restricted-data-sync");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20261108200000_restricted_data_storage.sql"), "utf8");
const indexTs = fs.readFileSync(path.join(fnDir, "index.ts"), "utf8");
const config = fs.readFileSync(path.join(root, "supabase", "config.toml"), "utf8");

(async () => {
  const L = await import(path.join(fnDir, "logic.js"));

  // name validation
  for (const ok of ["docs/data/announcements.json.gz", "scraper/site_map.json.gz", "a", "docs/data/school-info/xx-1.json.gz"]) {
    assert.equal(L.validName(ok), true, ok);
  }
  const bad = ["", "/etc/passwd", "../x", "a/../b", "a..b", "a//b", "a b", "a\\b", "名稱.gz", "a?x=1", "a%2e", "x".repeat(161), null, undefined, 5];
  for (const name of bad) assert.equal(L.validName(name), false, String(name));
  assert.equal(L.validName("x".repeat(160)), true);

  // sha256 + size cap
  const body = new TextEncoder().encode("invented-gzip-bytes");
  const good = await L.sha256Hex(body);
  assert.match(good, /^[0-9a-f]{64}$/);
  assert.deepEqual(await L.checkUpload(body, good), { ok: true, sha256: good });
  assert.deepEqual(await L.checkUpload(body, good.toUpperCase()), { ok: true, sha256: good });
  assert.equal((await L.checkUpload(body, "0".repeat(64))).error, "sha256_mismatch");
  assert.equal((await L.checkUpload(body, "")).error, "invalid_sha256");
  assert.equal((await L.checkUpload(body, "zz")).error, "invalid_sha256");
  assert.equal((await L.checkUpload(new Uint8Array(0), good)).error, "empty_body");
  const big = new Uint8Array(L.MAX_OBJECT_BYTES + 1);
  const tooBig = await L.checkUpload(big, await L.sha256Hex(big));
  assert.equal(tooBig.status, 413);
  const exact = new Uint8Array(L.MAX_OBJECT_BYTES);
  assert.equal((await L.checkUpload(exact, await L.sha256Hex(exact))).ok, true);

  // routing
  const q = (s) => new URLSearchParams(s);
  assert.deepEqual(L.route("GET", q("list=1")), { action: "list" });
  assert.deepEqual(L.route("get", q("name=a/b.gz")), { action: "get", name: "a/b.gz" });
  assert.deepEqual(L.route("PUT", q("name=a.gz")), { action: "put", name: "a.gz" });
  assert.deepEqual(L.route("DELETE", q("name=a.gz")), { action: "delete", name: "a.gz" });
  assert.equal(L.route("POST", q("name=a.gz")).status, 405);
  assert.equal(L.route("PATCH", q("list=1")).status, 405);
  assert.equal(L.route("PUT", q("list=1")).error, "invalid_name");
  assert.equal(L.route("GET", q("")).error, "invalid_name");
  assert.equal(L.route("GET", q("name=../x")).error, "invalid_name");
  assert.equal(L.route("DELETE", q("name=/abs")).status, 400);

  // constant-time compare
  assert.equal(L.constantTimeEqual("secret", "secret"), true);
  assert.equal(L.constantTimeEqual("secret", "secreT"), false);
  assert.equal(L.constantTimeEqual("secret", "secret2"), false);
  assert.equal(L.constantTimeEqual("", "x"), false);
  assert.equal(L.constantTimeEqual(undefined, undefined), true);

  // auth
  const env = { publishableKeys: ["sb_publishable_FAKE1", "sb_publishable_FAKE2"], anonKey: "legacy.anon.FAKE", token: "tok-FAKE-123" };
  const h = (o) => new Headers(o);
  assert.equal(L.checkAuth(h({ apikey: "sb_publishable_FAKE2", "x-announcement-content-sync-token": "tok-FAKE-123" }), env), null);
  assert.equal(L.checkAuth(h({ apikey: "legacy.anon.FAKE", "x-announcement-content-sync-token": "tok-FAKE-123" }), env), null);
  assert.equal(L.checkAuth(h({ "x-announcement-content-sync-token": "tok-FAKE-123" }), env).error, "invalid_apikey");
  assert.equal(L.checkAuth(h({ apikey: "nope", "x-announcement-content-sync-token": "tok-FAKE-123" }), env).error, "invalid_apikey");
  assert.equal(L.checkAuth(h({ apikey: "sb_publishable_FAKE1" }), env).error, "invalid_sync_caller");
  const wrong = L.checkAuth(h({ apikey: "sb_publishable_FAKE1", "x-announcement-content-sync-token": "tok-WRONG-123" }), env);
  assert.deepEqual(wrong, { status: 401, error: "invalid_sync_caller" });
  // unconfigured token or keys never authorise (even with empty headers)
  assert.equal(L.checkAuth(h({ apikey: "sb_publishable_FAKE1", "x-announcement-content-sync-token": "" }), { ...env, token: "" }).error, "invalid_sync_caller");
  assert.equal(L.checkAuth(h({ apikey: "", "x-announcement-content-sync-token": "tok-FAKE-123" }), { token: "tok-FAKE-123", publishableKeys: [] }).error, "invalid_apikey");
  // no response body may echo secrets
  for (const r of [wrong, L.checkAuth(h({}), env)]) {
    const text = JSON.stringify(r);
    assert.ok(!text.includes("tok-FAKE-123") && !text.includes("tok-WRONG-123") && !text.includes("sb_publishable"));
  }
  assert.equal(L.safeError(new Error("missing_supabase_url")), "missing_supabase_url");
  assert.equal(L.safeError(new Error("connect to db.secret.host tok-FAKE-123 failed")), "internal_error");
  assert.equal(L.safeError("x"), "internal_error");

  // function wiring (static)
  assert.doesNotMatch(indexTs, /jose|x-github-oidc|JSON\.parse\(await|req\.json\(\)/);
  assert.match(indexTs, /upsert: true, contentType: "application\/gzip"/);
  assert.match(indexTs, /storage\.from\(BUCKET\)/);
  assert.match(config, /\[functions\.restricted-data-sync\][^[]*verify_jwt = true/);

  // migration (static)
  assert.match(migration, /insert into storage\.buckets[\s\S]*'restricted-data'[\s\S]*false[\s\S]*8388608/);
  assert.match(migration, /on conflict \(id\) do update[\s\S]*public = false/);
  const policies = migration.match(/create policy[^;]*;/g) || [];
  assert.equal(policies.length, 1, "exactly one policy");
  assert.match(policies[0], /on storage\.objects\s+for select\s+to authenticated/);
  assert.match(policies[0], /bucket_id = 'restricted-data'/);
  assert.doesNotMatch(policies[0], /\b(anon|public)\b\s*(,|using|$)/);
  assert.doesNotMatch(migration, /for (insert|update|delete|all)\b/i);
  assert.match(migration, /\(select auth\.uid\(\)\)/);
  assert.match(migration, /is_active_app_admin\(\(select auth\.uid\(\)\)\)/);
  assert.match(migration, /revoke all on function public\.can_read_restricted_data\(\) from public, anon/);
  assert.match(migration, /grant execute on function public\.can_read_restricted_data\(\) to authenticated/);
  assert.match(migration, /set search_path = pg_catalog, public/);
  assert.doesNotMatch(migration, /grant[^;]*\bto\b[^;]*\banon\b/i);

  console.log("restricted-data-sync tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
