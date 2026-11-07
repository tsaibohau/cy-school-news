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

/* 2. 學校網頁上的校長、主任姓名（公開職稱）。 */
const page = (id, title, lines) => ({ item: { id, title, kind: "school_info", school: "cysh", school_name: "嘉中", summary: "", snippet: "", url: "https://school.example/" + id, date: "" },
  detail: { provenance: "official_article", announcement_id: id, source_hash: "h" + id, blocks: lines.map((text) => ({ type: "paragraph", text })), attachments: [] } });
const principal = page("p1", "行政單位 › 校長室", ["王大明 校長", "【自我期許】", "「心念有多大，願力就有多大」", "【學歷】", "星河大學教育博士", "星河大學教育碩士", "【經歷】", "星河高中教師兼教務主任"]);
const past = page("p2", "關於本校 › 歷任校長", ["屆別 校長姓名 任期", "第一任 李老舊 1950"]);
const staff = page("p3", "認識本校 › 行政單位聯絡資訊", ["輔導主任 李小華 1601", "學務主任 張美麗 1301", "校長 王大明 1001"]);
const group = page("p4", "學務處 › 衛生組 › 組織與職掌", ["衛生組長陳阿福 老師", "辦理健康檢查"]);
const rows = [principal, past, staff, group];
x = run("星河高中的校長名字叫什麼？", rows);
assert.equal(x.r.status, "answered");
assert.match(x.said.text, /王大明/);
assert.match(flat(x), /星河大學教育博士/, "the principal's background is listed too");
assert.doesNotMatch(flat(x), /李老舊/);
assert.ok(!QA.isPersonalDataQuery("校長名字叫什麼"), "an official's name is public, not student data");
assert.match(run("校長是誰", rows).said.text, /王大明/);
assert.match(run("輔導主任是誰", rows).said.text, /李小華/);
assert.match(run("學務主任叫什麼名字", rows).said.text, /張美麗/);
assert.match(run("衛生組長是誰", rows).said.text, /陳阿福/);
/* only the title's person; a student's name is never looked up */
x = run("歷任校長有哪些", rows);
assert.doesNotMatch(x.said.text, /王大明是|的校長是王大明/);
/* the read list fetches the pages that name people */
assert.ok(QA.readList("輔導主任是誰", rows.map((r) => r.item), OPTS).some((i) => i.id === "p3"));
console.log("qa detail tests passed");
