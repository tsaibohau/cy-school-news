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
  blocks: [{
    type: "paragraph",
    text: "比賽會場設於嘉義市文化中心。報名截止日期為9月20日。",
  }],
  attachments: [{
    provenance: "official_attachment",
    filename: "音樂比賽報名表.pdf",
    parse_status: "parsed",
    embedded_text: "參賽同學填妥報名表後，請送交學務處訓育組辦理。",
  }],
};

assert(QA.detailText(detail).includes("學務處訓育組"), "protected attachment text must enter the evidence corpus");
assert.equal(QA.questionPlan("音樂比賽的報名表要交到哪裡？").answer_slot, "destination");
const answer = QA.answer(
  "音樂比賽的報名表要交到哪裡？",
  [item],
  { "music-form": detail },
);
assert.equal(answer.status, "answered", "attachment-only official evidence must be answerable");
assert(answer.evidence[0].text.includes("學務處訓育組"), "destination sentence must outrank event venue and deadline noise");
assert(!answer.evidence[0].text.includes("文化中心"), "event venue must not be mistaken for form destination");
assert(answer.answer_lines.some((row) => row.includes("學務處訓育組")));

const signItem = {
  id: "sign-class",
  title: "手語微課程上課通知",
  school: "cysh",
  school_name: "嘉中",
  summary: "手語微課程相關資訊",
  snippet: "",
  url: "https://school.example/sign",
  date: "2026-09-02",
};
const signDetail = {
  provenance: "official_article",
  announcement_id: "sign-class",
  source_hash: "detail-sign",
  blocks: [{ type: "paragraph", text: "報名截止至9月15日。" }],
  attachments: [{
    provenance: "official_attachment",
    filename: "手語課程通知.pdf",
    parse_status: "parsed",
    embedded_text: "上課地點：圖書館三樓多功能教室。請於上課前五分鐘完成報到。",
  }],
};
assert.equal(QA.questionPlan("手語去哪上？").answer_slot, "class_place");
const signAnswer = QA.answer("手語去哪上？", [signItem], { "sign-class": signDetail });
assert.equal(signAnswer.status, "answered", "class location question must be answerable");
assert(signAnswer.evidence[0].text.includes("圖書館三樓多功能教室"), "classroom sentence must outrank registration deadline");

const lowConfidenceDetail = {
  provenance: "official_article",
  announcement_id: "music-form",
  source_hash: "detail-low-ocr",
  blocks: [],
  attachments: [{
    provenance: "official_attachment",
    filename: "音樂比賽報名表掃描檔.png",
    parse_status: "parsed",
    parse_reason: "ocr_low_confidence",
    evidence_confidence: "insufficient",
    ocr_confidence: 41.2,
    embedded_text: "【證據不足：OCR 辨識信心 41.2%，請核對官方原附件】報名表請送交學務處訓育組辦理。",
  }],
};
const lowAnswer = QA.answer(
  "音樂比賽的報名表要去哪個處室辦理？",
  [item],
  { "music-form": lowConfidenceDetail },
);
assert.equal(lowAnswer.status, "answered", "low-confidence OCR should remain visible instead of disappearing");
assert(lowAnswer.summary.includes("證據不足"), "visible answer must disclose insufficient OCR evidence");
assert(lowAnswer.evidence.some((row) => row.text.includes("證據不足")));
assert(lowAnswer.answer_lines.some((row) => row.includes("證據不足")));

const noEvidence = QA.answer("音樂比賽一定要參加嗎？", [item], { "music-form": detail });
assert.equal(noEvidence.status, "insufficient", "the assistant must not infer an unsupported requirement from an attachment");
console.log("Attachment-only assistant QA precision tests passed");
