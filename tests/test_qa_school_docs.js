"use strict";
/* 2026-10-31: 問校務 answers from the student handbook, school pages and the class timetable. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const QA = require("../docs/assistant-qa.js");

const chapter = (n, title, text, keywords) => ({
  item: { id: "cysh-handbook-115-" + n, kind: "school_handbook", title: "學生手冊 › " + title, school: "cysh", school_name: "嘉中",
    url: "https://www.cysh.cy.edu.tw/p/406-1008-136504,r1125.php", category: "校園資訊", date: "2026-09-01", page_range: [Number(n), Number(n) + 1], keywords },
  detail: { announcement_id: "cysh-handbook-115-" + n, provenance: "official_article", source_hash: "h" + n, blocks: [],
    attachments: [{ provenance: "official_attachment", parse_status: "parsed", filename: "手冊.pdf", embedded_text: text }] },
});
const docs = [
  chapter("40", "圖書館借書規定", "國立嘉義高級中學圖書館借書規定\n94年2月訂定，97年3月14日修訂，101年12月03日修訂\n五、還  書：開館時間，讀者皆可還書。\n八、借閱期限：借期二週，借閱期滿如無他人預約得續借一次，並請自行登入系統辦理續借。逾\n期未歸還者，停止借書權利。", ["借書", "還書", "圖書館", "借期"]),
  chapter("17", "學生在校作息時間規定", "國立嘉義高級中學 學生在校作息時間規定\n一、依據：教育部111年03月07日發布修正「教育部主管高級中等學校學生在校作息時間規劃注意事\n項」訂定本校學生在校作息時間規定。\n四、本校學生作息時間表如下：\n08:00-08:50 第一節 第一節\n12:35-13:10 午休 午休\n17:10 放學 放學\n五、學生須遵守規定時間上課，不得無故缺席或遲到早退。\n(一)遲到：老師到班後至曠課時間前為遲到。\n(二)曠課：上課後10分鐘起算。", ["作息", "午休", "放學", "遲到", "曠課"]),
  chapter("12", "學生請假要點", "國立嘉義高級中學 學生請假要點\n三、學生因故必須請假時，應使用學生線上請假系統請假，逐項填明，經核定後，請假手續方為完畢。", ["請假"]),
  chapter("45", "進修部學生出缺席管理暨請假規定", "三、進修部學生請假應於三日內向學生事務組辦理。", ["請假"]),
];
const items = docs.map(d => d.item).concat([
  { id: "cysh-1", school: "cysh", school_name: "嘉中", date: "2026-05-27", title: "台灣玩具圖書館協會《115木育玩具創作競賽》競賽", category: "競賽" },
]);
const details = Object.fromEntries(docs.map(d => [d.item.id, d.detail]));
const opts = { asOf: "2026-10-31", scopeLabel: "嘉中", schoolId: "cysh" };
const ask = q => QA.answer(q, items, details, opts);

let r = ask("嘉義高中還書");
assert.equal(r.status, "answered");
assert.equal(r.mode, "rule");
assert.match(r.summary, /學生手冊 › 圖書館借書規定.*還書/);
r = ask("書可以借多久");
assert.match(r.summary, /借期二週/);
assert.doesNotMatch(r.summary, /97年3月14日/, "revision history is never the answer");
assert.match(ask("午休時間是幾點").summary, /12:35-13:10 午休/);
assert.match(ask("遲到怎麼算").summary, /老師到班後至曠課時間前為遲到|遲到早退/);
assert.match(ask("第一節幾點上課").summary, /08:00-08:50 第一節/);
r = ask("請假要怎麼請");
assert.match(r.summary, /學生請假要點/);
assert.doesNotMatch(r.summary, /進修部/, "day-school rules first");
assert.match(ask("進修部請假").summary, /進修部/);
assert.match(r.summary, /（第 12–13 頁）/, "page numbers of the handbook are cited");
console.log("✓ 學生手冊規定原文回答");

/* Reply: a short opener naming the source, then the official facts as bullet points. */
r = ask("書可以借多久");
assert.match(r.reply.text, /學生手冊的〈圖書館借書規定〉（第 40–41 頁）/);
assert.deepEqual(r.reply.bullets.slice(0, 2), ["借期二週", "借閱期滿如果沒有他人預約可以續借一次"]);
assert.ok(r.reply.bullets.every(b => !/^八、|借閱期限：/.test(b)), "list numbers and labels are taken out");
assert.deepEqual(ask("午休時間是幾點").reply.bullets, ["午休是 12:35–13:10"]);
assert.ok(!ask("第一節幾點上課").reply.bullets.some(b => /第一節第一節/.test(b)));
assert.equal(ask("書可以借多久").reply.text, r.reply.text, "the same question gets the same wording");
assert.equal(QA.tidyClause("(一)遲到：老師到班後至曠課時間前為遲到。"), "老師到班後至曠課時間前為遲到。");
assert.equal(QA.tidyClause("(二)曠課：上課後10分鐘起算。"), "曠課：上課後10分鐘起算。", "a label the sentence needs stays");
assert.deepEqual(QA.answer("101 星期三課表", [], {}, { asOf: "2026-11-02", timetables: [{ academic_year: 115, semester: 1, classes: [{ class_name: "101", slots: [
  { weekday: "星期三", period: 1, start: "0800", end: "0850", subject: "國文" }, { weekday: "星期三", period: 3, start: "1000", end: "1050", subject: "生物" }] }] }] }).reply.bullets,
  ["第 1 節　國文", "第 3 節　生物"]);
/* Privacy answers stay plain: no teasing. */
assert.equal(QA.conversational({ status: "insufficient", query: "王小明的電話", summary: "不能提供個人資料。" }).text, "不能提供個人資料。");
console.log("✓ 口語化回答");

/* Follow-up questions read the previous turn. */
const follow = (q, prev) => QA.resolveFollowUp(q, { query: prev });
assert.equal(follow("那要多久？", "還書").query, "還書 要多久？");
assert.equal(follow("那嘉女呢", "請假要怎麼請").query, "嘉女 請假要怎麼請");
assert.match(follow("星期四呢", "101 星期三第3節是什麼課").query, /101.*第3節.*星期四/);
assert.doesNotMatch(follow("星期四呢", "101 星期三第3節是什麼課").query, /星期三/);
assert.equal(follow("午休時間是幾點", "請假要怎麼請").context, "", "a complete new question stands alone");
assert.equal(follow("那要多久？", "").context, "", "no previous turn, no context");
assert.match(ask(follow("那進修部呢", "請假要怎麼請").query).summary, /進修部學生請假/, "the follow-up is answered with the previous subject");
console.log("✓ 接續上一題");
/* Small talk is answered as conversation and never glued onto the next question. */
assert.equal(QA.answer("你能做什麼", items, details, opts).mode, "chat");
assert.ok(QA.answer("你能做什麼", items, details, opts).reply.bullets.length >= 4, "help lists what can be asked");
assert.equal(QA.smallTalk("沒用"), "negative");
assert.equal(QA.smallTalk("謝謝！"), "thanks");
assert.equal(QA.smallTalk("書"), "too_short");
assert.equal(QA.smallTalk("書可以借多久"), "");
assert.equal(QA.smallTalk("101"), "", "a class number is a real question");
assert.equal(follow("書", "你能做什麼").context, "", "an unmarked short question stands alone");
assert.equal(QA.resolveFollowUp("那要多久", { query: "你做什麼書", answered: false }).context, "", "an unanswered question is not continued");
assert.equal(follow("沒用", "還書").context, "", "feedback is not a follow-up");
assert.equal(follow("那要多久", "你能做什麼").context, "", "no topic, nothing to continue");
console.log("✓ 閒聊與不亂接續");
for (const [q, kind] of [["你好聰明", "praise"], ["你好笨", "negative"], ["誰做的你", "creator"], ["你是AI嗎", "ai"], ["好累", "bored"], ["考爛了", "exam"],
  ["我喜歡你", "love"], ["講個笑話", "joke"], ["幫我寫作業", "homework"], ["掰掰", "bye"], ["哈哈哈", "laugh"]]) {
  assert.equal(QA.smallTalk(q), kind, q);
  assert.ok(QA.answer(q, items, details, opts).reply.text.length > 8, q + " gets a reply");
}
for (const q of ["好累 請假怎麼請", "考爛了要補考嗎", "你好，請問請假怎麼請", "圖書館幾點開"]) assert.equal(QA.smallTalk(q), "", q + " is a real question");
for (const [q, kind] of [["我好帥", "self"], ["你幾歲", "age"], ["好餓", "food"], ["陪我聊天", "lonely"]]) assert.equal(QA.smallTalk(q), kind, q);
assert.ok(QA.answer("你好", items, details, Object.assign({ hour: 1 }, opts)).reply.text.length > 8);
assert.notEqual(QA.answer("你好", items, details, Object.assign({ hour: 1 }, opts)).reply.text, QA.answer("你好", items, details, Object.assign({ hour: 14 }, opts)).reply.text, "late-night greeting differs");
assert.notEqual(QA.answer("書可以借多久", items, details, Object.assign({ lastQuestion: "書可以借多久" }, opts)).reply.text, ask("書可以借多久").reply.text, "a repeated question gets teased");
console.log("✓ 更多閒聊");

/* Without member detail there is no rule answer, only the official link. */
r = QA.answer("嘉義高中還書", items, {}, opts);
assert.notEqual(r.mode, "rule");

/* Office numbers and the school address are not personal data; people's are. */
assert.equal(QA.isPersonalDataQuery("教務處電話"), false);
assert.equal(QA.isPersonalDataQuery("圖書館分機多少"), false);
assert.equal(QA.isPersonalDataQuery("學校地址"), false);
assert.equal(QA.isPersonalDataQuery("王小明的電話"), true);
console.log("✓ 處室電話不是個資");

/* Timetable answers. */
const timetables = [{ school_id: "cysh", academic_year: 115, semester: 1, version: "formal", source_url: "https://x/t.pdf", classes: [
  { class_name: "101", slots: [
    { weekday: "星期三", period: 3, start: "1000", end: "1050", subject: "生物" },
    { weekday: "星期三", period: 1, start: "0800", end: "0850", subject: "國文" },
    { weekday: "星期一", period: 1, start: "0800", end: "0850", subject: "歷史" }] }] }];
const t = (q, extra) => QA.answer(q, [], {}, Object.assign({ asOf: "2026-11-02", timetables }, extra || {}));
assert.equal(t("101 星期三第3節是什麼課").summary, "101 班星期三第 3 節（10:00–10:50）是「生物」。");
assert.equal(t("星期三課表", { className: "101" }).summary, "101 班星期三：1 國文、3 生物。");
assert.match(t("今天有什麼課", { className: "101" }).summary, /101 班星期一：1 歷史/);
assert.match(t("今天課表").summary, /要查哪一班/);
assert.match(t("999 課表").summary, /找不到 999 班/);
assert.equal(t("重補修課表", { className: "101" }).mode, undefined, "重補修 is not the class timetable");
console.log("✓ 班級課表");

/* Login systems: 問校務 gives the official entry link, never reads inside. */
const services = [
  { id: "cysh-service-sch", kind: "school_service", title: "網路服務 › 校務行政系統", school: "cysh", url: "https://cysh-cy.k12ea.gov.tw/SCH_UI/",
    purpose: "查成績、缺曠與獎懲紀錄", login_required: true, keywords: ["成績", "缺曠", "缺曠紀錄", "請假"] },
  { id: "cysh-service-exam", kind: "school_service", title: "網路服務 › 考試範圍公告", school: "cysh", url: "https://campus.cysh.cy.edu.tw/exam_range/",
    purpose: "查段考各科考試範圍", login_required: null, keywords: ["考試範圍", "期中考範圍"] },
];
const withServices = items.concat(services);
r = QA.answer("成績怎麼查", withServices, details, opts);
assert.equal(r.mode, "service");
assert.match(r.summary, /校務行政系統.*需要用學校帳號登入/);
r = QA.answer("期中考範圍", withServices, details, opts);
assert.equal(r.mode, "service");
assert.doesNotMatch(r.summary, /登入/, "login is not claimed when it was not confirmed");
r = QA.answer("我的缺曠紀錄", withServices, details, opts);
assert.equal(r.service_links[0].name, "校務行政系統", "personal records point to the system");
r = QA.answer("請假要怎麼請", withServices, details, opts);
assert.equal(r.mode, "rule", "a rule answer stays; the system link is added");
assert.equal(r.service_links[0].name, "校務行政系統");
console.log("✓ 需登入系統的入口連結");

/* 嘉女 keeps rules as linked documents: point to the document, never pretend to quote it. */
const cygshPages = [{ id: "cygsh-info-1843", kind: "school_info", title: "學務處 › 生活輔導組 › 學生獎懲", school: "cygsh", school_name: "嘉女", date: "",
  url: "https://www.cygsh.cy.edu.tw/p/412-1013-1843.php", keywords: ["獎懲"], documents: [
    { name: "學生獎懲委員會運作要點", url: "https://drive.google.com/a" },
    { name: "學生獎懲規定", url: "https://drive.google.com/b" },
    { name: "（請按我連結）", url: "https://drive.google.com/c" }] },
  { id: "cygsh-info-2133", kind: "school_info", title: "學務處 › 生活輔導組 › 生活教育及輔導", school: "cygsh", school_name: "嘉女", date: "",
  url: "https://www.cygsh.cy.edu.tw/p/412-1013-2133.php", keywords: [], documents: [{ name: "校園行動載具使用管理規範", url: "https://drive.google.com/d" }] }];
const g = q => QA.answer(q, cygshPages, {}, { asOf: "2026-10-31", scopeLabel: "嘉女", schoolId: "cygsh" });
r = g("獎懲規定");
assert.equal(r.mode, "document");
assert.match(r.summary, /官方文件「學生獎懲規定」.*讀不到這份文件的內文/);
assert.equal(g("手機可以帶到學校嗎").document_links[0].name, "校園行動載具使用管理規範");
assert.equal(QA.isPersonalDataQuery("獎懲規定"), false, "asking for the rules is not a records request");
assert.equal(QA.isPersonalDataQuery("王小明的獎懲"), true);
assert.ok(!g("獎懲規定").document_links.some(d => /請按我/.test(d.name)), "link labels like 請按我連結 are not documents");
console.log("✓ 嘉女官方文件連結");

/* The public school-info index (when present) never carries page text. */
for (const school of ["cysh", "cygsh"]) {
  const indexFile = path.join(__dirname, "..", "docs", "data", "school-info", school + ".json");
  if (fs.existsSync(indexFile)) assert.doesNotMatch(fs.readFileSync(indexFile, "utf8"), /embedded_text|"blocks"|"summary"/);
}
console.log("問校務 school documents and timetable tests passed");
