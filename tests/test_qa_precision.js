"use strict";
/* 問校務 precision fixes (2026-10-27): student words find official titles, open-list
   questions list what is still open, and "not found" replies say what is missing. */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const SQ = require("../docs/search-query.js");

const asOf = "2026-10-27";
let n = 0;
const item = (title, date, extra) => Object.assign({ id: "t" + (++n), title, date, school: "cysh", school_name: "嘉中", category: "一般", source_category: "教務處" }, extra || {});
const items = [
  item("高二社會組二外轉班申請(9/12前)", "2026-09-08"),
  item("📢115-1 高二社會組第二外語編班結果及上課地點", "2026-08-29"),
  item("【期中考】115學年度第一學期第一次期中考時間表", "2026-09-18"),
  item("【成績查詢】第一次期中考成績學生查詢成績期程", "2026-10-07"),
  item("115年國立嘉義高級中學全年級自主學習成果發表會活動資訊", "2026-08-20"),
  item("【自主學習】115年國立嘉義高級中學全年級自主學習成果發表會進入決審名單", "2026-08-21"),
  item("115學年度高級中學數理及資訊學科能力競賽國教署第三區複賽相關資訊及表件", "2026-09-30"),
  item("115學年度數理及資訊學科能力競賽國教署第三區【無學籍自學生】初賽報名名單及考試資訊", "2026-10-07"),
  item("【轉知】華科基金會「聽障學生獎學金」(於115年10月30日中午12時前自行完成線上申請)", "2026-10-01"),
  item("黃朝琴獎學基金會培育優秀人才獎學金辦法及申請表", "2026-06-10"),
  item("某基金會獎學金得獎名單", "2026-10-20"),
  item("新生校服廠商在校選購服務資訊", "2026-08-11"),
  item("課輔收費及實施節數調整通知", "2026-08-28"),
  item("115學年度選課輔導手冊", "2026-06-24"),
  item("轉知：國立臺北教育大學「校慶×園遊會×校園體驗日」活動資訊", "2026-10-13"),
  item("【校慶】嘉義高中102週年校慶當日活動及注意事項", "2026-04-14"),
  item("轉知：亞瑟瑞智2027年高中生寒假營隊活動海報", "2026-10-13"),
  item("國教署辦理教師輔導管教及班級經營研習營", "2026-10-10"),
  item("志願服務證及服務紀錄冊管理辦法修正發布", "2025-12-05"),
];
const top = (q) => (QA.rank(q, items, {}, { asOf })[0] || { item: {} }).item.title || "";
const shown = (r) => (r.sources || []).concat(r.related || []).map(s => s.title);

/* Student words reach official titles. */
assert.match(top("高二選組什麼時候"), /社會組/, "選組 finds 社會組 notices");
assert.match(top("課輔要報名嗎"), /課輔收費/, "課輔 is not 選課輔導");
assert.ok(!/選課輔導/.test(top("課輔要報名嗎")));
assert.deepEqual(SQ.queryPlan("愛校服務").topics, ["discipline"], "愛校服務 is not a 校服 question");
assert.equal(SQ.findTerms(SQ.compact("社團法人中華民國協會"), ["社團"]).length, 0, "社團法人 is not a school club");

/* 何時／怎麼 questions want the event notice, not its result list. */
assert.match(top("自主學習成果發表是什麼時候"), /活動資訊/);
assert.match(top("數理及資訊學科能力競賽怎麼報名"), /複賽相關資訊及表件/, "a 初賽 list does not replace the 複賽 notice");
/* A university's open day is not the school's own 校慶. */
assert.match(top("校慶什麼時候"), /嘉義高中102週年校慶/);

/* 「現在有哪些…可以申請」 lists open items, soonest deadline first, no result lists. */
const open = QA.answer("現在有哪些獎學金可以申請", items, {}, { asOf });
assert.equal(open.mode, "browse");
assert.match(open.sources[0].title, /聽障學生獎學金/);
assert.equal(open.sources[0].note, "10/30 截止");
assert.ok(!open.sources.some(s => /名單/.test(s.title)), "winner lists are not open opportunities");
assert.ok(!open.sources.some(s => /黃朝琴/.test(s.title)), "old notices without a deadline are left out");
const camps = QA.answer("有什麼營隊可以參加", items, {}, { asOf });
assert.ok(camps.sources.some(s => /寒假營隊/.test(s.title)));
assert.ok(!camps.sources.some(s => /教師/.test(s.title)), "staff training is not a student camp");
assert.equal(QA.titleDeadline({ title: "(於115年10月30日中午12時前自行完成線上申請)", date: "2026-10-01" }), "2026-10-30");

/* Grades schedules are not personal records. */
assert.equal(QA.isPersonalDataQuery("期中考成績"), false);
assert.equal(QA.isPersonalDataQuery("期中考的成績"), false);
assert.equal(QA.isPersonalDataQuery("我的期中考成績"), true);
assert.equal(QA.isPersonalDataQuery("王小明的成績"), true);

/* Human replies when nothing answers directly. */
const second = QA.answer("第二次段考是哪幾天", items, {}, { asOf });
assert.equal(second.status, "insufficient");
assert.match(second.summary, /只看到第一次.*第二次的還沒公告/);
assert.match(second.summary, /教務處/);
const track = QA.answer("高二選組什麼時候", items, {}, { asOf });
assert.match(track.summary, /9\/12前.*已經過了/, "a past date in the title is reported as past");
const none = QA.answer("停車證要怎麼申請", items, {}, { asOf, scopeLabel: "嘉中" });
assert.equal(none.status, "insufficient");
assert.match(none.summary, /嘉中的公告.*「停車證」.*總務處/);
const lost = QA.answer("學生證遺失怎麼辦", items, {}, { asOf });
assert.match(lost.summary, /「學生證遺失」/);
assert.ok(!shown(QA.answer("愛校服務", items, {}, { asOf })).some(t => /校服|志願服務/.test(t)));

console.log("問校務 precision tests passed");

/* 2026-10-27 user report: 「明天有什麼講座？」 listed recent notices instead of what happens
   tomorrow. Questions naming a day answer from the school calendar and title dates. */
{
  const calendar = [
    { id: "c1", school_id: "cysh", title: "校友返校講座成大都市計畫系陳彥仲教授", start_date: "2026-10-28", end_date: "2026-10-28" },
    { id: "c2", school_id: "cysh", title: "高三第三次模擬考", start_date: "2026-10-28", end_date: "2026-10-29" },
    { id: "c3", school_id: "cysh", title: "行政會議", start_date: "2026-10-28", end_date: "2026-10-28" },
    { id: "c4", school_id: "cysh", title: "學測報名", start_date: "2026-10-28", end_date: "2026-10-28" },
    { id: "c5", school_id: "cysh", title: "行憲紀念日放假一天", start_date: "2026-12-25", end_date: "2026-12-25" },
  ];
  const lectures = [
    item("轉知：國立陽明交通大學於115年12月5日（星期六）辦理「科普系列講座」", "2026-10-21"),
    item("某大學講座報名(10/28前)", "2026-10-20"),
    item("9-12週10/27-11/20團膳菜單", "2026-10-26"),
  ];
  const ask = (q) => QA.answer(q, lectures, {}, { asOf, scopeLabel: "嘉中", calendarEvents: calendar });
  assert.deepEqual(QA.dateTarget("明天有什麼講座？", asOf), { label: "明天", from: "2026-10-28", to: "2026-10-28" });
  assert.equal(QA.dateTarget("週五有什麼活動", asOf).from, "2026-10-30");
  assert.equal(QA.dateTarget("下週一", asOf).from, "2026-11-02");
  assert.deepEqual([QA.dateTarget("這週有什麼", asOf).from, QA.dateTarget("這週有什麼", asOf).to], ["2026-10-27", "2026-11-01"]);
  assert.equal(QA.dateTarget("12/5有什麼講座", asOf).from, "2026-12-05");
  assert.equal(QA.datePlan("明天講座在哪裡", asOf), null, "a specific question about a dated event still uses the normal search");

  const tomorrow = ask("明天有什麼講座？");
  assert.match(tomorrow.summary, /^明天（10\/28 週三）嘉中有 1 項講座：「校友返校講座/);
  assert.equal(tomorrow.sources[0].kind, "calendar");
  assert.ok(!tomorrow.sources.some(s => /陽明交通/.test(s.title)), "a 12/5 lecture is not tomorrow's");
  assert.match(tomorrow.summary, /報名或繳交在當天/, "a deadline tomorrow is mentioned separately");
  const activities = ask("明天有什麼活動");
  assert.ok(!activities.sources.some(s => /行政會議|菜單/.test(s.title)), "staff meetings and month-long menus are not tomorrow's activities");
  assert.match(ask("明天要考試嗎").summary, /^有。.*模擬考/);
  assert.match(ask("明天放假嗎").summary, /^沒有。.*12\/25（週五）「行憲紀念日放假一天」/);
  assert.match(ask("12/5有什麼講座").summary, /12\/5（週六）嘉中有 1 項講座：「國立陽明交通大學/);
  assert.deepEqual(QA.titleDates({ title: "於115年12月5日（星期六）辦理", date: "2026-10-21" }), [{ from: "2026-12-05", to: "2026-12-05", kind: "event" }]);
  assert.equal(QA.titleDates({ title: "報名(10/28前)", date: "2026-10-20" })[0].kind, "deadline");
  assert.equal(QA.titleDates({ title: "依113年11月12日令修正", date: "2026-10-20" }).length, 0, "dates before publication are references");
  console.log("問校務 dated-question tests passed");
}
