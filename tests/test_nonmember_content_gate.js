"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "docs", "app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "docs", "index.html"), "utf8");
const projection = fs.readFileSync(path.join(root, "tools", "public-metadata-projection.js"), "utf8");

assert.match(app, /if \(!hasSignedInAccount\(\)\) return "";/, "nonmembers cannot render snippets");
assert.match(app, /announcementScore\(searchableItem\(it\), q\)/, "nonmember search cannot inspect hidden body fields");
assert.match(app, /公告內文僅提供給已核准會員/, "direct detail calls fail closed");
assert.match(app, /前往校網原文/, "nonmembers retain the official source route");
assert.match(index, /公告內文不對非會員提供/, "public access boundary is explained plainly");
assert.match(projection, /PUBLIC_ITEM_FIELDS/);
assert.match(projection, /fs\.rmSync\(detailsRoot/, "downloadable detail files are removed from the public build");
console.log("Nonmember announcement-content gate tests passed");
