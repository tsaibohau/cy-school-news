"use strict";
const assert = require("node:assert/strict");
const cleanup = require("../docs/announcement-cleanup.js");
const base = { school: "cysh", school_name: "嘉義高中", category: "一般", date: "2026-01-01", url: "https://example.edu/a" };
const rows = [
  { ...base, id: "deadline", title: "數學競賽報名截止 2026/05/20" },
  { ...base, id: "event", title: "科學講座 2026年6月3日舉行" },
  { ...base, id: "term", title: "114學年度第2學期補考名單" },
  { ...base, id: "policy", title: "114學年度學生請假規定" },
  { ...base, id: "old", date: "2026-01-01", title: "115學年度選課辦法" },
  { ...base, id: "new", date: "2026-02-01", title: "115學年度選課辦法修正版" },
  { ...base, id: "merely-old", date: "2024-01-01", title: "校園服務資訊" },
  { ...base, id: "not-deadline", title: "獎學金申請要點於中華民國115年9月4日修正發布" },
  { ...base, id: "range", title: "申辦期限：115年8月28日至9月30日止" },
  { ...base, id: "edition", title: "學生營隊及相關活動資訊-115.08.27版" },
];
const result = cleanup.scan(rows, [], { today: "2026-09-11" });
const byId = Object.fromEntries(result.map((row) => [row.announcement_id, row]));
assert.equal(byId.deadline.reason, "deadline_passed");
assert.equal(byId.deadline.confidence, "high");
assert.equal(byId.event.reason, "event_ended");
assert.equal(byId.term.reason, "term_ended");
assert.equal(byId.old.reason, "replaced");
assert(!byId.policy, "policy must not expire solely because its school year ended");
assert(!byId["merely-old"], "publication age alone must never expire an announcement");
assert(!byId["not-deadline"], "a publication date near the word application is not a deadline");
assert(!byId.range, "a deadline range whose end is still in the future must not expire");
assert(!byId.edition, "an edition date is not an event date");
const kept = cleanup.scan(rows, [{ announcement_id: "deadline", action: "keep", source_hash: cleanup.sourceHash(rows[0]), rule_version: cleanup.RULE_VERSION }], { today: "2026-09-11" });
assert(!kept.some((row) => row.announcement_id === "deadline"), "unchanged keep override must be remembered");
const changed = { ...rows[0], title: rows[0].title + "（內容更新）" };
assert(cleanup.scan([changed], [{ announcement_id: "deadline", action: "keep", source_hash: cleanup.sourceHash(rows[0]), rule_version: cleanup.RULE_VERSION }], { today: "2026-09-11" }).length, "changed content must be reevaluated");
assert(!cleanup.scan(rows, [{ announcement_id: "deadline", action: "delete" }], { today: "2026-09-11" }).some((row) => row.announcement_id === "deadline"));
console.log("Announcement cleanup rules passed");
