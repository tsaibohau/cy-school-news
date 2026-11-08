"use strict";
/* 問校務：長短不一的真實問法（5 字內的簡問、10–20 字、20–40 字、50 字以上的長篇敘述）。
   開放時間題不拿借書辦法充數、「成績何時能查」找成績校對公告、短公告整篇講完（不漏最後期限）、
   「後八週」不被「前八週」「充實補強」取代、名單文字不外洩、梯次全列、長篇敘述的兩件事分開答。全部是虛構資料。 */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");

const flat = (r) => {
  const rep = r.reply || {};
  return [rep.text].concat(rep.bullets || [], (rep.paragraphs || []).map((p) => [p.heading, p.text].concat(p.bullets || [], p.asides || [], [p.source]).join("\n"))).join("\n");
};
const notice = (id, school, name, date, title) => ({ id, school, school_name: name, date, title, category: "公告" });
const detail = (id, lines) => ({ announcement_id: id, parse_status: "parsed", provenance: "official_article", source_hash: "h" + id, attachments: [], blocks: lines.map((text) => ({ type: "paragraph", text, links: [] })) });
const rule = (id, school, name, title, text, keywords) => ({
  item: { id, kind: "school_handbook", title, school, school_name: name, url: "https://school.example/" + id, category: "校園資訊", date: "2026-09-01", page_range: [1, 2], keywords },
  detail: { announcement_id: id, provenance: "official_article", source_hash: "h" + id, blocks: [], attachments: [{ provenance: "official_attachment", parse_status: "parsed", filename: "手冊.pdf", embedded_text: text }] },
});
const service = (id, school, title, keywords, purpose) => ({ id, kind: "school_service", title: "網路服務 › " + title, school, school_name: school, url: "https://sys.example/" + id, keywords, purpose, login_required: true, category: "服務" });

/* 語料夠多時，問句裡的關鍵詞才分得出常見字與專有詞：補一批不相干的公告。 */
const pool = "山水風雲花草鳥魚星月日光石林海河橋路門窗書筆墨紙琴棋畫茶酒米麵糖鹽油燈火鐵銅金銀玉珠貝竹松梅蘭菊荷柳桃李杏梨棗瓜豆麥稻".split("");
const filler = (school, name) => Array.from({ length: 230 }, (_, i) => ({ id: school + "-f" + i, school, school_name: name, date: "2026-10-01",
  title: "公告" + pool[i % 60] + pool[(i * 7 + 3) % 60] + pool[(i * 11 + 5) % 60] + pool[(i * 13 + 1) % 60] + "通知" }));

/* ---- 1. 「圖書館時間」（5 字）：開放時間不是借書辦法；日期清單全列並指出還沒到的 ---- */
{
  const lib = rule("cygsh-lib", "cygsh", "嘉女", "圖書館借書辦法", "本館出借圖書之冊數及期限規定如下：學生借出圖書總數為五冊，借期十四天。凡借書屆滿未還，每逾一日停借三日。", ["圖書館", "借書"]);
  const sat = notice("cygsh-sat", "cygsh", "嘉女", "2026-09-08", "115-1圖書館週六自習開放時間");
  const d = { "cygsh-sat": detail("cygsh-sat", ["開放日期如下： 9/19, 10/3, 10/31, 11/7, 11/14, 11/21, 1/9 開放時間：8:30至16:30 開放期間請由圖書館大門進出"]), [lib.item.id]: lib.detail };
  const r = QA.answer("圖書館時間", [lib.item, sat], d, { asOf: "2026-11-08", schoolId: "cygsh", scopeLabel: "嘉女" });
  const t = flat(r);
  assert.match(t, /8:30至16:30/);
  assert.match(t, /9\/19、10\/3、10\/31、11\/7、11\/14、11\/21、1\/9/, "every date is told");
  assert.match(t, /今天（11\/8）之後還有：11\/14、11\/21、1\/9/, "dates still ahead are pointed out");
  assert.doesNotMatch(t, /借出圖書總數|停借/, "the borrowing rule is not the opening hours");
  /* 規章只有借書規定、沒有時間：不拿借書規定當開放時間，照實說沒有。 */
  const none = QA.answer("圖書館時間", [lib.item], { [lib.item.id]: lib.detail }, { asOf: "2026-11-08", schoolId: "cygsh", scopeLabel: "嘉女" });
  assert.doesNotMatch(flat(none), /借出圖書總數|停借/);
  /* 規章裡寫了時間：用規章的時間。 */
  const hours = rule("cysh-lib2", "cysh", "嘉中", "圖書館閱覽規定", "本校圖書館上課日開放時間，星期一至星期五，每日8:00至17:30，中午不休息。\n國立某某高級中學圖書館閱覽規定94年2月訂定，97年3月14日修訂，108年8月29日修訂。", ["圖書館", "閱覽"]);
  const h = QA.answer("圖書館時間", [hours.item], { [hours.item.id]: hours.detail }, { asOf: "2026-11-08", schoolId: "cysh", scopeLabel: "嘉中" });
  assert.match(flat(h), /8:00至17:30/);
  assert.doesNotMatch(flat(h), /94年2月訂定|修訂/, "an amendment log is never an answer or a point");
}

/* ---- 2. 「期中考成績何時能查」（9 字）：成績校對公告，不是考試要點；窄公告說出它是哪一種考試 ---- */
{
  const exam = rule("cysh-exam", "cysh", "嘉中", "學生考試要點", "二、本校舉行之期中考、期末考、複習考、模擬考、補考等各項校內考試，悉依本規則辦理之。", ["考試", "期中考"]);
  const check = notice("cysh-chk", "cysh", "嘉中", "2026-10-22", "【成績校對】115學年度第一學期第一次期中考成績校對通知");
  const d1 = { "cysh-chk": detail("cysh-chk", ["第一次期中考成績校對，請至校務行政系統查詢成績並確認是否有誤，僅針對分數校對，排名俟分數校對後再行計算。", "※ 請住宿生或家中不便使用電腦的同學，利用下課時間至班級或圖書館公用電腦查詢。", "註冊組 20261022"]), [exam.item.id]: exam.detail };
  const sys = service("cysh-sys", "cysh", "校務行政系統", ["成績", "選課結果"], "查成績、缺曠與獎懲紀錄、個人課表與選課結果");
  const r = QA.answer("期中考成績何時能查", [exam.item, check, sys], d1, { asOf: "2026-11-08", schoolId: "cysh", scopeLabel: "嘉中" });
  const t = flat(r);
  assert.match(t, /校務行政系統查詢成績/);
  assert.match(t, /不便使用電腦的同學.*公用電腦/, "the second line of the notice is told too");
  assert.doesNotMatch(t, /悉依本規則/, "the exam rule does not answer when grades can be looked up");
  assert.doesNotMatch(t, /註冊組 20261022/, "a signature line is not content");
  /* 只有一種考試的公告：先說是哪一種，期限的下一句也要有。 */
  const eng = notice("cygsh-eng", "cygsh", "嘉女", "2026-11-03", "【高三英文閱讀期中考成績查詢】高三英文閱讀期中考學生查詢成績期程");
  const d2 = { "cygsh-eng": detail("cygsh-eng", ["一、高三英文閱讀期中考學生查詢成績期程：115年11月10日(星期二)~115年11月11日(星期三)中午12時止。", "二、請同學於期程內上網查詢校對考試成績，核對成績如有錯誤，需於上述期限內找任課教師至教務處註冊組更正，請勿逾時，如逾校對期程將不受理成績更正。"]) };
  const g = QA.answer("期中考成績何時能查", [eng], d2, { asOf: "2026-11-08", schoolId: "cygsh", scopeLabel: "嘉女" });
  assert.match(flat(g), /高三英文閱讀期中考學生查詢成績期程.*11月10日.*11月11日.*中午12時止/s);
  assert.match(flat(g), /不將受理成績更正|不受理成績更正|將不受理成績更正/, "the consequence of missing the deadline is told");
}

/* ---- 3. 20–40 字：微課程後八週的選課結果；短公告整篇講完，名單不外洩，沒寫的地點照實說 ---- */
{
  const back = notice("cysh-back", "cysh", "嘉中", "2026-11-06", "📢115-1 高一微課程(後八週)選課結果");
  const front = notice("cysh-front", "cysh", "嘉中", "2026-08-13", "📢115-1 高一微課程(前八週)選課重要事項");
  const fill = notice("cysh-fill", "cysh", "嘉中", "2026-08-29", "📢115-1高一(101-107)充實補強選課結果及上課地點");
  const dBack = detail("cysh-back", ["選課結果依校網公告為主，名單如附件。", "第一次上課時間為 11/12(四)第3、4節 。", "有任何問題，請於 11/10(二)12:30前 洽教務處教學組，逾時不候。"]);
  dBack.attachments = [{ provenance: "official_attachment", parse_status: "parsed", filename: "名單.pdf", embedded_text: "班級 座號 學號 姓名 課程 101 01 510060 王〇明 體適能 101 04 510063 李〇華 木工實作 101 06 510065 陳〇安 初級韓語" }];
  const d = { "cysh-back": dBack, "cysh-front": detail("cysh-front", ["前八週選課請於 8/20 前完成，課程大綱詳見附件。"]), "cysh-fill": detail("cysh-fill", ["彈性學習因人數不足不開班，選課結果請詳見班級名單、課程名單、上課地點、校園位置圖詳見附件。"]) };
  const sys = service("cysh-sys", "cysh", "校務行政系統", ["選課結果", "成績"], "查成績、個人課表與選課結果");
  const q = "我是高一的，想問微課程後八週的選課結果出來了嗎，要去哪裡看上課地點";
  const r = QA.answer(q, [back, front, fill, sys].concat(filler("cysh", "嘉中")), d, { asOf: "2026-11-08", schoolId: "cysh", scopeLabel: "嘉中" });
  const t = flat(r);
  assert.match(t, /選課結果依校網公告為主/, "the public notice answers 出來了嗎");
  assert.match(t, /11\/12\(四\)第3、4節/);
  assert.match(t, /11\/10\(二\)12:30前.*教務處教學組/, "the last line (who to ask, by when) is not dropped");
  assert.match(t, /沒有寫地點/, "says plainly the notice gives no place");
  assert.doesNotMatch(t, /510060|王〇明|李〇華|座號/, "no roster text is quoted");
  assert.doesNotMatch(t, /前八週|充實補強|8\/20/, "後八週 is not answered with 前八週 or another kind of course");
  assert.equal((r.sources || [])[0].id, "cysh-back");
  /* 問「怎麼查我自己的選課結果」仍然給系統入口。 */
  const own = QA.answer("我的選課結果要去哪裡查", [back, front, fill, sys].concat(filler("cysh", "嘉中")), d, { asOf: "2026-11-08", schoolId: "cysh", scopeLabel: "嘉中" });
  assert.match(flat(own), /校務行政系統/);
}

/* ---- 4. 50 字以上的長篇敘述：運動賽事志工 + 志工時數能不能用在備審 ---- */
{
  const vol = notice("cygsh-vol", "cygsh", "嘉女", "2026-11-04", "【公告】「115年運動賽事學生志工招募及培訓」實施計畫");
  const award = notice("cygsh-award", "cygsh", "嘉女", "2026-11-07", "【轉知】教育部「青年志工行動競賽表揚計畫（青志獎）」");
  const old = notice("cygsh-old", "cygsh", "嘉女", "2026-08-11", "中華民國志工總會舉辦「115年度模範志願服務家庭」");
  const d = {
    "cygsh-vol": detail("cygsh-vol", ["為培養具服務熱忱的學生志願服務人員，本會特辦理115年運動賽事學生志工招募及培訓。", "活動時間、地點：", "(一)第一梯次（初階）：115年11月14日（星期六）假甲市立乙國中視聽教室。", "(二)第二梯次（初階）：115年11月15日（星期日）假丙高農圖書館1樓。", "(三)第三梯次（進階）：115年11月21日（星期六）假丁體育館。", "報名日期：即日起至115年11月9日（星期一）截止。", "報名方式：請至本會官方網站下載報名表，填寫完成經學校核章通過後，掃描傳送至信箱。"]),
    "cygsh-award": detail("cygsh-award", ["三、請鼓勵符合資格者踴躍於12月21日中午12時前至計畫網站報名。"]),
    "cygsh-old": detail("cygsh-old", ["報名至 9 月 5 日止。"]),
  };
  const q = "我是高二的，最近看到學校好像在招募運動賽事的學生志工，想說可以順便累積一些志工時數，可是不知道要怎麼報名，也不知道什麼時候要培訓，另外我也想問志工時數可不可以拿來放進申請入學的備審資料裡面用";
  assert.ok((q.match(/[一-鿿]/g) || []).length >= 50);
  const r = QA.answer(q, [vol, award, old].concat(filler("cygsh", "嘉女")), d, { asOf: "2026-11-08", schoolId: "cygsh", scopeLabel: "嘉女" });
  const t = flat(r);
  assert.match(t, /第一梯次.*11月14日.*第二梯次.*11月15日.*第三梯次.*11月21日/s, "every session is told");
  assert.match(t, /11月9日/, "the sign-up deadline is told");
  assert.match(t, /學校核章|核章/, "how to sign up is told");
  assert.doesNotMatch(t, /青志獎|12月21日|模範志願服務家庭|歷屆：/, "other notices and a false 「歷屆」 are not mixed in");
  /* 第二件事（志工時數能不能放進備審）資料沒寫：照實說，不拿別的公告湊。 */
  assert.match(t, /沒有提到|沒有找到|沒有寫/);
  /* 只問報名時間的短問法也一樣找對公告。 */
  const short = QA.answer("運動賽事志工什麼時候培訓", [vol, award, old].concat(filler("cygsh", "嘉女")), d, { asOf: "2026-11-08", schoolId: "cygsh", scopeLabel: "嘉女" });
  assert.match(flat(short), /第三梯次.*11月21日/s);
  assert.doesNotMatch(flat(short), /青志獎|歷屆/);
}

/* ---- 5. 繁星選填頁面只有連結標題：照實說，不把標題當句子 ---- */
{
  const page = { id: "cygsh-info-1", kind: "school_info", title: "註冊組 › 升學資訊 › 高三選填志願", school: "cygsh", school_name: "嘉女", url: "https://school.example/p1", category: "校園資訊", date: "", keywords: ["選填", "繁星", "申請入學"], documents: [] };
  const pd = { announcement_id: "cygsh-info-1", provenance: "official_page", parse_status: "parsed", blocks: [{ type: "paragraph", text: "【大學申請入學選填系統說明】" }, { type: "paragraph", text: "【四技申請入學選填系統說明】" }], attachments: [] };
  const r = QA.answer("繁星推薦要怎麼選填志願", [page], { "cygsh-info-1": pd }, { asOf: "2026-11-08", schoolId: "cygsh", scopeLabel: "嘉女" });
  const t = flat(r);
  if (/連結標題/.test(t)) assert.match(t, /大學申請入學選填系統說明/);
}

console.log("qa lengths tests passed");
