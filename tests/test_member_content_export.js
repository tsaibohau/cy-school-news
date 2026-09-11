"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Exporter = require("../tools/export-member-content.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cy-member-export-"));
try {
  const dataRoot = path.join(root, "docs", "data");
  const detailRoot = path.join(dataRoot, "details", "cysh");
  fs.mkdirSync(detailRoot, { recursive: true });
  const item = {
    id: "cysh-music", title: "學生音樂比賽報名表", summary: "", snippet: "",
    detail_ref: "data/details/cysh/cysh-music.json", detail_revision: "rev-attachment",
  };
  fs.writeFileSync(path.join(dataRoot, "archive.json"), JSON.stringify({ items: [] }));
  fs.writeFileSync(path.join(dataRoot, "announcements.json"), JSON.stringify({ items: [item] }));
  fs.writeFileSync(path.join(detailRoot, "cysh-music.json"), JSON.stringify({
    announcement_id: "cysh-music", provenance: "official_article", source_hash: "rev-attachment",
    blocks: [], attachments: [{
      provenance: "official_attachment", parse_status: "parsed", filename: "報名表.pdf",
      embedded_text: "報名表請送交學務處訓育組。",
    }],
  }));

  const rows = Exporter.buildRows(root);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_hash, "rev-attachment");
  assert.equal(rows[0].detail.attachments[0].embedded_text, "報名表請送交學務處訓育組。");

  const output = path.join(root, ".member-content-sync-test");
  const count = Exporter.writeBatches(rows, output, { maxRecords: 1, maxBytes: 100000 });
  assert.equal(count, 1);
  const batch = JSON.parse(fs.readFileSync(path.join(output, "batch-000.json"), "utf8"));
  assert.equal(batch.schema_version, 1);
  assert.equal(batch.records[0].detail.provenance, "official_article");

  assert.equal(Exporter.safeDetailPath(root, "../secrets.txt"), null, "detail_ref must remain inside protected detail staging path");
  const mismatch = Object.assign({}, item, { detail_revision: "wrong" });
  assert.equal(Exporter.loadProtectedDetail(root, mismatch), null, "revision mismatch must fail closed");

  const migration = fs.readFileSync(path.resolve(__dirname, "../supabase/migrations/20260911004500_preserve_member_detail_during_summary_sync.sql"), "utf8");
  assert.match(migration, /detail = coalesce\(excluded\.detail, existing\.detail\)/);
  assert.match(migration, /then existing\.source_hash/);
  console.log("Protected member detail export tests passed");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
