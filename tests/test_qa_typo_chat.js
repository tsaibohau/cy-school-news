"use strict";
/* 2026-11-03: 打錯字、閒聊幹話、深度判斷、設定儲存後跳回原值。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const T = require("../docs/qa-typo.js");
const QA = require("../docs/assistant-qa.js");

/* Typos: one same-sound character, only into a school word. */
for (const [typed, fixed] of [["段烤什麼時候", "段考什麼時候"], ["學身證丟了怎麼辦", "學生證丟了怎麼辦"], ["請價要怎麼請", "請假要怎麼請"],
  ["獎學今怎麼申請", "獎學金怎麼申請"], ["行事力在哪看", "行事曆在哪看"], ["服裝議容規定", "服裝儀容規定"], ["成積單", "成績單"], ["圖書管幾點開", "圖書館幾點開"]]) {
  assert.equal(T.fix(typed).query, fixed, typed);
}
for (const fine of ["期中考是哪幾天", "缺曠紀錄怎麼查", "我的成績在哪查", "補考要繳費嗎", "明天要考試嗎", "書可以借多久", "我身體不舒服", "高二模擬考是哪天"]) {
  assert.equal(T.fix(fine).query, fine, "left alone: " + fine);
}
const cal = [{ school_id: "cysh", school_name: "嘉中", title: "第二次期中考", date: "2026-11-26", end_date: "2026-11-27", kind: "exam" }];
const r = QA.answer("段烤什麼時候", [], {}, { asOf: "2026-11-03", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: cal });
assert.match(r.reply.text, /^（我把「段烤」當成「段考」）/, "the answer says how the question was read");
assert.deepEqual(r.typo, [{ from: "段烤", to: "段考" }]);

/* Small talk: a little banter, never a 「找不到」. */
for (const [q, kind] of [["你好嗎", "howareyou"], ["你在幹嘛", "doing"], ["你叫什麼名字", "name"], ["我好緊張", "stress"], ["我被罵了", "sad"],
  ["幫我加油", "cheer"], ["推薦一部電影", "recommend"], ["你會不會累", "aitired"]]) {
  const a = QA.answer(q, [], {}, { asOf: "2026-11-03" });
  assert.equal(a.mode, "chat", q);
  assert.equal(a.chat, kind, q);
}
assert.equal(QA.answer("你會唱歌嗎", [], {}, { asOf: "2026-11-03" }).chat, "offtopic", "off-topic gets a light reply");
assert.notEqual(QA.answer("你知道明天段考嗎", [], {}, { asOf: "2026-11-03", calendarEvents: cal }).mode, "chat", "a school question with 你 is still searched");

/* 深度判斷: says what was compared and why. */
const items = [
  { id: "a", school: "cysh", school_name: "嘉中", title: "115-1第二次段考時間表", date: "2026-11-01", tokens: { v: 1, title: ["段考"], segments: [{ s: 0, t: ["段考"], k: ["time"], d: ["2026-11-26"] }] } },
  { id: "b", school: "cysh", school_name: "嘉中", title: "【複習考】高三第三次複習考時間表", date: "2026-11-02", tokens: { v: 1, title: ["段考"], segments: [{ s: 0, t: ["段考"], k: ["time"], d: ["2026-11-18"] }] } }];
const d = QA.answer("段考什麼時候", items, {}, { asOf: "2026-11-03", schoolId: "cysh", deep: true });
assert.ok(d.deep && d.deep.compared >= 1 && Array.isArray(d.deep.picked), JSON.stringify(d.deep));
assert.equal((d.sources || [])[0].id, "a", "the notice titled 段考 beats a 複習考 one");

/* Settings: sent to the server right away, and the PUBLIC editor shows the server's values. */
const app = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");
assert.match(app, /if \(type\.indexOf\("calendar\."\) !== 0\) scheduleAccountDrain\(\);/);
const caps = fs.readFileSync(path.join(__dirname, "..", "docs", "capability-layer.js"), "utf8");
assert.match(caps, /if \(owner\) controller\.getPublicCapabilities\(\)/);
assert.match(caps, /data-version/);
console.log("typo, chat, deep and settings tests passed");
