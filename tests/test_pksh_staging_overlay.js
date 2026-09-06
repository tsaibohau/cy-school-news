"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { applyPkshSnapshot, safeItems } = require("../tools/pksh-staging-overlay.js");

const root = path.resolve(__dirname, "..");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "pksh-staging-overlay-"));
fs.cpSync(path.join(root, "docs", "data"), path.join(output, "data"), { recursive: true });
const snapshot = path.join(output, "pksh.json");
fs.writeFileSync(snapshot, JSON.stringify({
  fetched_at: "2026-09-06T00:00:00Z",
  items: [{
    id: "pksh-28123", school: "pksh", school_name: "北港高中",
    title: "測試公告", url: "https://www.pksh.ylc.edu.tw/ischool/public/news_view/show.php?nid=28123",
    date: "2026-09-06", date_source: "list", source_category: "教務處",
  }],
}));
applyPkshSnapshot(output, snapshot);
const combined = JSON.parse(fs.readFileSync(path.join(output, "data", "announcements.json")));
const school = JSON.parse(fs.readFileSync(path.join(output, "data", "schools", "pksh", "current.json")));
const manifest = JSON.parse(fs.readFileSync(path.join(output, "data", "schools", "manifest.json")));
assert.equal(combined.items.filter((item) => item.school === "pksh").length, 1);
assert.equal(school.items.length, 1);
assert.equal(manifest.schools.find((entry) => entry.id === "pksh").current_count, 1);
assert(!("summary" in school.items[0]) && !("snippet" in school.items[0]) && !("detail_ref" in school.items[0]));
assert.equal(safeItems({ items: Array.from({ length: 201 }, (_, index) => ({
  id: "pksh-" + (30000 + index), school: "pksh", school_name: "北港高中",
  title: "公告", url: "https://www.pksh.ylc.edu.tw/ischool/public/news_view/show.php?nid=" + (30000 + index),
  date: "2026-09-06", date_source: "list", source_category: "教務處",
})) }).length, 201);
const mixed = safeItems({ fetched_at: "2026-09-06T00:00:00Z", items: [
  {
    id: "pksh-40001", school: "pksh", school_name: "北港高中", title: "有效公告",
    url: "https://www.pksh.ylc.edu.tw/ischool/public/news_view/show.php?nid=40001",
    date: "2026-09-06", summary: "不得公開的內容",
  },
  { id: "pksh-bad", school: "pksh", title: "錯誤公告", url: "https://example.test/bad" },
  {
    id: "pksh-40001", school: "pksh", title: "重複公告",
    url: "https://www.pksh.ylc.edu.tw/ischool/public/news_view/show.php?nid=40001",
  },
] });
assert.equal(mixed.length, 1, "one malformed row must not reject the valid announcements");
assert.equal(mixed[0].id, "pksh-40001");
assert.equal("summary" in mixed[0], false, "protected fields are removed instead of blocking the batch");
assert.throws(() => safeItems({ items: [{ id: "bad" }] }), /no valid announcement items/);

const cliOutput = fs.mkdtempSync(path.join(os.tmpdir(), "pksh-staging-overlay-cli-"));
fs.cpSync(path.join(root, "docs", "data"), path.join(cliOutput, "data"), { recursive: true });
execFileSync(process.execPath, [path.join(root, "tools", "pksh-staging-overlay.js"), cliOutput, snapshot]);
const cliCombined = JSON.parse(fs.readFileSync(path.join(cliOutput, "data", "announcements.json")));
const cliSchool = JSON.parse(fs.readFileSync(path.join(cliOutput, "data", "schools", "pksh", "current.json")));
const cliManifest = JSON.parse(fs.readFileSync(path.join(cliOutput, "data", "schools", "manifest.json")));
const cliCounts = [
  cliCombined.items.filter((item) => item.school === "pksh").length,
  cliSchool.items.length,
  cliManifest.schools.find((entry) => entry.id === "pksh").current_count,
];
assert.deepEqual(cliCounts, [1, 1, 1], "the workflow CLI must update every PKSH production corpus");

fs.rmSync(output, { recursive: true, force: true });
fs.rmSync(cliOutput, { recursive: true, force: true });
console.log("PKSH staging overlay tests passed");
