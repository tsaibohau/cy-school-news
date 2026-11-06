"use strict";
/* 問校務 sweep fixes (2026-11-06). Every notice here is invented for the test; no real
   notice text or student name is used. */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");

let seq = 0;
const note = (title, date, extra) => Object.assign({ id: "f" + (++seq), school: "cysh", school_name: "嘉中", date, title, category: "校園訊息" }, extra || {});
const body = (id, lines, status) => ({ announcement_id: id, provenance: "official_article", parse_status: status || "parsed",
  blocks: lines.map((text) => ({ type: "paragraph", text })), attachments: [] });
const opts = { asOf: "2026-11-06", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: [] };
const say = (r) => [r.summary, (r.reply && r.reply.text) || ""].join(" ");
const ids = (r) => (r.sources || []).map((s) => s.id);

const rule = { id: "hb-1", kind: "school_handbook", school: "cysh", school_name: "嘉中", title: "學生手冊 › 星河推薦施行細則", date: "2026-08-01" };
const items = [
  note("星河大學114學年度特殊選才招生說明會", "2026-10-01"),
  note("月影大學116學年度特殊選才招生訊息", "2026-10-20"),
  note("全國書法比賽決賽現場書寫簡章", "2026-10-02"),
  note("星塵旅遊企劃創意競賽", "2026-10-22"),
  note("藍鯨科技大學「2026藍鯨盃」電競賽事", "2026-10-15"),
  note("紅雀科技大學第二屆電競錦標賽", "2026-10-25"),
  note("風車劇團舞展《鏡》索票資訊", "2026-10-28"),
  note("山嵐大學小宇宙研習營報名", "2026-10-26"),
  note("雲杉大學學術講座改期通知", "2026-10-27"),
  note("成績校對作業說明", "2026-10-29"),
  note("已下架的虛構研習", "2026-10-30"),
  note("海風大學夏季研習活動", "2026-10-30"),
  note("亞洲大學虛構學系寒假營隊", "2026-10-31"),
  note("月湖獎得獎名單公告", "2026-10-21"),
  note("重修成績開放查詢", "2026-11-03"),
  rule,
];
const details = {
  [items[6].id]: body(items[6].id, ["本校舞展訂於11月7日(六)19:30於縣立表演廳演出，採預先索票制。", "10月28日(三)起開放索票，索完為止。"]),
  [items[8].id]: body(items[8].id, ["原訂10月30日舉辦之學術講座，因故改期，延至11月12日(四)下午2時舉行。"]),
  [items[10].id]: body(items[10].id, ["此頁面已移除"], "removed"),
  [items[11].id]: body(items[11].id, ["研習活動訂於11月20日(五)上午9時舉行。"]),
};

/* 1. Topic gate: generic words (特殊選才, 比賽, 研習) do not decide the answer. */
let r = QA.answer("月影大學特殊選才怎麼報名", items, details, opts);
assert.ok(ids(r).includes(items[1].id), "the notice of the named school is the answer: " + say(r));
assert.ok(!ids(r).includes(rule.id) && !ids(r).includes(items[0].id), "a rule or another school's notice is not");
r = QA.answer("北辰大學特殊選才怎麼報名", items, details, opts);
assert.ok(!ids(r).includes(rule.id) && !ids(r).includes(items[0].id) && !ids(r).includes(items[1].id), "unknown school: no unrelated answer " + say(r));
r = QA.answer("有沒有旅遊企劃類的比賽", items, details, opts);
assert.ok(ids(r).includes(items[3].id) && !ids(r).includes(items[2].id), "旅遊 contest, not the calligraphy one: " + say(r));
const gate = QA.topicGate("月影大學特殊選才怎麼報名", null);
assert.ok(gate && gate.test("月影大學116學年度") && !gate.test("星河大學114學年度"), "gate lets the named school in only");
assert.equal(QA.topicGate("比賽報名", null), null, "only generic words: no gate");

/* 2. A title that is the asked phrase is found even without a body. */
r = QA.answer("藍鯨盃電競報名", items, details, opts);
assert.equal(r.status, "answered");
assert.equal(ids(r)[0], items[4].id, "the 藍鯨 notice first, not the other 電競 notice: " + say(r));
assert.doesNotMatch(say(r), /登入後/);
r = QA.answer("小宇宙研習營", items, details, opts);
assert.equal(r.status, "answered", "title-only notice is named, not 「沒有找到」: " + say(r));
assert.equal(ids(r)[0], items[7].id);

/* 3. Abbreviations and Taiwan/Tai spelling. */
r = QA.answer("亞大寒假營隊", items, details, opts);
assert.ok(ids(r).includes(items[12].id), "亞大 = 亞洲大學: " + say(r));

/* 4. What time is it = the event day, with the signup/ticket date after it, never instead of it. */
r = QA.answer("舞展什麼時候", items, details, opts);
assert.match(say(r), /11月7日/, say(r));
assert.doesNotMatch(r.summary.split("另外")[0], /10月28日/, "the ticket date does not lead");

/* 5. Postponed: the new date wins. */
r = QA.answer("學術講座什麼時候", items, details, opts);
assert.match(say(r), /11月12日/, say(r));
assert.doesNotMatch(r.summary.split(/。/)[0], /10月30日/, "the original date does not lead");

/* 6. A word that is in a title is not a typo. */
r = QA.answer("成績校對什麼時候", items, details, opts);
assert.doesNotMatch(say(r), /我把「?校對/, "校對 is not corrected to 校隊: " + say(r));

/* 7. Schedule questions about results are not refused; asking for the list itself is. */
assert.equal(QA.isPersonalDataQuery("重修成績什麼時候查"), false);
assert.equal(QA.isPersonalDataQuery("英聽成績什麼時候查"), false);
assert.equal(QA.isPersonalDataQuery("AI診斷式段考檢討研習要去哪"), false);
assert.equal(QA.isPersonalDataQuery("得獎名單有誰"), true);
assert.equal(QA.isPersonalDataQuery("我的成績幾分"), true);
r = QA.answer("月湖獎得獎名單有誰", items, details, opts);
assert.equal(r.privacy_limited, true);
assert.match(say(r), /月湖獎得獎名單公告/, "the refusal still names the notice so it can be opened");

/* 8. Member text is quoted; 「登入後」 only appears when there is no text. */
r = QA.answer("海風大學夏季研習活動什麼時候", items, details, opts);
assert.match(say(r), /11月20日/);
assert.doesNotMatch(say(r), /登入後/);

/* 9. A removed notice is never an answer. */
r = QA.answer("已下架的虛構研習", items, details, opts);
assert.ok(!ids(r).includes(items[10].id), "removed notice: " + say(r));

/* Round 2 */
let seq2 = 0;
const n2 = (title, date) => note(title, date);
const b2 = (id, lines) => body(id, lines);
{
  const a = n2("彰師大虛構學系碩士班招生簡章", "2026-10-20"), b = n2("國立臺灣師範大學虛構所碩士班招生簡章", "2026-10-21");
  const c = n2("臺中第一高級中等學校辦理AI工作坊", "2026-10-22"), d = n2("台南一中AI創意競賽", "2026-10-23");
  const e = n2("國立中興大學NCHU Nobel Laureate Forum講座", "2026-10-24"), f = n2("諾貝爾物理學獎得主虛構教授專題演講", "2026-10-25");
  const g = n2("國立虛構大學會計學系碩士在職專班招生", "2026-10-26");
  const h = n2("大學申請入學招生訊息公告", "2026-10-27"), i = n2("期中成績校對與查詢通知", "2026-10-28");
  const j = n2("全國旅遊行程設計創意競賽", "2026-10-29"), k = n2("旅遊明信片創作展覽", "2026-10-30");
  const m = n2("第二次期中考時間表", "2026-10-31");
  const all = [a, b, c, d, e, f, g, h, i, j, k, m];
  const det = { [h.id]: b2(h.id, ["大學申請入學簡章於11月3日公告，成績採計方式請見簡章。"]), [i.id]: b2(i.id, ["成績校對時間為11月10日，請同學於期限內上網查詢。"]),
    [m.id]: b2(m.id, ["考試時間：11月26日(四)、11月27日(五)。"]), [j.id]: b2(j.id, ["本競賽以旅遊行程設計為主題，歡迎同學組隊參加，收件至11月30日止。"]), [k.id]: b2(k.id, ["旅遊明信片作品展出，歡迎參觀。"]) };
  /* 1. A short name is not the tail of a longer one. */
  let r = QA.answer("師大碩士班報考", all, det, opts);
  assert.ok(ids(r).includes(b.id) && !ids(r).includes(a.id), "師大 is not 彰師大: " + say(r));
  r = QA.answer("中一中有什麼AI工作坊", all, det, opts);
  assert.ok(ids(r).includes(c.id) && !ids(r).includes(d.id), "中一中 is 臺中第一高級中等學校, not 台南一中: " + say(r));
  /* 2. The notice with the institution's name wins over one that only shares the topic. */
  r = QA.answer("中興大學諾貝爾講座", all, det, opts);
  assert.equal(ids(r)[0], e.id, say(r));
  /* 3. The asked program is in no notice: do not answer with a different program. */
  r = QA.answer("中文系碩士在職專班招生", all, det, opts);
  assert.ok(!ids(r).includes(g.id) && r.status !== "answered", "no catch-all 碩專 notice: " + say(r));
  /* 5. Summary and source are the same notice, and it says the asked word. */
  r = QA.answer("成績校對什麼時候", all, det, opts);
  assert.equal(ids(r)[0], i.id, say(r));
  assert.match(say(r), /校對/);
  assert.doesNotMatch(say(r), /申請入學/);
  /* 6. 旅遊 splits out of 旅遊企劃類; 比賽 = 競賽 puts the contest first. */
  r = QA.answer("有沒有旅遊企劃類的比賽", all, det, opts);
  assert.equal(ids(r)[0], j.id, say(r));
  /* 7. A grades question is not answered by the exam timetable. */
  r = QA.answer("期中考成績什麼時候查", all, det, opts);
  assert.ok(!ids(r).includes(m.id), "timetable is not the grade schedule: " + say(r));
}
console.log("問校務 sweep fix tests passed");
