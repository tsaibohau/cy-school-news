"use strict";
/* 問校務要回答公告的「內容」（時間、地點、對象、報名…），不是重述標題。全部是虛構公告。 */
const assert = require("node:assert/strict");
const C = require("../docs/answer-composer.js");
const QA = require("../docs/assistant-qa.js");

const TITLE = "星河市立第一小學辦理「星光編程工作坊」";
const lines = [
  "星河市立第一小學辦理「星光編程工作坊」，詳如附件。",
  "主旨：本校辦理星光編程工作坊，邀請貴校學生報名參加，請查照。",
  "一、依據星光計畫辦理。",
  "二、活動資訊：",
  "(一)活動主題：用積木學程式，認識演算法與迴圈。",
  "(二)活動時間：115年12月5日（星期六）9:00-12:00。",
  "(三)活動地點：本校三樓電腦教室",
  "(四)參加對象：國中、高中學生，限30名。",
  "(五)報名方式：請於115年11月20日（星期五）前，至報名網站（https://example.org/join）完成報名。",
  "(六)費用：免費，午餐自理。",
  "(七)攜帶物品：筆電、充電器、學生證。",
  "三、聯絡人：王小明 電話：07-1234567 分機 88 電子信箱：demo@example.org",
];

/* Labelled lists: numbered, bracketed, and flattened into one line. */
for (const input of [lines, [lines.join(" ")]]) {
  const f = C.fieldsOf({ lines: input, title: TITLE, posted: "2026-11-02" });
  assert.match(f.slots.time.value, /115年12月5日/);
  assert.match(f.slots.place.value, /三樓電腦教室/);
  assert.match(f.slots.audience.value, /國中、高中學生/);
  assert.equal(f.slots.signup.url, "https://example.org/join");
  assert.match(f.slots.deadline.value, /115年11月20日/);
  assert.match(f.slots.fee.value, /免費/);
  assert.match(f.slots.bring.value, /筆電/);
  assert.match(f.slots.contact.value, /07-1234567/);
  assert.doesNotMatch(f.slots.contact.value, /王小明/, "a person's name is not repeated");
  assert.match(f.slots.purpose.value, /積木|星光編程/);
}
/* Label synonyms and the suffix rule. */
assert.equal(C.classifyLabel("辦理日期"), "time");
assert.equal(C.classifyLabel("場地"), "place");
assert.equal(C.classifyLabel("網路報名時間"), "deadline");
assert.equal(C.classifyLabel("應備文件"), "bring");
/* Fallback in prose, and 「詳如附件」 is a pointer, not a value. */
let f = C.fieldsOf({ lines: ["本校訂於116年1月8日在活動中心舉辦科學展覽，歡迎全校同學參加。", "活動地點：詳如附件"], title: "科學展覽公告" });
assert.match(f.slots.time.value, /1月8日/);
assert.match(f.slots.place.value, /活動中心/);
f = C.fieldsOf({ lines: ["時間：116年1月8日", "地點：詳如附件"], title: "某活動" });
assert.ok(!f.slots.place && f.pointers.place);

/* ROC dates, and dates with no year take the posting year. */
assert.equal(C.isoOf("115年12月5日", ""), "2026-12-05");
assert.equal(C.isoOf("12月5日（六）", "2026-11-02"), "2026-12-05");
assert.equal(C.isoOf("1/5", "2026-11-20"), "2027-01-05");

/* Question type → slot. */
const asks = { "星光編程工作坊什麼時候": "time", "星光編程工作坊在哪": "place", "怎麼報名": "signup", "要帶什麼": "bring", "多少錢": "fee",
  "誰可以參加": "audience", "要找誰問": "contact", "報名截止日": "deadline", "星光編程工作坊是什麼": "summary", "什麼時候報名": "deadline" };
Object.keys(asks).forEach((q) => assert.equal(C.askedSlot(q), asks[q], q));
assert.ok(C.isGeneralAsk("星光編程工作坊", TITLE));
assert.ok(!C.isGeneralAsk("星光編程工作坊在哪", TITLE));

/* In 問校務. */
const item = { id: "n1", title: TITLE, school: "cysh", school_name: "嘉中", summary: "", snippet: "", url: "https://school.example/n1", date: "2026-11-02" };
const detail = { provenance: "official_article", announcement_id: "n1", source_hash: "h1", blocks: lines.map((text) => ({ type: "paragraph", text })), attachments: [] };
const ask = (q, d) => QA.answer(q, [item], { n1: d || detail }, { asOf: "2026-11-05", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: [] });
let r = ask("星光編程工作坊在哪裡");
assert.equal(r.status, "answered");
assert.match(r.summary, /三樓電腦教室/);
r = ask("星光編程工作坊什麼時候");
assert.match(r.summary, /12月5日/);
r = ask("星光編程工作坊怎麼報名");
assert.match(r.summary, /example\.org\/join/);
r = ask("星光編程工作坊要帶什麼");
assert.match(r.summary, /筆電/);
r = ask("星光編程工作坊多少錢");
assert.match(r.summary, /免費/);
/* A general question gets what the notice is about, not its title again. */
r = ask("星光編程工作坊是什麼");
assert.match(r.summary, /積木|演算法/);
assert.match(r.summary, /12月5日/);
assert.equal(r.content.kind, "summary");
r = ask("星光編程工作坊");
assert.equal(r.content.kind, "summary");
assert.ok(C.noveltyOf(r.summary.replace(/根據[^「]*「[^」]*」[：，]/, ""), TITLE) >= 8);
/* A slot the notice does not give is said so, with where to look. */
const noPlace = { provenance: "official_article", announcement_id: "n1", source_hash: "h2", attachments: [],
  blocks: [{ type: "paragraph", text: "星河市立第一小學辦理「星光編程工作坊」，詳如附件。" }, { type: "paragraph", text: "活動時間：115年12月5日（星期六）9:00-12:00。" }] };
r = ask("星光編程工作坊在哪裡", noPlace);
assert.match(r.summary, /沒有寫明地點/);
assert.match(r.summary, /附件|原文/);
/* A date already past is flagged. */
r = QA.answer("星光編程工作坊什麼時候", [item], { n1: detail }, { asOf: "2026-12-20", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: [] });
assert.match(r.summary, /已經過了/);
/* The composed reply reads as an answer. */
const said = QA.conversational(ask("星光編程工作坊在哪裡"));
assert.match(said.text, /三樓電腦教室/);
console.log("qa content tests passed");
