const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(root, "docs/index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "docs/app.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260830120000_account_least_privilege.sql"), "utf8");
const retention = fs.readFileSync(path.join(root, "docs/privacy-retention-policy.md"), "utf8");

assert.match(index, /id="accountDeleteCloud"/);
assert.match(index, /刪除已同步資料/);
assert.match(app, /\.deleteOwnData\(\)/);
assert.match(app, /clearAccountData\(deletionUid\)/);
assert.match(app, /不會刪除 Google 帳號/);
assert.match(migration, /revoke truncate, references, trigger/i);
assert.match(migration, /to authenticated[\s\S]*select auth\.uid\(\)/i);
assert.match(retention, /尚未有已部署排程/);
assert.match(retention, /Supabase Auth 登入識別/);

console.log("Privacy and least-privilege control tests passed");
