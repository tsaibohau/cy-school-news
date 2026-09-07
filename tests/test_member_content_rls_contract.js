"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase", "migrations", "20260905115331_protected_announcement_member_content.sql"), "utf8");
const schemaGrant = fs.readFileSync(path.join(root, "supabase", "migrations", "20260907071914_grant_private_schema_usage_to_service_role.sql"), "utf8");
const permissionTest = fs.readFileSync(path.join(root, "supabase", "tests", "database", "member_content_permissions.test.sql"), "utf8");
const auth = fs.readFileSync(path.join(root, "docs", "account-auth.js"), "utf8");
const app = fs.readFileSync(path.join(root, "docs", "app.js"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "scrape-hourly.yml"), "utf8");

assert.match(sql, /create table if not exists private\.announcement_member_content/);
assert.match(sql, /enable row level security/);
assert.match(sql, /revoke all on private\.announcement_member_content from public, anon, authenticated/);
assert.match(sql, /access\.status = 'approved'/);
assert.match(sql, /revoke all on function public\.member_announcement_index\(integer, integer\) from public, anon/);
assert.match(sql, /revoke all on function public\.member_announcement_detail\(text\) from public, anon/);
assert.match(sql, /grant execute on function public\.member_announcement_index\(integer, integer\) to authenticated/);
assert.match(sql, /grant execute on function public\.member_announcement_detail\(text\) to authenticated/);
assert.match(sql, /revoke all on function public\.upsert_announcement_member_content\(jsonb\)[\s\S]*from public, anon, authenticated/);
assert.match(sql, /grant execute on function public\.upsert_announcement_member_content\(jsonb\) to service_role/);
assert.equal(schemaGrant.trim(), "grant usage on schema private to service_role;");
assert.doesNotMatch(schemaGrant, /\b(?:anon|authenticated)\b/i);
assert.doesNotMatch(schemaGrant, /grant\s+create/i);
assert.match(permissionTest, /has_schema_privilege\('service_role', 'private', 'USAGE'\)/);
assert.match(permissionTest, /not has_schema_privilege\('anon', 'private', 'USAGE'\)/);
assert.match(permissionTest, /not has_schema_privilege\('authenticated', 'private', 'USAGE'\)/);
assert.match(permissionTest, /set local role service_role[\s\S]*upsert_announcement_member_content/);
assert.match(permissionTest, /set local role anon[\s\S]*private\.announcement_member_content/);
assert.match(permissionTest, /set local role authenticated[\s\S]*private\.announcement_member_content/);
assert.match(permissionTest, /rollback;/);
assert.doesNotMatch(sql, /auth\.role\(\)/);
assert.match(auth, /rpc\("member_announcement_index"/);
assert.match(auth, /rpc\("member_announcement_detail"/);
assert.match(app, /auth\.getMemberAnnouncementIndex\(\)/);
assert.match(app, /accountAuth\.getMemberAnnouncementDetail\(item\.id\)/);
assert.doesNotMatch(app, /fetch\(item\.detail_ref/);
assert.match(workflow, /node tools\/export-member-content\.js \.member-content-sync/);
assert.match(workflow, /node tools\/public-metadata-projection\.js docs/);
assert.ok(workflow.indexOf("export-member-content.js") < workflow.indexOf("public-metadata-projection.js"), "protected export must happen before public sanitization");

console.log("Protected announcement member-content SQL contract passed");
