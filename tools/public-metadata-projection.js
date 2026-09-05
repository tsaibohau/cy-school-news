"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_ITEM_FIELDS = [
  "id", "title", "date", "source_category", "school", "school_name",
  "url", "category", "first_seen", "important", "importance", "source_pin",
];

function projectItem(item) {
  const projected = {};
  PUBLIC_ITEM_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(item || {}, field)) projected[field] = item[field];
  });
  return projected;
}

function projectCorpusFile(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(data.items)) return false;
  data.items = data.items.map(projectItem);
  data.content_access = "approved-account-required";
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
  return true;
}

function sanitizePublicData(root) {
  const dataRoot = path.join(root, "data");
  const corpusFiles = [
    path.join(dataRoot, "announcements.json"),
    path.join(dataRoot, "archive.json"),
  ];
  const schoolsRoot = path.join(dataRoot, "schools");
  if (fs.existsSync(schoolsRoot)) {
    fs.readdirSync(schoolsRoot, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isDirectory()) return;
      corpusFiles.push(path.join(schoolsRoot, entry.name, "current.json"));
      corpusFiles.push(path.join(schoolsRoot, entry.name, "archive.json"));
    });
  }
  corpusFiles.filter(fs.existsSync).forEach(projectCorpusFile);

  const detailsRoot = path.join(dataRoot, "details");
  if (fs.existsSync(detailsRoot)) fs.rmSync(detailsRoot, { recursive: true, force: true });
}

module.exports = { PUBLIC_ITEM_FIELDS, projectItem, projectCorpusFile, sanitizePublicData };
