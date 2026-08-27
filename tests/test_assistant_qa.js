const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const Feedback = require("../docs/assistant-feedback.js");
const Schools = require("../docs/school-registry.js");

const items = [
  { id: "a1", title: "學生行動載具管理規定", school_name: "嘉中", summary: "手機由學生自行保管，上課依教師指示使用。", url: "https://school.example/a1", date: "2026-08-20" },
  { id: "a2", title: "獎助學金申請", summary: "請於九月十日前送件。", url: "https://school.example/a2" },
  { id: "a3", title: "教師年資提敘相關規定", summary: "教師可依待遇條例申請。", url: "https://school.example/a3" },
];
const details = { a1: { provenance: "official_article", blocks: [{ type: "paragraph", text: "學生攜帶之手機由學生自行保管；上課期間應依授課教師指示使用。" }], attachments: [] } };
assert(QA.tokens("手機要上繳嗎？").includes("行動載具"), "question synonyms expand deterministically");
assert.deepEqual(QA.intent("獎學金什麼時候截止"), ["date"]);
const result = QA.answer("手機需要上繳嗎？", items, details);
assert.equal(result.status, "answered");
assert(result.evidence.some(row => row.announcement_id === "a1"));
assert.match(result.summary, /官方.*重點|先說結論/);
assert(!result.summary.includes("整理出以下重點"), "answer lead should be natural instead of a generic result count");
assert.equal(QA.smoothEvidence("主旨：請於九月十日前送件。"), "請於九月十日前送件。");
assert.equal(Schools.mentionedSchool("嘉義女中的獎學金有哪些？").id, "cygsh");
assert.equal(Schools.mentionedSchool("請查 CYSH 宿舍規定").id, "cysh");
assert(!QA.rank("手機或行動載具有什麼規定？", items, details).some(row => row.item.id === "a3"), "generic words cannot pull an unrelated regulation into the answer");
assert.equal(QA.answer("火星社團在哪裡", items, {}).status, "insufficient", "unsupported questions are not guessed");
let feedback = Feedback.record({}, "announcement:a1", "add_task", "2026-08-27T00:00:00Z");
feedback = Feedback.record(feedback, "announcement:a1", "dismiss", "2026-08-27T01:00:00Z");
assert.equal(Feedback.score(feedback, "announcement:a1"), -6);
assert.equal(Feedback.score(Feedback.record({}, "bad key", "complete"), "bad key"), 0);
console.log("Assistant QA and feedback tests passed");
