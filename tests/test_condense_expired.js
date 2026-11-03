"use strict";
/* 2026-11-03: 過期公告只留標題、活動事項、注意事項、相關辦法，不留任何時間。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const C = require("../tools/condense-expired.js");

assert.equal(C.stripTimes("請於115年11月20日（星期五）下午4:30前送至學務處。"), "請送至學務處。");
assert.equal(C.stripTimes("報名時間：即日起至12月10日止，請上網填寫報名表。"), "請上網填寫報名表。");
assert.equal(C.stripTimes("請各班於10月5日上午10:00至圖書館集合。"), "請各班至圖書館集合。");
assert.equal(C.stripTimes("對象：高一、高二學生，每班限報5名。"), "對象：高一、高二學生，每班限報5名。", "numbers that are not times stay");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "condense-"));
fs.mkdirSync(path.join(root, "docs", "data", "details", "cysh"), { recursive: true });
const record = { provenance: "official_article", announcement_id: "cysh-1", source_hash: "h1", published_on: "2026-01-01",
  blocks: [{ type: "paragraph", text: "一、依據教育部115年10月20日臺教字第1150001號函辦理。\n二、活動時間：116年1月25日至1月27日。\n三、地點：本校活動中心。\n四、對象：高一、高二學生，報名請上網填寫表單。\n五、逾期未繳交者，以零分計算。" }],
  attachments: [{ provenance: "official_attachment", parse_status: "parsed", embedded_text: "請攜帶學生證，於3月5日上午8:00報到。" }],
  verified_dates: [{ date: "2027-01-25" }], summary: { text: "116年1月25日舉行" } };
fs.writeFileSync(path.join(root, "docs", "data", "details", "cysh", "cysh-1.json"), JSON.stringify(record));
const item = { id: "cysh-1", school: "cysh", title: "教育營", detail_ref: "data/details/cysh/cysh-1.json", detail_revision: "h1", condense_pending: 1,
  calendar_events: [{ kind: "event", date: "2027-01-25" }], summary: "116年1月25日舉行", snippet: "116年1月25日舉行" };
fs.writeFileSync(path.join(root, "docs", "data", "announcements.json"), JSON.stringify({ items: [item, { id: "cysh-2" }] }));
fs.writeFileSync(path.join(root, "docs", "data", "archive.json"), JSON.stringify({ items: [] }));
assert.deepEqual(C.run(root), { done: 1, empty: 0 });
const out = JSON.parse(fs.readFileSync(path.join(root, "docs", "data", "details", "cysh", "cysh-1.json"), "utf8"));
const text = out.blocks.map((b) => b.text).join("\n");
assert.equal(out.source_hash, "h1", "still matches the item, so the sync accepts it");
assert.equal(out.condensed, 1);
assert.deepEqual(out.attachments, [], "attachment text is folded into the condensed version");
assert.doesNotMatch(JSON.stringify(out), /\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}:\d{2}|116年|verified_dates|published_on/, "no time anywhere");
assert.match(text, /地點：本校活動中心/);
assert.match(text, /逾期未繳交者，以零分計算/);
assert.match(text, /請攜帶學生證/);
assert.doesNotMatch(text, /依據/, "the letter reference is dropped");
const doc = JSON.parse(fs.readFileSync(path.join(root, "docs", "data", "announcements.json"), "utf8"));
assert.equal(doc.items[0].body_condensed, 1);
assert.equal(doc.items[0].condense_pending, undefined);
assert.deepEqual(doc.items[0].calendar_events, []);
assert.doesNotMatch(doc.items[0].summary + doc.items[0].snippet, /\d+月|\d+年/);
assert.equal(doc.items[1].body_condensed, undefined, "only marked notices are touched");
console.log("condense expired tests passed");
