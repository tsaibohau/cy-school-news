"use strict";
/* 問校務「巨細靡遺」：同一則公告回答一個欄位時，連同時間、期限、名額、對象、報名一起列出。全部是虛構資料。 */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const C = require("../docs/answer-composer.js");

const OPTS = { asOf: "2026-11-07", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: [] };
const mk = (id, title, lines, date) => ({
  item: { id, title, school: "cysh", school_name: "嘉中", summary: "", snippet: "", url: "https://school.example/" + id, date: date || "2026-11-02" },
  detail: { provenance: "official_article", announcement_id: id, source_hash: "h" + id, blocks: lines.map((text) => ({ type: "paragraph", text })), attachments: [] }
});
const run = (q, rows, opts) => {
  const items = rows.map((r) => r.item), details = {};
  rows.forEach((r) => { details[r.item.id] = r.detail; });
  const r = QA.answer(q, items, details, Object.assign({}, OPTS, opts || {}));
  return { r, said: QA.conversational(r) };
};
const flat = (x) => x.said.text + "\n" + (x.said.bullets || []).join("\n");

/* 1. 問地點 → 地點加上同一場活動的時間、期限、名額、對象、報名方式。 */
const star = mk("s1", "【星空觀測報名】第3屆星際天文競賽校內甄選", [
  "星河大學第3屆星際天文競賽 本校代表校內甄選",
  "一、本表單僅限 星河高中在校高一高二學生 填報 。",
  "有興趣的同學，即日起至115年11月17日上午8：00止，填妥報名表單參加校內甄選，逾時不候。",
  "二、教務處將於115年12月02日(三)下午14:30-15:30舉辦校內甄選競試，依成績擇優推薦。",
  "校內甄選地點：天文館二樓觀測室。",
  "三、本校可提報之參賽代表名額為8人，如至截止日期，報名人數未達8人，將公告取消本次甄選。",
  "(欲報名者，請掃描QRcode，或報名連結: https://forms.example.org/star 填妥送出。)"
]);
let x = run("我這次參加星際天文競賽，但是我不知道要去哪裡比", [star]);
let t = flat(x);
assert.equal(x.r.status, "answered");
assert.match(t, /天文館二樓觀測室/);
assert.match(t, /12月0?2日/);
assert.match(t, /14:30/);
assert.match(t, /15:30/, "the time range keeps its end");
assert.match(t, /11月17日/);
assert.match(t, /8:00/);
assert.match(t, /8 人/);
assert.match(t, /取消/);
assert.match(t, /高一高二/);
assert.match(t, /forms\.example\.org\/star/);
/* quota is a field of its own */
const f = C.fieldsOf({ lines: star.detail.blocks.map((b) => b.text), title: star.item.title, posted: "2026-11-02" });
assert.match(f.slots.quota.value, /8 人/);
assert.equal(C.askedSlot("星際天文競賽名額有幾人"), "quota");
x = run("星際天文競賽什麼時候考", [star]);
t = flat(x);
assert.match(t, /天文館二樓觀測室/, "asking the time also lists the place");
assert.match(t, /11月17日/);

/* 2. 學校網頁上的校長、主任姓名（公開職稱）。 */
const page = (id, title, lines) => ({ item: { id, title, kind: "school_info", school: "cysh", school_name: "嘉中", summary: "", snippet: "", url: "https://school.example/" + id, date: "" },
  detail: { provenance: "official_article", announcement_id: id, source_hash: "h" + id, blocks: lines.map((text) => ({ type: "paragraph", text })), attachments: [] } });
const principal = page("p1", "行政單位 › 校長室", ["王大明 校長", "【自我期許】", "「心念有多大，願力就有多大」", "【學歷】", "星河大學教育博士", "星河大學教育碩士", "【經歷】", "星河高中教師兼教務主任"]);
const past = page("p2", "關於本校 › 歷任校長", ["屆別 校長姓名 任期", "第一任 李老舊 1950"]);
const staff = page("p3", "認識本校 › 行政單位聯絡資訊", ["輔導主任 李小華 1601", "學務主任 張美麗 1301", "校長 王大明 1001"]);
const group = page("p4", "學務處 › 衛生組 › 組織與職掌", ["衛生組長陳阿福 老師", "辦理健康檢查"]);
const rows = [principal, past, staff, group];
x = run("星河高中的校長名字叫什麼？", rows);
assert.equal(x.r.status, "answered");
assert.match(x.said.text, /王大明/);
assert.match(flat(x), /星河大學教育博士/, "the principal's background is listed too");
assert.doesNotMatch(flat(x), /李老舊/);
assert.ok(!QA.isPersonalDataQuery("校長名字叫什麼"), "an official's name is public, not student data");
assert.match(run("校長是誰", rows).said.text, /王大明/);
assert.match(run("輔導主任是誰", rows).said.text, /李小華/);
assert.match(run("學務主任叫什麼名字", rows).said.text, /張美麗/);
assert.match(run("衛生組長是誰", rows).said.text, /陳阿福/);
/* only the title's person; a student's name is never looked up */
x = run("歷任校長有哪些", rows);
assert.doesNotMatch(x.said.text, /王大明是|的校長是王大明/);
/* the read list fetches the pages that name people */
assert.ok(QA.readList("輔導主任是誰", rows.map((r) => r.item), OPTS).some((i) => i.id === "p3"));

/* 3a. 打錯字修正不能切開常用詞：「課程大致」的「程大」不是「成大」。 */
const Typo = require("../docs/qa-typo.js");
assert.deepEqual(Typo.fix("多元選修的課程大致上會有什麼").fixes, []);
assert.deepEqual(Typo.fix("工程大學的過程與流程").fixes, []);
assert.equal(Typo.fix("程大的招生").query, "成大的招生", "a real typo is still fixed");
assert.equal(Typo.fix("我學身證掉了").query, "我學生證掉了");

/* 3b. 「有哪些課程」：從課程總表拆成清單，去編號、依科別分組。 */
const table = mk("c1", "📢115-1高一多元選修課程選課重要事項", [
  "1.115-1 學期高一多元選修線上選課。",
  "2.選課對象：高一各班學生。",
  "115-1 高一多元選修課程大綱科別序號課程名稱課程種類科技 1 機器人製作(需收材料費)實作(實驗)及探索體驗2 程式入門實作(實驗)及探索體驗國文 3 小說賞析通識性課程數學 4 數學桌遊實作(實驗)及探索體驗藝術 5 版畫通識性課程3科技領域4課程編號：1課程名稱：中文名稱：機器人製作英文名稱：Robot課程屬性：實作(實驗)及探索體驗議題融入：科技師資來源：校內"
]);
x = run("多元選修的課程大致上會有什麼？", [table]);
t = flat(x);
assert.equal(x.r.mode, "course_list");
assert.match(t, /共 5 門/);
assert.match(t, /科技：機器人製作\(需收材料費\)、程式入門/);
assert.match(t, /國文：小說賞析/);
assert.match(t, /藝術：版畫/);
assert.doesNotMatch(t, /\b[1-5] 程式|3科技領域|通識性課程數學/, "no raw table fragments");
assert.match(t, /選課對象：高一各班學生/);
x = run("多元選修的課程有哪些", [table]);
assert.equal(x.r.mode, "course_list");
assert.notEqual(run("多元選修什麼時候選課", [table]).r.mode, "course_list", "a when question is not a list question");

/* 4. 「去哪裡買制服」：整理廠商、地點、時間、方式；標籤要對得上內容。 */
const shop = mk("u1", "新生制服選購事宜", [
  "各位新生及家長們好：",
  "一、本校無提供制服販售服務，請學生、家長自行在外訂購。",
  "二、購買數量可視個人需求自行比價購買。",
  "三、廠商將到校提供選購服務，販售時間、地點如下：",
  "( 一 ) 星光制服社： 12/5( 六 ) 上午 9 時到下午 16 時 ( 電話：陳先生 0912-345-678) ，地點 — 本校活動中心。",
  "【廠商資訊】",
  "1. 月亮服飾 ( 有電繡 )/ 星河市中山路 12 號 / 電話： 07-1112222/ 營業時間 - 周一至周六 (9:00-20:00)",
  "2. 太陽制服行 / 星河市和平街 5 號 / 電話： 07-3334444/ 營業時間：周一至周日 (8:00-21:00) 。",
  "【建議購買數量與參考價格】",
  "品項 參考單價 建議購買數量",
  "長袖制服 350~400 元 1-2 件 運動外套 550~750 元 1 件",
  "備註：",
  "本校提供之廠商資訊僅供參考，不代表本校指定或推薦特定廠商。"
], "2026-11-01");
const sizes = mk("u2", "新生校服建議購買數量及學號繡製說明", [
  "一、請於開學前自行購買校服，並於新生訓練期間穿著到校。",
  "二、學號請查詢校網新生編班。"
], "2026-10-20");
const sportsNotice = mk("u3", "校慶運動會相關說明", ["運動會當天請穿著運動服到校。"], "2026-10-25");
x = run("我是剛入學的新生，想買制服，不知道應該去哪裡買，你能整理給我嗎？", [shop, sizes, sportsNotice]);
t = flat(x);
assert.equal(x.r.mode, "purchase");
assert.match(t, /月亮服飾[^；]*星河市中山路 12 號|月亮服飾[^；]*中山路12號/);
assert.match(t, /太陽制服行/);
assert.match(t, /07-1112222/);
assert.match(t, /星光制服社[^；]*活動中心/);
assert.match(t, /自行在外訂購/);
assert.match(t, /350~400 元（建議 1-2 件）/);
assert.doesNotMatch(t, /0912-345-678/, "a person's mobile number is not repeated");
assert.doesNotMatch(t, /地點：[^；、。]*購買數量/, "a 地點 label never carries an unrelated clause");
assert.doesNotMatch(t, /運動會當天/, "an unrelated notice is not a source");
/* a 地點 value has to look like a place */
const bad = mk("u4", "新生制服選購事宜", ["( 一 ) 某某服飾： 12/5( 六 ) 上午 9 時 ，地點 — 購買數量可視個人需求自行比價購買。", "請至本校合作社購買制服。"], "2026-11-01");
x = run("新生制服要去哪裡買", [bad]);
assert.doesNotMatch(flat(x), /地點：購買數量/);
/* a school with no vendor list says what it does say, and that the place is not stated */
const coop = page("u5", "學生規定 › 服儀規定", ["本校合作社代辦學生制服、體育服裝、書包等項目，歡迎自由選購。"]);
x = run("新生制服要去哪裡買", [coop]);
assert.equal(x.r.mode, "purchase");
assert.match(flat(x), /合作社代辦學生制服/);
console.log("qa detail tests passed");
