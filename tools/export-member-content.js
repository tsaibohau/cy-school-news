"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.resolve(process.argv[2] || path.join(root, ".member-content-sync"));
if (output === root || !path.basename(output).startsWith(".member-content-sync")) {
  throw new Error("refusing unexpected member-content output path");
}
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const records = new Map();
for (const name of ["archive.json", "announcements.json"]) {
  const corpus = JSON.parse(fs.readFileSync(path.join(root, "docs", "data", name), "utf8"));
  for (const item of corpus.items || []) {
    const id = String(item.id || "");
    if (!id) continue;
    records.set(id, {
      announcement_id: id,
      summary: String(item.summary || ""),
      snippet: String(item.snippet || ""),
      detail: null,
      source_hash: String(item.detail_revision || ""),
    });
  }
}

const rows = Array.from(records.values());
for (let index = 0; index < rows.length; index += 400) {
  const file = path.join(output, `batch-${String(index / 400).padStart(3, "0")}.json`);
  fs.writeFileSync(file, JSON.stringify({ schema_version: 1, records: rows.slice(index, index + 400) }));
}
console.log(`Prepared ${rows.length} protected summary records in ${Math.ceil(rows.length / 400)} batches`);
