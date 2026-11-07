/* 載入效能的接線檢查：公告資料提早下載、字型不擋繪製、問校務引擎延後載入但仍保持順序。 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const docs = path.join(__dirname, "..", "docs");
const index = fs.readFileSync(path.join(docs, "index.html"), "utf8");
const app = fs.readFileSync(path.join(docs, "app.js"), "utf8");

/* head 提早 fetch，URL 與 app.js 的 dataFetch(revalidate) 一致 */
assert.match(index, /window\.__cyNewsEarly/);
assert.match(index, /start\("data\/announcements\.json"\)/);
assert.match(app, /window\.__cyNewsEarly/);
assert.ok(index.indexOf("__cyNewsEarly") < index.indexOf('src="account-config.js'), "early fetch starts before the script chain");

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
