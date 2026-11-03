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
console.log("penalty handbook tests passed");
