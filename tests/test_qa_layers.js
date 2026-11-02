"use strict";
/* 2026-11-02: 問校務翻找順序——先規定（學生手冊、學校網頁），再行事曆（含課表），最後公告；
   三層都翻，第一個找到的當主答案，其他層找到的依序附在後面。同義詞資料庫讓不同說法都找得到。 */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const Syn = require("../docs/qa-synonyms.js");

/* Synonym database. */
assert.ok(Syn.expand("段考").includes("期中考") && Syn.expand("段考").includes("期末考"), "段考 includes 期中考 and 期末考");
assert.ok(!Syn.expand("期中考").includes("期末考"), "期中考 does not include 期末考");
assert.ok(Syn.related("手機", "行動載具"));
assert.ok(Syn.related("家長日", "親師座談"));
assert.deepEqual(Syn.find("閱讀心得報告要交"), ["閱讀心得報告"]);
assert.ok(Syn.variants("閱讀心得報告").includes("閱讀心得"));
assert.ok(!Syn.variants("手機可以帶嗎").some((v) => v.includes("智慧型智慧型")), "no doubled replacements");

const handbook = { id: "cysh-hb-21", kind: "school_handbook", school: "cysh", school_name: "嘉中", title: "學生手冊 › 校園行動載具使用規定", url: "https://www.cysh.cy.edu.tw/hb.pdf", page_range: [40, 41] };
const leaveRule = { id: "cysh-hb-12", kind: "school_handbook", school: "cysh", school_name: "嘉中", title: "學生手冊 › 學生請假要點", url: "https://www.cysh.cy.edu.tw/hb2.pdf" };
const details = {
  "cysh-hb-21": { announcement_id: "cysh-hb-21", provenance: "official_article", blocks: [{ type: "paragraph", text:
    "一、依據教育部高級中等以下學校行動載具使用原則訂定。\n二、學生攜帶之行動載具應自行妥善保管，上課期間應關機或調為靜音並收納於書包內。\n三、上課期間未經授課教師同意使用者，由教師暫時保管，放學時發還。" }], attachments: [] },
  "cysh-hb-12": { announcement_id: "cysh-hb-12", provenance: "official_article", blocks: [{ type: "paragraph", text:
    "一、學生因病或因事不能到校者，應於三日內持假單完成請假手續。\n二、事假應事先請假，並經導師及生輔組核准。" }], attachments: [] },
};
const notices = [
  { id: "cysh-1", school: "cysh", school_name: "嘉中", date: "2026-10-19", title: "國立嘉義高中115學年度推展閱讀運動閱讀心得繳交流程、時程與電子檔", category: "研習活動" },
  { id: "cysh-2", school: "cysh", school_name: "嘉中", date: "2026-10-27", title: "10/31(六)嘉義高中115學年度親師座談會當日流程及手冊", category: "一般" },
  { id: "cysh-3", school: "cysh", school_name: "嘉中", date: "2026-08-31", title: "轉知：社團法人台灣少年權益與福利促進聯盟最新手機互動遊戲教材", category: "研習活動" },
];
const calendar = [
  { id: "c1", school_id: "cysh", school_name: "嘉中", start_date: "2026-11-20", end_date: "2026-11-20", title: "高一閱讀心得繳交截止" },
  { id: "c2", school_id: "cysh", school_name: "嘉中", start_date: "2027-01-20", end_date: "2027-01-20", title: "結業式" },
  { id: "c3", school_id: "cysh", school_name: "嘉中", start_date: "2026-11-26", end_date: "2026-11-27", title: "第二次期中考" },
];
const items = [handbook, leaveRule].concat(notices);
const opts = { asOf: "2026-11-02", scopeLabel: "嘉中", schoolId: "cysh", calendarEvents: calendar };
const ask = (q) => QA.answer(q, items, details, opts);

/* Rules first. */
let r = ask("手機可以帶嗎");
assert.equal(r.status, "answered");
assert.equal(r.layer, "rule", r.summary);
assert.match(r.summary, /自行妥善保管/);
assert.ok(!(r.also || []).some((row) => row.sources.some((s) => s.id === "cysh-3")), "a phone-game notice is not an answer about phones at school");

/* 行動電話 is the same thing as 手機 / 行動載具. */
r = ask("行動電話上課可以用嗎");
assert.equal(r.layer, "rule", r.summary);

/* The notice about it leads (its 內文 has the details); the calendar adds the due date, and the
   reply does not open with 「找不到」. */
r = ask("閱讀心得報告要交？不交會怎樣？");
assert.deepEqual(r.split, { subject: "閱讀心得報告", aspects: ["consequence"] }, "the question is split into its subject and what is asked");
assert.match(JSON.stringify(r), /閱讀心得繳交流程/);
assert.match(r.summary + JSON.stringify(r.also || []), /11\/20.*高一閱讀心得繳交截止/);
assert.ok((r.also || []).some((row) => /^「不交會怎樣」：/.test(row.text)), "the 不交會怎樣 part gets its own line");
assert.doesNotMatch(r.reply.text, /找不到/);
/* 「期末考範圍」 asks for the 範圍: exam dates are a side note, not the answer. */
r = ask("期中考範圍");
assert.notEqual(r.layer, "calendar");

/* A 「什麼時候」 question: the calendar answers first; a rule clause without a date comes after. */
r = ask("段考什麼時候");
assert.equal(r.layer, "calendar");
assert.match(r.summary, /11\/26.*第二次期中考/);
r = ask("寒假什麼時候");
assert.match(r.summary, /1\/20.*結業式.*1\/21.*起放寒假/);

/* 家長日 = 親師座談. */
r = ask("家長日什麼時候");
assert.match(r.summary + JSON.stringify(r.related || []) + JSON.stringify(r.sources || []), /親師座談/);

/* Rules about 請假 come from the handbook. */
r = ask("請假要怎麼請");
assert.equal(r.layer, "rule", r.summary);
assert.match(r.summary, /三日內|假單/);

/* Guests cannot read the handbook text: point to the chapter named after the question. */
const guestItems = [
  { id: "hb-48", kind: "school_handbook", school: "cysh", school_name: "嘉中", title: "學生手冊 › 學生在校作息時間規定", url: "https://www.cysh.cy.edu.tw/hb.pdf", page_range: [48, 49] },
  { id: "hb-37", kind: "school_handbook", school: "cysh", school_name: "嘉中", title: "學生手冊 › 學生獎懲規定", url: "https://www.cysh.cy.edu.tw/hb.pdf", page_range: [37, 42] },
  { id: "hb-117", kind: "school_handbook", school: "cysh", school_name: "嘉中", title: "學生手冊 › 圖書館借書規定", url: "https://www.cysh.cy.edu.tw/hb.pdf", page_range: [117, 117] },
  { id: "hb-32", kind: "school_handbook", school: "cysh", school_name: "嘉中", title: "學生手冊 › 學生服儀規定事項", url: "https://www.cysh.cy.edu.tw/hb.pdf", page_range: [32, 36] },
  { id: "info-1", kind: "school_info", school: "cysh", school_name: "嘉中", title: "總務處 › 庶務組 › 法令規章", url: "https://www.cysh.cy.edu.tw/p/1.php",
    documents: [{ name: "國立嘉義高級中學工友管理要點及獎懲考核辦法", url: "https://www.cysh.cy.edu.tw/a.pdf" }, { name: "職業衛生安全辦法", url: "https://www.cysh.cy.edu.tw/b.pdf" }] },
];
const guest = (q) => QA.answer(q, guestItems, {}, { asOf: "2026-11-02", scopeLabel: "嘉中", schoolId: "cysh", calendarEvents: [] });
for (const [q, chapter] of [["幾點放學", "學生在校作息時間規定"], ["記過", "學生獎懲規定"], ["書可以借多久", "圖書館借書規定"], ["可以染頭髮嗎", "學生服儀規定事項"]]) {
  r = guest(q);
  assert.equal(r.layer, "rule", q + " → " + r.summary);
  assert.match(r.summary, new RegExp("學生手冊的「" + chapter + "」"), q);
}
assert.doesNotMatch(JSON.stringify(guest("記過")), /工友/, "staff rules are not student rules");
assert.doesNotMatch(JSON.stringify(guest("颱風停課")), /職業衛生安全/, "a topic's broad words do not pull in unrelated documents");
assert.ok(Syn.broader("記過").includes("獎懲") && Syn.broader("放學").includes("作息"));

/* This year's edition of a yearly notice beats last year's, even when last year's title
   matches the question word for word; asking for a year keeps that year. */
const editions = [
  { id: "old", school: "cysh", school_name: "嘉中", date: "2025-10-15", title: "國立嘉義高中114學年度推展閱讀運動閱讀心得報告繳交流程" },
  { id: "new", school: "cysh", school_name: "嘉中", date: "2026-10-19", title: "國立嘉義高中115學年度推展閱讀運動閱讀心得繳交流程、時程與電子檔" },
];
assert.equal(QA.rank("閱讀心得報告要交嗎", editions, {}, { asOf: "2026-11-02" })[0].item.id, "new");
assert.equal(QA.rank("114學年度閱讀心得報告", editions, {}, { asOf: "2026-11-02" })[0].item.id, "old");

/* 2026-11-02 screenshot: two clauses. 「發生什麼事情」 is not 「最近發生什麼新鮮事」; the subject
   is searched on its own everywhere, then each ask gets its own line. */
r = ask("閱讀心得報告怎麼寫？沒寫會發生什麼事情？");
assert.deepEqual(r.split, { subject: "閱讀心得報告", aspects: ["method", "consequence"] });
assert.doesNotMatch(r.summary, /最近一個月/);
assert.match(r.summary + JSON.stringify(r.also), /高一閱讀心得繳交截止/);
assert.ok(r.also.some((row) => /閱讀心得報告怎麼寫/.test(row.text)) && r.also.some((row) => /沒寫會發生什麼事情/.test(row.text)), JSON.stringify(r.also));
/* A clause without its own subject borrows the one before; 「沒請假」 is about 請假. */
r = ask("請假要怎麼請？沒請假會怎樣？");
assert.deepEqual(r.split, { subject: "請假", aspects: ["method", "consequence"] });
assert.equal(r.layer, "rule");
/* One plain clause is not split. */
assert.equal(ask("段考什麼時候").split, undefined);

/* Every answer says which layers were checked, in order. */
assert.deepEqual(ask("手機可以帶嗎").layers_checked, ["rule", "calendar", "announcement"]);
console.log("問校務 three-layer and synonym tests passed");
