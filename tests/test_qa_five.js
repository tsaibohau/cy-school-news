"use strict";
/* 問校務：兩校比較題（「校運會日期的差異」→「那嘉中呢」）、校運會不誤配「學校運動教練」公告、
   日期題不附成績公告、同一句裡兩件不相干的事分段回答、學測錄取率不拿經驗分享檔案充數。全部是虛構資料。 */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");

/* ---- 1. 兩校行事曆不同：沒指定學校 + 「差異」→ 各校一段 + 差異段；追問「那嘉中呢」→ 嘉中自己的答案 ---- */
const cal = [
  { id: "c1", school_id: "cysh", school_name: "嘉中", title: "校運會", start_date: "2026-11-05", end_date: "2026-11-06" },
  { id: "c2", school_id: "cygsh", school_name: "嘉女", title: "校慶運動會", start_date: "2026-12-04", end_date: "2026-12-04" },
];
const notice = (id, school, name, date, title) => ({ id, school, school_name: name, date, title });
const items = [
  notice("a1", "cysh", "嘉中", "2026-11-06", "115學年度校運成績公告"),
  notice("a2", "cygsh", "嘉女", "2026-10-06", "「115年度高級中等以下學校運動教練校園性別事件專業增能研習實施計畫」"),
  notice("a3", "cygsh", "嘉女", "2026-04-27", "115年嘉義市運動會成績得獎名單"),
];
const both = { asOf: "2026-11-07", schoolId: "", scopeLabel: "", calendarEvents: cal };
const flat = (r) => {
  const rep = r.reply || {};
  return [rep.text].concat(rep.bullets || [], (rep.paragraphs || []).map((p) => [p.heading, p.text].concat(p.bullets || [], p.asides || [], [p.source]).join("\n"))).join("\n");
};
let r = QA.answer("校運會日期的差異", items, {}, both);
assert.equal(r.mode, "multi_school");
assert.deepEqual(r.reply.paragraphs.map((p) => p.heading), ["嘉中", "嘉女", "差異"]);
assert.match(r.reply.paragraphs[0].text, /11\/5.*11\/6.*「校運會」/);
assert.match(r.reply.paragraphs[1].text, /12\/4.*「校慶運動會」/);
assert.match(r.reply.paragraphs[2].text, /日期不一樣：嘉中是 11\/5～11\/6，嘉女是 12\/4/);
assert.doesNotMatch(flat(r), /性別事件|運動教練|成績公告|嘉義市運動會/, "no unrelated notices");
/* 同一天就說一樣。 */
const same = [Object.assign({}, cal[0]), Object.assign({}, cal[1], { start_date: "2026-11-05", end_date: "2026-11-06" })];
r = QA.answer("校運會日期有什麼不同", items, {}, Object.assign({}, both, { calendarEvents: same }));
assert.match(r.reply.paragraphs[2].text, /日期一樣/);
/* 只有一間有資料：照實說沒辦法比較。 */
r = QA.answer("校運會日期的差異", items, {}, Object.assign({}, both, { calendarEvents: [cal[0]] }));
assert.match(flat(r), /沒有查到相關內容，所以只能看嘉中的說法，沒辦法比較/);
/* 追問：上一題帶「差異」，「那嘉中呢」要回嘉中自己的日期，不是再比一次。 */
const fu = QA.resolveFollowUp("那嘉中呢", { query: "校運會日期的差異", answered: true });
assert.equal(fu.query, "嘉中 校運會日期");
const one = { asOf: "2026-11-07", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: [cal[0]] };
r = QA.answer(fu.query, items.filter((i) => i.school === "cysh"), {}, one);
assert.match(r.reply.text, /11\/5.*11\/6.*「校運會」/);
assert.doesNotMatch(flat(r), /成績|名次/, "a results notice does not say when");
/* 只問一間：不受影響。 */
r = QA.answer("嘉女校運會什麼時候", items, {}, both);
assert.match(r.reply.text, /12\/4/);
assert.doesNotMatch(flat(r), /性別事件|運動教練|嘉義市運動會/);

/* ---- 2. 「學校運動…」「○○市運動會」不是校運會 ---- */
r = QA.answer("校運會是哪天", items.slice(1), {}, { asOf: "2026-11-07", schoolId: "cygsh", scopeLabel: "嘉女", calendarEvents: [cal[1]] });
assert.match(r.reply.text, /12\/4/);
assert.doesNotMatch(flat(r), /運動教練|嘉義市運動會/);

/* ---- 3. 同一句兩件不相干的事：各答各的，病假不被「忘記帶學生證」那句罐頭話取代 ---- */
const rule = (n, title, text, keywords) => ({
  item: { id: "cysh-handbook-115-" + n, kind: "school_handbook", title: "學生手冊 › " + title, school: "cysh", school_name: "嘉中", url: "https://school.example/" + n, category: "校園資訊", date: "2026-09-01", page_range: [n, n + 1], keywords },
  detail: { announcement_id: "cysh-handbook-115-" + n, provenance: "official_article", source_hash: "h" + n, blocks: [], attachments: [{ provenance: "official_attachment", parse_status: "parsed", filename: "手冊.pdf", embedded_text: text }] },
});
const docs = [
  rule(1, "學生在校作息時間規定", "國立嘉義高級中學 學生在校作息時間規定\n一、依據：教育部發布之學生在校作息時間規劃注意事項訂定。\n二、遲到：老師到班後至曠課時間前為遲到，遲到累計三次視同曠課一節。\n三、曠課：無故逾時十分鐘以上未到者以曠課論，累計曠課三節記警告一次。", ["作息", "遲到", "曠課"]),
  rule(2, "學生請假要點", "國立嘉義高級中學 學生請假要點\n三、學生因病請假，應於當日上午8時前由家長電話向導師說明，返校後三日內補辦請假手續。", ["請假", "病假"]),
];
const ritems = docs.map((d) => d.item).concat(["圖書館新書展", "園遊會義賣", "籃球賽報名", "社團博覽會", "健康檢查通知", "防災演練通知"].map((title, n) => ({ id: "cysh-n" + n, school: "cysh", school_name: "嘉中", date: "2026-10-0" + (n + 1), title, category: "活動" }))), rdetails = Object.fromEntries(docs.map((d) => [d.item.id, d.detail]));
const ropts = { asOf: "2026-11-07", schoolId: "cysh", scopeLabel: "嘉中" };
r = QA.answer("我睡過頭遲到了，會被記什麼？還有如果要請病假要怎麼辦手續", ritems, rdetails, ropts);
assert.equal(r.mode, "multi_question");
assert.equal(r.reply.paragraphs.length, 2);
assert.match(r.reply.paragraphs[0].heading, /遲到/);
assert.match(flat(r), /曠課/);
assert.match(r.reply.paragraphs[1].text + (r.reply.paragraphs[1].bullets || []).join(""), /請假|補辦/);
assert.doesNotMatch(flat(r), /忘記帶學生證/);
/* 同一個主題的追問、只問細節的第二句：不拆開。 */
for (const q of ["請假要怎麼請？請假手續是什麼", "有沒有清寒獎學金可以申請？需要準備什麼資料", "遲到會怎樣？還有遲到怎麼算"]) {
  assert.notEqual(QA.answer(q, ritems, rdetails, ropts).mode, "multi_question", q);
}
/* 兩校：每間學校下面各自分段。 */
const two = QA.answer("我睡過頭遲到了，會被記什麼？還有如果要請病假要怎麼辦手續", ritems, rdetails, Object.assign({}, ropts, { schoolId: "", scopeLabel: "", calendarEvents: [{ school_id: "cysh" }, { school_id: "cygsh" }] }));
assert.equal(two.mode, "multi_school");
assert.ok(two.reply.paragraphs.some((p) => /^嘉中｜/.test(p.heading)), JSON.stringify(two.reply.paragraphs.map((p) => p.heading)));

/* ---- 4. 學測錄取率：經驗分享檔案不是數字 ---- */
const guide = { id: "cygsh-info-9", kind: "school_info", school: "cygsh", school_name: "嘉女", title: "輔導室 › 生涯輔導 › 高二專區",
  documents: [{ name: "114學年度學測準備經驗分享-數A.自然", url: "https://school.example/tips.pdf" }] };
r = QA.answer("學測錄取率是多少", [guide], {}, { asOf: "2026-11-07", schoolId: "cygsh", scopeLabel: "嘉女" });
assert.notEqual(r.mode, "document");
assert.doesNotMatch(flat(r) + (r.summary || ""), /公布的成績在官方文件/);

console.log("qa five tests passed");
