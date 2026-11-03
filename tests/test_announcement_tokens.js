"use strict";
/* 2026-11-03: 公告 token 化——每則公告切成段，每段標主題、類型、日期、年級；
   問題也切成主題＋問的類型，比對看「同一段」。公開資料只有標籤，沒有原文。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const T = require("../docs/announcement-tokens.js");
const Syn = require("../docs/qa-synonyms.js");
const QA = require("../docs/assistant-qa.js");
const Projection = require("../tools/public-metadata-projection.js");

const record = { provenance: "official_article", blocks: [{ type: "paragraph", text:
  "一、依據教育部115年10月1日臺教字第1150001號函辦理。\n二、對象：本校高一學生。\n三、閱讀心得請於11月20日（星期五）前上傳至系統，格式為A4、字數1500字以上。\n四、逾期未繳交者，以零分計算。\n五、聯絡人：圖書館王老師，分機123。" }] };
const tokens = T.tokenize(record, { title: "115學年度推展閱讀運動閱讀心得繳交流程", date: "2026-10-19" });
const seg = (s) => tokens.segments.find((row) => row.s === s);

/* Each segment gets its own labels. */
assert.equal(seg(0), undefined, "「依據…函辦理」 carries no topic or kind worth keeping");
assert.deepEqual(seg(1).k, ["audience"]);
assert.deepEqual(seg(1).g, [1]);
assert.ok(seg(2).t.includes("閱讀心得") && seg(2).k.includes("deadline") && seg(2).k.includes("method"));
assert.deepEqual(seg(2).d, ["2026-11-20"], "a bare 11/20 is dated from the notice's own year");
assert.ok(seg(3).k.includes("penalty"));
assert.ok(seg(4).k.includes("contact"));
assert.deepEqual(T.datesOf("報名至115年12月10日止", ""), ["2026-12-10"], "民國 years become 西元");
assert.deepEqual(T.datesOf("1/5 前繳交", "2026-12-20"), ["2027-01-05"], "a January date after a December notice is next year");

/* No text is published: every topic is a word from the vocabulary (or a taxonomy id). */
const vocab = new Set([].concat(...Syn.SAME).map(Syn.compact).concat(Object.keys(Syn.INCLUDES).map(Syn.compact)));
tokens.segments.concat([{ t: tokens.title }]).forEach((row) => row.t.forEach((t) => assert.ok(t.startsWith("#") || vocab.has(t), "not a vocabulary word: " + t)));
assert.doesNotMatch(JSON.stringify(tokens), /零分|王老師|分機123|上傳至系統/, "labels hold no sentence text");

/* Questions are tokenized the same way; the match is on one segment. */
let asked = T.tokenizeQuestion("閱讀心得報告什麼時候要交");
assert.deepEqual(asked.topics, ["閱讀心得"]);
assert.deepEqual(asked.kinds, ["deadline"]);
assert.equal(T.match(tokens, asked).segment.s, 2);
asked = T.tokenizeQuestion("閱讀心得沒交會怎樣");
assert.equal(T.match(tokens, asked).segment.s, 3, "the penalty segment, not the deadline one");
assert.equal(T.tokenizeQuestion("行動電話可以帶嗎").topics[0], "手機", "synonyms land on one word");

/* Public projection: labels come from the sidecar while it exists, and are kept afterwards. */
const root = fs.mkdtempSync(path.join(os.tmpdir(), "tokens-"));
fs.mkdirSync(path.join(root, "data", "details", "cysh"), { recursive: true });
fs.writeFileSync(path.join(root, "data", "details", "cysh", "cysh-1.json"), JSON.stringify(record));
const item = { id: "cysh-1", school: "cysh", title: "閱讀心得繳交流程", date: "2026-10-19", summary: "會員內容", detail_ref: "data/details/cysh/cysh-1.json" };
const projected = Projection.projectItem(item, root);
assert.equal(projected.tokens.segments.length, tokens.segments.length);
assert.equal(projected.summary, undefined, "member text stays out");
assert.equal(projected.detail_ref, undefined);
assert.deepEqual(Projection.projectItem(projected, root).tokens, projected.tokens, "kept when the sidecar is gone");
/* School pages: the index record keeps the labels for the next rebuild. */
fs.mkdirSync(path.join(root, "data", "school-info"), { recursive: true });
fs.writeFileSync(path.join(root, "data", "details", "cysh", "cysh-info-9.json"), JSON.stringify(record));
fs.writeFileSync(path.join(root, "data", "school-info", "cysh.json"), JSON.stringify({ school: "cysh", pages: { 9: { page_id: 9, status: "ok" } },
  items: [{ id: "cysh-info-9", kind: "school_info", title: "圖書館 › 閱讀心得", detail_ref: "data/details/cysh/cysh-info-9.json" }] }));
Projection.sanitizePublicData(root);
const info = JSON.parse(fs.readFileSync(path.join(root, "data", "school-info", "cysh.json"), "utf8"));
assert.ok(info.items[0].tokens && info.pages["9"].tokens, "item and index record both hold the labels");
assert.ok(!fs.existsSync(path.join(root, "data", "details")), "sidecars are removed");

/* 問校務 without text (guests): the labels answer the date and say where things are written. */
const notices = [
  { id: "n1", school: "cysh", school_name: "嘉中", date: "2026-10-19", title: "115學年度推展閱讀運動閱讀心得繳交流程、時程與電子檔", tokens },
  { id: "n2", school: "cysh", school_name: "嘉中", date: "2026-10-28", title: "閱讀心得寫作比賽相關事宜" },
];
const opts = { asOf: "2026-11-03", scopeLabel: "嘉中", schoolId: "cysh", calendarEvents: [] };
let r = QA.answer("閱讀心得什麼時候要交", notices, {}, opts);
assert.equal(r.status, "answered");
assert.match(r.summary, /截止日是 11\/20（週五）/);
assert.equal(r.headline, "截止日：11/20（週五）");
assert.equal(r.sources[0].id, "n1");
r = QA.answer("閱讀心得沒交會怎樣", notices, {}, opts);
assert.match(JSON.stringify(r), /第 4 段寫到罰則/, "guests are told which segment holds the penalty");
/* Members: the quoted sentence is the labelled segment. */
r = QA.answer("閱讀心得什麼時候要交", notices, { n1: Object.assign({ announcement_id: "n1" }, record) }, opts);
assert.match(r.evidence[0].text, /11月20日/);
console.log("announcement token tests passed");
