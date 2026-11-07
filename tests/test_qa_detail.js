"use strict";
/* 問校務「巨細靡遺」：同一則公告回答一個欄位時，連同時間、期限、名額、對象、報名一起列出。全部是虛構資料。 */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const C = require("../docs/answer-composer.js");

const OPTS = { asOf: "2026-11-07", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: [] };
const mk = (id, title, lines, date) => ({
  item: { id, title, school: "cysh", school_name: "嘉中", summary: "", snippet: "", url: "https://school.example/" + id, date: date || "2026-11-02" },
  detail: { provenance: "official_article", announcement_id: id, source_hash: "h" + id, blocks: lines.map((text) => ({ type: "paragraph", text })), attachments: [] }
});
const run = (q, rows, opts) => {
  const items = rows.map((r) => r.item), details = {};
  rows.forEach((r) => { details[r.item.id] = r.detail; });
  const r = QA.answer(q, items, details, Object.assign({}, OPTS, opts || {}));
  return { r, said: QA.conversational(r) };
};
const flat = (x) => x.said.text + "\n" + (x.said.bullets || []).join("\n");

/* 1. 問地點 → 地點加上同一場活動的時間、期限、名額、對象、報名方式。 */
const star = mk("s1", "【星空觀測報名】第3屆星際天文競賽校內甄選", [
  "星河大學第3屆星際天文競賽 本校代表校內甄選",
  "一、本表單僅限 星河高中在校高一高二學生 填報 。",
  "有興趣的同學，即日起至115年11月17日上午8：00止，填妥報名表單參加校內甄選，逾時不候。",
  "二、教務處將於115年12月02日(三)下午14:30-15:30舉辦校內甄選競試，依成績擇優推薦。",
  "校內甄選地點：天文館二樓觀測室。",
  "三、本校可提報之參賽代表名額為8人，如至截止日期，報名人數未達8人，將公告取消本次甄選。",
  "(欲報名者，請掃描QRcode，或報名連結: https://forms.example.org/star 填妥送出。)"
]);
let x = run("我這次參加星際天文競賽，但是我不知道要去哪裡比", [star]);
let t = flat(x);
assert.equal(x.r.status, "answered");
assert.match(t, /天文館二樓觀測室/);
assert.match(t, /12月0?2日/);
assert.match(t, /14:30/);
assert.match(t, /15:30/, "the time range keeps its end");
assert.match(t, /11月17日/);
assert.match(t, /8:00/);
assert.match(t, /8 人/);
assert.match(t, /取消/);
assert.match(t, /高一高二/);
assert.match(t, /forms\.example\.org\/star/);
/* quota is a field of its own */
const f = C.fieldsOf({ lines: star.detail.blocks.map((b) => b.text), title: star.item.title, posted: "2026-11-02" });
assert.match(f.slots.quota.value, /8 人/);
assert.equal(C.askedSlot("星際天文競賽名額有幾人"), "quota");
x = run("星際天文競賽什麼時候考", [star]);
t = flat(x);
assert.match(t, /天文館二樓觀測室/, "asking the time also lists the place");
assert.match(t, /11月17日/);
console.log("qa detail tests passed");
