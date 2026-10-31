"use strict";
/* 2026-11-01: 公告排序（最新、最早、處室、急迫性）與加入 Google 日曆。 */
const assert = require("node:assert/strict");
const Sort = require("../docs/announcement-sort.js");
const Cal = require("../docs/google-calendar.js");

const items = [
  { id: "a", title: "第二次段考補考名單", date: "2026-10-20", source_category: "註冊組", category: "段考考試" },
  { id: "b", title: "【學務處】清寒獎學金申請", date: "2026-10-25", source_category: "最新消息", category: "獎助學金",
    calendar_events: [{ kind: "deadline", date: "2026-11-03" }] },
  { id: "c", title: "大學博覽會", date: "2026-10-28", source_category: "輔導室", category: "升學",
    calendar_events: [{ kind: "deadline", date: "2026-11-01" }] },
  { id: "d", title: "宿舍申請（已截止）", date: "2026-09-01", source_category: "生輔組", category: "生活學務",
    calendar_events: [{ kind: "deadline", date: "2026-09-10" }] },
  { id: "e", title: "鱟知鱟學成果分享會", date: "2026-10-30", source_category: "校外訊息", category: "研習活動" },
];
const today = "2026-11-01";
assert.deepEqual(Sort.sort(items, "newest", { today }).map(i => i.id), ["e", "c", "b", "a", "d"]);
assert.deepEqual(Sort.sort(items, "oldest", { today }).map(i => i.id), ["d", "a", "b", "c", "e"]);
assert.equal(Sort.office(items[0]), "教務處", "註冊組 belongs to 教務處");
assert.equal(Sort.office(items[1]), "學務處", "【學務處】 in the title");
assert.equal(Sort.office(items[3]), "學務處", "生輔組 belongs to 學務處");
assert.equal(Sort.office(items[4]), Sort.OTHER, "outside events with no office stay 其他");
assert.equal(Sort.office({ title: "116學年度大學特殊選才招生", source_category: "最新消息", category: "一般" }), "輔導室", "title words as the last hint");
assert.deepEqual(Sort.sort(items, "office", { today }).map(i => Sort.office(i)), ["教務處", "學務處", "學務處", "輔導室", Sort.OTHER]);
assert.deepEqual(Sort.sort(items, "urgent", { today }).map(i => i.id), ["c", "b", "e", "a", "d"], "today → 2 days → no deadline (newest first) → overdue");
assert.equal(Sort.urgency(items[2], today).label, "今天截止");
assert.equal(Sort.urgency(items[1], today).label, "剩 2 天");
assert.equal(Sort.urgency(items[3], today).label, "已截止");
assert.equal(Sort.urgency(items[0], today).label, "");
assert.equal(Sort.deadline({ title: "報名至11/27止", date: "2026-11-01" }, today, () => "2026-11-27"), "2026-11-27", "title deadline when nothing is verified");
assert.deepEqual(items.map(i => i.id), ["a", "b", "c", "d", "e"], "the input order is never changed");
console.log("✓ 公告排序");

const url = Cal.eventUrl({ title: "截止：清寒獎學金申請", date: "2026-11-03", url: "https://www.cysh.cy.edu.tw/p/1", details: "嘉中公告" });
assert.match(url, /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=/);
assert.match(url, /&dates=20261103\/20261104&/, "an all-day event on the deadline");
assert.match(decodeURIComponent(url), /官方原文：https:\/\/www\.cysh\.cy\.edu\.tw\/p\/1/);
assert.match(url, /ctz=Asia%2FTaipei$/);
assert.equal(Cal.eventUrl({ title: "沒日期" }), "");
assert.doesNotMatch(decodeURIComponent(Cal.eventUrl({ title: "x", date: "2026-11-03", url: "javascript:alert(1)" })), /javascript:/, "only https links");
const ics = Cal.ics([{ id: "t1", title: "繳住宿資料, 記得；帶章", date: "2026-11-05", details: "很長".repeat(80) }, { id: "t2", title: "無日期" }], { now: "2026-11-01T00:00:00Z" });
assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1, "items without a date are skipped");
assert.match(ics, /DTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261106/);
assert.match(ics, /SUMMARY:繳住宿資料\\, 記得\\；?帶章|SUMMARY:繳住宿資料\\, 記得；帶章/);
assert.ok(ics.split("\r\n").every(line => Buffer.byteLength(line) <= 75), "long lines are folded");
console.log("✓ 加入 Google 日曆與 .ics");
console.log("Announcement sort and calendar export tests passed");
