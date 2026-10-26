"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_ITEM_FIELDS = [
  "id", "title", "date", "source_category", "school", "school_name",
  "url", "category", "first_seen", "important", "importance", "source_pin",
];

const Relevance = require("../docs/relevance.js");

// Scraper bookkeeping, not announcement content. Keeping it lets the next run
// skip pages it already fetched instead of re-requesting the newest ones forever.
const PUBLIC_STATE_FIELDS = ["detail_status", "detail_attempts", "date_tried", "snippet_tried"];

// Short facts for 我的今日: labelled full-year dates and the target audience.
// No body text is published; dates come from detail_parser's verified_dates.
const PUBLIC_DATE_PROVENANCE = new Set(["verified_announcement_deadline", "verified_announcement_event"]);
const MAX_PUBLIC_DATES = 10;

function publicCalendarEvents(item) {
  const rows = Array.isArray(item.calendar_events) ? item.calendar_events : [];
  return rows.filter((row) => row && (row.kind === "deadline" || row.kind === "event")
      && /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || "")) && PUBLIC_DATE_PROVENANCE.has(row.provenance))
    .slice(0, MAX_PUBLIC_DATES)
    .map((row) => ({ kind: row.kind, date: row.date, provenance: row.provenance, source_revision: String(row.source_revision || "") }));
}

function publicAudience(item) {
  const previous = item.audience && typeof item.audience === "object" ? item.audience : {};
  const found = Relevance.extractAudience(item);
  const grades = Array.from(new Set([].concat(previous.grades || [], found.grades || []).map(Number)))
    .filter((grade) => grade === 1 || grade === 2 || grade === 3).sort();
  const classes = Array.from(new Set([].concat(previous.classes || [], found.classes || []).map(String)))
    .filter((name) => /^\d{3}$/.test(name)).sort().slice(0, 40);
  const allSchool = !!(previous.all_school || found.all_school);
  return grades.length || classes.length || allSchool ? { grades, classes, all_school: allSchool } : null;
}

function projectItem(item) {
  item = item || {};
  const projected = {};
  PUBLIC_ITEM_FIELDS.concat(PUBLIC_STATE_FIELDS).forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(item, field)) projected[field] = item[field];
  });
  // The snippet itself stays member-only; remember that it was already fetched.
  if (String(item.snippet || "").trim()) projected.snippet_tried = true;
  const events = publicCalendarEvents(item);
  if (events.length) projected.calendar_events = events;
  const audience = publicAudience(item);
  if (audience) projected.audience = audience;
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

module.exports = { PUBLIC_ITEM_FIELDS, PUBLIC_STATE_FIELDS, publicCalendarEvents, publicAudience, projectItem, projectCorpusFile, sanitizePublicData };

if (require.main === module) {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!target || !fs.existsSync(path.join(target, "data"))) {
    throw new Error("usage: node tools/public-metadata-projection.js <public-root>");
  }
  sanitizePublicData(target);
  console.log("Public announcement data contains metadata only");
}
