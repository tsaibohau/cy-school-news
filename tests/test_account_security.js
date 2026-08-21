const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/001_account_sync_v1.sql"), "utf8");
for (const table of ["user_subscriptions", "user_reads", "user_preferences"]) {
  assert(migration.includes(`alter table public.${table} enable row level security`));
  assert(migration.includes(`auth.uid() = user_id`));
  assert(migration.includes(`revoke all on public.${table} from anon`));
  assert(migration.includes("authenticated"));
}
const tracked = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === ".git" || name === "data") continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (name !== "test_account_security.js" && /\.(js|py|sql|yml|yaml|json|md)$/.test(name)) tracked.push(p);
  }
}
walk(root);
const joined = tracked.map(p => fs.readFileSync(p, "utf8")).join("\n");
assert(!joined.match(/service_role\s*[:=]\s*["'][^"']+/i), "privileged service_role key must not be committed");
assert(!joined.match(/SUPABASE_DB_PASSWORD|postgresql:\/\//i), "database credential must not be committed");
console.log("Account security static checks passed");
