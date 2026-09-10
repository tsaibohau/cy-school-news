"use strict";

const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");

const item = {
  id: "music-form",
  title: "學生音樂比賽報名表",
  school: "cysh",
  school_name: "嘉中",
  summary: "",
  snippet: "",
  url: "https://school.example/music",
  date: "2026-09-01",
};
const detail = {
  provenance: "official_article",
  announcement_id: "music-form",
  source_hash: "detail-1",
  blocks: [],
  attachments: [{
    provenance: "official_attachment",
    filename: "音樂比賽報名表.pdf",
    parse_status: "parsed",
    embedded_text: "參賽同學填妥報名表後，請送交學務處訓育組辦理。",
  }],
};

assert(QA.detailText(detail).includes("學務處訓育組"), "protected attachment text must enter the evidence corpus");
const answer = QA.answer(
  "音樂比賽的報名表要去哪個處室辦理？",
  [item],
  { "music-form": detail },
);
assert.equal(answer.status, "answered", "attachment-only official evidence must be answerable");
assert(answer.evidence.some((row) => row.text.includes("學務處訓育組")));
assert(answer.answer_lines.some((row) => row.includes("學務處訓育組")));

const noEvidence = QA.answer("音樂比賽一定要參加嗎？", [item], { "music-form": detail });
assert.equal(noEvidence.status, "insufficient", "the assistant must not infer an unsupported requirement from an attachment");
console.log("Attachment-only assistant QA tests passed");
