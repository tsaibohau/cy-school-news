/* 跨校行程比較：「哪間學校段考最早」用各校行事曆與公告標題的日期回答，看不出來的學校照實說。 */
const assert = require("node:assert/strict");
const S = require("../docs/schedule-compare.js");
const QA = require("../docs/assistant-qa.js");

const schools = [
  { id: "cysh", short: "嘉中" }, { id: "cygsh", short: "嘉女" }, { id: "tssh", short: "東石高中" }, { id: "sgash", short: "新港藝術高中" }
];
const ev = (school_id, title, start_date, end_date) => ({ school_id, title, start_date, end_date: end_date || start_date, provenance: "official_calendar" });
const calendarEvents = [
  ev("cysh", "第一次期中考", "2026-10-13", "2026-10-14"),
  ev("cysh", "第一次期中考成績繳交截止", "2026-10-21"),
  ev("cysh", "第二次期中考", "2026-11-26", "2026-11-27"),
  ev("cysh", "高三期末考", "2026-12-28", "2026-12-29"),
  ev("cysh", "高一高二期末考", "2027-01-18", "2027-01-20"),
  ev("cysh", "結業式", "2027-01-20"),
  ev("cygsh", "【全校】第一次期中考", "2026-10-12", "2026-10-13"),
  ev("cygsh", "【高三】英文閱讀期中考(第5節)", "2026-11-04"),
  ev("cygsh", "【全校】第二次期中考", "2026-11-27", "2026-11-28"),
  ev("cygsh", "【高三】期末考", "2026-12-30"),
  ev("cygsh", "【高一二】期末考", "2027-01-18", "2027-01-20"),
  ev("cygsh", "寒假", "2027-01-21", "2027-02-10"),
];
const items = [
  { id: "t1", school: "tssh", school_name: "東石高中", title: "【期中考】115-1第二次段考考程表暨監考表", date: "2026-10-30" },
  { id: "t2", school: "tssh", school_name: "東石高中", title: "115-1第一次段考補考名單", date: "2026-10-13" },
  { id: "g1", school: "sgash", school_name: "新港藝術高中", title: "第二次期中考（11/24-11/25）", date: "2026-10-28" },
];
const opts = (extra) => Object.assign({ calendarEvents, items, schools, today: "2026-11-01", titleDates: QA.titleDates }, extra || {});
const ask = (q, named) => { const plan = S.asks(q, named || []); return plan && S.compare(q, plan, opts({ onlySchools: (named || []).length >= 2 ? named : [] })); };

/* The screenshot question. */
let r = ask("哪間學校段考最早");
assert.equal(r.status, "answered");
assert.match(r.reply.text, /^看接下來的段考：最早的是新港藝術高中，11\/24–25（第二次期中考）。/, r.reply.text);
assert.deepEqual(r.reply.bullets, [
  "新港藝術高中　11/24–25　第二次期中考（公告標題）",
  "嘉中　11/26–27　第二次期中考",
  "嘉女　11/27–28　第二次期中考",
]);
assert.match(r.reply.tail, /^其他學校（東石高中）的段考日期沒寫在公開的行事曆或公告標題裡（多半在考程表附件裡）；下面是它們的相關公告/);
assert.deepEqual(r.sources.map((s) => s.id), ["t1"], "the 考程表 is offered, the 補考名單 is not");

/* 第一次 → the first exam, already past. */
r = ask("哪間學校第一次段考最早");
assert.match(r.reply.text, /最早的是嘉女，10\/12–13（第一次期中考）/);
assert.match(r.reply.bullets[0], /（已過）$/);

/* 最晚; finals prefer the 高一高二 date and mention the 高三 one. */
r = ask("哪間學校期末考最晚");
assert.match(r.reply.text, /嘉中、嘉女的期末考都在 1\/18，同一天|最晚的是/);
assert.ok(r.reply.bullets.some((b) => /嘉中　1\/18–20　高一高二期末考；高三期末考 12\/28–29/.test(b)), r.reply.bullets.join("\n"));
/* A 高三 student gets the 高三 date. */
const plan = S.asks("哪間學校期末考最早", []);
r = S.compare("哪間學校期末考最早", plan, opts({ grade: "高三" }));
assert.match(r.reply.bullets[0], /嘉中　12\/28–29　高三期末考/);

/* 寒假: a 「寒假」 entry, or the day after 結業式. */
r = ask("各校什麼時候放寒假");
assert.ok(r.reply.bullets.includes("嘉中　1/21　結業式 1/20，隔天起放寒假"), r.reply.bullets.join("\n"));
assert.ok(r.reply.bullets.includes("嘉女　1/21–2/10　寒假"));
assert.doesNotMatch(r.reply.text + r.reply.tail, /考程表/, "the 考程表 hint is for exams only");

/* Two named schools: only those two. */
r = ask("嘉中跟嘉女誰先考第二次期中考", ["cysh", "cygsh"]);
assert.match(r.reply.text, /最早的是嘉中，11\/26–27/);
assert.equal(r.reply.tail, "");

/* Not a cross-school question. */
assert.equal(S.asks("段考什麼時候", []), null);
assert.equal(S.asks("哪些學校有公告 AI妙用大挑戰", []), null);
assert.equal(S.eventLabel("【高三】期末考", S.TOPICS[0]), "高三期末考");
assert.equal(S.eventLabel("【全校】第一次期中考", S.TOPICS[0]), "第一次期中考");

/* Nobody has a date: say so, never guess. */
r = S.compare("哪間學校校慶最早", S.asks("哪間學校校慶最早", []), opts({ calendarEvents: [] }));
assert.equal(r.status, "insufficient");
assert.match(r.reply.text, /各校的校慶日期我都看不出來/);
console.log("schedule compare tests passed");
