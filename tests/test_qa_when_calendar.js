"use strict";
/* 2026-10-30: 「X 是什麼時候」 questions are answered from the school calendar, the school
   name inside a question is ignored, and unanswerable questions point to the office page. */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");

const cal = (date, title, end) => ({ id: "c-" + date + title, school_id: "cysh", school_name: "嘉中", date, end_date: end || date, title });
const calendar = [
  cal("2026-10-13", "第一次期中考", "2026-10-14"),
  cal("2026-10-21", "第一次期中考成績繳交截止"),
  cal("2026-11-26", "第二次期中考", "2026-11-27"),
  cal("2026-12-04", "第二次期中考成績繳交截止"),
  cal("2026-09-01", "學習歷程-多元表現上傳截止、學習歷程勾選截止"),
  cal("2026-09-30", "社團1(社團博覽會)"),
  cal("2026-12-08", "高三第四次模擬考", "2026-12-09"),
  cal("2026-11-03", "高二模擬考"),
];
const items = [
  { id: "cysh-1", school: "cysh", school_name: "嘉中", date: "2026-10-27", title: "【期中考】115學年度第一學期第二次期中考時間表", category: "段考考試" },
  { id: "cysh-2", school: "cysh", school_name: "嘉中", date: "2026-05-27", title: "台灣玩具圖書館協會《115木育玩具創作競賽》競賽", category: "競賽" },
];
const opts = { asOf: "2026-10-30", scopeLabel: "嘉中", schoolId: "cysh", calendarEvents: calendar };
const ask = q => QA.answer(q, items, {}, opts);

/* 段考 = 期中考; the ordinal picks the right one; 成績繳交 is a different thing. */
let r = ask("第二次段考是哪幾天");
assert.equal(r.status, "answered");
assert.match(r.summary, /11\/26.*第二次期中考/);
assert(!r.sources.some(s => /成績/.test(s.title)), "grade-submission deadlines are not the exam");
assert(r.sources.some(s => s.id === "cysh-1"), "the matching announcement is listed for details");
r = ask("第一次段考是哪幾天");
assert.match(r.summary, /最近一次是 10\/13.*已經過了/);

/* A past deadline is reported as past, not as upcoming. */
r = ask("學習歷程檔案上傳期限是什麼時候");
assert.equal(r.status, "answered");
assert.match(r.summary, /9\/1.*已經過了/);

/* Grade in the question excludes other grades. */
r = ask("高三模擬考是什麼時候");
assert.match(r.summary, /高三第四次模擬考/);
assert.doesNotMatch(r.summary, /高二/);

/* An extra subject the calendar does not have must not be answered by a near miss. */
r = ask("社團成果發表會什麼時候");
assert.notEqual(r.status, "answered", "社團博覽會 is not 社團成果發表會");
/* Grades or locations are not calendar questions. */
assert.notEqual(ask("期中考成績什麼時候可以查").sources.some(s => s.kind === "calendar"), true);

/* School names are ignored; library questions point to the library page, without
   listing an unrelated 玩具圖書館 notice. */
r = ask("嘉義高中還書");
assert.notEqual(r.status, "answered");
assert.equal(r.query, "還書");
assert.equal(r.office_link && r.office_link.office, "圖書館");
assert.match(r.office_link.url, /^https:\/\/www\.cysh\.cy\.edu\.tw\//);
assert.equal((r.related || []).length, 0);
assert.match(r.summary, /嘉中圖書館網頁/);
/* No office link for schools without recorded office pages. */
assert.equal(QA.answer("還書", items, {}, Object.assign({}, opts, { schoolId: "cygsh" })).office_link, undefined);
/* Without calendar data the old behaviour is unchanged. */
assert.notEqual(QA.answer("第二次段考是哪幾天", items, {}, { asOf: "2026-10-30" }).sources.some(s => s.kind === "calendar"), true);

console.log("問校務 calendar 'when' questions and office links passed");
