"use strict";
/* 問校務 against the user's 2026-10-26 manual labels (20 questions). Thresholds are the
   measured result after the October fixes; a change that lowers them is a regression. */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const gold = require("./fixtures/qa-gold-2026-10-26.json");
let top1 = 0, found = 0, wrong = 0, answerable = 0, noAnswerOk = 0, noAnswer = 0;
for (const row of gold.questions) {
  const ranked = QA.rank(row.q, gold.items, {}, { asOf: gold.as_of });
  const result = QA.answer(row.q, gold.items, {}, { asOf: gold.as_of });
  const shown = (result.sources || []).map(s => s.id).concat((result.related || []).map(s => s.id));
  if (row.no_answer) {
    noAnswer++;
    if (result.status !== "answered") noAnswerOk++;
    continue;
  }
  answerable++;
  if (ranked[0] && row.answer_ids.includes(ranked[0].item.id)) top1++;
  if (shown.some(id => row.answer_ids.includes(id))) found++;
  if (result.status === "answered" && !(result.sources || []).some(s => row.answer_ids.includes(s.id))) wrong++;
}
console.log(`top1 ${top1}/${answerable}, shown ${found}/${answerable}, wrong ${wrong}, no-answer ok ${noAnswerOk}/${noAnswer}`);
assert.equal(wrong, 0, "never answer with an announcement the user marked as not answering");
assert.equal(noAnswerOk, noAnswer, "questions without an official answer must not get a direct answer");
assert.ok(top1 >= 8, "correct announcement ranked first for at least 8 of 13");
assert.ok(found >= 8, "answer or related list includes a correct announcement for at least 8 of 13");
console.log("問校務 gold-set tests passed");

/* 2026-10-27 real-device report: 「學生證丟了怎麼辦」 was answered with a 學生音樂比賽 notice
   (shared word 學生). Use the full announcement corpus so common words are recognised. */
const fs = require("node:fs");
const path = require("node:path");
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "data", f), "utf8")).items || [];
const corpus = load("announcements.json").concat(load("archive.json")).map(item => Object.assign({}, item));
const music = corpus.find(item => item.id === "cygsh-186135");
if (music) music.summary = "學生音樂比賽鋼琴調音標準為 A=442Hz；學生參賽注意事項與報名辦理方式。";
for (const q of ["學生證丟了怎麼辦", "學生證遺失要怎麼補辦"]) {
  const result = QA.answer(q, corpus, {}, { asOf: "2026-10-27" });
  assert.notEqual(result.status, "answered", q + " must not be answered by an unrelated notice");
  assert(!(result.sources || []).some(s => s.id === "cygsh-186135"), q + " must not cite the music contest");
}
if (music) assert.equal(QA.answer("音樂比賽鋼琴調音標準", corpus, {}, { asOf: "2026-10-27" }).status, "answered", "the music question itself still works");
assert.equal(QA.isPersonalDataQuery("期中考成績什麼時候可以查"), false, "asking when grades open is not a records request");
assert.equal(QA.isPersonalDataQuery("王小明的成績"), true);
const app = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");
assert.match(app, /function inAssistantScope\(scopeId\)/, "「我的學校」 scope only cites that school's announcements");
console.log("問校務 real-device regression tests passed");
