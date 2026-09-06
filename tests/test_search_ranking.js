const assert = require("node:assert/strict");
const Search = require("../docs/search-query.js");
const Validity = require("../docs/announcement-validity.js");

function ids(rows) { return rows.map(row => row.item.id); }

const fixtures = [
  { id: "dorm-info", title: "115學年度高一新生住宿相關資訊", summary: "學生入住與宿舍報到說明。" },
  { id: "dorm-job", title: "宿舍幹事職缺公告", summary: "甄選人員與面試名單。" },
  { id: "camp", title: "大學暑期營隊", summary: "活動提供學生宿舍，請完成報名。" },
  { id: "bus-route", title: "115學年度校車路線表", summary: "各站乘車時間。" },
  { id: "public-bus", title: "BRT公車候車安全宣導", summary: "學生請勿越過警戒線。" },
  { id: "device-rule", title: "校園行動載具使用規定", summary: "學生手機依規定管理。", date: "2020-01-22" },
  { id: "phone-app", title: "手機校務查詢應用程式", summary: "請勿安裝非官方版本。" },
  { id: "open-contest", title: "學生音樂比賽報名", summary: "報名期限至2026年9月15日止。", date: "2026-08-20" },
  { id: "old-contest", title: "學生音樂比賽報名", summary: "報名期限至2025年9月15日止。", date: "2025-08-20" },
];

let rows = Search.select(fixtures, "宿舍申請", { asOf: "2026-08-30", validity: Validity });
assert.equal(rows[0].item.id, "dorm-info", "student accommodation must outrank a staff vacancy");
assert(!ids(rows).includes("dorm-job"), "a staff vacancy must fall outside strong student-service results");
assert(!ids(rows).includes("camp"), "a body-only dormitory mention must not survive a strong title match");

rows = Search.select(fixtures, "校車報名", { asOf: "2026-08-30", validity: Validity });
assert.equal(rows[0].item.id, "bus-route", "the user's exact 校車 term must outrank the broader 公車 synonym");

rows = Search.select(fixtures, "手機管理規定", { asOf: "2026-08-30", validity: Validity });
assert.equal(rows[0].item.id, "device-rule", "topic and document-type intent in one title must outrank a generic phone notice");

rows = Search.select(fixtures, "現在可以報名的比賽", { asOf: "2026-08-30", validity: Validity });
assert.equal(rows[0].item.id, "open-contest", "an active registration window must outrank an expired one");
assert(!ids(rows).includes("old-contest"), "an expired registration must fall outside results when an active one exists");
assert(Search.select([fixtures[8]], "現在可以報名的比賽", { asOf: "2026-08-30", validity: Validity }).length,
  "an expired result remains available as historical fallback when it is the only evidence");

const plan = Search.queryPlan("手機或行動載具有什麼規定");
assert.deepEqual(plan.topics, ["device"]);
assert.deepEqual(plan.facets, ["regulation"]);
assert.equal(plan.remainder, "", "question glue must not become an accidental required phrase");

const current = require("../docs/data/announcements.json").items || [];
const archive = require("../docs/data/archive.json").items || [];
const seen = new Set();
const real = current.concat(archive).filter(item => item && item.id && !seen.has(item.id) && seen.add(item.id));

rows = Search.select(real, "手機管理規定", { asOf: "2026-08-30", validity: Validity });
assert.equal(rows[0].item.id, "cysh-8032", "the real official mobile-device regulation must rank first");
rows = Search.select(real, "宿舍申請", { asOf: "2026-08-30", validity: Validity });
assert(rows.length && rows.every(row => !/職缺|徵才|幹事.*(?:甄選|面試|名單)/.test(row.item.title)),
  "real accommodation results must not include dormitory staff recruitment");
rows = Search.select(real, "VPN", { asOf: "2026-08-30", validity: Validity });
assert.equal(rows[0].item.id, "cysh-116561", "the official VPN guide must outrank firewall vulnerability notices");
rows = Search.select(real, "現在可以報名的比賽", { asOf: "2026-08-30", validity: Validity }).slice(0, 10);
assert(rows.length && rows.every(row => row.validity && row.validity.status === "ACTIVE_WINDOW"),
  "the first page of a current registration query must contain active windows only");

console.log("Precision search ranking tests passed");
