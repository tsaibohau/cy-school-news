"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const View = require("../docs/series-view.js");
const app = fs.readFileSync(path.join(root, "docs", "app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "docs", "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "docs", "sw.js"), "utf8");
const css = fs.readFileSync(path.join(root, "docs", "style.css"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "scrape-hourly.yml"), "utf8");

/* ── the view model ── */
assert.equal(View.label("聯合盃作文比賽", 5, [112, 115]), "聯合盃作文比賽（5 則・112–115 學年）");
assert.equal(View.label("校慶", 3, [114, 114]), "校慶（3 則・114 學年）");
assert.equal(View.label("校慶", 3, [0, 0]), "校慶（3 則）");

const items = {};
function add(id, title, date, school_name) { items[id] = { id, title, date, url: "https://example.test/" + id, school_name: school_name || "嘉中" }; }
add("a1", "112學年度聯合盃作文比賽簡章", "2023-09-10");
add("a2", "112學年度聯合盃作文比賽得獎名單", "2024-01-15");
add("a3", "113學年度聯合盃作文比賽簡章", "2024-09-12");
add("a4", "115學年度聯合盃作文比賽報名", "2026-09-15");
add("b1", "高一英文營", "2025-06-01");
add("b2", "高一英文營", "2026-06-01");
const doc = { schema_version: 1, series: [
  { id: "s_1", name: "聯合盃作文比賽", school: "cysh", category: "競賽", years: [112, 115],
    members: [{ id: "a1", year: 112, stage: "簡章" }, { id: "a2", year: 112, stage: "得獎" }, { id: "a3", year: 113, stage: "簡章" }, { id: "a4", year: 115, stage: "報名" }, { id: "gone", year: 114, stage: "報名" }] },
  { id: "s_2", name: "高一英文營", school: "cysh", category: "研習活動", years: [114, 115], members: [{ id: "b1", year: 114, stage: "" }, { id: "b2", year: 115, stage: "" }] },
  { id: "s_3", name: "只剩一則", school: "cysh", category: "競賽", years: [114, 114], members: [{ id: "a1", year: 114, stage: "" }, { id: "missing", year: 115, stage: "" }] },
] };

let list = View.forCategory(doc, { category: "競賽", items });
assert.equal(list.length, 1, "only series of this category with >= 2 loaded notices");
assert.equal(list[0].label, "聯合盃作文比賽（4 則・112–115 學年）", "unloaded members are not counted");
assert.deepEqual(list[0].groups.map((g) => g.year), [112, 113, 115], "timeline groups run oldest academic year first");
assert.deepEqual(list[0].groups[0].rows.map((r) => r.stage), ["簡章", "得獎"], "stage order inside a year is kept");
assert.equal(View.yearTitle(113), "113 學年度");
assert.equal(View.yearTitle(0), "未標示學年度");
assert.equal(View.forCategory(doc, { category: "all", items }).length, 2, "all categories");
assert.equal(View.forCategory(doc, { category: "競賽", school: "cygsh", items }).length, 0, "school filter");
assert.equal(View.forCategory(doc, { category: "競賽", items, hidden: (it) => it.id === "a1" || it.id === "a2" })[0].count, 2, "hidden notices are dropped");
assert.deepEqual(View.forCategory(null, { category: "競賽", items }), []);
assert.deepEqual(View.forCategory({ series: [] }, { category: "競賽", items }), []);

/* newest activity first */
add("c1", "活動甲", "2026-10-01"); add("c2", "活動甲", "2025-10-01"); add("d1", "活動乙", "2024-10-01"); add("d2", "活動乙", "2023-10-01");
const two = { series: [
  { id: "x", name: "活動乙", school: "cysh", category: "競賽", members: [{ id: "d1", year: 113 }, { id: "d2", year: 112 }] },
  { id: "y", name: "活動甲", school: "cysh", category: "競賽", members: [{ id: "c1", year: 115 }, { id: "c2", year: 114 }] } ] };
assert.deepEqual(View.forCategory(two, { category: "競賽", items }).map((s) => s.id), ["y", "x"]);

/* ── wiring ── */
assert.match(index, /<script src="series-view\.js\?v=\d+"><\/script>\s*\n?(?:.*\n){0,12}.*<script src="app\.js/, "series-view.js loads before app.js");
assert(index.indexOf("series-view.js") < index.indexOf("app.js?v="), "series-view.js precedes app.js");
assert.match(sw, /\.\/series-view\.js\?v=\d+/, "offline shell includes the module");
assert.match(app, /fetch\("data\/series\.json\?_="/, "series.json is fetched on demand");
assert(!/data\/series\.json/.test(index) && !/series\.json/.test(sw), "series.json is not preloaded or cached by the shell");
assert.match(app, /function seriesBlockHTML\(\)[\s\S]*state\.cat === "all" \|\| state\.q/, "series list only under a chosen category and not while searching");
assert.match(app, /el\.list\.innerHTML = seriesBlockHTML\(\) \+/, "series list is rendered above the notices of the category");
assert.match(app, /<details class="series-item"/);
assert.match(app, /esc\(r\.url\)/, "links are escaped");
assert.match(css, /\.series-item\b/);
assert.match(css, /\.series-timeline\b/);

/* ── the generator step ── */
assert.match(workflow, /python scraper\/event_series\.py/, "series.json is produced in the scrape job");
assert(workflow.indexOf("python scraper/event_series.py") > workflow.indexOf("tools/public-metadata-projection.js"), "runs after member content is stripped");
assert(workflow.indexOf("python scraper/event_series.py") < workflow.indexOf("git commit -m"), "and before the data commit");
assert.match(workflow, /git add -A docs\/data/, "docs/data (incl. series.json) is committed by the bot");
assert.doesNotMatch(workflow, /cron:/, "no schedule is added to the hourly job");
const generator = fs.readFileSync(path.join(root, "scraper", "event_series.py"), "utf8");
assert(!/(?:get\(|\[)["'](snippet|summary|detail_ref|body|content|tokens|calendar_events)["']/.test(generator), "generator reads titles/dates/school/category only");

console.log("series view ok");
