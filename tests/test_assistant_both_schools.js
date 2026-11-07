const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");

/* Invented data only. */
const items = [
  { id: "x1", school: "cysh", school_name: "嘉中", title: "植物園校外教學報名", summary: "嘉中高一校外教學，集合地點在藍色大門口，請準時到。", date: "2026-10-20", url: "https://school.example/x1" },
  { id: "y1", school: "cygsh", school_name: "嘉女", title: "圖書館寒假開放時間", summary: "嘉女圖書館寒假週一到週五開放。", date: "2026-10-21", url: "https://school.example/y1" },
];
const details = {
  x1: { provenance: "official_article", blocks: [{ type: "paragraph", text: "校外教學集合地點在藍色大門口，請於七點三十分前到達。" }], attachments: [] },
  y1: { provenance: "official_article", blocks: [{ type: "paragraph", text: "圖書館寒假期間週一到週五上午九點到下午四點開放。" }], attachments: [] },
};
const calendar = [
  { id: "c1", school_id: "cysh", school_name: "嘉中", start_date: "2026-11-05", end_date: "2026-11-06", title: "校運會" },
  { id: "c2", school_id: "cygsh", school_name: "嘉女", start_date: "2026-12-04", end_date: "2026-12-04", title: "校慶運動會" },
];
const base = { asOf: "2026-11-07", schoolId: "", scopeLabel: "", calendarEvents: calendar };

/* Calendar: a past event for one school and a future one for the other are both answered, each labelled. */
let r = QA.answer("校運會大概落在什麼時候", items, details, base);
assert.equal(r.status, "answered");
assert.equal(r.mode, "multi_school");
const lines = r.reply.bullets.join("\n");
assert.match(lines, /嘉中：.*11\/5.*11\/6.*校運會.*已經過了/s);
assert.match(lines, /嘉女：.*12\/4.*校慶運動會/s);
assert(!/嘉女：.*目前資料裡沒有/.test(lines));
assert(r.sources.some(s => s.school_name === "嘉中") && r.sources.some(s => s.school_name === "嘉女"), "sources keep both schools");

/* A school without anything says so explicitly instead of pointing at an unrelated notice. */
r = QA.answer("校外教學集合地點在哪裡", items, details, base);
assert.equal(r.status, "answered");
assert(/嘉中：[^\n]*/.test(r.reply.bullets.join("\n")) && /藍色大門口/.test(r.reply.bullets.join("\n")), JSON.stringify(r.reply));
assert(r.reply.bullets.includes("嘉女：目前資料裡沒有找到相關內容。"));
assert(r.sources.every(s => s.school_name === "嘉中"), "no unrelated 嘉女 notice is offered");

/* Neither school has it. */
r = QA.answer("月球基地的入口在哪裡", items, details, base);
assert.equal(r.status, "insufficient");
assert(r.reply.bullets.includes("嘉中：目前資料裡沒有找到相關內容。") && r.reply.bullets.includes("嘉女：目前資料裡沒有找到相關內容。"));

/* A question that names one school is answered for that school only. */
r = QA.answer("嘉義女中的圖書館寒假有開嗎", items, details, base);
assert.notEqual(r.mode, "multi_school");
assert.equal(r.status, "answered");
assert((r.sources || []).every(s => s.school_name !== "嘉中"));
r = QA.answer("嘉義高中的校運會什麼時候", items, details, base);
assert.notEqual(r.mode, "multi_school");
const text = r.summary + ((r.reply && r.reply.text) || "");
assert.match(text, /11\/5/);
assert(!/12\/4/.test(text));

/* A picked school is never split. */
r = QA.answer("校運會什麼時候", items.filter(i => i.school === "cysh"), details, Object.assign({}, base, { schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: calendar.filter(e => e.school_id === "cysh") }));
assert.notEqual(r.mode, "multi_school");
assert.match(r.summary, /11\/5.*11\/6/);

/* Small talk is not split by school. */
r = QA.answer("你好", items, details, base);
assert.notEqual(r.mode, "multi_school");
console.log("Both-schools answer tests passed");
