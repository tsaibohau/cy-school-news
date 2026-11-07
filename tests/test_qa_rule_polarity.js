"use strict";
/* 2026-11-07 owner test: the handbook answers were wrong in three ways. Rule text below is INVENTED (the real
   chapters are member content); the layout copies the handbook's numbering and heading levels.
   1. 「午休滑手機會怎樣」 was answered 「可以，只是要照規矩來」 although the rule bans it.
   2. 「忘記帶學生證」 was answered with a revision date instead of the procedure.
   3. 「在哪裡集合」 was answered with a time, without saying the place is not written. */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const info = require("../docs/data/school-info/cysh.json").items;
const items = info.concat(require("../docs/data/schools/cysh/current.json").items);
const chapter = (name) => items.find((i) => i.kind === "school_handbook" && i.title.split("›").pop().trim() === name);
/* PDF text wraps at about 40 characters; a numbered clause is several wrapped lines. */
const wrap = (line) => (line.length > 40 && /^[一二三四五六七八九十]+、/.test(line) ? line.match(/.{1,38}/g).join("\n") : line);
const body = (item, lines) => ({ [item.id]: { announcement_id: item.id, provenance: "official_article", blocks: [{ type: "paragraph", text: lines.map(wrap).join("\n") }], attachments: [] } });
const phone = chapter("校園行動載具使用規定"), exam = chapter("學生考試要點"), weekend = chapter("學生週末生活輔導實施要點"), penalty = chapter("學生獎懲規定");
assert.ok(phone && exam && weekend && penalty);
const bodies = Object.assign({},
  body(phone, ["某校 校園行動載具使用規定", "88 年 1 月 19 日校務會議訂定", "99 年 7 月 2 日校務會議修訂",
    "一、實施依據：", "（一）教育部 90 年 9 月 6 日以某字第 123 號函辦理。",
    "三、適用對象：學生、教職員工及其他人。",
    "四、使用規範：", "為維護公共秩序，應正確使用行動載具(泛指手機、可攜式電腦、平板電腦等終端裝置)，並遵守以下規範：",
    "（一）學生須知：",
    "1、上課、定期評量、午休及集會，皆不得使用行動載具，並應關機收好且不得置於桌面。學生遇緊急狀況，經老師同意後方可使用。",
    "2、早自習前、放學後使用時，不得大聲喧嘩。",
    "3、違規處置依本校學生獎懲規定及週末生活輔導實施要點辦理。",
    "（二）職員工如發現學生違規使用行動載具，請交由該班導師依校規處理。"]),
  body(exam, ["某校 學生考試要點", "88 年 1 月 19 日校務會議修訂",
    "十九、學生在定期性考試時，每節均必須攜帶學生證應試，如未攜帶可以用身分證、護照、健保卡（需有相片）、駕照等代替。如以上證件均無，應到教務處註冊組核對身分後申領臨時學生證（需週輔乙次）。如未攜帶任何證件且未申請臨時學生證被監考人員登記者，記警告乙次。臨時學生證有效日期一天。",
    "二十、學生在考試時，不得飲食。"]),
  body(weekend, ["某校 學生週末生活輔導實施要點", "98 年 1 月 19 日校務會議修訂", "壹、依據：本校學生獎懲實施要點第四點辦理。",
    "貳、目的：為使學生個別偏差行為得到適切之輔導改正。", "參、實施方式：",
    "一、每月第四週週末由生輔組就有犯錯事實之學生，留校 1.5 小時實施生活輔導。", "二、實施時間：週六上午 9 時起實施。",
    "三、無法參加者，請假需於當週星期五中午 12 時前完成。", "四、輔導內容：愛校服務、心得寫作。",
    "五、有下列情事者給予生活輔導：", "（一）違反一般規定：", "1. 當週週末輔導上午 9:10 後集合。"]),
  body(penalty, ["某校 學生獎懲規定", "十四、合於下列情事之一者，記警告：", "(一)遲到，經勸導仍未改正者。", "(二)違反本校「校園行動載具使用規定」，經勸導後仍未改正，情節輕微者。",
    "十五、合於下列情事之一者，記小過：", "(一)違反本校「校園行動載具使用規定」，經勸導後仍未改正，情節嚴重者。"]));
const daily = chapter("學生在校作息時間規定");
assert.ok(daily);
Object.assign(bodies, body(daily, ["某校 學生在校作息時間規定", "一、午休應立即進入教室，不得喧鬧或在外逗留、走動。", "二、嚴禁利用午休於廁所聚集聊天。"]));
const opts = { asOf: "2026-11-07", schoolId: "cysh", scopeLabel: "嘉中", calendarEvents: [] };
function ask(q) {
  const details = {};
  QA.readList(q, items, opts).forEach((item) => { if (bodies[item.id]) details[item.id] = bodies[item.id]; });
  return QA.answer(q, items, details, opts);
}
const say = (r) => [r.summary, (r.reply && r.reply.text) || "", ((r.reply && r.reply.bullets) || []).join(" "), (r.reply && r.reply.tail) || "", (r.also || []).map((a) => a.text).join(" ")].join(" ");

/* 1. Polarity: a rule that says 不得／應關機 is never answered 可以／允許 (「可攜式」 is not 可). */
let r = ask("午休時間滑手機會發生什麼事情？如果校規有寫，但老師沒有抓是不是就沒事");
let t = say(r);
assert.doesNotMatch(t, /可以，|是允許|答案是可以|^行，/, "must not say it is allowed: " + t);
assert.match((r.reply && r.reply.text) || "", /不行|不可以|這個不行/);
assert.match(t, /皆不得使用行動載具/, "the operative clause is quoted");
assert.match(t, /違規處置依本校學生獎懲規定/, "the consequence clause of the same rule is listed");
assert.match(t, /交由該班導師依校規處理/, "what staff do on finding a violation");
assert.match(t, /不代表允許/, "not being caught does not make it allowed: " + t);
assert.match(t, /記警告|記小過/, "the concrete penalty is quoted, not a 登入 hint: " + t);
assert.doesNotMatch(t, /登入後我可以直接引用/);
assert.doesNotMatch(t, /88 年|99 年|某字第/, "no revision history or 依據 line: " + t);
r = ask("午休可以滑手機嗎");
assert.match((r.reply && r.reply.text) || "", /不行|不可以|這個不行/);
assert.doesNotMatch(say(r), /可以，只是要照規矩來/);

/* The asked subject (手機) picks the chapter; the situation (午休) alone does not. This phone chapter never says 午休. */
const phoneText = bodies[phone.id].blocks[0].text;
bodies[phone.id].blocks[0].text = phoneText.replace("上課、定期評量、午休及集會", "上課、定期評量及集會");
r = ask("午休滑手機會怎樣");
assert.match(say(r), /行動載具/, say(r));
assert.doesNotMatch(say(r), /廁所聚集|不得喧鬧/, say(r));
bodies[phone.id].blocks[0].text = phoneText;

/* 2. A question about what to do: the procedure, every alternative, and the penalty. */
r = ask("段考時間我忘記帶學生證該怎麼辦？");
t = say(r);
assert.match(t, /身分證、護照、健保卡/, t);
assert.match(t, /教務處註冊組/);
assert.match(t, /臨時學生證/);
assert.match(t, /記警告乙次/);
assert.doesNotMatch(t, /88 年|1 月 19 日/, "a revision date is not an answer: " + t);

/* 3. Where: the rule gives no place — say so, and give the facts that are written. */
r = ask("週末輔導要去哪裡集合？");
t = say(r);
assert.match(t, /沒有寫明地點/, t);
assert.match(t, /週六上午 9 時/);
assert.match(t, /星期五中午 12 時/);
assert.match(t, /每月第四週/);
assert.doesNotMatch(t, /98 年|本校學生獎懲實施要點第四點/, "no revision line or 依據: " + t);
/* 4. Unit: revision history and basis lines carry no weight unless asked. */
const terms = QA.ruleTerms("週末輔導什麼時候");
assert.equal(QA.scoreClause("98 年 1 月 19 日校務會議修訂", terms, "週末輔導什麼時候", "學生週末生活輔導實施要點"), 0);
assert.ok(QA.scoreClause("一、 依據：教育部108 年函頒週末輔導原則。", terms, "週末輔導的依據是什麼", "學生週末生活輔導實施要點") > 0, "asked for the basis: it counts");
assert.equal(QA.scoreClause("一、 依據：教育部108 年函頒週末輔導原則。", terms, "週末輔導什麼時候", "學生週末生活輔導實施要點"), 0);
assert.equal(QA.scoreClause("二、 目的：為使週末輔導得到適切之改正。", terms, "週末輔導什麼時候", "學生週末生活輔導實施要點"), 0);
console.log("rule polarity, procedure and place tests passed");
