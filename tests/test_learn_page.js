/* 教學頁：公開、從設定頁和頁尾都點得到、離線可讀、不含任何秘密。 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const docs = path.join(__dirname, "..", "docs");
const page = fs.readFileSync(path.join(docs, "learn.html"), "utf8");
const index = fs.readFileSync(path.join(docs, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(docs, "sw.js"), "utf8");

assert.match(index, /<a id="learnEntry"[^>]*href="learn\.html"/, "設定頁有教學入口");
assert.match(index, /<a href="learn\.html">教學：程式寫法<\/a>/, "頁尾有教學連結");
assert.match(sw, /"\.\/learn\.html"/, "教學頁可離線讀");

const chapters = page.match(/<section class="chapter" id="c\d+">/g) || [];
assert.strictEqual(chapters.length, 10);
for (let i = 1; i <= 10; i++) {
  assert.ok(page.includes(`href="#c${i}"`), `目錄連到第 ${i} 章`);
  assert.ok(page.includes(`data-done="c${i}"`), `第 ${i} 章有閱讀勾選`);
}
assert.match(page, /time\.sleep\(1\.5\)/, "教學示範對學校伺服器友善的間隔");

// 公開頁面：不得出現金鑰、Token、專案代號或限制學校的資料
assert.doesNotMatch(page, /sb_publishable_|sb_secret_|service_role|eyJhbGci|ghp_|github_pat_/);
assert.doesNotMatch(page, /oppdhtnepjagdwovndra|supabase\.co/);
assert.doesNotMatch(page, /restricted-data-sync|x-announcement-content-sync-token|ANNOUNCEMENT_CONTENT_SYNC/);
assert.doesNotMatch(page, /嘉女|cygsh|innerHTML\s*=/);

console.log("✓ 教學頁");
