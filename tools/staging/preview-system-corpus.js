"use strict";
const fs = require("node:fs"), path = require("node:path");
const { projectItem } = require("../public-metadata-projection.js");
// Existing branch snapshot only. No database, school website, or Production request.
function loadCorpus(root = path.resolve(__dirname, "../..")) {
  const current = JSON.parse(fs.readFileSync(path.join(root, "docs/data/announcements.json"), "utf8"));
  const archive = JSON.parse(fs.readFileSync(path.join(root, "docs/data/archive.json"), "utf8"));
  const byId = new Map();
  for (const item of [...archive.items, ...current.items]) {
    if (["cysh", "cygsh"].includes(item.school) && /^(cysh|cygsh)-[A-Za-z0-9._-]+$/.test(item.id || "")) byId.set(item.id, projectItem(item));
  }
  return { ...current, schools: current.schools.filter(s => ["cysh", "cygsh"].includes(s.id)),
    items: [...byId.values()].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || a.id.localeCompare(b.id)),
    content_access: "metadata-only-body-unavailable", snapshot_scope: "branch-current-and-history" };
}
module.exports = { loadCorpus };
