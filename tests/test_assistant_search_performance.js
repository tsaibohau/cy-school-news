"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const QA = require("../docs/assistant-qa.js");

const items = [];
const details = {};
for (let i = 0; i < 5000; i++) {
  const id = `noise-${i}`;
  items.push({
    id,
    title: `第${i}號一般行政公告`,
    school: "cysh",
    school_name: "嘉中",
    summary: "一般校務行政資訊",
    snippet: "",
    date: "2026-09-01",
  });
  details[id] = {
    provenance: "official_article",
    blocks: [{ text: "這是一段不相關的校務內容。".repeat(40) }],
    attachments: [{ parse_status: "parsed", embedded_text: "不相關附件內容。".repeat(80) }],
  };
}

items.push({
  id: "sign-old",
  title: "113-2本土語文台灣手語上課地點_名單&開設情形",
  school: "cysh",
  school_name: "嘉中",
  summary: "台灣手語上課地點",
  snippet: "",
  date: "2025-02-08",
});
details["sign-old"] = {
  provenance: "official_article",
  blocks: [{ text: "台灣手語課程在懷恩樓三樓多功能教室上課。" }],
  attachments: [],
};

items.push({
  id: "sign-current",
  title: "115-1本土語文台灣手語上課地點_名單&開設情形",
  school: "cysh",
  school_name: "嘉中",
  summary: "台灣手語上課地點",
  snippet: "",
  date: "2026-08-27",
});
details["sign-current"] = {
  provenance: "official_article",
  blocks: [{ text: "台灣手語課程在懷恩樓四樓多功能教室上課。" }],
  attachments: [],
};

const start = performance.now();
const answer = QA.answer("手語去哪上？", items, details, { asOf: "2026-09-11" });
const elapsed = performance.now() - start;

assert.equal(answer.status, "answered");
assert(answer.answer_lines.some((row) => row.includes("懷恩樓四樓多功能教室")));
assert(!answer.answer_lines.some((row) => row.includes("三樓多功能教室")));
// This is deliberately generous for shared CI runners; the regression is meant
// to catch full-corpus detail scans taking many seconds, not micro-optimize JS.
assert(elapsed < 1500, `ask-school search took ${elapsed.toFixed(1)}ms for 5k announcements`);
console.log(`Ask-school 5k benchmark: ${elapsed.toFixed(1)}ms`);
