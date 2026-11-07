"use strict";
/* 2026-11-02: 回答先拆事實再套句型（有無、判斷、表態、敘事），不直接貼原文；
   「不做會怎樣」先找罰則，沒有就虧一下。 */
const assert = require("node:assert/strict");
const C = require("../docs/answer-composer.js");
const QA = require("../docs/assistant-qa.js");

/* Every sentence type has at least three templates, and so does every slot. */
for (const key of ["allow", "deny", "allowIf", "must", "unsure"]) assert.ok(C.TEMPLATES.judge[key].length >= 3, key);
assert.ok(C.TEMPLATES.exist.yes.length >= 3 && C.TEMPLATES.exist.no.length >= 3);
for (const key of ["stance", "time", "deadline", "required", "audience"]) assert.ok(C.TEMPLATES[key].length >= 3, key);
/* A narrating answer has no verdict word: its first sentence is the answer itself. */
assert.deepEqual(C.TEMPLATES.narrate, [""]);
assert.ok(C.PENALTY_FOUND.length >= 3 && C.PENALTY_NONE.length >= 3 && C.PENALTY_LATE.length >= 3);

/* Question types. */
assert.equal(C.sentenceType("有沒有營隊"), "exist");
assert.equal(C.sentenceType("手機可以帶嗎"), "judge");
assert.equal(C.sentenceType("要不要報名這個比賽"), "stance");
assert.equal(C.sentenceType("書可以借多久"), "narrate", "「多久」 asks for information, not yes or no");
assert.equal(C.sentenceType("請假要怎麼請"), "narrate");

/* Time words, connectives, facts. */
assert.deepEqual(C.times("請於11月20日（星期五）下午4:30前送至學務處"), ["11月20日（星期五）", "下午4:30"]);
assert.equal(C.stripConnectives("另，請於期限內繳交。"), "於期限內繳交。");
let f = C.factsOf("國立臺灣師範大學2027教育營訂於116年1月25日至1月27日舉行，對象：高一、高二學生，報名至12月10日止。");
assert.match(f.time, /1月25日/);
assert.equal(f.deadline, "12月10日");
assert.equal(f.audience, "高一、高二學生");
f = C.factsOf("請於11月20日前檢附成績單及申請表送至學務處。");
assert.equal(f.deadline, "11月20日");
assert.equal(f.required, "成績單及申請表");
assert.equal(C.factsOf("依據元智大學115年10月20日元資字第1150001號函辦理。").time, "", "a letter's date is not the event");

/* Judgements: 可以／不行／可以但有條件／要. The opening line is ours; the fact is a point. */
let r = C.compose({ query: "可以染頭髮嗎", source: "學生手冊〈服儀規定〉", text: "一、學生不得染髮、燙髮。" });
assert.match(r.text, /^(?:不行|不可以|這個不行)/);
assert.deepEqual(r.bullets, ["學生不得染髮、燙髮。"]);
r = C.compose({ query: "手機可以帶嗎", source: "學生手冊", text: "學生攜帶之行動載具應自行妥善保管，上課期間應關機。" });
assert.match(r.text, /^(?:可以，但有條件|可以，只是要照規矩來|行，不過)/);
r = C.compose({ query: "一定要穿制服嗎", source: "學生手冊", text: "學生到校應穿著制服或運動服。" });
assert.match(r.text, /^(?:要。|需要|是必須的)/);
/* Slots are filled into the opening line: deadline, audience, what to bring. */
r = C.compose({ query: "有沒有營隊", source: "公告", text: "教育營訂於116年1月25日至1月27日舉行，對象：高一、高二學生，報名至12月10日止。" });
assert.match(r.text, /12月10日/);
assert.match(r.text, /高一、高二學生/);
assert.match(r.text, /(?:有。|有的|查到了)/);
r = C.compose({ query: "獎學金要準備什麼", source: "公告", text: "請於11月20日前檢附成績單及申請表送至學務處。" });
assert.match(r.text, /成績單及申請表/);
assert.equal(C.compose({ query: "x", text: "y" }).text, C.compose({ query: "x", text: "y" }).text, "same question, same wording");

/* 不做會怎樣. */
assert.equal(C.actOf("沒請假會怎樣"), "請假");
assert.equal(C.actOf("不交會怎樣"), "交");
let c = C.consequence({ query: "沒交會怎樣", text: "逾期未繳交者，以零分計算。", source: "規定" });
assert.ok(c.found);
assert.match(c.text, /逾期未繳交者，以零分計算/);
c = C.consequence({ query: "沒請假會怎樣", text: "請於期限內辦理。" });
assert.ok(!c.found);
assert.match(c.text, /請假/);
assert.doesNotMatch(C.consequence({ query: "遲到會怎樣" }).text, /沒到/);

/* In 問校務: a penalty in the rule text is found and said; otherwise a tease with where to look. */
const rule = { id: "hb-12", kind: "school_handbook", school: "cysh", school_name: "嘉中", title: "學生手冊 › 學生請假要點", url: "https://www.cysh.cy.edu.tw/hb.pdf" };
const details = { "hb-12": { announcement_id: "hb-12", provenance: "official_article", blocks: [{ type: "paragraph", text:
  "一、學生因病或因事不能到校者，應於三日內持假單完成請假手續。\n二、未依規定完成請假手續者，以曠課論。" }], attachments: [] } };
const opts = { asOf: "2026-11-02", scopeLabel: "嘉中", schoolId: "cysh", calendarEvents: [] };
r = QA.answer("請假要怎麼請？沒請假會怎樣？", [rule], details, opts);
const line = (r.also || []).find((row) => row.aspect === "consequence");
assert.ok(line && /以曠課論/.test(line.text), JSON.stringify(r.also));
r = QA.answer("請假要怎麼請？沒請假會怎樣？", [rule], { "hb-12": { announcement_id: "hb-12", provenance: "official_article", blocks: [{ type: "paragraph", text: "一、學生因病或因事不能到校者，應於三日內持假單完成請假手續。" }], attachments: [] } }, opts);
const tease = (r.also || []).find((row) => row.aspect === "consequence");
assert.ok(tease && C.PENALTY_NONE.some((t) => tease.text.indexOf(t.split("{")[0]) !== -1) && /學生請假要點/.test(tease.text), tease && tease.text);
console.log("answer composer tests passed");
