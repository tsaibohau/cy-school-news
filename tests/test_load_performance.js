/* 載入效能的接線檢查：公告資料提早下載、字型不擋繪製、問校務引擎延後載入但仍保持順序。 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const docs = path.join(__dirname, "..", "docs");
const index = fs.readFileSync(path.join(docs, "index.html"), "utf8");
const app = fs.readFileSync(path.join(docs, "app.js"), "utf8");

/* head 提早 fetch，URL 與 app.js 的 dataFetch(revalidate) 一致 */
assert.match(index, /window\.__cyNewsEarly/);
assert.match(index, /start\("data\/announcements-latest\.json"\)/, "the first-load snapshot is prefetched, not the 8 MB full file");
assert.ok(!/start\("data\/announcements\.json"\)/.test(index), "the full file is not on the critical path");
assert.match(app, /window\.__cyNewsEarly/);
assert.ok(index.indexOf("__cyNewsEarly") < index.indexOf('src="account-config.js'), "early fetch starts before the script chain");

/* app.js 先用精簡快照，完整檔案之後再載入；快照不存在時退回完整檔案 */
assert.match(app, /announcements-latest\.json/);
assert.match(app, /function loadFullData\(\)/);
assert.match(app, /function renderAllChunked\(\)/, "the full-data swap re-renders in small tasks");
assert.match(app, /loadFullData\(\)\.then\(function \(\) \{ return askAssistant\(question\); \}\)/, "asking waits for the full data");
assert.match(app, /latest\.json/, "per-school snapshot");
/* 公告列表不等「已刪除公告」RPC（要先載入 Supabase）；會員摘要延後下載 */
assert.match(app, /accountAuth\.getDeletedAnnouncementIds\(\)\.then\(applyDeletedIds\)/);
assert.doesNotMatch(app, /return deletedIds\.then/);
assert.match(app, /function deferredMemberIndex\(auth\)/);
assert.doesNotMatch(app, /auth\.getMemberAnnouncementIndex\(\)\.then/, "member summaries do not compete with the first page");
/* Supabase 程式庫提早下載，網址與 account-auth.js 相同 */
const clientUrl = /CLIENT_VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(docs, "account-auth.js"), "utf8"));
assert.ok(clientUrl && index.includes("@supabase/supabase-js@" + clientUrl[1] + "/+esm"), "head preloads the same Supabase module URL");
/* Service Worker 安裝時不預載大型資料檔 */
const sw = fs.readFileSync(path.join(docs, "sw.js"), "utf8");
assert.ok(!/SHELL = \[[^\]]*data\//.test(sw), "no data files in the install-time precache");

/* 網路字型不是 render-blocking <link rel=stylesheet> */
assert.ok(!/<link[^>]+rel="stylesheet"[^>]+fonts\.googleapis\.com/.test(index.replace(/<noscript>[\s\S]*?<\/noscript>/g, "")), "font css must not block first paint");
assert.match(app, /__cyNewsLoadFonts/);

/* 問校務引擎：延後載入，順序 qa-typo -> answer-composer -> assistant-qa 不變 */
const lazy = [...index.matchAll(/<script type="text\/lazy-assistant" data-lazy-src="([^"]+)"/g)].map((m) => m[1].split("?")[0]);
assert.deepStrictEqual(lazy, ["qa-typo.js", "answer-composer.js", "assistant-qa.js"]);
assert.ok(!/<script src="assistant-qa\.js/.test(index), "assistant-qa.js is not a blocking script");
assert.match(app, /function ensureAssistant\(\)/);
assert.match(app, /ensureAssistant\(\)\.then\(function \(ok\) \{ return ok \? askAssistant/);

/* Service Worker 等第一份公告畫出後才註冊 */
assert.match(app, /__cyNewsFirstPaintDone/);
console.log("load performance wiring: ok");
