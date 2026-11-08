"use strict";
/* 問校務：複查（全部是虛構資料）。
   本學年度的公告不因發布年份而被說成過時、擷取不切斷電子郵件、兩件事的小標題寫出實際主題、
   規章裡「逾時」「遲到」折行與空白的整理、被切在括號中間的句子不當答案、圖示符號不外洩、
   「(不含…遲到)」不算談到遲到、「忘記帶」不用服裝表格湊數。 */
const assert = require("node:assert/strict");
const QA = require("../docs/assistant-qa.js");
const Composer = require("../docs/answer-composer.js");

const flat = (r) => {
  const rep = r.reply || {};
  return [rep.text].concat(rep.bullets || [], rep.tail || "", (rep.paragraphs || []).map((p) => [p.heading, p.text].concat(p.bullets || [], p.asides || [], [p.source]).join("\n"))).join("\n");
};
const notice = (id, school, name, date, title) => ({ id, school, school_name: name, date, title, category: "公告" });
const detail = (id, lines) => ({ announcement_id: id, parse_status: "parsed", provenance: "official_article", source_hash: "h" + id, attachments: [], blocks: lines.map((text) => ({ type: "paragraph", text, links: [] })) });
const rule = (id, school, name, title, text, keywords) => ({
  item: { id, kind: "school_handbook", title, school, school_name: name, url: "https://school.example/" + id, category: "校園資訊", date: "2026-09-01", page_range: [1, 2], keywords },
  detail: { announcement_id: id, provenance: "official_article", source_hash: "h" + id, blocks: [], attachments: [{ provenance: "official_attachment", parse_status: "parsed", filename: "手冊.pdf", embedded_text: text }] },
});
const pool = "山水風雲花草鳥魚星月日光石林海河橋路門窗書筆墨紙琴棋畫茶酒米麵糖鹽油燈火鐵銅金銀玉珠貝竹松梅蘭菊荷柳桃李杏梨棗瓜豆麥稻".split("");
const filler = (school, name) => Array.from({ length: 230 }, (_, i) => ({ id: school + "-f" + i, school, school_name: name, date: "2026-10-01",
  title: "公告" + pool[i % 60] + pool[(i * 7 + 3) % 60] + pool[(i * 11 + 5) % 60] + pool[(i * 13 + 1) % 60] + "通知" }));
const OPT = { asOf: "2026-11-08", schoolId: "xs", scopeLabel: "某校" };

/* ---- 1. cutText：不切斷電子郵件與網址，盡量停在子句邊界 ---- */
{
  const mail = "請將報名表掃描後傳送至 volunteer0123@example.org.tw，經承辦人審視完整後回信，始完成報名。";
  const cut = Composer.cutText(mail, 28);
  assert.match(cut, /volunteer0123@example\.org\.tw/, "the address is kept whole");
  assert.doesNotMatch(cut, /volunteer0…/);
  const link = "詳情請至 https://example.org/path/to/form?id=12345 填寫表單並於期限前送出，逾期不受理。";
  assert.match(Composer.cutText(link, 24), /https:\/\/example\.org\/path\/to\/form\?id=12345/);
  assert.equal(Composer.cutText("短句不需要裁切。", 40), "短句不需要裁切。");
}

/* ---- 2. 標題寫本學年度（115）的公告，不因 2025 年發布而被說成「現在的做法可能已改變」 ---- */
{
  const cur = notice("xs-cur", "xs", "某校", "2025-03-27", "115學年度大學繁星推薦校內比序辦法");
  const old = notice("xs-old", "xs", "某校", "2025-03-27", "113學年度大學繁星推薦校內比序辦法");
  const dc = detail("xs-cur", ["校內比序依學業成績總平均排名百分比、其次依語文成績，由校內會議決議後公告。"]);
  const dold = detail("xs-old", ["校內比序依學業成績總平均排名百分比、其次依語文成績，由校內會議決議後公告。"]);
  const a = QA.answer("繁星推薦校內比序要看什麼", [cur].concat(filler("xs", "某校")), { "xs-cur": dc }, OPT);
  assert.equal(a.status, "answered");
  assert.doesNotMatch(flat(a), /公告，現在的做法可能已經改變|2025 年的公告/, "a notice for this school year is not stale");
  const b = QA.answer("113學年度繁星推薦校內比序要看什麼", [old].concat(filler("xs", "某校")), { "xs-old": dold }, OPT);
  assert.match(flat(b), /113 學年度的公告.*可能已經改變|2025 年的公告/, "a notice titled for an earlier year is still flagged");
}

/* ---- 3. 兩件事的小標題寫出實際主題（不只是共用的「志工」）；簽名電子郵件完整 ---- */
{
  const vol = notice("xs-vol", "xs", "某校", "2026-11-04", "【公告】「115年運動賽事學生志工招募及培訓」實施計畫");
  const d = {
    "xs-vol": detail("xs-vol", [
      "為培養學生志願服務精神，辦理115年運動賽事學生志工招募及培訓。",
      "報名方式：請至本會官方網站下載報名表及附件，填寫完成經學校核章通過後，將附件1報名表、附件2家長同意書及個人資料使用授權書、大頭照電子檔掃描傳送至 volunteer0123@example.org.tw，經本會審視報名文件完整無誤後回信，始完成報名。",
      "培訓時間：115年11月14日（星期六）上午9時，地點在甲市活動中心。",
      "報名期限：即日起至115年11月9日（星期一）截止。",
    ]),
  };
  const q = "我是高二的，最近看到學校在招募運動賽事的學生志工，可是不知道要怎麼報名，也不知道什麼時候要培訓，另外我也想問志工時數可不可以拿來放進申請入學的備審資料裡面用";
  const r = QA.answer(q, [vol].concat(filler("xs", "某校")), d, OPT);
  const t = flat(r);
  assert.match(t, /volunteer0123@example\.org\.tw/, "the sign-up address is whole");
  assert.doesNotMatch(t, /volunteer0…/);
  const heads = ((r.reply || {}).paragraphs || []).map((p) => p.heading);
  assert.ok(heads.length >= 2, "two questions, two paragraphs");
  assert.ok(heads.some((h) => /運動賽事/.test(h)), "the heading names the topic: " + heads.join("｜"));
  assert.ok(heads.every((h) => h !== "志工"), "not only the shared word");
  /* 「放進」「拿來」是口語動詞，不是資料裡該有的詞。 */
  assert.doesNotMatch(t, /沒有提到[^。]*「放進」|「拿來」/);
  /* 單問報名：答案已經講了報名方式，不再補一句「沒有直接寫」。 */
  const one = QA.answer("我想當運動賽事志工，怎麼報名", [vol].concat(filler("xs", "某校")), d, OPT);
  assert.match(flat(one), /volunteer0123@example\.org\.tw/);
  assert.doesNotMatch(flat(one), /沒有直接寫/);
}

/* ---- 4. 規章折行：「遲到」在作息規定裡，不被當成順帶提到；空白與折行整理乾淨 ---- */
{
  const sched = rule("xs-sched", "xs", "某校", "學生規定 › 在校作息時間相關規定",
    "某校在校作息時間相關規定\n一、 學生每日七時三十分前到校，進入教室後即開始早自習。 \n二、 上課鐘響應即刻到上課地點 ， 不得室外喧鬧 ， 無故逾時5 分鐘任課老師登\n記遲到；無故逾時10 分鐘，以曠課論。若因公務遲、未到，請向負責單\n位師長申請證明以利註銷。 \n三、 午休應立即進入教室，不得喧鬧或在外逗留、走動。 \n",
    ["作息", "遲到", "曠課"]);
  const r = QA.answer("遲到了怎麼辦", [sched.item].concat(filler("xs", "某校")), { [sched.item.id]: sched.detail }, OPT);
  const t = flat(r);
  assert.equal(r.status, "answered");
  assert.match(t, /逾時5分鐘任課老師登記遲到/, "the wrapped line is joined and the unit sticks to its number");
  assert.match(t, /逾時10分鐘，以曠課論/);
  assert.match(t, /負責單位師長申請證明/, "a line wrapped inside a word is not cut there");
  assert.doesNotMatch(t, / ，|， 不得|順帶提到/, "no blanks around punctuation, not called incidental");
  assert.doesNotMatch(t, /^學生規定 ›/m, "the answer does not lead with the chapter title");
}

/* ---- 5. 「(不含…遲到)」不算談到遲到；忘記帶運動服不拿服裝表格湊數 ---- */
{
  const sched = rule("xs-sched", "xs", "某校", "學生規定 › 在校作息時間相關規定",
    "某校在校作息時間相關規定\n一、 上課鐘響後逾時5分鐘由任課老師登記遲到；逾時10分鐘，以曠課論。 \n", ["作息", "遲到"]);
  const pen = rule("xs-pen", "xs", "某校", "學生規定 › 學生獎懲規定",
    "第十條 有下列事蹟之一者記警告：\n一、無正當理由，未依時完成愛校服務，經勸導仍未改正，情節輕微者 (不含服儀違規、學習\n或非學習節數活動出缺席、遲到)。 \n", ["獎懲", "警告"]);
  const r = QA.answer("遲到會怎樣", [sched.item, pen.item].concat(filler("xs", "某校")), { [sched.item.id]: sched.detail, [pen.item.id]: pen.detail }, OPT);
  assert.doesNotMatch(flat(r), /愛校服務/, "an exclusion clause is not a rule about 遲到");
  const dress = rule("xs-dress", "xs", "某校", "學生規定 › 服儀規定",
    "某校服儀規定摘錄\n壹、 本校學生服裝儀容穿著說明摘錄如下，供選購服裝時參考。 \n短袖白色制服上衣 必備 須繡學號\n黑色長褲 必備\n白色短袖運動衫 必備 滾邊兩款\n運動外套 視個人需求\n三、長袖運動服外套：\n繡白色，繡於外套右前方 \n進出校門時一律穿著制服或體育服。\n", ["服儀", "運動服", "制服"]);
  const f = QA.answer("運動服忘記帶會怎樣", [dress.item].concat(filler("xs", "某校")), { [dress.item.id]: dress.detail }, OPT);
  assert.doesNotMatch(flat(f), /繡白色|繡於外套|必備|備註/, "a table row is never the answer to 忘記帶");
}

/* ---- 6. 圖示符號與裝飾星號不外洩 ---- */
{
  const page = { id: "xs-info-1", kind: "school_info", title: "學務處 › 新生始業輔導", school: "xs", school_name: "某校", url: "https://school.example/p1", category: "校園資訊", date: "", keywords: ["新生", "住宿", "始業輔導"] };
  const pd = { announcement_id: "xs-info-1", provenance: "official_page", parse_status: "parsed", blocks: [
    { type: "paragraph", text: "新生住宿生可於 8/23（日）下午 16:00 起由學校大門進入，並請沿校內動線前往宿舍辦理入住。" },
    { type: "paragraph", text: "★ 新生始業輔導 進出入校門指示 ★ 新生始業輔導 請假表單 🔔" } ] };
  const r = QA.answer("新生住宿生什麼時候入住", [page].concat(filler("xs", "某校")), { "xs-info-1": pd }, OPT);
  assert.doesNotMatch(flat(r), /[🔔★]/u, "icon glyphs are not shown");
}

console.log("qa recheck tests passed");
