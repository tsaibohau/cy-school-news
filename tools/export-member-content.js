"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MAX_BATCH_RECORDS = 120;
const DEFAULT_MAX_BATCH_BYTES = 1_500_000;
const MAX_DETAIL_BYTES = 600_000;

function safeDetailPath(root, detailRef) {
  const docsRoot = path.resolve(root, "docs");
  const detailsRoot = path.resolve(docsRoot, "data", "details");
  const candidate = path.resolve(docsRoot, String(detailRef || ""));
  if (candidate !== detailsRoot && !candidate.startsWith(detailsRoot + path.sep)) return null;
  return candidate;
}

function loadProtectedDetail(root, item) {
  if (!item || !item.detail_ref) return null;
  const file = safeDetailPath(root, item.detail_ref);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const detail = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!detail || detail.provenance !== "official_article") return null;
    if (String(detail.announcement_id || "") !== String(item.id || "")) return null;
    if (item.detail_revision && String(detail.source_hash || "") !== String(item.detail_revision)) return null;
    const bytes = Buffer.byteLength(JSON.stringify(detail), "utf8");
    if (bytes > MAX_DETAIL_BYTES) return null;
    return detail;
  } catch (_error) {
    return null;
  }
}

function readCorpus(root) {
  const records = new Map();
  for (const name of ["archive.json", "announcements.json"]) {
    const file = path.join(root, "docs", "data", name);
    const corpus = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const item of corpus.items || []) {
      const id = String(item.id || "");
      if (id) records.set(id, item);
    }
  }
  return Array.from(records.values());
}

function buildRows(root) {
  return readCorpus(root).map((item) => {
    const detail = loadProtectedDetail(root, item);
    return {
      announcement_id: String(item.id || ""),
      summary: String(item.summary || ""),
      snippet: String(item.snippet || ""),
      detail,
      source_hash: String((detail && detail.source_hash) || item.detail_revision || ""),
    };
  }).filter((row) => row.announcement_id);
}

function writeBatches(rows, output, options) {
  options = options || {};
  const maxRecords = Number(options.maxRecords || DEFAULT_MAX_BATCH_RECORDS);
  const maxBytes = Number(options.maxBytes || DEFAULT_MAX_BATCH_BYTES);
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });

  let batches = [];
  let current = [];
  let currentBytes = Buffer.byteLength('{"schema_version":1,"records":[]}', "utf8");
  for (const row of rows) {
    const rowBytes = Buffer.byteLength(JSON.stringify(row), "utf8") + 1;
    if (current.length && (current.length >= maxRecords || currentBytes + rowBytes > maxBytes)) {
      batches.push(current);
      current = [];
      currentBytes = Buffer.byteLength('{"schema_version":1,"records":[]}', "utf8");
    }
    current.push(row);
    currentBytes += rowBytes;
  }
  if (current.length) batches.push(current);

  batches.forEach((records, index) => {
    const file = path.join(output, `batch-${String(index).padStart(3, "0")}.json`);
    fs.writeFileSync(file, JSON.stringify({ schema_version: 1, records }));
  });
  return batches.length;
}

function run(root, output) {
  if (output === root || !path.basename(output).startsWith(".member-content-sync")) {
    throw new Error("refusing unexpected member-content output path");
  }
  const rows = buildRows(root);
  const detailCount = rows.filter((row) => row.detail).length;
  const batchCount = writeBatches(rows, output);
  console.log(`Prepared ${rows.length} protected records (${detailCount} with official detail) in ${batchCount} batches`);
  return { rows: rows.length, detailCount, batchCount };
}

module.exports = { safeDetailPath, loadProtectedDetail, readCorpus, buildRows, writeBatches, run };

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const output = path.resolve(process.argv[2] || path.join(root, ".member-content-sync"));
  run(root, output);
}
