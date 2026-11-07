"use strict";
/* 2026-11-07: 問校務的回答像人說話：第一段直接回答，細節分點，來源只在最後說一次；
   兩間學校分段（reply.paragraphs）；不留一、（一）編號、重複詞、被遮蔽姓名的句子。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const C = require("../docs/answer-composer.js");
const QA = require("../docs/assistant-qa.js");

/* Numbering goes, content stays; 1.5 小時 is not numbering. */
assert.equal(C.stripNumbering("（一）廿五、1. 違反規定"), "違反規定");
assert.equal(C.stripNumbering("1.5 小時"), "1.5 小時");
/* OCR doubles: a repeated 2-4 character word and a repeated label; real repeats stay. */
assert.equal(C.dedupeText("且情節情節輕微者"), "且情節輕微者");
assert.equal(C.dedupeText("實施方式：實施方式：輔導內容"), "實施方式：輔導內容");
assert.equal(C.dedupeText("一個一個依序進場"), "一個一個依序進場");

/* The compose templates carry no source and no snark; a verdict stands alone. */
const all = JSON.stringify(C.TEMPLATES) + JSON.stringify([C.PENALTY_FOUND, C.PENALTY_NONE, C.PENALTY_LATE]);
assert.doesNotMatch(all, /別賭|不是我不努力|😏|😑|🙄|重點如下|是這樣寫的|裡寫到/);
const deny = C.compose({ query: "午休可以滑手機嗎", text: "上課、午休及集會，皆不得使用行動載具。" });
assert.equal(deny.head.replace(/喔/, ""), "不可以。");
assert.equal(deny.lead, "上課、午休及集會，皆不得使用行動載具。");

/* A rule answer: verdict + why, details as points, the source once on its own line. */
const rule = { id: "hb-1", kind: "school_handbook", school: "cysh", school_name: "嘉中", title: "學生手冊 › 學生考試要點", page_range: [24, 25], url: "https://x/hb.pdf" };
const detail = { "hb-1": { announcement_id: "hb-1", provenance: "official_article", blocks: [{ type: "paragraph", text:
  "一、學生在定期性考試時，每節均必須攜帶學生證應試。\n二、如未攜帶學生證，應到教務處註冊組申領臨時學生證。\n三、情節情節輕微者，記警告乙次。\n四、王〇明同學負責監考。" }], attachments: [] } };
const opts = { asOf: "2026-11-07", scopeLabel: "嘉中", schoolId: "cysh", calendarEvents: [] };
let r = QA.answer("段考忘記帶學生證怎麼辦", [rule], detail, opts);
assert.equal(r.mode, "rule");
const rep = r.reply;
assert.match(rep.source, /^資料來源：嘉中學生手冊〈學生考試要點〉（第 24–25 頁）$/);
assert.doesNotMatch(rep.text, /學生手冊|重點如下|寫到|別賭|整理好了/, rep.text);
const lines = [rep.text].concat(rep.bullets).join("\n");
assert.doesNotMatch(lines, /[一二三四]、|（一）/, "list numbers are taken out");
assert.doesNotMatch(lines, /情節情節/, "doubled words are taken out");
assert.doesNotMatch(lines, /〇/, "a line with a masked name is dropped");
assert.match(lines, /臨時學生證/);

/* Nothing found: said plainly, no snark. */
r = QA.answer("學校有養貓嗎", [], {}, opts);
assert.equal(r.status, "insufficient");
assert.doesNotMatch(r.reply.text, /努力|考倒|手都酸|亂掰|🥲|😤/);

/* Two schools: one section per school with a heading, each in the same shape. */
const rule2 = { id: "hb-2", kind: "school_handbook", school: "cygsh", school_name: "嘉女", title: "學生規定 › 學生考試要點", url: "https://x/hb2.pdf" };
const detail2 = { "hb-2": { announcement_id: "hb-2", provenance: "official_article", blocks: [{ type: "paragraph", text: "一、學生在定期性考試時，應攜帶學生證應試。\n二、未攜帶者，應向教務處申請臨時學生證。" }], attachments: [] } };
r = QA.answer("段考忘記帶學生證怎麼辦", [rule, rule2], Object.assign({}, detail, detail2), { asOf: "2026-11-07", calendarEvents: [] });
assert.equal(r.mode, "multi_school");
const paragraphs = r.reply.paragraphs;
assert.deepEqual(paragraphs.map((p) => p.heading), ["嘉中", "嘉女"]);
assert.ok(paragraphs.every((p) => p.text && /^資料來源：/.test(p.source)), JSON.stringify(paragraphs));
assert.ok(r.reply.bullets.some((b) => /^嘉中：/.test(b)), "the flat bullets stay for older callers");

/* The page renders sections escaped, with headings. */
const app = fs.readFileSync(require.resolve("../docs/app.js"), "utf8");
assert.match(app, /chat-section/);
assert.match(app, /reply\.paragraphs/);
assert.match(app, /esc\(part\.heading\)/);
console.log("natural reply tests passed");
