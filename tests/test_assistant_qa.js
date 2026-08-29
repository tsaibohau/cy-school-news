const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const SearchQuery = require("../docs/search-query.js");
const Feedback = require("../docs/assistant-feedback.js");
const Schools = require("../docs/school-registry.js");

const items = [
  { id: "a1", title: "學生行動載具管理規定", school_name: "嘉中", summary: "手機由學生自行保管，上課依教師指示使用。", url: "https://school.example/a1", date: "2026-08-20" },
  { id: "a2", title: "獎助學金申請", summary: "請於九月十日前送件。", url: "https://school.example/a2" },
  { id: "a3", title: "教師年資提敘相關規定", summary: "教師可依待遇條例申請。", url: "https://school.example/a3" },
];
const details = { a1: { provenance: "official_article", blocks: [{ type: "paragraph", text: "學生攜帶之手機由學生自行保管；上課期間應依授課教師指示使用。" }], attachments: [] } };
const accommodationItem = { id: "a4", title: "學生宿舍申請作業說明", summary: "欲申請住宿者，請依期限完成登記。", url: "https://school.example/a4", date: "2026-08-21" };
const admissionItem = { id: "a5", title: "大學申請入學說明", summary: "新生住宿與宿舍相關資訊另行公告。", url: "https://school.example/a5", date: "2026-08-22" };
items.push(accommodationItem);
items.push(admissionItem);
details.a4 = { provenance: "official_article", blocks: [{ type: "paragraph", text: "欲申請學生宿舍住宿者，請於期限前完成登記。" }], attachments: [] };
assert(SearchQuery.matches(accommodationItem.title + " " + accommodationItem.summary, "住宿申請"), "library search treats 住宿 and 宿舍 as one concept");
assert(SearchQuery.matches("學生宿舍管理規定", "住宿申請"), "process words are optional retrieval signals");
assert(SearchQuery.announcementScore(accommodationItem, "宿舍申請") > 0, "a primary accommodation title remains searchable");
assert(SearchQuery.announcementScore(admissionItem, "宿舍申請") < SearchQuery.announcementScore(accommodationItem, "宿舍申請"),
  "a body mention ranks below a real dormitory application notice");
assert(!SearchQuery.select([admissionItem, accommodationItem], "宿舍申請").some(function (row) { return row.item.id === "a5"; }),
  "a weak admission-body match stays out when a stronger dormitory result exists");
assert(SearchQuery.announcementScore({ title: "學生宿舍管理規定", summary: "申請表另附" }, "宿舍申請") > 0,
  "a dormitory announcement stays discoverable even when it does not use the requested process word");
assert(SearchQuery.announcementScore({ title: "115學年度高一新生住宿相關資訊" }, "住宿申請") > 0,
  "a subject match is not discarded because the title says information rather than application");
const studentDormInfo = { id: "a6", title: "115學年度高一新生住宿相關資訊", summary: "學生報到及搬入宿舍。" };
const staffDormJob = { id: "a7", title: "宿舍幹事職缺公告", summary: "徵才及面試作業。" };
assert(SearchQuery.announcementScore(studentDormInfo, "住宿申請") > SearchQuery.announcementScore(staffDormJob, "住宿申請"),
  "student housing service ranks above a staff vacancy for a student lodging query");
assert.deepEqual(SearchQuery.select([staffDormJob, studentDormInfo], "住宿申請").map(function (row) { return row.item.id; }), ["a6"],
  "low-confidence role conflicts are hidden when a stronger subject result exists");
assert(SearchQuery.announcementScore({ title: "晚自習申請說明" }, "晚自習申請") > 0,
  "unknown subjects use title/source matching instead of a hard-coded topic list");
assert(SearchQuery.announcementScore({ title: "大學申請入學說明", summary: "晚自習資訊另行公告" }, "晚自習申請") <
  SearchQuery.announcementScore({ title: "晚自習申請說明" }, "晚自習申請"),
  "an unknown subject mentioned only in body ranks below a title match");
const searchCases = [
  ["獎學金申請", { title: "獎助學金申請辦法" }, { title: "社團補助核銷", summary: "獎學金資訊另行公告" }],
  ["社團選填", { title: "社團選填須知" }, { title: "社團成果發表" }],
  ["校車報名", { title: "校車乘車申請表" }, { title: "語文競賽報名" }],
];
searchCases.forEach(([query, strong, weak]) => {
  assert(SearchQuery.announcementScore(strong, query) > SearchQuery.announcementScore(weak, query), query + " ranks the closer notice first");
  assert.deepEqual(SearchQuery.select([weak, strong], query).map(function (row) { return row.item; }), [strong], query + " hides weak matches when a strong result exists");
});
assert(QA.tokens("住宿申請怎麼辦").includes("宿舍"), "assistant query expands accommodation terminology bidirectionally");
assert(QA.answer("住宿申請怎麼辦", items, details).sources.some(row => row.id === "a4"), "assistant finds a 宿舍公告 for a 住宿申請 question");
assert(!QA.rank("宿舍申請怎麼辦", items, details).some(row => row.item.id === "a5"), "assistant excludes admissions that only mention a dormitory in their body");
assert(QA.tokens("手機要上繳嗎？").includes("行動載具"), "question synonyms expand deterministically");
assert.deepEqual(QA.intent("獎學金什麼時候截止"), ["date"]);
const result = QA.answer("手機需要上繳嗎？", items, details);
assert.equal(result.status, "answered");
assert(result.evidence.some(row => row.announcement_id === "a1"));
assert(result.answer_lines.some(row => row.includes("自行保管")), "direct answer stays grounded in the official sentence");
assert.equal(result.plan.yes_no, true);
assert.match(result.limitation, /官方|公告|附件/);
assert.match(result.summary, /官方.*重點|先說結論/);
assert(!result.summary.includes("整理出以下重點"), "answer lead should be natural instead of a generic result count");
assert.equal(QA.smoothEvidence("主旨：請於九月十日前送件。"), "請於九月十日前送件。");
assert.match(QA.composeSummary([{ text: "科學營於九月五日前報名。" }, { text: "寫作工作坊於九月十日前報名。" }], [{ id: "one" }, { id: "two" }], []), /不是同一項活動/);
assert.equal(Schools.mentionedSchool("嘉義女中的獎學金有哪些？").id, "cygsh");
assert.equal(Schools.mentionedSchool("請查 CYSH 宿舍規定").id, "cysh");
assert.equal(Schools.mentionedSchool("輔仁中學的校車公告").id, "fjsh");
assert.equal(QA.questionPlan("目前最新的報名方式是什麼").wants_latest, true);
const split = QA.answerLines([
  { announcement_id: "one", text: "科學營於九月五日前報名。" },
  { announcement_id: "two", text: "寫作工作坊於九月十日前報名。" },
], [{ id: "one", title: "科學營" }, { id: "two", title: "寫作工作坊" }]);
assert.deepEqual(split, ["科學營：科學營於九月五日前報名。", "寫作工作坊：寫作工作坊於九月十日前報名。"]);
assert(!QA.rank("手機或行動載具有什麼規定？", items, details).some(row => row.item.id === "a3"), "generic words cannot pull an unrelated regulation into the answer");
assert.equal(QA.answer("火星社團在哪裡", items, {}).status, "insufficient", "unsupported questions are not guessed");
let feedback = Feedback.record({}, "announcement:a1", "add_task", "2026-08-27T00:00:00Z");
feedback = Feedback.record(feedback, "announcement:a1", "dismiss", "2026-08-27T01:00:00Z");
assert.equal(Feedback.score(feedback, "announcement:a1"), -6);
assert.equal(Feedback.score(Feedback.record({}, "bad key", "complete"), "bad key"), 0);
console.log("Assistant QA and feedback tests passed");
