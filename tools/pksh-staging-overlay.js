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
  return snapshot.items.map((item) => {
    if (!item || item.school !== "pksh" || !/^pksh-\d+$/.test(item.id || "") ||
        !String(item.url || "").startsWith("https://www.pksh.ylc.edu.tw/ischool/public/news_view/show.php?nid=")) {
      throw new Error("invalid PKSH staging snapshot item");
    }
    const publicItem = {};
    for (const key of Object.keys(item)) {
      if (!ALLOWED.has(key)) throw new Error("PKSH staging snapshot contains protected content");
      publicItem[key] = item[key];
    }
    publicItem.category = "一般";
    publicItem.first_seen = snapshot.fetched_at || "";
    return publicItem;
  });
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

module.exports = { applyPkshSnapshot, safeItems };
