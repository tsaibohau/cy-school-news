"use strict";
/* 問校務：兩校校長分段回答、重複提問、「這兩個人差在哪裡」追問、並排比較。全部是虛構資料。 */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");

const page = (id, school, name, title, lines) => ({
  item: { id, title, kind: "school_info", school, school_name: name, summary: "", snippet: "", url: "https://school.example/" + id, date: "" },
  detail: { provenance: "official_article", announcement_id: id, source_hash: "h" + id, blocks: lines.map((text) => ({ type: "paragraph", text })), attachments: [] }
});
const rows = [
  page("a1", "cysh", "嘉中", "行政單位 › 校長室", ["王大明 校長", "【學歷】", "星河大學教育博士", "星河大學教育碩士", "【經歷】", "星河高中教師兼教務主任"]),
  page("b1", "cygsh", "嘉女", "行政單位 › 校長室", ["李小華 校長", "【學歷】", "月光大學教育碩士", "【經歷】", "月光女中教師兼學務主任"]),
];
const items = rows.map((r) => r.item), details = {};
rows.forEach((r) => { details[r.item.id] = r.detail; });
const BOTH = { asOf: "2026-11-07", schoolId: "", scopeLabel: "", calendarEvents: [{ school_id: "cysh" }, { school_id: "cygsh" }] };
const ask = (q, extra) => QA.answer(q, items, details, Object.assign({}, BOTH, extra || {}));
const flat = (r) => {
  const rep = r.reply || {};
  return [rep.text].concat((rep.bullets || []), (rep.paragraphs || []).map((p) => [p.heading, p.text].concat(p.bullets || []).join("\n")), [rep.tail]).join("\n");
};

/* 1. 沒指定學校：兩校各一段，各自有姓名與學歷。 */
const first = ask("校長是誰？");
assert.equal(first.mode, "multi_school");
assert.deepEqual(first.reply.paragraphs.map((p) => p.heading), ["嘉中", "嘉女"]);
assert.match(first.reply.paragraphs[0].text, /王大明/);
assert.match(first.reply.paragraphs[1].text, /李小華/);
assert.match(flat(first), /星河大學教育博士/);
assert.match(flat(first), /月光大學教育碩士/);
assert.deepEqual(first.entities.map((e) => e.name), ["王大明", "李小華"]);
/* 指名兩間學校但沒有比較詞：一樣分段。 */
assert.deepEqual(ask("嘉中嘉女的校長是誰").reply.paragraphs.map((p) => p.heading), ["嘉中", "嘉女"]);
/* 只指名一間：只答那一間。 */
assert.match(ask("嘉女校長是誰").reply.text, /李小華/);
assert.doesNotMatch(ask("嘉女校長是誰").reply.text, /王大明/);

/* 2. 重複同一題：答案完整一致，沒有「再回答一次」之類的開場白。 */
const again = ask("校長是誰？", { lastQuestion: "校長是誰？" });
assert.deepEqual(again.reply, first.reply);
assert.doesNotMatch(flat(again), /再回答一次|再說明一次|再整理一次/);

/* 3. 追問「這兩個人差在哪裡？」：用上一輪的兩位校長並排比較。 */
const prev = QA.turnSummary("校長是誰？", first);
assert.equal(prev.entities.length, 2);
assert.deepEqual(prev.schools, ["cysh", "cygsh"]);
for (const q of ["這兩個人差在哪裡？", "他們有什麼不同", "這兩位校長差在哪", "兩者哪裡不一樣"]) {
  const cmp = ask(q, { previousTurn: prev });
  assert.equal(cmp.mode, "compare", q);
  const t = flat(cmp);
  assert.match(t, /王大明/); assert.match(t, /李小華/);
  assert.match(t, /學歷不同/, q);
  assert.match(t, /經歷不同/, q);
  assert.deepEqual(cmp.reply.paragraphs.map((p) => p.heading), ["嘉中", "嘉女", "差異摘要"]);
  assert.doesNotMatch(t, /較好|比較優秀|更適合/, "no rating of people");
}
/* 頁面沒寫的就明說，不猜。 */
const thin = rows.slice();
const thinItems = [rows[0].item, page("b2", "cygsh", "嘉女", "行政單位 › 校長室", ["李小華 校長"]).item];
const thinDetails = { a1: rows[0].detail, b2: page("b2", "cygsh", "嘉女", "行政單位 › 校長室", ["李小華 校長"]).detail };
const thinFirst = QA.answer("校長是誰", thinItems, thinDetails, BOTH);
const thinCmp = QA.answer("這兩個人差在哪裡", thinItems, thinDetails, Object.assign({}, BOTH, { previousTurn: QA.turnSummary("校長是誰", thinFirst) }));
assert.match(flat(thinCmp), /嘉女的頁面沒有寫，無法比較/);
assert.equal(thin.length, 2);
/* 單一欄位追問。 */
const edu = ask("他們的學歷呢", { previousTurn: prev });
assert.match(flat(edu), /王大明/); assert.match(flat(edu), /月光大學教育碩士/);

/* 3b. 追問指不到任何人：請使用者說清楚，不拿無關公告亂答。 */
const notice = { id: "n1", title: "家庭教育講座報名", school: "cysh", school_name: "嘉中", summary: "家庭教育講座", snippet: "", url: "https://school.example/n1", date: "2026-11-01" };
for (const prevTurn of [null, QA.turnSummary("圖書館幾點開", { status: "answered", mode: "rule", entities: [] })]) {
  const lost = QA.answer("這兩個人差在哪裡？", items.concat([notice]), details, Object.assign({}, BOTH, { previousTurn: prevTurn }));
  assert.equal(lost.mode, "chat");
  assert.equal(lost.status, "insufficient");
  assert.match(lost.reply.text, /我不確定你指的是哪兩個，可以說得完整一點嗎？例如「嘉中和嘉女的校長差在哪裡」/);
  assert.equal((lost.sources || []).length, 0);
}
/* 「這個」之類一般用語不受影響。 */
assert.notEqual(ask("這個活動什麼時候").mode, "chat");

/* 4. 單獨的比較問句：兩校官網頁面並排。 */
for (const q of ["嘉中和嘉女的校長差在哪裡", "兩校校長有什麼不同", "嘉中跟嘉女校長有什麼差別"]) {
  const cmp = ask(q);
  assert.equal(cmp.mode, "compare", q);
  assert.deepEqual(cmp.reply.paragraphs.map((p) => p.heading), ["嘉中", "嘉女", "差異摘要"], q);
  assert.match(flat(cmp), /王大明/); assert.match(flat(cmp), /李小華/);
  assert.match(flat(cmp), /學歷不同/);
}
/* 應用程式的比較路徑：每校用「校長是誰」回答，再交給 compareResults。 */
const plan = QA.comparePlan("嘉中和嘉女的校長差在哪裡", [{ id: "cysh", name: "嘉義高級中學", short: "嘉中", aliases: [] }, { id: "cygsh", name: "嘉義女子高級中學", short: "嘉女", aliases: [] }], null);
assert.deepEqual(plan.schools, ["cysh", "cygsh"]);
assert.equal(plan.topic, "校長是誰");
const per = plan.schools.map((id) => {
  const mine = items.filter((i) => i.school === id);
  return { school: { id, short: id === "cysh" ? "嘉中" : "嘉女" }, result: QA.answer(plan.topic, mine, details, Object.assign({}, BOTH, { schoolId: id })) };
});
const viaApp = QA.compareResults(plan.topic, per);
assert.equal(viaApp.mode, "compare");
assert.match(flat(viaApp), /學歷不同/);
assert.equal(viaApp.entities.length, 2);
/* 其他主題的比較照舊（規定並排），不被校長比較攔走。 */
assert.equal(QA.comparePlan("嘉中和嘉女的請假規定差在哪", [{ id: "cysh", short: "嘉中", name: "嘉義高級中學" }, { id: "cygsh", short: "嘉女", name: "嘉義女子高級中學" }], null).topic, "請假規定");

console.log("qa compare tests passed");
