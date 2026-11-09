const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");

/* Invented data only: a made-up school with the same page shapes as the real ones. */
const para = (text) => ({ type: "paragraph", text, links: [] });
const article = (texts, attachments) => ({ provenance: "official_article", blocks: texts.map(para), attachments: attachments || [] });
const item = (id, title, extra) => Object.assign({ id, title, school: "alpha", school_name: "星月", category: "校園資訊", date: "2026-10-19", url: "https://school.example/" + id }, extra || {});
const ev = (id, title, day) => ({ id, school_id: "alpha", school_name: "星月", title, start_date: day, end_date: day, all_day: true, event_type: "school_activity", source_url: "https://school.example/calendar.pdf", source_document: "星月高中115學年第一學期行事曆.pdf", provenance: "official_school_calendar", academic_year: 115, semester: 1 });
const options = { asOf: "2026-11-08", schoolId: "alpha", scopeLabel: "星月", calendarEvents: [ev("ev1", "高一讀書報告繳交截止", "2026-11-20"), ev("ev2", "優良讀書報告敘獎", "2026-12-09")] };

const notice = item("n1", "星月高中115學年度讀書報告繳交流程、時程與電子檔", { source_category: "校園訊息" });
const noticeBody = article([
  "📜本校高一讀書報告從模板下載及上傳的操作過程製作成影片教學， 連結如下： https://video.example/abc",
  "🚨 注意 🚨",
  "一、請依照影片操作說明，並在本文附件下載「星月高中讀書報告(電子檔)」",
  "二、上傳檔名為 「班級+座號+姓名」 ，例如：1年21班5號王小明，上傳檔案名稱應為： 「12105王小明」 。",
  "三、繳交期限：",
  "第一學期：115年11月20日下午5:00前",
  "第二學期：日期另行公告",
], [{ filename: "讀書報告範本.odt", parse_status: "unparsed", provenance: "official_attachment" }]);
/* A library page that only lists link titles with their dates (award lists), as the real one does. */
const linkPage = item("p1", "圖書館 › 小論文及讀書報告 › 讀書報告", { kind: "school_info", date: "" });
const linkBody = article(["行政單位>圖書館>小論文及讀書報告>讀書報告", "2026-10-19", "星月高中115學年度讀書報告繳交流程、時程與電子檔", "2025-11-20", "第九梯次全國讀書報告寫作比賽　得獎名單", "2025-05-05", "第八梯次全國讀書報告寫作比賽　得獎名單", "2025-01-09", "第七梯次全國讀書報告寫作比賽　得獎名單"]);
const intro = item("i1", "關於星月 › 星月簡介", { kind: "school_info", date: "" });
const introBody = article(["創校以來成就可觀，目前本校編制日間部班級數40班，並設進修部4班合計44班，學生1500餘人，教職員工120餘人。"]);
const other = item("o1", "【現況】Q02：全國有幾所科學班？", { date: "2017-04-06" });
const items = [notice, linkPage, intro, other];
const details = { n1: noticeBody, p1: linkBody, i1: introBody };

const text = (r) => [r.reply.text].concat(r.reply.bullets || [], r.reply.tail || "", (r.also || []).map((a) => a.text)).join("\n");

/* 1. 「讀書報告怎麼寫」: led by the subject's own notice; no award-list lead; no emoji; nothing said twice. */
{
  const r = QA.answer("讀書報告怎麼寫", items, details, options);
  const all = text(r);
  assert.equal(r.status, "answered");
  assert(/https:\/\/video\.example\/abc/.test(all), all);
  assert(/高一/.test(all) && /11月20日下午5:00/.test(all), "who and the deadline: " + all);
  assert(!/得獎名單/.test(r.reply.text), "no award-list lead: " + r.reply.text);
  assert(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all), "no emoji glyphs: " + all);
  assert.equal((all.match(/video\.example/g) || []).length, 1, "the video line is said once: " + all);
  assert(/11\/20/.test(all) && /12\/9/.test(all), "calendar dates follow: " + all);
  assert(/讀書報告範本\.odt/.test(all), "unreadable attachment is named: " + all);
  assert(!/^另外/.test(r.reply.text));
}

/* 2. 「讀書報告沒寫會怎樣」: never a bare title; says plainly nothing is written, then what the notice asks. */
{
  const r = QA.answer("讀書報告沒寫會怎樣", items, details, options);
  const all = text(r);
  assert.equal(r.status, "answered");
  assert(/沒有寫/.test(r.reply.text), r.reply.text);
  assert(/11\/20/.test(all) && /下午 5 點/.test(all), all);
  assert(/圖書館/.test(all), "the office comes from the school page: " + all);
  assert(!/^讀書報告。?$/.test(r.reply.text.trim()), "no bare title lead");
}

/* 3. Deadline, where to hand in, word count. */
{
  const d = QA.answer("讀書報告截止日", items, details, options);
  assert(/11月20日下午5:00/.test(text(d)), text(d));
  const w = QA.answer("讀書報告要交到哪裡", items, details, options);
  assert(/上傳/.test(text(w)) && /video\.example/.test(text(w)), text(w));
  const n = QA.answer("讀書報告字數", items, details, options);
  assert(/沒有寫字數/.test(n.reply.text), n.reply.text);
}

/* 4. Counts: the number comes from the school's introduction; teachers are not guessed from 教職員工. */
{
  const t = QA.answer("星月有幾位老師", items, details, options);
  assert(/沒有單獨寫老師/.test(t.reply.text) && /教職員工 120 餘人/.test(t.reply.text), t.reply.text);
  assert(!/科學班/.test(JSON.stringify(t)), "no unrelated 有幾 match");
  const c = QA.answer("學校有幾個班", items, details, options);
  assert(/日間部 40 班/.test(c.reply.text) && /合計 44 班/.test(c.reply.text), c.reply.text);
  const s = QA.answer("星月有多少學生", items, details, options);
  assert(/1500 餘人/.test(s.reply.text), s.reply.text);
  const none = QA.answer("星月有幾位老師", [other], {}, options);
  assert(/沒有寫老師的人數/.test(none.reply.text) && !/科學班/.test(JSON.stringify(none)), none.reply.text);
}

/* 5. A lead that is only a title is replaced. */
{
  const out = QA.conversational({ status: "answered", mode: "rule", query: "x", summary: "讀書報告。", answer_lines: ["讀書報告"], sources: [{ id: "p1", kind: "school_info", title: "圖書館 › 小論文及讀書報告 › 讀書報告", school_name: "星月" }] });
  assert(/只列出標題/.test(out.text), out.text);
}
console.log("ok - qa shots3");
