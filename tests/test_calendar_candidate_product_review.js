"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "docs/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "docs/index.html"), "utf8");
const style = fs.readFileSync(path.join(root, "docs/style.css"), "utf8");
const build = fs.readFileSync(path.join(root, "tools/build-staging.js"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "tools/staging/calendar-parser-1151-review.js"), "utf8");

assert.match(bootstrap, /review\/calendar-parser-1151\/candidate-calendar-events\.json/);
assert.match(build, /calendarReviewHtml = html/);
assert.match(build, /calendar-parser-1151-review\.js/);
assert.match(app, /calendarReview && tab === "calendar"/);
assert.match(app, /calendarReview && !hasSignedInAccount\(\) \? \[\] : state\.userEvents/);
assert.match(app, /候選官方行事曆（唯讀）/);
assert.match(app, /ev\.kind === "user" && \(!calendarReview \|\| hasSignedInAccount\(\)\)/);
assert.match(app, /if \(calendarReview && !hasSignedInAccount\(\)\) return;/);
assert.match(html, /id="eventImportance"/);
assert.match(html, /value="important">重要/);
assert.match(html, /value="normal" selected>一般/);
assert.match(html, /value="reference">參考/);
assert.match(html, /CYSH「元旦放」/);
assert.match(html, /CYGSH 三筆重複/);
assert.match(html, /CYSH 跨日事件/);
assert.match(app, /importance-' \+ eventImportance\(ev\)/);
assert.match(style, /\.day-dot\.importance-important/);
assert.match(style, /\.day-dot\.importance-reference/);
assert.match(style, /\.agenda-item\.importance-important/);
assert.match(style, /\.agenda-item\.importance-reference/);
assert.doesNotMatch(build, /copyFileSync\(path\.join\(staging, "calendar-parser-1151-review\.html"/);

console.log("Candidate full calendar product review contracts passed");
