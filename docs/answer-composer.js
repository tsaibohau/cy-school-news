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
  var AUDIENCE = /(?:對象|資格|適用對象|參加對象|報名資格)\s*(?:[：:]|為|是)\s*([^。；;，,]{2,40})|(全校|高一|高二|高三|國一|國二|國三|新生|應屆畢業生|高中部|國中部|住宿生|全體(?:學生|同學)|[一二三]年級)(?:學生|同學)?/;
  var DENY = /不得|禁止|不准|不可|不能|嚴禁|不予|不受理/;
  var ALLOW = /(?:^|[^不])(?:得|可|可以|准予|允許|開放)(?=[一-鿿])/;
  var MUST = /應|須|必須|一律|務必|規定/;
  var PENALTY = /懲處|記(?:警告|申誡|小過|大過|過)|警告|申誡|扣(?:分|減|點)|不予計分|零分|以零分計|不計分|曠課|愛校服務|銷過|取消(?:資格|錄取|參加)|視同(?:放棄|未|曠)|不予(?:受理|核發|補)|補交|罰/;
  function grams(text) { var t = String(text).replace(/[^\u4e00-\u9fff\w]/g, ""), out = {}; for (var i = 0; i + 2 <= t.length; i++) out[t.slice(i, i + 2)] = true; return out; }
  function overlap(sentence, query) { var q = grams(query), n = 0; Object.keys(grams(sentence)).forEach(function (g) { if (q[g]) n++; }); return n; }
  function factsOf(text, extra, query) {
    var out = { deadline: "", time: "", required: "", audience: "", place: "", fee: "", allow: null, must: false, penalty: "", lead: "" };
    var rows = sentences(text), first = "";
    /* The answer sentence: the first one that is not just a label line (「申請對象：…」). */
    /* The answer sentence: the one sharing most words with the question (first on ties),
       not a bare label line (「申請對象：…」). */
    var best = -1;
    rows.forEach(function (row) {
      var s = stripConnectives(row);
      if (/^[^，。]{2,8}[：:]$/.test(s) || /^依據|函辦理|字第\d|號函/.test(s)) return;   // a heading or 「依據…函辦理」 says nothing
      var score = query ? overlap(s, query) : 0;
      /* 「多久」「幾點」「什麼時候」: a sentence with an amount of time or a date answers it. */
      if (query && /多久|幾點|幾天|幾週|什麼時候|何時|期限/.test(query) && /\d|[一二三四五六七八九十兩]+\s*(?:週|天|日|次|本|小時|分鐘|個月)/.test(s)) score += 2;
      if (query && /逾期|沒|不/.test(s) && !/逾期|沒|不|會怎樣/.test(query)) score -= 1;
      if (score > best) { best = score; first = s.replace(/[。；;]$/, ""); }
    });
    /* Facts come from comma clauses: 「1/25至1/27舉行，報名至12/10止」 holds a time and a deadline. */
    var clauses = [];
    rows.forEach(function (row) { stripConnectives(row).split(/[，,](?!\d{3})/).forEach(function (c) { if (clean(c).length >= 2) clauses.push(clean(c)); }); });
    clauses.forEach(function (row) {
      var s = stripConnectives(row), found = times(s);
      /* 「…年…月…日函」「公告日期」 date a letter, not the event. */
      if (/函|來函|發文|公告日期|發布日期|發佈日期|張貼|字第|號令/.test(s)) found = [];
      if (!out.deadline && DEADLINE.test(s) && found.length) out.deadline = found.slice(0, 2).join("–");
      else if (!out.time && found.length && !DEADLINE.test(s)) out.time = found.slice(0, 2).join(RANGE_JOIN.test(s) ? "～" : "、");
      var req = s.match(REQUIRE);
      if (!out.required && req && !/公告|本校|函|辦理/.test(req[1])) out.required = req[1].replace(/[，,]?(?:並|及|等)$/, "");
      var aud = s.match(AUDIENCE);
      if (!out.audience && aud) out.audience = clean(aud[1] || aud[2]);
      if (out.allow === null && DENY.test(s)) out.allow = false;
      else if (out.allow === null && ALLOW.test(s)) out.allow = true;
      if (MUST.test(s)) out.must = true;
    });
    rows.forEach(function (row) { var s = stripConnectives(row); if (!out.penalty && PENALTY.test(s)) out.penalty = s.replace(/[。；;]$/, ""); if (MUST.test(s)) out.must = true; if (out.allow === null && DENY.test(s)) out.allow = false; });
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
    var facts = factsOf(input.text || "", input.points, query);
    if (!facts.lead) return { text: "", bullets: [], type: type, facts: facts };
    var slots = { subject: input.subject || "這件事", source: input.source || "學校公告" };
    var head;
    if (type === "exist") head = fill(pick(T.exist.yes, seed), slots);
    else if (type === "judge") {
      /* 「可以…嗎」 is answered with 可以／不行／可以但有條件; 「一定要…嗎」 with 要／沒寫死. */
      var asksMust = /一定要|要不要|需不需要|必須|是不是都要|強制/.test(query);
      var key = facts.allow === false ? "deny" : asksMust ? (facts.must ? "must" : "unsure")
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

  return { compose: compose, consequence: consequence, actOf: actOf, factsOf: factsOf, sentenceType: sentenceType, times: times,
    stripConnectives: stripConnectives, TEMPLATES: T, PENALTY_FOUND: PENALTY_FOUND, PENALTY_NONE: PENALTY_NONE, PENALTY_LATE: PENALTY_LATE, PENALTY: PENALTY };
});
