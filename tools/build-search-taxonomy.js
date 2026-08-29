"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const taxonomy = JSON.parse(fs.readFileSync(path.join(root, "search-taxonomy.json"), "utf8"));
const rendered = "/* Generated from search-taxonomy.json; see tools/build-search-taxonomy.js. */\n" +
  "(function (root) {\n  \"use strict\";\n  var taxonomy = " + JSON.stringify(taxonomy) + ";\n" +
  "  root.CyNewsSearchTaxonomy = taxonomy;\n  if (typeof module !== \"undefined\" && module.exports) module.exports = taxonomy;\n})(typeof window !== \"undefined\" ? window : this);\n";
const target = path.join(root, "docs", "search-taxonomy.js");
if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8") !== rendered) throw new Error("docs/search-taxonomy.js is stale; run node tools/build-search-taxonomy.js");
} else fs.writeFileSync(target, rendered);
