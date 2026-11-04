"use strict";
/* 2026-11-04 check with the newest 嘉中 notices, asked as short questions. Item metadata is the public
   corpus; notice bodies here are short lines written for the test in the layout the real ones use. */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const SQ = require("../docs/search-query.js");

const n = (id, date, title, extra) => Object.assign({ id, school: "cysh", school_name: "嘉中", date, title, category: "校園訊息" }, extra || {});
const body = (id, lines, pdf) => ({ announcement_id: id, provenance: "official_article",
  blocks: [{ type: "paragraph", text: "作者 : 設備組 發佈日期 : 2026-11-03 最後更新日期 : 2026-11-03" }],
  attachments: pdf ? [{ parse_status: "parsed", filename: "來文.pdf", embedded_text: lines.join("\n") }] : [] });
const opts = { asOf: "2026-11-04", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: [] };
const text = (r) => [r.summary, (r.reply && r.reply.text) || "", ((r.reply && r.reply.bullets) || []).join(" ")].join(" ");

/* 奧林匹克 is written 奧林匹亞; 「校內甄選」 is a student selection, not a job posting. */
const olympiad = n("o1", "2026-11-02", "【地科奧林匹亞報名】第20屆國際地球科學奧林匹亞競賽全國初選校內甄選",
  { calendar_events: [{ kind: "deadline", date: "2026-11-17" }] });
const calligraphy = n("c1", "2026-09-15", "115學年度全國學生美術比賽書法類決賽嘉義市現場書寫簡章");
const old = n("h1", "2024-08-28", "賀!!本校科學班同學通過2024年國際國中科學奧林匹亞競賽決選營", { source_category: "榮譽榜" });
assert.ok(SQ.announcementScore(olympiad, "奧林匹亞") > 0);
let rows = SQ.rank([olympiad, old], "奧林匹亞", { asOf: "2026-11-04" });
assert.ok(rows[0].score > rows[1].score * 0.5, "a 校內甄選 is not scored down as a job posting");
const details = { o1: body("o1", ["全國初選需經學校推薦報名，請有興趣報名參賽的同學，即日起至115年11月17日上午8：00止，", "填妥報名表單參加校內甄選，逾時不候。"], true) };
let r = QA.answer("奧林匹克比賽還來的及報嗎", [olympiad, calligraphy, old], details, opts);
assert.match(text(r), /奧林匹亞/, text(r));
assert.doesNotMatch(text(r), /書法/);
assert.match(text(r), /115年11月17日上午8：00/, "a PDF sentence wrapped over two lines is quoted whole");
assert.doesNotMatch(text(r), /作者\s*:|發佈日期/, "the page's author/date line is not quoted");

/* A bare activity question is answered by the newest matching activity, from its title when its
   body has nothing else. */
const camp = n("s1", "2026-11-02", "轉知：清華大學奈微與材料科技中心舉辦116年寒假「探索半導體高中創客營」。");
const oldCamp = n("s2", "2026-08-17", "轉知：國立臺北科技大學辦理115年暑期半導體研習營");
const campDetails = { s1: body("s1", []), s2: body("s2", ["說明：一、本研習營以智慧半導體為核心主軸，結合半導體製程與實作。"], true) };
r = QA.answer("半導體營", [camp, oldCamp], campDetails, opts);
assert.match(r.summary, /11 月 2 日.*探索半導體高中創客營/, r.summary);
const talk = n("t1", "2026-10-30", "中央研究院訂於115年11月19日（星期四）下午於國立臺灣海洋大學舉辦「中研講堂」基隆場科普演講");
r = QA.answer("中研講堂", [talk], { t1: body("t1", []) }, opts);
assert.match(r.summary, /115年11月19日（星期四）下午於國立臺灣海洋大學/, "the title is the answer");

/* Activities live in announcements: 「防災營」 is the camp notice, not the campus safety rules. */
const rule = { id: "hb-26", kind: "school_handbook", school: "cysh", school_name: "嘉中", title: "學生手冊 › 校園安全檢查規定" };
const drill = n("d1", "2026-11-02", "轉知：教育部辦理「第六屆防災青年國際領袖培訓營」。");
r = QA.answer("防災營", [rule, drill], {
  "hb-26": { announcement_id: "hb-26", provenance: "official_article", blocks: [{ type: "paragraph", text: "貳、目的：為維護校園安全及防災，明確律定相關權責及檢查處理程序。" }], attachments: [] },
  d1: body("d1", ["為使學生掌握全球防災教育推動趨勢，並培養學生災害風險意識，辦理培訓營。"], true) }, opts);
assert.match(r.summary, /防災青年國際領袖培訓營/, r.summary);
assert.ok(!(r.also || []).some((a) => /校園安全檢查/.test(a.text)), "an unrelated rule is not added");

/* A what-year question is not answered by an old notice's title. */
const reading = [n("r1", "2025-10-15", "國立嘉義高中114學年度推展閱讀運動閱讀心得報告繳交流程")];
r = QA.answer("閱讀心得報告什麼時候要交？ 115年", reading, {}, opts);
assert.notEqual(r.status, "answered");
console.log("latest notice tests passed");
