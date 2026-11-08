const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");

/* Invented data only: a made-up school with the same page shapes as the real ones. */
const exam = [
  "星月高中學生考試要點",
  "98 年 1 月 19 日校務會議修訂",
  "一、 學生在定期性考試時，每節均必須攜帶學生證應試，如未攜帶可以用身分證代替。如以上證件均無，應到教務處證件組核對身分後申領臨時學生證。如未攜帶學生證且未申請臨時學生證被監考人員登記者，記警告乙次。",
].join("\n");
const withProcedure = [
  "星月高中學生證管理要點",
  "一、 學生證遺失者，應至證件組填寫補發申請單，繳交照片一張及工本費五十元，三個工作天內領取。",
].join("\n");
const detail = (text) => ({ provenance: "official_article", blocks: [], attachments: [{ embedded_text: text, extension: "pdf", provenance: "official_attachment" }] });
const doc = (id, title, kind, school) => ({ id, kind, title, school, school_name: school === "alpha" ? "星月" : "海風", category: "校園資訊", date: "2026-09-01", url: "https://school.example/" + id });
const options = (school, label) => ({ asOf: "2026-11-07", schoolId: school, scopeLabel: label, calendarEvents: [] });

/* 1. A school page names the office that replaces student IDs; the exam rule is only a labelled side note. */
{
  const items = [
    doc("a-exam", "學生手冊 › 學生考試要點", "school_handbook", "alpha"),
    doc("a-page", "教務處 › 證件組 › 學生證補發申請", "school_info", "alpha"),
  ];
  const details = { "a-exam": detail(exam) };
  for (const q of ["我的學生證遺失了怎麼辦", "學生證不見了怎麼辦", "學生證掉了要去哪裡補"]) {
    const r = QA.answer(q, items, details, options("alpha", "星月"));
    const text = [r.reply.text].concat(r.reply.bullets || [], (r.also || []).map((a) => a.text)).join("\n");
    assert.equal(r.status, "answered", q);
    assert(/證件組/.test(r.reply.text), q + " names the office that handles it: " + r.reply.text);
    assert(!/^未攜帶|^如未攜帶/.test(r.reply.text), q + " does not lead with the exam penalty");
    assert(!/時間：98/.test(text), q + " has no revision-date bullet");
    const penaltyAt = text.indexOf("記警告");
    if (penaltyAt !== -1) assert(/另外，考試時/.test(text) && text.indexOf("另外，考試時") < penaltyAt, q + " penalty only as a labelled side note");
  }
}

/* 2. The handbook has the procedure itself: it is the answer (where, what to bring, the fee). */
{
  const items = [doc("a-card", "學生手冊 › 學生證管理要點", "school_handbook", "alpha"), doc("a-exam", "學生手冊 › 學生考試要點", "school_handbook", "alpha")];
  const details = { "a-card": detail(withProcedure), "a-exam": detail(exam) };
  const r = QA.answer("學生證遺失了怎麼辦", items, details, options("alpha", "星月"));
  assert.equal(r.status, "answered");
  assert(r.mode === "howto" || r.mode === "rule", r.mode);
  assert(/證件組/.test(r.reply.text) && /補發申請單/.test(r.reply.text), r.reply.text);
  assert(/照片/.test(r.reply.text + r.reply.bullets.join("")) || /工本費/.test(r.reply.text + r.reply.bullets.join("")), JSON.stringify(r.reply));
  assert(!/記警告/.test(r.reply.text + r.reply.bullets.join("")), "no penalty in the answer itself");
}

/* 3. No procedure anywhere: say so plainly, without inventing an office. */
{
  const items = [doc("b-exam", "學生手冊 › 學生考試要點", "school_handbook", "beta")];
  const details = { "b-exam": detail(exam) };
  const r = QA.answer("我的學生證遺失了怎麼辦", items, details, options("beta", "海風"));
  const text = [r.reply.text].concat(r.reply.bullets || []).join("\n");
  assert(/海風的資料裡沒有寫學生證遺失後的補辦方式/.test(text), text);
  assert(/導師或教務處/.test(text), text);
  assert(!/證件組/.test(r.reply.text), "office not invented");
  assert(!/^未攜帶|^如未攜帶|^如以上/.test(r.reply.text), "the exam rule is not the answer");
  /* Nothing at all in the data. */
  const none = QA.answer("學生證遺失了怎麼辦", [], {}, options("beta", "海風"));
  assert(/沒有寫學生證遺失後的補辦方式/.test(none.reply.text), none.reply.text);
}

/* 4. Something else lost or taken: the same plain answer, never a penalty clause. */
{
  const items = [doc("b-exam", "學生手冊 › 學生考試要點", "school_handbook", "beta")];
  const details = { "b-exam": detail(exam) };
  for (const [q, thing] of [["制服弄丟了怎麼辦", "制服遺失後的補辦方式"], ["手機被沒收了怎麼辦", "手機被沒收後的處理方式"]]) {
    const r = QA.answer(q, items, details, options("beta", "海風"));
    assert(r.reply.text.indexOf(thing) !== -1, q + ": " + r.reply.text);
    assert(!/記警告/.test(r.reply.text), q);
  }
}

/* 5. Asking what happens is still answered with the penalty. */
{
  const items = [doc("a-exam", "學生手冊 › 學生考試要點", "school_handbook", "alpha"), doc("a-pen", "學生手冊 › 學生獎懲規定", "school_handbook", "alpha")];
  const details = { "a-exam": detail(exam), "a-pen": detail("星月高中學生獎懲規定\n一、 合於下列情事之一者，記警告：\n(一) 參加定期性考試，未攜帶學生證且未申請臨時學生證者。") };
  const r = QA.answer("考試沒帶學生證會被記警告嗎", items, details, options("alpha", "星月"));
  assert.equal(r.status, "answered");
  assert(/記警告/.test([r.reply.text].concat(r.reply.bullets || [], (r.also || []).map((a) => a.text)).join("")), JSON.stringify(r.reply));
}

/* 6. A rule's revision date is not shown as a 「時間」 point when the question is not about time. */
{
  const items = [doc("a-exam", "學生手冊 › 學生考試要點", "school_handbook", "alpha")];
  const details = { "a-exam": detail(exam) };
  const r = QA.answer("考試沒帶學生證會怎樣", items, details, options("alpha", "星月"));
  const all = JSON.stringify(r.reply) + JSON.stringify(r.key_points || []);
  assert(!/98 年 1 月 19 日/.test(all), all);
}

console.log("test_qa_howto ok");
