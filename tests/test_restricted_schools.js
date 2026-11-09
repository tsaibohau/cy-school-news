/* 只有嘉中公開；嘉女和其他學校只給聯席管理員以上（owner、co_admin）。 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.join(__dirname, "..");
delete require.cache[require.resolve("../docs/school-registry.js")];
const Registry = require("../docs/school-registry.js");

// 一般訪客（預設、確認身分前）：只看得到嘉中
Registry.setAdminViewer(false);
assert.deepStrictEqual(Registry.schools().map((s) => s.id), ["cysh"]);
assert.strictEqual(Registry.find("cygsh"), null, "嘉女 is not found for guests");
assert.strictEqual(Registry.find("pksh"), null);
assert.strictEqual(Registry.mentionedSchool("嘉女有收男生嗎"), null, "a restricted school is never resolved for guests");
assert.ok(Registry.hiddenIds().cygsh && Registry.hiddenIds().pksh && !Registry.hiddenIds().cysh);
assert.ok(Registry.hiddenNames().indexOf("嘉女") !== -1);
assert.strictEqual(Registry.find("cysh").short, "嘉中");

// 聯席管理員以上：全部學校
assert.strictEqual(Registry.setAdminViewer(true), true, "reports a change");
assert.ok(Registry.schools().length > 50);
assert.strictEqual(Registry.find("cygsh").short, "嘉女");
assert.strictEqual(Registry.setAdminViewer(true), false, "no change, no reload");
Registry.setAdminViewer(false);

// app.js：身分改變時重載；看不到的學校的行事曆、課表、跨校比對不出現；問到時照實說沒開放
const app = fs.readFileSync(path.join(repo, "docs", "app.js"), "utf8");
assert.match(app, /if \(syncAdminSchoolView\(access\.status === "approved" && !!access\.is_admin\)\) return;/);
assert.match(app, /if \(syncAdminSchoolView\(false\)\) return;/, "signing out returns to the guest view");
assert.match(app, /return ev && visibleSchool\(ev\) && \(ev\.start_date/, "calendar events of hidden schools are dropped");
assert.match(app, /data\.timetables\.filter\(visibleSchool\)/, "timetables of hidden schools are dropped");
assert.match(app, /SCHOOL_REGISTRY\.schools\(\)\.length < 2/, "cross-school view is off with one school");
assert.match(app, /的內容目前沒有開放。問校務現在可以問/);

// 頁面說明只寫嘉義高中
const index = fs.readFileSync(path.join(repo, "docs", "index.html"), "utf8");
assert.match(index, /<span class="mast-sub">嘉義高中公告彙整<\/span>/);
assert.doesNotMatch(index, /嘉義女中官網/);
const manifest = fs.readFileSync(path.join(repo, "docs", "manifest.webmanifest"), "utf8");
assert.doesNotMatch(manifest, /嘉義女中/);

// 資料庫：會員內文依學校擋下
const sql = fs.readFileSync(path.join(repo, "supabase", "migrations", "20261108190000_restricted_schools_admin_only.sql"), "utf8");
assert.match(sql, /like 'cysh-%'[\s\S]*is_active_app_admin/);
assert.match(sql, /function public\.member_announcement_detail[\s\S]*can_view_school_content\(target_announcement_id\)/);
assert.match(sql, /function public\.member_announcement_index[\s\S]*\(admin_view or c\.announcement_id like 'cysh-%'\)/);
assert.match(sql, /function public\.member_historical_reference_index[\s\S]*school_filter <> 'cysh' and not public\.is_active_app_admin/);

// 電子報只寄嘉中
const digest = fs.readFileSync(path.join(repo, "supabase", "functions", "announcement-email-digest", "digest.js"), "utf8");
assert.match(digest, /schools: \["cysh"\]/);

console.log("✓ 只有嘉中公開，其他學校限聯席管理員以上");
