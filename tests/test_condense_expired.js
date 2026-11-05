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
const item = { id: "cysh-1", school: "cysh", title: "教育營", detail_ref: "data/details/cysh/cysh-1.json", detail_revision: "h1", condense_pending: C.VERSION,
  calendar_events: [{ kind: "event", date: "2027-01-25" }], summary: "116年1月25日舉行", snippet: "116年1月25日舉行" };
fs.writeFileSync(path.join(root, "docs", "data", "announcements.json"), JSON.stringify({ items: [item, { id: "cysh-2" }] }));
fs.writeFileSync(path.join(root, "docs", "data", "archive.json"), JSON.stringify({ items: [] }));
assert.deepEqual(C.run(root), { done: 1, empty: 0 });
const out = JSON.parse(fs.readFileSync(path.join(root, "docs", "data", "details", "cysh", "cysh-1.json"), "utf8"));
const text = out.blocks.map((b) => b.text).join("\n");
assert.equal(out.source_hash, "h1", "still matches the item, so the sync accepts it");
assert.equal(out.condensed, C.VERSION);
assert.deepEqual(out.attachments, [], "attachment text is folded into the condensed version");
assert.doesNotMatch(JSON.stringify(out), /\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}:\d{2}|116年|verified_dates|published_on/, "no time anywhere");
assert.match(text, /地點：本校活動中心/);
assert.match(text, /逾期未繳交者，以零分計算/);
assert.match(text, /請攜帶學生證/);
assert.doesNotMatch(text, /依據/, "the letter reference is dropped");
const doc = JSON.parse(fs.readFileSync(path.join(root, "docs", "data", "announcements.json"), "utf8"));
assert.equal(doc.items[0].body_condensed, C.VERSION);
assert.equal(doc.items[0].condense_pending, undefined);
assert.deepEqual(doc.items[0].calendar_events, []);
assert.doesNotMatch(doc.items[0].summary + doc.items[0].snippet, /\d+月|\d+年/);
assert.equal(doc.items[1].body_condensed, undefined, "only marked notices are touched");
/* 2026-11-04 first real run: 211 of 300 kept only the title. PDF letters wrap every ~35 characters,
   so no single line was labelled as an activity or a note. Whole sentences are judged now. */
const letter = { provenance: "official_article", announcement_id: "x9", blocks: [], attachments: [{ parse_status: "parsed", filename: "來文.pdf", embedded_text: [
  "國立某某大學 函", "地址：某市某路1號", "承辦人：王小明",
  "主旨：本校辦理「114年度高中生化學營」，請轉知所屬學生踴躍報名參", "加，請查照。",
  "說明：一、活動對象為高中一、二年級學生，請攜帶學生證及文具，", "於115年1月20日（星期二）上午9時報到。",
  "恭喜本校王○明同學榮獲第一名。"].join("\n") }] };
const kept = C.condense(letter, "某某大學化學營");
assert.ok(kept.length >= 2, JSON.stringify(kept));
assert.ok(kept.some((p) => /高中生化學營.*請轉知所屬學生踴躍報名參加/.test(p)), "a wrapped sentence is kept whole");
assert.ok(kept.some((p) => /請攜帶學生證及文具/.test(p)));
assert.ok(!kept.some((p) => /承辦人|地址|恭喜/.test(p)), "letter headers and congratulations are not kept");
assert.ok(!kept.some((p) => /\d{2,4}\s*年|\d+月|星期|\d+時/.test(p)), JSON.stringify(kept));
assert.ok(C.condense({ provenance: "official_article", blocks: [{ type: "paragraph", text: "班聯會執秘招生" }], attachments: [] }, "學生團體").length === 1,
  "a line with a topic and no other label is kept");
/* Second real run, checked with the test account: more date forms, result tables and links. */
for (const [raw, gone] of [["預計參訪日期：1 11 年 4 月份。", /年|月/], ["本課表至8月11 適用", /8月|11/], ["一百零一年三月十七日（星期六）上課，中午十二時集合", /年|月|日|時|星期/],
  ["參加「2020 WMI世界數學邀請賽」總決賽", /2020/], ["學生將自 98 年 11 月上旬先接受入學課程", /98|月/]]) {
  assert.doesNotMatch(C.stripTimes(raw), gone, raw + " → " + C.stripTimes(raw));
}
const results = C.condense({ provenance: "official_article", blocks: [{ type: "paragraph", text: [
  "地球科學 318 黃○蓁 5 進入全國", "本班共3位學生通過複賽，入選選拔營", "http://web1.example.edu.tw/var/file/8/1.pdf",
  "報名方式：請填寫線上表單並繳交家長同意書。"].join("\n") }], attachments: [] }, "學科能力競賽");
assert.deepEqual(results, ["報名方式：請填寫線上表單並繳交家長同意書。"], JSON.stringify(results));
console.log("condense expired tests passed");
