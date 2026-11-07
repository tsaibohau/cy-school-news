"use strict";
/* 2026-11-07 owner report: 「往常校運會什麼時候辦理」 was answered with a records table page (names masked 李〇諾)
   and a 全民e化資訊運動會 notice. Invented data only. */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const Syn = require("../docs/qa-synonyms.js");

const ev = (school, id, title, from, to) => ({ id, school_id: school, school_name: school === "cysh" ? "嘉中" : "嘉女", title, start_date: from, end_date: to || from });
const calendar = [
  ev("cysh", "a1", "校運會", "2026-11-05", "2026-11-06"),
  ev("cysh", "a2", "校運會預演", "2026-11-04"),
  ev("cysh", "a3", "校運會", "2025-11-06", "2025-11-07"),
  ev("cysh", "a4", "校慶運動會", "2024-11-07", "2024-11-08"),
  ev("cygsh", "b1", "校慶運動會", "2026-12-04"),
  ev("cygsh", "b2", "校慶運動會", "2025-12-05"),
  ev("cysh", "a5", "畢業典禮", "2026-06-06"),
  ev("cysh", "a6", "畢業典禮", "2025-06-07"),
  ev("cysh", "a7", "畢業典禮", "2024-06-08"),
];
const records = { id: "cysh-info-9", kind: "school_info", school: "cysh", school_name: "嘉中", title: "學務處 › 體育組 › 運動會各項紀錄保持者紀錄表",
  summary: "400公尺接力 李〇諾 蔡〇瀛 64.03.25 運動會 什麼時候 辦理" };
const maskedOnly = { id: "cysh-info-10", kind: "school_info", school: "cysh", school_name: "嘉中", title: "學務處 › 體育組 › 校運會辦理說明", summary: "校運會辦理 保持者 王〇明 2019" };
const e = { id: "cysh-e1", school: "cysh", school_name: "嘉中", date: "2026-09-20", title: "2026年全民e化資訊運動會 報名辦理，排在115年11月15日", category: "競賽" };
const older = { id: "cysh-o1", school: "cysh", school_name: "嘉中", date: "2023-10-20", title: "112學年度校慶運動會注意事項", category: "活動" };
const items = [records, maskedOnly, e, older];
const opts = { asOf: "2026-11-07", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: calendar.filter((x) => x.school_id === "cysh") };
const say = (r) => (r.reply && r.reply.text) || r.summary;

/* 1. the usual timing: this year past, earlier years listed, no record names, no unrelated event. */
for (const q of ["往常校運會什麼時候辦理", "校運會通常幾月", "每年校運會什麼時候舉辦", "歷年運動會大多在什麼時候"]) {
  const r = QA.answer(q, items, {}, opts);
  assert.equal(r.status, "answered", q);
  const t = r.summary;
  assert.match(t, /通常在 11 月上旬/, q + " " + t);
  assert.match(t, /今年（115 學年）是 11\/5–11\/6，已經辦完了/, t);
  assert.match(t, /114 學年 11\/6–11\/7/, t);
  assert.match(t, /113 學年 11\/7–11\/8/, t);
  assert.doesNotMatch(t + say(r), /〇|紀錄|全民|e化|資訊運動會|預演/, q + " " + t);
  assert.ok(r.sources.every((s) => s.kind === "calendar" || s.id === "cysh-o1"), q);
}

/* 2. 校慶／畢業典禮 style. */
let r = QA.answer("畢業典禮通常幾月", items, {}, opts);
assert.match(r.summary, /畢業典禮通常在 6 月上旬舉行/, r.summary);
r = QA.answer("校慶每年什麼時候", items, {}, opts);
assert.doesNotMatch(r.summary + say(r), /〇|全民/);

/* 3. only one year known: said honestly. */
r = QA.answer("往常校運會什麼時候辦理", [], {}, Object.assign({}, opts, { calendarEvents: [calendar[0]] }));
assert.match(r.summary, /只找到 115 學年這一年.*說不出「通常」/, r.summary);

/* 4. a notice from an earlier year fills in a year the calendar lacks. */
r = QA.answer("往常校運會什麼時候辦理", [older], {}, Object.assign({}, opts, { calendarEvents: [calendar[0]] }));
assert.match(r.summary, /112 學年有公告「112學年度校慶運動會注意事項」/, r.summary);

/* 5. both schools, each in its own section. */
const both = QA.answer("往常校運會什麼時候辦理", items, {}, { asOf: "2026-11-07", calendarEvents: calendar });
const text = both.summary;
assert.match(text, /嘉中：.*11 月上旬/, text);
assert.match(text, /嘉女：.*12 月上旬/, text);
assert.doesNotMatch(text, /〇|全民/);

/* 6. a records page never answers a when-question (even without the 往常 word). */
r = QA.answer("運動會什麼時候", [records, maskedOnly], {}, opts);
assert.doesNotMatch(say(r) + r.summary, /〇|紀錄保持/, say(r));
r = QA.answer("運動會什麼時候", [records, maskedOnly], {}, Object.assign({}, opts, { calendarEvents: [] }));
assert.doesNotMatch(say(r) + r.summary, /〇|紀錄保持/, say(r));

/* 7. topic gate: 全民e化資訊運動會 and friends are not the school's sports day. */
for (const t of ["2026年全民e化資訊運動會", "115年嘉義市中小學聯合運動會", "全國運動會選拔", "全中運報名"]) assert.equal(Syn.ownEventText("校運會", t).replace(/\s|\d|年|嘉義市|選拔|報名/g, ""), "", t);
assert.equal(Syn.ownEventText("校運會", "校慶運動會預演"), "校慶運動會預演");
assert.equal(Syn.ownEventText("段考", "全民運動會"), "全民運動會", "only sports-day questions are gated");
r = QA.answer("校運會什麼時候", [e], {}, Object.assign({}, opts, { calendarEvents: [] }));
assert.doesNotMatch(say(r), /全民|e化/, say(r));
r = QA.answer("運動會什麼時候", [e], {}, Object.assign({}, opts, { calendarEvents: [ev("cysh", "x", "全民e化資訊運動會", "2026-11-15")] }));
assert.doesNotMatch(say(r), /全民|e化/, say(r));
console.log("usual-when tests passed");
