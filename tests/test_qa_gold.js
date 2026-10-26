"use strict";
/* 問校務 against the user's 2026-10-26 manual labels (20 questions). Thresholds are the
   measured result after the October fixes; a change that lowers them is a regression. */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const gold = require("./fixtures/qa-gold-2026-10-26.json");
let top1 = 0, top3 = 0, found = 0, wrong = 0, answerable = 0, noAnswerOk = 0, noAnswer = 0;
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
  if (ranked.slice(0, 3).some(r => row.answer_ids.includes(r.item.id))) top3++;
  if (shown.some(id => row.answer_ids.includes(id))) found++;
  if (result.status === "answered" && !(result.sources || []).some(s => row.answer_ids.includes(s.id))) wrong++;
}
console.log(`top1 ${top1}/${answerable}, top3 ${top3}/${answerable}, shown ${found}/${answerable}, wrong ${wrong}, no-answer ok ${noAnswerOk}/${noAnswer}`);
assert.equal(wrong, 0, "never answer with an announcement the user marked as not answering");
assert.equal(noAnswerOk, noAnswer, "questions without an official answer must not get a direct answer");
/* Two questions have two equally valid notices (two GEPT notices; the 2nd and 3rd mock-exam
   timetables) where only one was labelled, so top-3 is the stable measure. */
assert.ok(top1 >= 7, "correct announcement ranked first for at least 7 of 13");
assert.ok(top3 >= 9, "correct announcement in the top 3 for at least 9 of 13");
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

/* 2026-10-27: different wordings of the labelled questions must find the same notices, and
   distinct things (多元選修 vs 微課程, 期中考 vs 期末考) must never be mixed up. */
const para = require("./fixtures/qa-paraphrases-2026-10-27.json");
const goldByQ = Object.fromEntries(gold.questions.map(row => [row.q, row]));
let variants = 0, variantHits = 0;
for (const group of para.groups) {
  const ids = goldByQ[group.gold].answer_ids;
  for (const q of group.variants) {
    variants++;
    if (QA.rank(q, gold.items, {}, { asOf: gold.as_of }).slice(0, 3).some(r => ids.includes(r.item.id))) variantHits++;
  }
}
console.log(`wordings: top3 ${variantHits}/${variants}`);
assert.ok(variantHits >= 24, "reworded questions keep finding the labelled notices");
for (const row of para.exclusive) {
  const top = QA.rank(row.q, corpus, {}, { asOf: "2026-10-27" }).slice(0, 3);
  assert.ok(top.length && top[0].item.title.includes(row.must), row.q + " should lead with " + row.must);
  assert.ok(top.every(r => !r.item.title.includes(row.never)), row.q + " must not return " + row.never);
}
console.log("問校務 wording and distinct-term tests passed");

/* 重點整理: labelled facts pulled out with fixed rules (2026-10-27 request). */
const pts = QA.keyPoints("一、選課時間：10/16(五)中午12:00 至 10/22(四)下午5:00。二、請登入選課系統，依志願序選填三門課程。三、上課地點：樸毅樓三樓 301 教室。四、參加對象：高一全體學生。五、報名費 200 元，洽詢電話 05-2763060 分機 123。");
assert.deepEqual(pts.map(p => p.label + "：" + p.value), [
  "時間：10/16(五)中午12:00 至 10/22(四)下午5:00", "地點：樸毅樓三樓 301 教室", "方式：請登入選課系統，依志願序選填三門課程",
  "對象：高一全體學生", "費用：報名費 200 元"]);
assert.deepEqual(QA.keyPoints("請有興趣同學於 115年10月31日(五) 前至官網完成報名，活動將於 11/15(六) 上午9:00 於本校禮堂舉行。").map(p => p.label + "：" + p.value),
  ["截止：115年10月31日(五) 前", "時間：11/15(六) 上午9:00", "地點：本校禮堂"]);
assert(!QA.keyPoints("請電洽國立東石高級中學圖書館張世宗主任。").length, "contact lines with names are never listed");
assert(!JSON.stringify(QA.keyPoints("報名費 200 元，洽詢電話 05-2763060。")).includes("2763060"), "phone numbers are dropped");
console.log("重點整理 tests passed");
