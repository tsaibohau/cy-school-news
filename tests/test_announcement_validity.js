const assert = require("node:assert/strict");
const Validity = require("../docs/announcement-validity.js");

const AS_OF = "2026-08-30";

function analyze(item, detail) { return Validity.analyze(item, detail || null, { asOf: AS_OF }); }

let result = analyze({ title: "學生宿舍管理規定", date: "2022-08-01", summary: "進住宿舍應遵守門禁規範。" });
assert.equal(result.document_type, "REGULATION_STANDING");
assert.notEqual(result.status, "EXPIRED", "old publication age cannot expire a standing regulation");

result = analyze({ title: "宿舍申請公告", date: "2026-08-01", summary: "申請期間為115年8月1日至8月3日止。" });
assert.equal(result.status, "EXPIRED");
assert.equal(result.answer_policy, "exclude");

result = analyze({ title: "第九屆傑出校友實施辦法（報名至115/8/31止）", summary: "推薦日期至115年8月31日止。" });
assert.equal(result.status, "ACTIVE_WINDOW", "an explicit deadline can establish an open window without a publication date");

result = analyze({ title: "115上註冊費繳費注意事項", date: "2026-08-21", summary: "繳費期限至9月13日止。信用卡繳費請使用學校代碼。" });
assert.equal(result.document_type, "MIXED");
assert.equal(result.status, "ACTIVE_WINDOW");

result = analyze({ title: "114上註冊費繳費注意事項", date: "2025-08-21", summary: "繳費期限至2025年9月13日止。信用卡繳費請使用學校代碼。" });
assert.equal(result.status, "PARTIAL_ACTIVE");
assert.equal(Validity.sentencePolicy("繳費期限至2025年9月13日止。", result, "現在怎麼繳註冊費"), "exclude");
assert.equal(Validity.sentencePolicy("信用卡繳費請使用學校代碼。", result, "現在怎麼繳註冊費"), "exclude");

result = analyze({ title: "清寒學生獎助學金申請辦法", snippet: "иӘӘжҳҺпјҡ гҖҒеҚ дёҖз”іи«Ӣ", detail_ref: "data/details/bad.json" });
assert.equal(result.answer_policy, "warn");
assert(result.warnings.some((row) => row.includes("編碼損壞")));

result = analyze({ title: "赴陸交流登錄注意事項", summary: "活動前一個月登錄，直到另行通知。" });
assert.equal(result.status, "UNCONFIRMED");
assert(result.warnings.some((row) => row.includes("後續公告")));

result = analyze({ title: "高級中等學校學生就學貸款辦法部分條文修正", date: "2026-06-17", summary: "第八條、第九條及第十一條修正發布。" });
assert.equal(result.document_type, "REGULATION_AMENDMENT");
assert.notEqual(result.status, "EXPIRED");

result = analyze({ title: "2026第三屆簡報比賽語言規定修正", date: "2026-08-25", summary: "除語言規定外其餘活動內容維持不變。" });
assert.equal(result.document_type, "DEADLINE_MODIFICATION");

assert.equal(Validity.requiresCurrentStatus("現在可以申請嗎"), true);
assert.equal(Validity.requiresCurrentStatus("2024年當時怎麼申請"), false);
assert.equal(Validity.requiresOpenWindow("現在有哪些比賽可以報名"), true);
assert.equal(Validity.requiresOpenWindow("下學期要怎麼繳註冊費"), false);
assert.equal(Validity.label({ status: "EXPIRED" }), "本次已過期");

result = analyze({ title: "本校學生宿舍114學年第1學期入住名單" });
assert.equal(result.status, "EXPIRED", "a previous academic-year roster cannot prove the current status");
result = analyze({ title: "114學年度學生宿舍管理規定", summary: "學生應遵守門禁規定。" });
assert.notEqual(result.status, "EXPIRED", "an academic year alone cannot automatically repeal a standing regulation");

console.log("Announcement validity policy tests passed");
