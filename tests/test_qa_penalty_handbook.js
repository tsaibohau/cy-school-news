"use strict";
/* 2026-11-03 report: penalty answers 「少找」. Penalties are written only in the handbook's 獎懲 chapter,
   whose title never names the act (遲到、打架、抽菸), so the chapter was not read and the penalty was not found.
   Uses the full public 嘉中 corpus (handbook chapters + notices) so notices compete as they do on the site;
   chapter bodies are short copies of the handbook's layout (the real text is member content). */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const info = require("../docs/data/school-info/cysh.json").items;
const notices = require("../docs/data/schools/cysh/current.json").items;
const items = info.concat(notices);
const chapter = (name) => items.find((i) => i.kind === "school_handbook" && i.title.split("›").pop().trim() === name);
const body = (item, lines) => ({ [item.id]: { announcement_id: item.id, provenance: "official_article", blocks: [{ type: "paragraph", text: lines.join("\n") }], attachments: [] } });
const rules = chapter("學生獎懲規定"), daily = chapter("學生在校作息時間規定");
assert.ok(rules && daily);
const bodies = Object.assign({},
  body(rules, ["國立嘉義高級中學學生獎懲規定", "一、學生之獎懲，除應符合相關法令及規定外，亦應遵循下列原則：", "(一)尊重學生人格尊嚴，重視學生個別差異。",
    "三、學生有下列情形之一者，記警告：", "(一)上學遲到，經勸導仍不改善者。", "(二)服儀不整，經勸導仍不改善者。",
    "五、學生有下列情形之一者，記小過：", "(一)考試時夾帶、傳遞或偷看他人答案者。", "(二)吸菸或持有菸品者。",
    "六、學生有下列情形之一者，記大過：", "(一)考試舞弊或代人考試者。", "(二)聚眾鬥毆，情節嚴重者。",
    "八、學生違反本規定達記大過以上處分，應通知家長。"]),
  body(daily, ["國立嘉義高級中學學生在校作息時間規定", "一、學生應於上午7:30前到校。", "二、早上7:30以後到校者為遲到，由學務處登記。"]));
const opts = { asOf: "2026-11-03", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: [] };
const text = (r) => [r.summary, (r.reply && r.reply.text) || "", ((r.reply && r.reply.bullets) || []).join(" "), (r.also || []).map((a) => a.text).join(" ")].join(" ");
/* What the site does: read the chosen documents, then answer from what was read. */
function ask(q) {
  const read = QA.readList(q, items, opts), details = {};
  read.forEach((item) => { if (bodies[item.id]) details[item.id] = bodies[item.id]; });
  return QA.answer(q, items, details, opts);
}
const cases = [
  ["遲到會怎樣", /記警告：上學遲到/],
  ["遲到會被記過嗎", /記警告：上學遲到/],
  ["打架會怎樣", /記大過：聚眾鬥毆/],
  ["抽菸會記幾支過", /記小過：吸菸/],
  ["段考怎樣會被記過", /考試時夾帶|考試舞弊/],
  ["服裝不整會被處罰嗎", /服儀不整/],
];
for (const [q, want] of cases) {
  const r = ask(q);
  assert.match(text(r), want, q + " → " + text(r));
  assert.doesNotMatch(text(r), /人格尊嚴/, q);
}
/* Not a penalty question: the 獎懲 chapter is not read. */
assert.ok(!QA.readList("圖書館幾點開", items, opts).some((i) => i.id === rules.id));
assert.ok(QA.readList("遲到會怎樣", items, opts).some((i) => i.id === rules.id));
/* Layouts seen in the real handbooks (lines written for this test, not copied):
   - a heading that ends with 「。」: 「…之一者，記大過一次，且該科成績零分計算。」
   - 嘉女: 「第十條 有下列事蹟之一者記警告：」 › 「六、…」, numbers like 「廿八、」
   - 「(不含…遲到)」 means the rule is not about 遲到; 改過銷過 is not a penalty. */
const QA2 = QA;
const exam = { id: "t-exam", kind: "school_handbook", school: "cysh", school_name: "嘉中", title: "學生手冊 › 學生考試要點" };
const girls = { id: "t-gp", kind: "school_handbook", school: "cygsh", school_name: "嘉女", title: "學生規定 › 學生獎懲規定" };
const clear = { id: "t-clear", kind: "school_handbook", school: "cygsh", school_name: "嘉女", title: "學生規定 › 學生改過銷過辦法" };
const lay = Object.assign({},
  body(exam, ["十一、學生考試時有下列情形之一者，記大過一次，且該科成績零分計算。", "(一)夾帶小抄進場者。", "(二)與他人交換答案卷者。"]),
  body(girls, ["第十條 有下列事蹟之一者記警告：", "三、未依時完成愛校服務，經勸導仍未改正者(不含服儀違規、遲到)。", "第十一條 有下列事蹟之一者記小過：", "廿八、出手毆打他人、情節輕微者。", "九、違反本校「試場規則」，經勸導仍未改正者。"]),
  body(clear, ["一、受警告處分者，完成愛校服務後得申請銷過。"]));
const girlsOpts = { asOf: "2026-11-04", schoolId: "cygsh", scopeLabel: "嘉女", calendarEvents: [] };
let r = QA2.answer("考試作弊會怎樣", [exam], lay, opts);
assert.match(text(r), /記大過一次，且該科成績零分計算：夾帶小抄/, text(r));
r = QA2.answer("打架會怎樣", [girls, clear], lay, girlsOpts);
assert.match(text(r), /記小過：出手毆打他人/, text(r));
assert.doesNotMatch(text(r), /銷過/);
r = QA2.answer("考試作弊會怎樣", [girls, clear], lay, girlsOpts);
assert.match(text(r), /試場規則/, "a clause pointing to the exam rules counts for 作弊");
r = QA2.answer("遲到會怎樣", [girls, clear], lay, girlsOpts);
assert.doesNotMatch(text(r), /愛校服務，經勸導/, "(不含…遲到) is not a rule about 遲到");
/* Ordinary questions keep their old answers: no penalty preference outside 會怎樣 questions. */
assert.equal(QA2.asksPenalty("圖書館幾點開"), false);
console.log("penalty handbook tests passed");
