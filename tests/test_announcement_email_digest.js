const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const fnDir = path.join(root, "supabase", "functions", "announcement-email-digest");
const worker = fs.readFileSync(path.join(fnDir, "index.ts"), "utf8");
const config = fs.readFileSync(path.join(root, "supabase", "config.toml"), "utf8");
const imports = JSON.parse(fs.readFileSync(path.join(fnDir, "deno.json"), "utf8"));
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20261028120000_announcement_email_digest.sql"), "utf8");
const scheduler = fs.readFileSync(path.join(root, "supabase", "scheduler", "activate_announcement_email_digest_cron.sql"), "utf8");
const app = fs.readFileSync(path.join(root, "docs", "app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "docs", "index.html"), "utf8");

(async () => {
  const digest = await import(path.join(fnDir, "digest.js"));
  const now = new Date("2026-10-28T23:10:00Z"); // 07:10 Taipei
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const items = [
    { id: "cysh-1", school: "cysh", title: "物理競賽報名", first_seen: hoursAgo(2), url: "https://www.cysh.cy.edu.tw/a" },
    { id: "cysh-2", school: "cysh", title: "選課說明", category: "教務", first_seen: hoursAgo(1), url: "javascript:alert(1)" },
    { id: "cysh-old", school: "cysh", title: "物理營隊", first_seen: hoursAgo(100) },
    { id: "pksh-1", school: "pksh", title: "物理競賽", first_seen: hoursAgo(1) },
    { id: "cygsh-sent", school: "cygsh", title: "物理講座", first_seen: hoursAgo(1) },
    { id: "cygsh-before-optin", school: "cygsh", title: "物理講座二", first_seen: hoursAgo(30) },
    { id: "cygsh-other", school: "cygsh", title: "運動會", first_seen: hoursAgo(1) },
  ];
  const recipient = {
    user_id: "11111111-2222-3333-4444-555555555555",
    frequency: "daily",
    enabled_at: hoursAgo(24),
    keywords: ["物理", " 選課 ", "物理"],
    sent_ids: ["cygsh-sent"],
    last_sent_at: hoursAgo(24),
  };

  // Matching: keyword hits, allowed schools only, after opt-in, within lookback, not resent, newest first.
  const picked = digest.selectItems(items, recipient, now);
  assert.deepEqual(picked.map((p) => p.item.id), ["cysh-2", "cysh-1"]);
  assert.deepEqual(picked[1].matched, ["物理"]);
  assert.equal(digest.selectItems(items, { ...recipient, keywords: [] }, now).length, 0);
  assert.equal(digest.selectItems(items, recipient, now, { maxItems: 1 }).length, 1);
  assert.deepEqual(digest.normalizeKeywords(["A", "a", "", null, "x".repeat(41)]), ["a"]);

  // Scheduling: daily only at the Taipei hour and once per day; instant at most hourly.
  assert.equal(digest.taipeiHour(now), 7);
  assert.equal(digest.isDue(recipient, now), true);
  assert.equal(digest.isDue({ ...recipient, last_sent_at: hoursAgo(2) }, now), false);
  assert.equal(digest.isDue(recipient, new Date("2026-10-28T05:00:00Z")), false);
  assert.equal(digest.isDue({ ...recipient, frequency: "instant", last_sent_at: hoursAgo(0.5) }, now), false);
  assert.equal(digest.isDue({ ...recipient, frequency: "instant", last_sent_at: null }, now), true);

  // Email body escapes content and never emits unsafe links.
  const email = digest.buildEmail(
    [{ item: { ...items[1], title: "<b>選課</b>" }, matched: ["選課"] }],
    { siteUrl: "https://example.test/", unsubscribeUrl: "https://fn.test/?u=1", frequency: "daily", schoolNames: { cysh: "嘉中" } },
  );
  assert.doesNotMatch(email.html, /<b>選課<\/b>|javascript:/);
  assert.match(email.html, /&lt;b&gt;/);
  assert.match(email.html, /嘉中/);
  assert.match(email.html, /一鍵取消/);
  assert.match(email.text, /取消 Email 通知/);

  // Unsubscribe tokens are user-bound HMACs.
  const token = await digest.unsubscribeToken("secret", recipient.user_id);
  assert.equal(await digest.verifyUnsubscribeToken("secret", recipient.user_id, token), true);
  assert.equal(await digest.verifyUnsubscribeToken("other", recipient.user_id, token), false);
  assert.equal(await digest.verifyUnsubscribeToken("secret", "99999999-2222-3333-4444-555555555555", token), false);
  assert.equal(await digest.verifyUnsubscribeToken("secret", recipient.user_id, "zz"), false);

  // Worker security contract.
  assert.match(config, /\[functions\.announcement-email-digest\]\nenabled = true\nverify_jwt = false/);
  assert.match(worker, /x-email-digest-worker-token/);
  assert.match(worker, /EMAIL_DIGEST_WORKER_TOKEN/);
  assert.match(worker, /verifyUnsubscribeToken/);
  assert.match(worker, /List-Unsubscribe-Post/);
  assert.match(worker, /EMAIL_DIGEST_DAILY_CAP/);
  assert.match(worker, /record_email_digest/);
  assert.doesNotMatch(worker, /console\.(?:log|error)/);
  for (const specifier of Object.values(imports.imports)) assert.doesNotMatch(specifier, /[\^~*]|@latest$/);

  // Database contract: backend-only tables, service_role-only RPCs, approved + capability gate.
  assert.match(migration, /revoke all on table private\.announcement_email_digests from public, anon, authenticated/);
  assert.match(migration, /revoke all on table private\.announcement_email_deliveries from public, anon, authenticated/);
  for (const fn of ["email_digest_recipients\\(\\)", "email_digest_sent_since\\(timestamptz\\)", "record_email_digest\\(uuid, text, text\\[\\]\\)", "email_digest_unsubscribe\\(uuid\\)"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn} from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn} to service_role`));
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${fn} to (anon|authenticated)`));
  }
  assert.match(migration, /a\.status = 'approved'/);
  assert.match(migration, /c\.capability = 'notifications' and c\.enabled/);
  assert.match(migration, /email_confirmed_at is not null/);
  assert.match(migration, /set search_path = pg_catalog/);
  assert.match(scheduler, /OWNER-RUN ACTIVATION, not a migration/);
  assert.match(scheduler, /'23 \* \* \* \*'/);

  // Client stores the preference in the synced notification preferences.
  assert.match(index, /id="emailDigestMode"/);
  assert.match(app, /email: normalizeEmailDigest\(/);
  assert.match(app, /state\.emailDigest = normalizeEmailDigest\(notificationPreferences && notificationPreferences\.email\)/);

  console.log("Announcement email digest tests passed");
})().catch((error) => { console.error(error); process.exit(1); });
