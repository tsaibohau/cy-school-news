"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(root, "docs", "index.html"), "utf8");
const style = fs.readFileSync(path.join(root, "docs", "style.css"), "utf8");
const app = fs.readFileSync(path.join(root, "docs", "app.js"), "utf8");

assert.match(index, /立即檢查更新/, "refresh control uses truthful wording across staging and production");
assert.match(index, /id="refreshState"[^>]*role="status"[^>]*aria-live="polite"/, "refresh progress is announced accessibly");
assert.match(app, /正在取得雲端已發布資料/);
assert.match(app, /同步完成；雲端尚未發布新版本/);
assert.match(app, /目前顯示離線快取，未取得雲端新資料/);
assert.match(style, /\.brand h1 \{ font-family: var\(--serif\)/, "editorial typography is scoped to headings, not body copy");
assert.match(style, /#btnRefresh\.is-refreshing svg/);
assert.match(style, /@media \(prefers-reduced-motion: reduce\)/, "motion preference remains respected");
assert.ok((style.match(/@media \(prefers-color-scheme: dark\)/g) || []).length >= 2,
  "the final editorial palette preserves a readable dark variant");
assert.match(index, /style\.css\?v=38/);
assert.match(index, /app\.js\?v=38/);

console.log("Editorial UI and honest refresh status contract tests passed");
