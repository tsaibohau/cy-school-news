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

console.log("問校務 sweep fix tests passed");
