"use strict";
/* 2026-11-05 real-device report: 「校運會什麼時候」 answered with the 113學年 校運會海報比賽 notice and listed
   「校運會.pdf」 three times, while 嘉中's calendar has 校運會 on 11/5–11/6. */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const cal = [
  { id: "c1", school_id: "cysh", school_name: "嘉中", title: "校運會預演", start_date: "2026-11-04", end_date: "2026-11-04" },
  { id: "c2", school_id: "cysh", school_name: "嘉中", title: "校運會", start_date: "2026-11-05", end_date: "2026-11-06" },
];
const page = { id: "cysh-info-1", kind: "school_info", school: "cysh", school_name: "嘉中", title: "學務處 › 體育組 › 各項運動競賽成績",
  documents: [1, 2, 3].map((n) => ({ name: "校運會.pdf(另開新視窗)", url: "https://www.cysh.cy.edu.tw/var/file/" + n + ".pdf" })) };
const poster = { id: "cysh-1", school: "cysh", school_name: "嘉中", date: "2024-08-30", title: "113學年度校運會海報比賽徵選開始" };
const outside = { id: "cysh-2", school: "cysh", school_name: "嘉中", date: "2026-10-13", title: "轉知：國立臺北教育大學「NTUE Open Day｜校慶×園遊會×校園體驗日」活動資訊。" };
const opts = { asOf: "2026-11-05", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: cal };
const items = [page, poster, outside];
const say = (r) => (r.reply && r.reply.text) || r.summary;

let r = QA.answer("校運會什麼時候", items, {}, opts);
assert.match(say(r), /11\/5（週四）～11\/6（週五）「校運會」（就是今天）/, say(r));
assert.doesNotMatch(say(r), /海報比賽/);
assert.ok((r.document_links || []).length <= 1, "one button for three years' 校運會.pdf");
r = QA.answer("校運", items, {}, opts);
assert.match(say(r), /「校運會」/, "a bare 校運 is answered from the calendar, not the results PDF");
r = QA.answer("校慶運動會什麼時候", items, {}, opts);
assert.match(say(r), /「校運會」/, "校慶運動會 = 校運會");
r = QA.answer("校運會預演", items, {}, opts);
assert.match(say(r), /已經過了.*「校運會預演」在 11\/4/, say(r));
r = QA.answer("校慶什麼時候", items, {}, opts);
assert.doesNotMatch(say(r), /臺北教育大學|NTUE/, "another school's 校慶 is not the answer");
console.log("sports day tests passed");
