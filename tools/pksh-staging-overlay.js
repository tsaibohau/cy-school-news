"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ALLOWED = new Set([
  "id", "school", "school_name", "title", "url", "date",
  "date_source", "source_category",
]);
const MAX_PKSH_ANNOUNCEMENTS = 3000;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 1) + "\n");
}

function safeItems(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.items) || !snapshot.items.length || snapshot.items.length > MAX_PKSH_ANNOUNCEMENTS) {
    throw new Error("invalid PKSH staging snapshot count");
  }
  const seen = new Set();
  const items = [];
  for (const item of snapshot.items) {
    const idMatch = /^pksh-(\d+)$/.exec(String(item && item.id || ""));
    const urlMatch = /^https:\/\/www\.pksh\.ylc\.edu\.tw\/ischool\/public\/news_view\/show\.php\?nid=(\d+)$/.exec(String(item && item.url || ""));
    if (!item || item.school !== "pksh" || !idMatch || !urlMatch ||
        idMatch[1] !== urlMatch[1] || !String(item.title || "").trim() || seen.has(item.id)) {
      continue;
    }
    const publicItem = {};
    for (const key of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(item, key)) publicItem[key] = item[key];
    }
    publicItem.category = "一般";
    publicItem.first_seen = snapshot.fetched_at || "";
    seen.add(item.id);
    items.push(publicItem);
  }
  if (!items.length) throw new Error("PKSH snapshot contains no valid announcement items");
  return items;
}

function applyPkshSnapshot(output, snapshotPath) {
  const snapshot = readJson(snapshotPath);
  const items = safeItems(snapshot);
  const data = path.join(output, "data");
  const currentPath = path.join(data, "announcements.json");
  const current = readJson(currentPath);
  current.items = items.concat((current.items || []).filter((item) => item.school !== "pksh"));
  current.generated_at = snapshot.fetched_at || current.generated_at;
  writeJson(currentPath, current);

  const schoolPath = path.join(data, "schools", "pksh", "current.json");
  const school = readJson(schoolPath);
  school.items = items;
  school.generated_at = snapshot.fetched_at || school.generated_at;
  writeJson(schoolPath, school);

  const manifestPath = path.join(data, "schools", "manifest.json");
  const manifest = readJson(manifestPath);
  const pksh = (manifest.schools || []).find((entry) => entry.id === "pksh");
  if (!pksh) throw new Error("PKSH is missing from the school manifest");
  pksh.current_count = items.length;
  manifest.generated_at = snapshot.fetched_at || manifest.generated_at;
  writeJson(manifestPath, manifest);
}

if (require.main === module) {
  const [, , output, snapshotPath] = process.argv;
  if (!output || !snapshotPath) {
    console.error("usage: node tools/pksh-staging-overlay.js <docs-dir> <snapshot.json>");
    process.exit(2);
  }
  applyPkshSnapshot(output, snapshotPath);
}

module.exports = { applyPkshSnapshot, safeItems };
