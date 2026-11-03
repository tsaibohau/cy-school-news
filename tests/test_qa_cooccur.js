"use strict";
/* 2026-11-03 real-device report: 「段考怎樣會被記過」 quoted the opening principles of the 獎懲規定
   (「學生之獎懲…尊重學生人格尊嚴」) and an unrelated 「記大過以上…通知家長」 line. The answer must be
   a clause about the exam AND the penalty; a list item is read with its heading (記小過：(一)考試…). */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const T = require("../docs/announcement-tokens.js");
/* The real 學生獎懲規定 entry (public metadata); its body here is a shortened copy of the handbook's layout. */
const info = require("../docs/data/school-info/cysh.json");
const item = [].concat(info.items || [], (info.handbook && info.handbook.items) || []).find((row) => /獎懲規定/.test(row.title || ""));
assert.ok(item, "嘉中 學生獎懲規定 is indexed");
const text = ["國立嘉義高級中學學生獎懲規定", "一、學生之獎懲，除應符合相關法令及規定外，亦應遵循下列原則：", "(一)配合學生心智發展需求，尊重學生人格尊嚴，重視學生個別差異。",
  "(二)發揮教育愛心與耐心，多獎勵少懲罰，積極維護學生受教權益。", "(三)獎懲之決定，應力求審慎客觀，兼顧學生隱私權。",
  "五、學生有下列情形之一者，記小過：", "(一)考試時夾帶、傳遞、偷看他人答案或其他違反試場規則情節較重者。", "(二)無故曠課累計達十四節者。",
  "六、學生有下列情形之一者，記大過：", "(一)考試舞弊或代人考試者。", "(二)偷竊他人財物者。",
  "七、獎懲之程序：", "(一)嘉獎及小功之獎勵，由導師簽請核定。", "(二)警告及小過之懲處，由有關教職員工提供參考資料，填具獎懲建議單並會導師、學創人員。",
  "八、學生違反本規定達記大過以上處分，應依教育部「高級中等以下學校提供家庭教育諮商或輔導辦法」通知家長。"].join("\n");
const details = { [item.id]: { announcement_id: item.id, provenance: "official_article", blocks: [{ type: "paragraph", text }], attachments: [] } };
const opts = { asOf: "2026-11-03", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: [] };
const all = (r) => [r.summary, (r.reply && r.reply.text) || "", ((r.reply && r.reply.bullets) || []).join(" "), (r.also || []).map((a) => a.text).join(" ")].join(" ");

let r = QA.answer("段考怎樣會被記過", [item], details, opts);
assert.match(all(r), /記小過：考試時夾帶/);
assert.match(all(r), /記大過：考試舞弊/);
assert.doesNotMatch(all(r), /人格尊嚴|家庭教育諮商|獎懲建議單/, "no principles, no unrelated penalty, no procedure");
r = QA.answer("考試作弊會怎樣", [item], details, opts);
assert.match(all(r), /記大過：考試舞弊/, "作弊 = 舞弊");
r = QA.answer("曠課會被記過嗎", [item], details, opts);
assert.match(all(r), /記小過：無故曠課/);
assert.doesNotMatch(all(r), /考試/);

/* Labels: a list item inherits its heading's penalty; 段考 also matches a segment that says 考試. */
const tokens = T.tokenize(details[item.id], { title: item.title });
const exam = tokens.segments.find((s) => s.t.includes("考試") && s.k.includes("penalty"));
assert.ok(exam, JSON.stringify(tokens.segments));
assert.equal(T.match(tokens, T.tokenizeQuestion("段考怎樣會被記過")).segment.t.includes("考試"), true);
console.log("co-occurrence tests passed");
