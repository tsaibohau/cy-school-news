"use strict";

const assert = require("node:assert/strict");
const Projection = require("../tools/public-metadata-projection.js");
const Today = require("../docs/today.js");
const Relevance = require("../docs/relevance.js");
const Registry = require("../docs/school-registry.js");

// Fresh scrape output: member-only text is present and must not be published.
const fresh = Projection.projectItem({
  id: "cysh-1", school: "cysh", title: "高二校外教學家長同意書", date: "2026-10-20",
  summary: "請305班同學於2026年10月28日前繳交。", snippet: "活動說明", body: "內文",
  detail_ref: "data/details/cysh/cysh-1.json", detail_revision: "rev1", detail_status: "parsed", detail_attempts: 1,
  calendar_events: [
    { kind: "deadline", date: "2026-10-28", title: "高二校外教學家長同意書", provenance: "verified_announcement_deadline", source_revision: "rev1" },
    { kind: "deadline", date: "2026-10-29", provenance: "guessed" },
    { kind: "event", date: "11/3", provenance: "verified_announcement_event" },
  ],
});
["summary", "snippet", "body", "detail_ref"].forEach((field) => assert.equal(field in fresh, false, field + " stays member-only"));
assert.equal(fresh.detail_status, "parsed", "scraper bookkeeping survives so pages are not re-fetched");
assert.equal(fresh.snippet_tried, true);
assert.deepEqual(fresh.calendar_events, [{ kind: "deadline", date: "2026-10-28", provenance: "verified_announcement_deadline", source_revision: "rev1" }],
  "only labelled full-year dates are published, without text");
assert.deepEqual(fresh.audience, { grades: [2], classes: ["305"], all_school: false });

// Next run: the item is reloaded without text; facts must not be lost.
const again = Projection.projectItem(fresh);
assert.deepEqual(again, fresh, "projection is stable across runs");

// Items with nothing to say carry no empty fact fields.
const plain = Projection.projectItem({ id: "cysh-2", school: "cysh", title: "圖書館公告" });
assert.equal("audience" in plain, false);
assert.equal("calendar_events" in plain, false);

// 我的今日 can use the public facts directly.
const projection = Today.build({
  today: "2026-10-26",
  announcementItems: [fresh, plain],
  profile: { school_id: "cysh", grade_level: 2 },
  relevance: (item, profile) => Relevance.calculate(item, profile, Registry),
});
assert.equal(projection.deadlines.length, 1);
assert.equal(projection.deadlines[0].date, "2026-10-28");
assert.ok(projection.focusItems.some((row) => row.title === "高二校外教學家長同意書"), "a near deadline for my grade is a focus item");

console.log("Public facts projection tests passed");
