/* 問校務回答組句：把公告、規定裡找到的句子拆成事實（時間、截止、必備、對象、可不可以、罰則），
   再依問題的句型（有無、判斷、表態、敘事）套固定模板說出來，不直接貼原文。原文留在參考資料裡。
   全部是固定規則與模板，不呼叫任何外部服務。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsAnswerComposer = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function pick(list, seed) {
    var h = 0, s = String(seed || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return list[h % list.length];
  }
  function fill(template, slots) {
    return template.replace(/\{(\w+)\}/g, function (_, key) { return slots[key] == null ? "" : slots[key]; });
  }

  /* ---------- 斷詞：時間詞、連接詞 ---------- */
  var WEEKDAY = "[一二三四五六日天]";
  var TIME_WORD = new RegExp(
    "(?:\\d{2,3}|20\\d{2})\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日(?:\\s*[（(]\\s*(?:星期|週)?" + WEEKDAY + "\\s*[)）])?" +
    "|\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日(?:\\s*[（(]\\s*(?:星期|週)?" + WEEKDAY + "\\s*[)）])?" +
    "|\\d{1,2}\\s*[\\/／]\\s*\\d{1,2}(?:\\s*[（(]\\s*" + WEEKDAY + "\\s*[)）])?" +
    "|(?:星期|週|禮拜)" + WEEKDAY +
    "|(?:上午|下午|中午|晚上|早上)?\\s*\\d{1,2}\\s*[:：]\\s*\\d{2}" +
    "|(?:上午|下午|中午|晚上|早上)\\s*\\d{1,2}\\s*(?:時|點)(?:\\s*\\d{1,2}\\s*分)?" +
    "|第\\s*[一二三四五六七八\\d]\\s*節", "g");
  var RANGE_JOIN = /\s*(?:至|到|~|～|－|-|—)\s*/;
  /* 連接詞：句首的「惟、另、並、且、如、若、又、但、即、故」只是銜接，不是內容。 */
  var CONNECTIVE = /^(?:惟|另外|另|並且|並|且|如|若|又|但是|但|即|故|因此|爰|請|敬請|煩請|務請)\s*[，,、]?\s*/;
  /* 「115年12月02日(三)下午14:30-15:30」 is one time, not a date plus half a time range. */
  var CLOCK_WORD = "(?:上午|下午|中午|晚上|早上)?\\s*\\d{1,2}\\s*[:：]\\s*\\d{2}";
  var DATE_CLOCK = new RegExp("(?:(?:\\d{2,3}|20\\d{2})\\s*年\\s*)?\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日(?:\\s*[（(]\\s*(?:星期|週)?" + WEEKDAY + "\\s*[)）])?\\s*" + CLOCK_WORD + "(?:\\s*(?:至|到|~|～|－|-|—)\\s*" + CLOCK_WORD + ")?");
  function dateClock(text) {
    var m = String(text).match(DATE_CLOCK);
    return m ? clean(m[0]).replace(/\s*[:：]\s*/g, ":").replace(/\s*[至到~～－—]\s*/g, "～").replace(/(\d)\s*-\s*(?=(?:上午|下午|中午|晚上|早上)?\d)/g, "$1～") : "";
  }
  function times(text) { return (String(text).match(TIME_WORD) || []).map(clean); }
  function stripConnectives(text) {
    var t = clean(text);
    for (var i = 0; i < 3; i++) { var next = t.replace(CONNECTIVE, ""); if (next === t) break; t = next; }
    return t.replace(/^(?:[一二三四五六七八九十]+、|[（(][一二三四五六七八九十\d]+[)）]|\d{1,2}[.、．])\s*/, "");
  }
  function sentences(text) {
    return clean(text).split(/(?<=[。！？!?；;])|\n+/).map(clean).filter(function (s) { return s.length >= 4; });
  }

  /* ---------- 事實擷取 ---------- */
  var DEADLINE = /截止|期限|[日號)）]\s*(?:以)?前|前(?:完成|報名|繳交|上傳|送交|填寫|申請|交)|受理至|報名至|收件至|至.{0,24}止|逾期/;
  var REQUIRE = /(?:應|須|需|請|要|務必|前|並)\s*(?:檢附|攜帶|備妥|準備|附上)\s*[：:]?\s*([^。；;，,]{2,40}?)(?=送|交|至|向|於|，|,|。|；|$)/;
  var AUDIENCE = /(?:對象|資格|適用對象|參加對象|報名資格)\s*(?:[：:]|為|是)\s*([^。；;，,]{2,40})|((?:高|國)[一二三](?:[、及和與]?(?:高|國)[一二三])+|全校|高一|高二|高三|國一|國二|國三|新生|應屆畢業生|高中部|國中部|住宿生|全體(?:學生|同學)|[一二三]年級)(?:學生|同學)?/;
  var DENY = /不得|禁止|不准|不可(?!攜)|不能|嚴禁|不予|不受理/;
  var ALLOW = /(?:^|[^不])(?:得|可(?!攜|能|見|是|愛|惜|謂|靠)|可以|准予|允許|開放)(?=[一-鿿])/;
  /* 「皆不得使用…經老師同意後方可使用」 is a ban with an exception, never 「可以」. */
  var STRONG_DENY = /皆不得|均不得|一律不得|不得使用|不得置於|嚴禁|禁止|不准|應關機|以關機為原則/;
  var MUST = /應|須|必須|一律|務必|規定/;
  var PENALTY = /懲處|記(?:警告|申誡|小過|大過|過)|警告|申誡|扣(?:分|減|點)|不予計分|零分|以零分計|不計分|曠課|愛校服務|銷過|取消(?:資格|錄取|參加)|視同(?:放棄|未|曠)|不予(?:受理|核發|補)|補交|罰/;
  function grams(text) { var t = String(text).replace(/[^\u4e00-\u9fff\w]/g, ""), out = {}; for (var i = 0; i + 2 <= t.length; i++) out[t.slice(i, i + 2)] = true; return out; }
  function overlap(sentence, query) { var q = grams(query), n = 0; Object.keys(grams(sentence)).forEach(function (g) { if (q[g]) n++; }); return n; }
  /* A sentence that carries a date or a labelled field says more than one that does not. */
  function informative(sentence) { return (times(sentence).length ? 1 : 0) + (/[^，。]{2,6}[：:]\S/.test(sentence) ? 1 : 0); }
  function queryWithoutTitle(query, title) {
    var tg = gramSet(title), t = String(query), keep = [];
    for (var i = 0; i < t.length; i++) {
      var inTitle = (i + 2 <= t.length && tg[compactText(t.slice(i, i + 2))]) || (i > 0 && tg[compactText(t.slice(i - 1, i + 1))]);
      if (!inTitle) keep.push(t[i]);
    }
    return keep.join("");
  }
  function factsOf(text, extra, query, title) {
    var out = { deadline: "", time: "", required: "", audience: "", place: "", fee: "", allow: null, must: false, penalty: "", lead: "" };
    var rows = sentences(text), first = "";
    /* The answer sentence: the one sharing most words with the question, not a bare label line
       (「申請對象：…」). The title is already on screen, so its words are taken out of the question,
       a sentence that mostly repeats the title is marked down, and a tie goes to the sentence with
       more to say (a date, a labelled field), not to the first one. */
    var best = -Infinity, asked = query && title ? queryWithoutTitle(query, title) : query;
    rows.forEach(function (row, at) {
      var s = stripConnectives(row);
      if (/^[^，。]{2,8}[：:]$/.test(s) || /^依據|函辦理|字第\d|號函/.test(s)) return;   // a heading or 「依據…函辦理」 says nothing
      var score = asked ? overlap(s, asked) : 0;
      /* 「多久」「幾點」「什麼時候」: a sentence with an amount of time or a date answers it. */
      if (query && /多久|幾點|幾天|幾週|什麼時候|何時|期限/.test(query) && /\d|[一二三四五六七八九十兩]+\s*(?:週|天|日|次|本|小時|分鐘|個月)/.test(s)) score += 2;
      if (query && /逾期|沒|不/.test(s) && !/逾期|沒|不|會怎樣/.test(query)) score -= 1;
      if (title) {
        var repeat = echoRatio(s, title);
        if (repeat >= 0.6) score -= 3 + Math.round(repeat * 3);
        else if (noveltyOf(s, title) >= 8) score += 0.5;
      }
      score += informative(s) * 0.4 - at * 0.001;
      if (score > best) { best = score; first = s.replace(/[。；;]$/, ""); }
    });
    /* Facts come from comma clauses: 「1/25至1/27舉行，報名至12/10止」 holds a time and a deadline. */
    var clauses = [];
    rows.forEach(function (row) { stripConnectives(row).split(/[，,](?!\d{3})/).forEach(function (c) { if (clean(c).length >= 2) clauses.push(clean(c)); }); });
    clauses.forEach(function (row) {
      var s = stripConnectives(row), found = times(s);
      /* 「…年…月…日函」「公告日期」 date a letter, not the event. */
      if (/函|來函|發文|公告日期|發布日期|發佈日期|張貼|字第|號令/.test(s)) found = [];
      var dc = found.length ? dateClock(s) : "";
      if (!out.deadline && DEADLINE.test(s) && found.length) out.deadline = dc || found.slice(0, 2).join("–");
      else if (!out.time && found.length && !DEADLINE.test(s)) out.time = dc || found.slice(0, 2).join(RANGE_JOIN.test(s) ? "～" : "、");
      var req = s.match(REQUIRE);
      if (!out.required && req && !/公告|本校|函|辦理/.test(req[1])) out.required = req[1].replace(/[，,]?(?:並|及|等)$/, "");
      var aud = s.match(AUDIENCE);
      if (!out.audience && aud) out.audience = clean(aud[1] || aud[2]);
      if (out.allow === null && DENY.test(s)) out.allow = false;
      else if (out.allow === null && ALLOW.test(s)) out.allow = true;
      if (MUST.test(s)) out.must = true;
    });
    rows.forEach(function (row) { var s = stripConnectives(row); if (!out.penalty && PENALTY.test(s)) out.penalty = s.replace(/[。；;]$/, ""); if (MUST.test(s)) out.must = true; if (out.allow === null && DENY.test(s)) out.allow = false; });
    out.strongDeny = STRONG_DENY.test(rows.join(""));
    out.lead = first || (rows[0] ? stripConnectives(rows[0]).replace(/[。；;]$/, "") : "");
    (extra || []).forEach(function (point) {
      var v = clean(point && point.value);
      if (!v) return;
      if (point.label === "截止" && !out.deadline) out.deadline = v;
      if (point.label === "時間" && !out.time) out.time = v;
      if (point.label === "地點" && !out.place) out.place = v;
      if (point.label === "對象" && !out.audience) out.audience = v;
      if (point.label === "費用" && !out.fee) out.fee = v;
    });
    return out;
  }

  /* ---------- 公告內容：欄位解析（時間、地點、對象、報名、攜帶、費用、聯絡、內容） ----------
     公告多半是「一、時間：… (二)地點：… 3.對象：…」的條列，也可能被抓成沒有換行的一整串。
     先在條列標號處斷行，再用標籤字典（qa-synonyms.js）把「標籤：值」歸到欄位；標籤沒寫的欄位，
     才用內文的固定規則（正規式）補。全部是規則，不呼叫任何外部服務。 */
  var Syn = typeof window !== "undefined" ? window.CyNewsSynonyms : null;
  if (!Syn && typeof module !== "undefined" && module.exports) { try { Syn = require("./qa-synonyms.js"); } catch (e) { Syn = null; } }
  var SLOT_NAME = { time: "活動時間", deadline: "報名或申請的期限", place: "地點", audience: "對象", signup: "報名方式", bring: "要攜帶或準備的東西", fee: "費用", contact: "聯絡方式", quota: "名額", purpose: "活動內容" };
  var LABEL_MAP = null;
  function labelMap() {
    if (LABEL_MAP) return LABEL_MAP;
    LABEL_MAP = {};
    var data = Syn && Syn.FIELD_LABELS || {};
    Object.keys(data).forEach(function (slot) { data[slot].forEach(function (label) { LABEL_MAP[label.toLowerCase()] = slot; }); });
    return LABEL_MAP;
  }
  function classifyLabel(label) {
    var key = clean(label).replace(/[（(][^）)]*[)）]/g, "").replace(/\s+/g, "").toLowerCase(), map = labelMap();
    if (map[key]) return map[key];
    var rules = Syn && Syn.LABEL_SUFFIX || [];
    for (var i = 0; i < rules.length; i++) if (rules[i][1].test(key)) return rules[i][0];
    return "";
  }
  function compactText(text) { return String(text == null ? "" : text).toLowerCase().replace(/[^0-9a-z㐀-鿿]+/g, "").replace(/臺/g, "台").replace(/佈/g, "布"); }
  /* Break flat text at list markers: 一、 （二） 3. */
  function breakLines(text) {
    return String(text == null ? "" : text).replace(/\r/g, "\n")
      .replace(/([^\n])(?=[（(][一二三四五六七八九十廿]{1,3}[)）])/g, "$1\n")
      .replace(/(^|[\s。；;：:])(?=(?:[一二三四五六七八九十廿]{1,3}[、．]|[（(]\d{1,2}[)）]|\d{1,2}[.、．](?!\d)))/g, "$1\n")
      .split(/\n+/).map(clean).filter(Boolean);
  }
  var LABEL_AT = /(^|[\s，,。；;、.．)）】\]」])([一-鿿A-Za-z\/][一-鿿A-Za-z\/\- ]{0,9}?(?:[（(][^）)]{1,8}[)）])?)\s*[：:](?!\/\/)\s*/g;
  var LIST_MARK = /^(?:[一二三四五六七八九十廿]{1,3}[、．]|[（(][一二三四五六七八九十廿\d]{1,3}[)）]|\d{1,2}[.、．)](?!\d)|[①②③④⑤⑥⑦⑧⑨⑩◎●■◆▲※•○☆★▶►])\s*/;
  var NOISE_LINE = /^(?:[.．·\s]+|第\s*\d+\s*頁.*|檔\s*號.*|裝|訂|線|正本[：:].*|副本[：:].*)$/;
  var POINTER = /^(?:詳(?:如|見|請參[閱見])|請(?:參閱|見|詳見)|如|見|依)?\s*(?:附件|附檔|附表|簡章|計畫|實施計畫|活動網站|網站|官網|公告)[^，。；]{0,12}$/;
  function cleanValue(value, slot) {
    var v = clean(value).replace(/^[：:，,、\s]+/, "");
    var limit = slot === "signup" || slot === "purpose" ? 140 : 100;
    var stop = slot === "signup" || slot === "purpose" || slot === "contact" ? 2 : 1, parts = v.split(/(?<=[。！？!?])/), out = "";
    for (var i = 0; i < parts.length && i < stop; i++) { if (out && (out + parts[i]).length > limit) break; out += parts[i]; }
    v = out || v;
    v = v.replace(/[，,、；;：:。\s]+$/, "").replace(/[（(]\s*$/, "");
    return v.length > limit ? v.slice(0, limit - 1).replace(/[，、；;：:（(]?[^，。；、]{0,12}$/, "") + "…" : v;
  }
  function parseLabelled(lines) {
    var pieces = [];
    lines.forEach(function (rawLine) {
      if (NOISE_LINE.test(rawLine)) return;
      var line = rawLine.replace(LIST_MARK, ""), hits = [], m;
      LABEL_AT.lastIndex = 0;
      while ((m = LABEL_AT.exec(line))) {
        hits.push({ at: m.index + m[1].length, vstart: LABEL_AT.lastIndex, label: m[2] });
        if (LABEL_AT.lastIndex === m.index) LABEL_AT.lastIndex++;
      }
      if (!hits.length) {
        /* A wrapped line continues an open value (「（連結網址：」 then the address). */
        var last = pieces[pieces.length - 1];
        if (last && !LIST_MARK.test(rawLine) && !/[。！？!?]$/.test(last.raw) && last.raw.length < 100) last.raw += rawLine;
        return;
      }
      hits.forEach(function (hit, i) {
        var end = i + 1 < hits.length ? hits[i + 1].at : line.length;
        pieces.push({ label: hit.label, slot: classifyLabel(hit.label), raw: line.slice(hit.vstart, end) });
      });
    });
    return pieces;
  }
  var CONTACT_PHONE = /(?:\(?0\d{1,2}\)?[-\s]?)?\d{3,4}[-\s]?\d{3,4}(?:\s*(?:分機|#|轉)\s*\d+)?|分機\s*\d+/;
  var EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  var URL_RE = /https?:\/\/[^\s，。；、）)」]+/;
  /* ROC years: 115年 → 2026. A date without a year takes the posting year (the next year when it
     falls well before the posting date). which: "first" (default) or "last" date in the text. */
  function isoOf(text, posted, which) {
    var s = String(text || ""), all = [], m;
    var re = /(\d{2,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日|(\d{1,2})\s*月\s*(\d{1,2})\s*日|(?<![\d/])(\d{1,2})\s*[\/／]\s*(\d{1,2})(?![\d/])/g;
    var base = /^\d{4}-\d{2}-\d{2}/.test(String(posted || "")) ? String(posted).slice(0, 10) : "";
    while ((m = re.exec(s))) {
      var y, mo, d;
      if (m[1]) { y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); if (y < 1911) y += 1911; }
      else {
        mo = Number(m[4] || m[6]); d = Number(m[5] || m[7]);
        if (!base) continue;
        y = Number(base.slice(0, 4));
        var cand = y + "-" + ("0" + mo).slice(-2) + "-" + ("0" + d).slice(-2);
        if (Date.parse(cand) < Date.parse(base) - 120 * 86400000) y++;
      }
      if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
      all.push(y + "-" + ("0" + mo).slice(-2) + "-" + ("0" + d).slice(-2));
    }
    return which === "last" ? all[all.length - 1] || "" : all[0] || "";
  }
  function plausible(slot, value) {
    if (!value || value.length < 2 || (/^(?:無|略|同上|如下)$/.test(value))) return false;
    if (slot === "place" && (/購買數量|個人需求|自行比價|可視|如有|不得|必須|應於|請於|^[\d\s\-－()（）]+$/.test(value) || value.length > 60)) return false;
    if (slot === "time" || slot === "deadline") return /\d/.test(value) || /星期|週[一二三四五六日]|即日起|隨時/.test(value);
    return true;
  }
  var BOILER_START = /^(?:依據|依\S{0,12}(?:函|辦理|規定)|檢送|檢附|附件|旨揭|如附|詳如|請查照|請轉知|惠請|敬請|檔\s*號|保存年限|地址|速別|受文者|發文)/;
  function gramSet(text) { var t = compactText(text), o = {}; for (var i = 0; i + 2 <= t.length; i++) o[t.slice(i, i + 2)] = true; return o; }
  /* How many characters of the text are not covered by any two-character piece of the title. */
  function noveltyOf(text, title) {
    var tg = gramSet(title), t = compactText(text), n = 0;
    for (var i = 0; i < t.length; i++) if (!(tg[t.slice(i, i + 2)] || (i > 0 && tg[t.slice(i - 1, i + 1)]))) n++;
    return n;
  }
  /* The share of a sentence's two-character pieces that the title already has (1 = a pure repeat). */
  function echoRatio(sentence, title) {
    var g = Object.keys(gramSet(sentence)), tg = gramSet(title);
    if (!g.length) return 0;
    return g.filter(function (x) { return tg[x]; }).length / g.length;
  }
  function usefulPurpose(text, title) {
    var t = clean(text).replace(/[，、]?(?:敬?請|煩請|惠請)(?:查照|鑒核|轉知|公告|周知)[^。]*$/, "").replace(/，?(?:詳如附件|詳見附件|如附件)。?$/, "");
    if (t.length < 10 || BOILER_START.test(t)) return "";
    if (noveltyOf(t, title) < 8) return "";
    return t;
  }
  var ONLINE = /線上(?:會議|辦理|進行|舉行|直播|研習|課程|方式)|(?:Google\s*Meet|Zoom|Teams|視訊會議|Webex)/i;
  var PLACE_PROSE = /(?:地點|地址|場地|場所)\s*(?:為|在|位於|是)\s*([^，。；]{2,40})|(?:於|假|在|借用)\s*([^，。；：:\s]{2,30}?(?:禮堂|教室|會議室|體育館|圖書館|活動中心|演講廳|國際會議中心|研討室|視聽室|大樓|校區|學院|大學|實驗室|中心|會場|劇院|展覽館|廳|場|館)(?:[^，。；]{0,6}?\d{1,3}\s*[廳室樓])?)/;
  var EVENT_VERB = /舉行|舉辦|辦理|召開|進行|開幕|開課|上課|比賽|考試|演講|講座|研習|營隊|活動|說明會|頒獎|決賽|初賽/;
  var SIGNUP_CUE = /報名|登記|申請|投稿|繳交|填寫/;
  var SIGNUP_HOW = /請(?:至|於|上|登入|掃描|填|逕|以|利用|自行|透過|先)|線上|網路|網址|連結|表單|QR|條碼|e-?mail|寄(?:至|送)|送(?:至|交)|交(?:至|予)|填報|https?:/i;
  var FEE_RE = /免費|免收(?:費用|報名費)?|不收費|無須(?:繳)?費|(?:報名費|費用|收費|每人|學費|註冊費|材料費|保證金)[^，。；]{0,12}?(?:新[臺台]幣)?\s*[\d,]+\s*元整?|新[臺台]幣\s*[\d,]+\s*元整?/;
  var BRING_RE = /(?:請|須|需|應|務必)?(?:自行)?(?:攜帶|自備|備妥|準備)\s*[：:]?\s*([^。；]{2,50})/;
  /* fieldsOf({ lines, attachmentLines, title, posted }) → { slots: { time: { value, src, from } … }, pointers: { slot: "詳如附件" } }
     lines: the notice's own text (strings, lines or paragraphs); attachmentLines: the attachments' text.
     src "label" = from a 「標籤：值」 field; "prose" = a fixed rule on running text. The notice's own
     text wins over the attachments. A value that only says 「詳如附件」 is kept as a pointer. */
  function fieldsOf(input) {
    input = input || {};
    var title = input.title || "", out = { slots: {}, pointers: {} };
    function put(slot, value, src, from) {
      value = cleanValue(value, slot);
      if (out.slots[slot] || !value) return;
      if (POINTER.test(value)) { if (!out.pointers[slot]) out.pointers[slot] = value; return; }
      if (!plausible(slot, value)) return;
      out.slots[slot] = { value: value, src: src, from: from };
    }
    var groups = [["notice", input.lines || []], ["attachment", input.attachmentLines || []], ["letter", input.headerLines || []]];
    groups.forEach(function (group) {
      var lines = [], onlyContact = group[0] === "letter";
      group[1].forEach(function (chunk) { breakLines(chunk).forEach(function (l) { lines.push(l); }); });
      group.push(lines);
      var contactBits = [];
      parseLabelled(lines).forEach(function (p) {
        if (!p.slot || (onlyContact && p.slot !== "contact")) return;
        /* 主旨 is the fallback for the purpose: 活動內容／目的／主題 say more. */
        if (p.slot === "purpose" && /^主旨$/.test(clean(p.label))) { if (!out.topic) out.topic = p.raw; return; }
        if (p.slot === "contact") {
          /* A person's name is not repeated; the office, phone and mailbox are. */
          var phone = (p.raw.match(CONTACT_PHONE) || [""])[0], mail = (p.raw.match(EMAIL) || [""])[0];
          if (/電話|分機|洽詢|專線/.test(p.label) && phone) contactBits.push("電話 " + clean(phone));
          else if (/信箱|郵件|mail/i.test(p.label) && mail) contactBits.push(mail);
          else if (/承辦單位|聯絡方式|聯絡窗口|聯繫窗口|聯絡資訊/.test(p.label) && !/^[一-鿿]{2,4}$/.test(clean(p.raw))) contactBits.push(cleanValue(p.raw, "contact"));
          return;
        }
        put(p.slot, p.raw, "label", group[0]);
      });
      if (contactBits.length && !out.slots.contact) {
        var seen = {};
        out.slots.contact = { value: contactBits.filter(function (b) { var k = compactText(b); if (!k || seen[k]) return false; seen[k] = true; return true; }).slice(0, 3).join("；"), src: "label", from: group[0] };
      }
    });
    /* Running text: the slots the labels did not give. */
    groups.forEach(function (group) {
      var lines = group[2];
      if (!lines.length || group[0] === "letter") return;
      var text = lines.join("\n"), facts = factsOf(text);
      if (!out.slots.time && facts.time) put("time", facts.time, "prose", group[0]);
      if (!out.slots.deadline && facts.deadline) put("deadline", facts.deadline, "prose", group[0]);
      if (!out.slots.audience && facts.audience) put("audience", facts.audience, "prose", group[0]);
      if (!out.slots.bring && facts.required) put("bring", facts.required, "prose", group[0]);
      sentences(text).forEach(function (row) {
        var s = stripConnectives(row);
        if (/^依據|函辦理|字第\d|號函/.test(s) && !/報名|地點/.test(s)) return;
        if (!out.slots.audience) { var inv = s.match(/敬邀(?:貴校)?([^，。；]{2,16}?)(?:報名|參加|踴躍|參與|蒞臨)/); if (inv) put("audience", inv[1], "prose", group[0]); }
        if (!out.slots.place) {
          var pm = s.match(PLACE_PROSE);
          if (pm && (EVENT_VERB.test(s) || times(s).length)) put("place", clean(pm[1] || pm[2]), "prose", group[0]);
          else if (ONLINE.test(s) && EVENT_VERB.test(s)) {
            var link = (s.match(URL_RE) || [""])[0];
            put("place", "線上" + (/Google\s*Meet/i.test(s) ? "（Google Meet）" : /Zoom/i.test(s) ? "（Zoom）" : "") + (link ? " " + link : ""), "prose", group[0]);
          }
        }
        if (!out.slots.quota) { var qt = quotaOf(s); if (qt) put("quota", qt, "prose", group[0]); }
        if (!out.slots.signup && SIGNUP_CUE.test(s) && SIGNUP_HOW.test(s) && !/錄取|名單|公告結果|成績/.test(s)) put("signup", s, "prose", group[0]);
        if (!out.slots.fee && !/獎金|獎勵|獎品|獎額|補助|經費由/.test(s)) {
          var fm = s.match(FEE_RE);
          if (fm) put("fee", /^(?:免費|免收|不收費|無須)/.test(fm[0]) ? fm[0] : fm[0].replace(/^(?:報名費|費用|收費)[^\d新]*/, "報名費 "), "prose", group[0]);
        }
        if (!out.slots.bring) { var bm = s.match(BRING_RE); if (bm && !/公告|本校|函|辦理/.test(bm[1])) put("bring", bm[1], "prose", group[0]); }
        if (!out.slots.contact) {
          var cm = s.match(/(?:洽詢|聯絡|聯繫|詢問|諮詢)[^。；]{0,16}?(?:電話)?\s*[：:]?\s*((?:\(?0\d{1,2}\)?[-\s]?)?\d{3,4}[-\s]?\d{3,4}(?:\s*(?:分機|#|轉)\s*\d+)?)/);
          if (cm) put("contact", "電話 " + clean(cm[1]), "prose", group[0]);
        }
      });
    });
    /* A signup sentence with a date before 前／止 also gives the deadline; keep its link. */
    if (!out.slots.deadline && out.slots.signup) { var df = factsOf(out.slots.signup.value).deadline; if (df) put("deadline", df, "prose", out.slots.signup.from); }
    if (out.slots.signup) { var url = (out.slots.signup.value.match(URL_RE) || [""])[0]; if (url) out.slots.signup.url = url; }
    /* The purpose: a labelled field or 主旨 that adds to the title, else the best sentence that does. */
    var labelled = out.slots.purpose && usefulPurpose(out.slots.purpose.value, title);
    if (!labelled && out.topic) labelled = usefulPurpose(cleanValue(out.topic, "purpose"), title);
    delete out.slots.purpose;
    delete out.topic;
    if (labelled) out.slots.purpose = { value: labelled, src: "label", from: "notice" };
    else {
      var best = "", bestScore = 0;
      groups.forEach(function (group) {
        if (group[0] === "letter") return;
        group[2].forEach(function (line) {
          var t = clean(line).replace(LIST_MARK, "").replace(/^(?:主旨|說明|活動內容|辦理目的)\s*[：:]\s*/, "");
          sentences(t).map(stripConnectives).forEach(function (c) {
            var u = usefulPurpose(c, title);
            if (!u || u.length > 120) return;
            var sc = Math.min(40, noveltyOf(u, title)) + (/旨在|目的|透過|藉由|希望|為了|培養|提升|推廣|探討|介紹|體驗|邀請|招生|徵(?:件|稿|選)|競賽|研習|講座|營/.test(u) ? 12 : 0) - (/報名|截止|地址|電話|承辦|依據|函/.test(u) ? 10 : 0);
            if (sc > bestScore) { bestScore = sc; best = u; }
          });
        });
      });
      if (best) out.slots.purpose = { value: cleanValue(best.replace(/[。！？]$/, ""), "purpose"), src: "prose", from: "notice" };
    }
    return out;
  }

  /* 「名額為16人，未達16人將取消甄選」→ 名額與成行條件. */
  function quotaOf(sentence) {
    var s = clean(sentence), bits = [];
    var n = s.match(/(?:名額|員額|限額|人數上限|可提報[^，。；\d]{0,8}名額)[^，。；\d]{0,8}?(\d+)\s*(?:人|名|位|組|隊)/) || s.match(/(?:限|至多|最多|招收|錄取|額滿為止[，,]?共)\s*(\d+)\s*(?:人|名|位)/);
    if (n) bits.push(n[1] + " 人");
    var c = s.match(/(未達|不足|少於|未滿)\s*(\d+)\s*(?:人|名|位)[^，。；]*?[，,]\s*(?:則|將|即|得)?\s*([^，。；]{0,10}?取消[^，。；]{0,8}|不[^，。；]{0,8}(?:辦理|開班|開課|舉行))/);
    if (c && (n || /報名|甄選|開班|名額/.test(s))) bits.push(c[1] + " " + c[2] + " 人將" + c[3].replace(/^(?:將|則)?(?:公告|予以)?/, ""));
    return bits.join("；");
  }
  /* 問題 → 想問的欄位（字典在 qa-synonyms.js 的 QUESTION_SLOTS）。 */
  function askedSlot(query) {
    var q = clean(query), rules = Syn && Syn.QUESTION_SLOTS || [];
    for (var i = 0; i < rules.length; i++) if (rules[i][1].test(q)) return rules[i][0];
    return "";
  }
  var GENERIC_ASK = /請問|我想知道|想知道|想問|可以告訴我|告訴我|幫我|關於|一下|有關|這個|那個|這則|那則|公告|消息|資訊|資料|詳細|詳情|說明|是什麼|是啥|什麼|有嗎|有沒有|有無|嗎|呢|啊|吧|喔|的|了|是|研習|活動|比賽|競賽|營隊|營|講座|課程|工作坊|說明會|徵件|簡章|招生|報名|辦理|舉辦|最近|最新|目前|今年|本次|有|在/g;
  /* What is left of a question after the words the notice's title already has, and the filler. */
  function queryRemainder(query, title) {
    var q = compactText(query), tg = gramSet(title), covered = {};
    for (var i = 0; i + 2 <= q.length; i++) if (tg[q.slice(i, i + 2)]) { covered[i] = true; covered[i + 1] = true; }
    var kept = "";
    for (var j = 0; j < q.length; j++) if (!covered[j]) kept += q[j];
    return kept.replace(GENERIC_ASK, "");
  }
  /* 「X是什麼」「介紹X」or just the name of the event: no particular field is asked. */
  function isGeneralAsk(query, title) {
    var slot = askedSlot(query);
    if (slot && slot !== "summary") return false;
    return queryRemainder(query, title).length <= 1;
  }

  var SLOT_LEAD = {
    time: ["時間是{v}", "日期和時間是{v}", "排在{v}"],
    deadline: ["期限是{v}", "要在{v}之前完成", "截止時間是{v}"],
    place: ["地點在{v}", "會在{v}進行", "地點是{v}"],
    audience: ["對象是{v}", "參加資格是{v}", "針對的是{v}"],
    signup: ["報名方式：{v}", "要這樣報名：{v}", "報名請看：{v}"],
    bring: ["要準備{v}", "記得帶{v}", "需要的東西是{v}"],
    fee: ["費用：{v}", "收費方面：{v}", "費用部分：{v}"],
    contact: ["聯絡方式：{v}", "可以這樣聯絡：{v}", "洽詢請用：{v}"],
    quota: ["名額：{v}", "名額方面：{v}", "人數限制：{v}"]
  };
  /* 1–2 sentences about what the notice is: its purpose, then the date, place and who it is for. */
  function summaryOf(fields) {
    var s = fields && fields.slots || {}, parts = [], facts = [];
    if (s.purpose) parts.push(s.purpose.value.replace(/[。！？]$/, ""));
    if (s.time) facts.push("時間：" + s.time.value);
    if (s.place) facts.push("地點：" + s.place.value);
    if (s.audience) facts.push("對象：" + s.audience.value);
    if (s.deadline && facts.length < 3) facts.push((s.time ? "報名期限：" : "期限：") + s.deadline.value);
    if (!facts.length && s.signup) facts.push("報名：" + s.signup.value);
    if (facts.length) parts.push(facts.slice(0, 3).join("；"));
    return parts.length ? parts.join("。").replace(/[。；]$/, "") + "。" : "";
  }
  /* The answer for one asked slot, or the statement that the notice does not give it. */
  function slotAnswer(slot, fields, seed) {
    var s = fields && fields.slots || {}, pointers = fields && fields.pointers || {};
    if (slot === "summary") { var sm = summaryOf(fields); return sm ? { found: true, slot: slot, value: sm, text: sm } : { found: false, slot: slot, text: "" }; }
    var hit = s[slot];
    if (hit) {
      var lead = pick(SLOT_LEAD[slot] || ["{v}"], (seed || "") + slot).replace("{v}", hit.value);
      return { found: true, slot: slot, value: hit.value, from: hit.from, url: hit.url || "", text: lead.replace(/[。；]$/, "") + "。" };
    }
    var name = SLOT_NAME[slot] || "這項資訊";
    var where = pointers[slot] ? "公告只寫「" + pointers[slot] + "」，細節在附件或原公告裡" : "細節請看附件或公告原文";
    return { found: false, slot: slot, pointer: pointers[slot] || "", text: "這則公告內文沒有寫明" + name + "，" + where + "；也可以洽詢承辦處室確認。" };
  }
  /* The other facts worth showing beside the answer (not the asked one). */
  function otherFacts(fields, skip) {
    var s = fields && fields.slots || {}, names = { time: "時間", deadline: "報名期限", place: "地點", quota: "名額", audience: "對象", signup: "報名方式", fee: "費用", bring: "攜帶", contact: "聯絡" };
    return ["time", "deadline", "place", "quota", "audience", "signup", "fee", "bring", "contact"].filter(function (k) { return k !== skip && s[k]; })
      .map(function (k) { return { slot: k, label: names[k], value: s[k].value }; });
  }

  /* ---------- 問題的句型 ---------- */
  function sentenceType(query) {
    var q = clean(query);
    /* 「可以借多久」「幾點」「什麼時候」 ask for information, not yes or no. */
    if (/多久|幾點|幾天|幾次|幾本|多少|什麼時候|何時|哪天|哪裡|在哪|怎麼|如何|哪些|是什麼/.test(q)) return "narrate";
    if (/有沒有|有無|有.{0,12}嗎|是否有|還有.{0,8}嗎/.test(q)) return "exist";
    if (/建議|值不值得|要不要(?:報名|參加|去)|該不該|推薦|好不好/.test(q)) return "stance";
    if (/可以|可不可以|能不能|能否|准不准|一定要|要不要|需不需要|是不是|是否|嗎$|嗎[？?]/.test(q)) return "judge";
    return "narrate";
  }

  /* ---------- 模板（每種句型至少三個）。開頭句只說結論和出處，事實列在下面的重點裡。
     補充句的空格：{time} 時間、{deadline} 截止、{required} 報名必備、{audience} 針對對象。 ---------- */
  var T = {
    exist: {
      yes: ["有。{source}有寫到：", "有的，{source}裡查得到：", "查到了，在{source}："],
      no: ["目前沒有查到{subject}的消息。", "沒有，規定、行事曆和公告裡都沒看到{subject}。", "暫時沒有，{subject}還沒出現在學校的公告裡。"]
    },
    judge: {
      allow: ["可以。{source}這樣寫：", "行，{source}是允許的：", "答案是可以的，依{source}："],
      deny: ["不行。{source}寫明：", "不可以喔，{source}寫得很清楚：", "這個不行，依{source}："],
      allowIf: ["可以，但有條件，依{source}：", "可以，只是要照規矩來，{source}這樣寫：", "行，不過{source}有但書："],
      must: ["要。{source}規定：", "需要，依{source}：", "是必須的，{source}寫明："],
      unsure: ["{source}沒有直接說可不可以，相關的寫法是：", "規定沒寫死，{source}提到的是：", "沒有明講，最接近的是{source}這幾點："]
    },
    stance: ["我的建議：{advice}。{source}這樣寫：", "如果是我會{advice}，依{source}：", "{advice}比較保險，{source}寫到："],
    narrate: ["{source}是這樣寫的：", "照{source}，重點如下：", "{source}裡寫到："],
    deadline: ["{deadline}截止", "最晚{deadline}前要完成", "期限是{deadline}"],
    time: ["時間在{time}", "{time}舉行", "日期是{time}"],
    clock: ["時間是{time}", "在{time}這段時間", "從{time}"],
    required: ["要準備{required}", "記得帶{required}", "需要附上{required}"],
    audience: ["對象是{audience}", "限{audience}參加", "適用於{audience}"]
  };
  function extrasLine(facts, seed) {
    var parts = [];
    if (facts.time) parts.push(fill(pick(/[:：]|節/.test(facts.time) && !/月|\//.test(facts.time) ? T.clock : T.time, seed + "t"), facts));
    if (facts.deadline) parts.push(fill(pick(T.deadline, seed + "d"), facts));
    if (facts.required) parts.push(fill(pick(T.required, seed + "r"), facts));
    if (facts.audience) parts.push(fill(pick(T.audience, seed + "a"), facts));
    return parts.length ? parts.join("，") + "。" : "";
  }
  /* 「借閱期限：借期二週」→「借期二週」; numbering and connectives go, the wording stays. */
  function tidy(sentence) {
    var t = stripConnectives(sentence).replace(/^[^，。：:]{2,8}[：:]\s*(?=.{4,})/, "");
    return t.replace(/[。；;]$/, "") + "。";
  }
  /* compose({ query, subject, source, text, points }) → { text, bullets, type, facts }.
     text: the verdict and where it comes from, with the slots that were found (time, deadline,
     what to bring, who it is for); bullets: the facts themselves, tidied. */
  function compose(input) {
    var query = clean(input.query), seed = query, type = input.type || sentenceType(query);
    var facts = factsOf(input.text || "", input.points, query, input.title || "");
    if (!facts.lead) return { text: "", bullets: [], type: type, facts: facts };
    var slots = { subject: input.subject || "這件事", source: input.source || "學校公告" };
    var head;
    if (type === "exist") head = fill(pick(T.exist.yes, seed), slots);
    else if (type === "judge") {
      /* 「可以…嗎」 is answered with 可以／不行／可以但有條件; 「一定要…嗎」 with 要／沒寫死. */
      var asksMust = /一定要|要不要|需不需要|必須|是不是都要|強制/.test(query);
      /* 「皆不得使用…應關機」 is a ban even when the same text also says the teacher may allow an exception; bringing it is another matter. */
      var banned = facts.allow === false || (facts.strongDeny && !/帶/.test(query));
      var key = banned ? "deny" : asksMust ? (facts.must ? "must" : "unsure")
        : facts.must ? "allowIf" : facts.allow === true ? "allow" : "unsure";
      head = fill(pick(T.judge[key], seed), slots);
    } else if (type === "stance") {
      slots.advice = facts.deadline ? "早點在" + facts.deadline + "前處理" : facts.must ? "照規定來" : "先看過原文再決定";
      head = fill(pick(T.stance, seed), slots);
    } else head = fill(pick(T.narrate, seed), slots);
    var extras = extrasLine(facts, seed);
    var bullets = [tidy(facts.lead)];
    if (facts.place) bullets.push("地點：" + facts.place);
    if (facts.fee) bullets.push("費用：" + facts.fee);
    /* Verdict first, then the slots: 「查到了，在X。12/10截止，對象是高一高二。」 */
    var text = extras ? head.replace(/[：:]$/, "。") + extras : head;
    return { text: text.replace(/。。/g, "。"), bullets: bullets, type: type, facts: facts, extras: extras };
  }

  /* ---------- 「不做會怎樣」：先找罰則，沒有就虧一下 ---------- */
  var PENALTY_FOUND = [
    "有罰則喔：{penalty}（{source}）。乖乖做比較划算。",
    "會，{source}寫到：{penalty}。別賭了。",
    "不做的代價在{source}裡寫得很清楚：{penalty}。"
  ];
  var PENALTY_NONE = [
    "規定裡沒寫罰則，但與其研究不{act}會怎樣，不如把這時間拿去{act}，多{act}一點又不會少塊肉😏",
    "我翻遍了沒看到罰則。不過老師的記憶力通常比規定好，建議還是乖乖{act}。",
    "沒{act}會怎樣？目前查不到罰則，但「沒{act}」本身就是最大的損失。快去{act}，{act}完你就不用問我了🙃",
    "罰則沒查到。給你一個免費建議：問這題的時間，已經夠你{act}一半了✍️"
  ];
  var PENALTY_LATE = [
    "遲到的罰則沒查到，但鬧鐘多設一個比問我有用⏰",
    "規定裡沒寫遲到會怎樣，不過導師的點名簿會記得。早五分鐘出門就解決了。",
    "查不到遲到的罰則。建議你把問這題的時間拿去睡覺，明天比較起得來😴"
  ];
  /* 「沒請假會怎樣」→ 請假；「不交會怎樣」→ 交；沒寫明動作時用「做」。 */
  function actOf(clause) {
    var m = clean(clause).match(/(?:沒有|沒|不|未|遲)([\u4e00-\u9fff]{1,3}?)(?:的話)?(?:會|要|怎|，|$)/);
    return m && !/會|要|怎/.test(m[1]) ? m[1] : "做";
  }
  function consequence(input) {
    var facts = factsOf(input.text || "");
    var slots = { penalty: facts.penalty, source: input.source || "學校規定", subject: input.subject || "", act: actOf(input.query) };
    if (facts.penalty) return { found: true, text: fill(pick(PENALTY_FOUND, input.query), slots) };
    if (/遲到|晚到|睡過頭/.test(input.query || "")) return { found: false, text: pick(PENALTY_LATE, input.query) };
    return { found: false, text: fill(pick(PENALTY_NONE, input.query), slots) };
  }

  return { fieldsOf: fieldsOf, askedSlot: askedSlot, isGeneralAsk: isGeneralAsk, queryRemainder: queryRemainder, slotAnswer: slotAnswer, summaryOf: summaryOf, otherFacts: otherFacts,
    isoOf: isoOf, noveltyOf: noveltyOf, echoRatio: echoRatio, breakLines: breakLines, classifyLabel: classifyLabel,
    compose: compose, consequence: consequence, actOf: actOf, factsOf: factsOf, sentenceType: sentenceType, times: times,
    stripConnectives: stripConnectives, TEMPLATES: T, PENALTY_FOUND: PENALTY_FOUND, PENALTY_NONE: PENALTY_NONE, PENALTY_LATE: PENALTY_LATE, PENALTY: PENALTY };
});
