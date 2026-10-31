/* Deterministic, evidence-first school information question answering. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsAssistantQA = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var SearchQuery = typeof window !== "undefined" ? window.CyNewsSearchQuery : null;
  if (!SearchQuery && typeof module !== "undefined" && module.exports) SearchQuery = require("./search-query.js");
  var Validity = typeof window !== "undefined" ? window.CyNewsAnnouncementValidity : null;
  if (!Validity && typeof module !== "undefined" && module.exports) Validity = require("./announcement-validity.js");

  var INTENTS = {
    date: ["何時", "什麼時候", "日期", "截止", "幾點", "時間", "多久", "哪天", "哪一天", "哪幾天", "幾號", "幾月"],
    place: ["哪裡", "地點", "在哪", "會場", "教室", "去哪", "哪上"],
    method: ["怎麼", "如何", "辦法", "流程", "報名", "申請", "要帶", "繳交", "送交", "交到"],
    person: ["誰", "對象", "資格", "哪些人", "學生", "年級"],
    status: ["現在", "目前", "已經", "還有", "最新", "公告了嗎"],
    yesno: ["是否", "有沒有", "需不需要", "需要", "可以嗎", "能不能", "會不會", "一定要", "強制", "嗎"],
  };
  var STOP = ["請問", "我想知道", "想知道", "可以幫我", "幫我", "有沒有", "是否", "可以", "目前", "學校", "公告", "相關", "一下", "嗎", "呢", "啊", "的", "了", "是"];
  var GENERIC = ["有什麼", "什麼", "哪些", "最近", "目前", "相關", "規定", "辦法", "如何", "怎麼", "何時", "時間", "日期", "截止", "活動", "資訊", "資料", "請問", "快", "或"];
  var PERSONAL_DATA_QUERY = /名單|姓名|學號|座號|身分證|電話|地址|成績|獎懲|缺曠|請假紀錄|健康檢查結果|病歷|診斷|低收入|補助名冊|誰錄取|誰得獎/;
  /* Asking when or how to check grades is a schedule question, not a request for records. */
  var PROCEDURE_QUESTION = /規定|辦法|要點|規範|準則|標準表|要注意|注意事項|重點|什麼時候|何時|哪天|哪一天|期程|時間|日期|怎麼查|如何查|在哪查|哪裡查|怎麼申請|如何申請|校對/;
  var RECORD_ONLY = /名單|姓名|學號|座號|身分證|電話|地址|病歷|診斷|誰錄取|誰得獎/;
  var EXAM_RESULTS = /(?:期中考|期末考|段考|模擬考|複習考|補考|重修|重補修|學期|學測|統測|分科|英檢|會考|英聽|競賽|比賽)(?:的)?成績/;
  var PERSON_TARGET = /我的|他的|她的|同學的|[\u4e00-\u9fff]{2,3}的成績|幾分|多少分|排名|名次/;
  /* 「教務處電話」「圖書館分機」 ask for an office number, not a person's. */
  var OFFICE_CONTACT = /(?:處|室|組|館|中心|總機|學校|宿舍|合作社|校門|傳達室)(?:的)?(?:電話|分機|專線|傳真|地址)|(?:電話|分機|專線)(?:是|多少|幾號)|校址/;
  function personalDataQuery(query) {
    query = clean(query);
    if (OFFICE_CONTACT.test(query) && !/學生|同學|老師的|[\u4e00-\u9fff]{2,3}的電話/.test(query.replace(/(?:處|室|組|館|中心)的電話/, ""))) return false;
    if (!PERSONAL_DATA_QUERY.test(query)) return false;
    if (RECORD_ONLY.test(query)) return true;
    /* 「期中考成績」「模擬考成績」 ask when results come out, not for someone's record. */
    if (EXAM_RESULTS.test(query) && !PERSON_TARGET.test(query.replace(EXAM_RESULTS, "成績"))) return false;
    return !PROCEDURE_QUESTION.test(query);
  }

  var SLOT_CUES = {
    destination: ["送交", "繳交", "交至", "繳至", "送至", "交到", "繳到", "送到", "交給", "收件", "承辦", "辦理", "處室", "辦公室", "訓育組", "教務處", "學務處", "總務處", "輔導室", "圖書館"],
    class_place: ["上課地點", "上課教室", "上課場地", "教室", "上課", "授課地點", "集合地點", "場地", "地點"],
    place: ["地點", "教室", "會場", "場地", "地址", "位於", "集合", "報到地點"],
    deadline: ["截止", "期限", "以前", "前完成", "前繳交", "受理至", "報名至", "申請至"],
    contact: ["承辦人", "聯絡人", "聯絡電話", "分機", "洽詢", "聯絡"],
    fee: ["費用", "金額", "新台幣", "元", "繳費"],
    eligibility: ["資格", "對象", "限", "年級", "符合", "申請人", "參加對象"],
    documents: ["應備", "檢附", "附件", "申請表", "報名表", "同意書", "證明", "繳交資料", "備審資料"],
    requirement: ["強制", "必須", "務必", "須", "應", "自願", "自由參加", "不強制", "得自由", "家長同意", "不同意"],
    method: ["方式", "流程", "步驟", "報名", "申請", "填寫", "繳交", "送交", "登入", "線上"],
  };
  var SLOT_QUERY_WORDS = ["哪裡", "在哪", "去哪", "哪上", "哪個處室", "哪一個處室", "哪個組", "交到", "繳到", "送到", "交給誰", "怎麼", "如何", "何時", "什麼時候", "多少錢", "費用", "資格", "需要什麼", "要帶什麼", "一定要", "強制", "是否", "嗎"];

  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  /* toLowerCase gives the same result as toLowerCase() for Chinese and
     ASCII but is far faster; repeated texts are cached (問校務 took 20+ seconds). */
  var COMPACT_CACHE = new Map();
  function compact(value) {
    var key = String(value == null ? "" : value), hit = COMPACT_CACHE.get(key);
    if (hit !== undefined) return hit;
    /* Variant characters schools use interchangeably: 佈置／布置, 臺／台, 裏／裡. */
    var out = clean(key).toLowerCase().replace(/[^0-9a-z\u3400-\u9fff]+/g, "").replace(/佈/g, "布").replace(/臺/g, "台").replace(/裏/g, "裡");
    if (COMPACT_CACHE.size > 20000) COMPACT_CACHE.clear();
    COMPACT_CACHE.set(key, out);
    return out;
  }
  function unique(rows) { var seen = {}; return rows.filter(function (row) { if (!row || seen[row]) return false; seen[row] = true; return true; }); }
  function tokens(query) {
    var normalized = compact(query), base = normalized;
    STOP.forEach(function (word) { base = base.split(word).join(""); });
    var out = clean(query).toLowerCase().split(/[\s,，。！？?、:：;；()（）]+/).filter(function (word) { return word.length >= 2; });
    if (base.length >= 2) {
      out.push(base);
      for (var size = Math.min(4, base.length); size >= 2; size--) {
        for (var i = 0; i + size <= base.length; i++) out.push(base.slice(i, i + size));
      }
    }
    if (SearchQuery) out = out.concat(SearchQuery.terms(query));
    return unique(out.map(compact).filter(function (word) { return word.length >= 2 && STOP.indexOf(word) === -1; })).slice(0, 48);
  }
  function intent(query) {
    var value = clean(query), found = [];
    Object.keys(INTENTS).forEach(function (key) {
      if (INTENTS[key].some(function (word) { return value.indexOf(word) !== -1; })) found.push(key);
    });
    return found;
  }
  function answerSlot(query) {
    var q = clean(query);
    if (/(?:報名表|申請表|資料|文件|表格).{0,10}(?:交|繳|送)|(?:交|繳|送).{0,12}(?:哪裡|哪個處室|哪一個處室|哪個組|誰)|去哪(?:裡)?辦/.test(q)) return "destination";
    if (/(?:去哪|哪裡|在哪).{0,8}(?:上課|上|學)|(?:上課|課程).{0,8}(?:哪裡|地點|教室|在哪)/.test(q)) return "class_place";
    if (/截止|期限|何時|什麼時候|到幾號|幾點/.test(q)) return "deadline";
    if (/找誰|聯絡誰|電話|分機|承辦人|聯絡人/.test(q)) return "contact";
    if (/多少錢|費用|金額|繳費/.test(q)) return "fee";
    if (/誰可以|資格|對象|哪些人|年級/.test(q)) return "eligibility";
    if (/要帶什麼|準備什麼|需要什麼(?:資料|文件)|應備|檢附/.test(q)) return "documents";
    if (/一定要|強制|必須|自願|自由參加|需不需要/.test(q)) return "requirement";
    if (/哪裡|地點|在哪|會場|教室|地址/.test(q)) return "place";
    if (/怎麼|如何|辦法|流程|報名|申請|繳交|送交/.test(q)) return "method";
    return "";
  }
  function subjectTerms(query) {
    var value = compact(query);
    STOP.concat(GENERIC).concat(SLOT_QUERY_WORDS).sort(function (a, b) { return b.length - a.length; }).forEach(function (word) {
      value = value.split(compact(word)).join("");
    });
    var out = [];
    if (value.length >= 2) {
      out.push(value);
      for (var size = Math.min(5, value.length); size >= 2; size--) {
        for (var i = 0; i + size <= value.length; i++) out.push(value.slice(i, i + size));
      }
    }
    return unique(out).slice(0, 24);
  }
  function anchors(query) {
    var value = compact(query);
    STOP.concat(GENERIC).sort(function (a, b) { return b.length - a.length; }).forEach(function (word) { value = value.split(word).join(""); });
    var out = [];
    if (SearchQuery) out = out.concat(SearchQuery.terms(query));
    if (out.length) return unique(out.map(compact).filter(function (word) { return word.length >= 2; }));
    if (value.length >= 2) {
      out.push(value);
      for (var size = Math.min(4, value.length); size >= 2; size--) for (var i = 0; i + size <= value.length; i++) out.push(value.slice(i, i + size));
    }
    return unique(out.map(compact).filter(function (word) { return word.length >= 2; }));
  }
  function literalAnchors(query) {
    var value=compact(query);
    STOP.concat(GENERIC).sort(function(a,b){return b.length-a.length;}).forEach(function(word){value=value.split(compact(word)).join("");});
    var out=[];
    for(var size=Math.min(4,value.length);size>=2;size--)for(var i=0;i+size<=value.length;i++)out.push(value.slice(i,i+size));
    return unique(out);
  }
  function overview(item) {
    return clean([item && item.title, item && item.summary, item && item.snippet, item && item.category, item && item.source_category, item && item.school_name].filter(Boolean).join(" "));
  }
  function pushSegments(parts, value, meta) {
    var raw = String(value == null ? "" : value).replace(/\r/g, "\n");
    raw.split(/\n+|(?<=[。！？!?；;])/).forEach(function (piece) {
      piece = clean(piece);
      if (!piece) return;
      if (piece.length <= 420) { parts.push({ text: piece, meta: meta || {} }); return; }
      for (var start = 0; start < piece.length; start += 280) {
        var chunk = clean(piece.slice(Math.max(0, start - 50), start + 330));
        if (chunk.length >= 8) parts.push({ text: chunk, meta: meta || {} });
      }
    });
  }
  function detailSegments(record) {
    if (!record || record.provenance !== "official_article") return [];
    var parts = [];
    (record.blocks || []).forEach(function (block) {
      if (block && block.text) pushSegments(parts, block.text, { source_type: "article" });
      (block && block.items || []).forEach(function (item) { pushSegments(parts, item, { source_type: "article" }); });
      (block && block.rows || []).forEach(function (row) { pushSegments(parts, (row || []).join(" "), { source_type: "article" }); });
    });
    (record.attachments || []).forEach(function (file) {
      if (file && file.parse_status === "parsed" && file.embedded_text) {
        pushSegments(parts, file.embedded_text, {
          source_type: "attachment",
          filename: file.filename || "",
          evidence_confidence: file.evidence_confidence || "",
          ocr_confidence: file.ocr_confidence,
        });
      }
    });
    return parts;
  }
  function detailText(record) {
    return clean(detailSegments(record).map(function (part) { return part.text; }).join(" ")).slice(0, 120000);
  }
  function occurrence(text, token) {
    var count = 0, at = 0;
    while ((at = text.indexOf(token, at)) !== -1 && count < 5) { count++; at += token.length; }
    return count;
  }
  function scoreText(text, queryTokens, weight) {
    var normalized = compact(text), score = 0;
    queryTokens.forEach(function (token) { score += occurrence(normalized, token) * Math.max(1, token.length - 1) * weight; });
    return score;
  }
  function cueHits(text, slot) {
    var cues = SLOT_CUES[slot] || [], normalized = clean(text), hits = 0;
    cues.forEach(function (cue) { if (normalized.indexOf(cue) !== -1) hits++; });
    return hits;
  }
  function periodToken(value) {
    var text = clean(value), match = text.match(/(\d{2,4})\s*[-－]\s*([12])|(?:民國\s*)?(\d{2,4})\s*學年(?:度)?(?:第?\s*([一二12])\s*學期)?/);
    if (!match) return "";
    var year = match[1] || match[3] || "", term = match[2] || match[4] || "";
    if (term === "一") term = "1";
    if (term === "二") term = "2";
    return year + (term ? "-" + term : "");
  }
  function rowDate(row) {
    var item = row && row.item || {};
    return String(item.date || item.first_seen || "").slice(0, 10);
  }
  function familyText(row) {
    var title = clean(row && row.item && row.item.title || "");
    return compact(title
      .replace(/(?:民國\s*)?\d{2,4}\s*學年(?:度)?/g, " ")
      .replace(/\d{2,4}\s*[-－]\s*[12]/g, " ")
      .replace(/第?[一二12]\s*學期/g, " ")
      .replace(/修正版|修正|更正|更新|新版|公告|通知|名單|開設情形|上課地點|上課教室/g, " "));
  }
  function grams(value) {
    value = compact(value); var out = [];
    if (value.length < 2) return value ? [value] : [];
    for (var i = 0; i + 2 <= value.length; i++) out.push(value.slice(i, i + 2));
    return unique(out);
  }
  function familySimilarity(a, b) {
    var left = grams(familyText(a)), right = grams(familyText(b));
    if (!left.length || !right.length) return 0;
    var lookup = {}; right.forEach(function (g) { lookup[g] = true; });
    var shared = left.filter(function (g) { return lookup[g]; }).length;
    return shared / Math.max(1, Math.min(left.length, right.length));
  }
  function sameSchool(a, b) {
    var ai = a && a.item || {}, bi = b && b.item || {};
    return String(ai.school || ai.school_id || "") === String(bi.school || bi.school_id || "");
  }
  function subjectOverlap(query, row) {
    var words = subjectTerms(query), text = compact(clean((row && row.item && row.item.title || "") + " " + (row && row.text || "")));
    return words.some(function (word) { return word.length >= 2 && text.indexOf(word) !== -1; });
  }
  function hasSlotEvidence(row, slot) {
    if (!slot) return false;
    return cueHits(clean((row && row.item && row.item.title || "") + " " + (row && row.text || "")), slot) > 0;
  }
  function stageWord(title) { return (String(title).match(/初賽|複賽|決賽|初審|複審|決審|第[一二三四五12345]次|第[一二三四五12345]階段/) || [""])[0]; }
  function preferNewestRelated(query, ranked) {
    ranked = Array.isArray(ranked) ? ranked.slice() : [];
    if (ranked.length < 2) return ranked;
    var requestedPeriod = periodToken(query), slot = answerSlot(query);
    if (requestedPeriod) {
      var periodRows = ranked.filter(function (row) { return periodToken(row && row.item && row.item.title || "") === requestedPeriod; });
      if (periodRows.length) return periodRows;
    }
    var chronological = ranked.slice().sort(function (a, b) {
      return rowDate(b).localeCompare(rowDate(a)) || b.score - a.score;
    });
    var kept = [];
    chronological.forEach(function (row) {
      var superseded = kept.some(function (newer) {
        if (!sameSchool(row, newer)) return false;
        if (!subjectOverlap(query, row) || !subjectOverlap(query, newer)) return false;
        if (familySimilarity(row, newer) < 0.45) return false;
        /* A list of who registered or won does not replace the notice about the event,
           and a 初賽 notice does not replace the 複賽 one. */
        var newTitle = clean(newer.item && newer.item.title || ""), oldTitle = clean(row.item && row.item.title || "");
        if (TITLE_RESULT.test(newTitle) && !TITLE_RESULT.test(oldTitle)) return false;
        if (stageWord(newTitle) !== stageWord(oldTitle)) return false;
        if (rowDate(newer) <= rowDate(row)) return false;
        return slot ? hasSlotEvidence(newer, slot) : false;
      });
      if (!superseded) kept.push(row);
    });
    var allowed = {};
    kept.forEach(function (row) { if (row && row.item) allowed[row.item.id] = true; });
    return ranked.filter(function (row) { return row && row.item && allowed[row.item.id]; });
  }
  function currentAcademicYear(asOf) {
    var year = Number(String(asOf).slice(0, 4)), month = Number(String(asOf).slice(5, 7));
    return (month >= 8 ? year : year - 1) - 1911;
  }
  /* Students ask about what is happening now: newer announcements rank higher and titles
     from earlier school years rank lower, unless the question names that year. */
  function timeliness(item, query, asOf) {
    var bonus = 0, day = String(item.date || item.first_seen || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      var age = (Date.parse(asOf + "T00:00:00Z") - Date.parse(day + "T00:00:00Z")) / 86400000;
      if (age >= 0) bonus += Math.round(40 * Math.exp(-age / 120));
    }
    var titleYear = Number((periodToken(item.title || "").match(/^\d+/) || [])[0]);
    var askedYear = Number((periodToken(query).match(/^\d+/) || [])[0]);
    if (titleYear >= 90 && titleYear < 200 && !askedYear) {
      var current = currentAcademicYear(asOf);
      if (titleYear <= current - 2) bonus -= 240;
      else if (titleYear === current - 1) bonus -= 60;
    }
    return bonus;
  }
  /* A long anchor such as 高三模擬考 should still match 高三第二次模擬考: count how many
     of its two-character pieces appear in the announcement. */
  /* Terms in one group name different things: asking about 多元選修 must not return a
     微課程 notice, 期中考 is not 期末考, and 高一 is not 高三 (user report 2026-10-27). */
  var EXCLUSIVE_GROUPS = [
    ["多元選修", "微課程", "加深加廣", "充實補強", "自主學習", "彈性學習"],
    ["期中考", "期末考", "模擬考", "複習考", "補考"],
    ["高一", "高二", "高三"]
  ];
  function exclusivePenalty(query, title) {
    var q = clean(query), t = clean(title), penalty = 0;
    EXCLUSIVE_GROUPS.forEach(function (group) {
      var asked = group.filter(function (term) { return q.indexOf(term) !== -1; });
      if (!asked.length) return;
      var hasAsked = asked.some(function (term) { return t.indexOf(term) !== -1; });
      var hasOther = group.some(function (term) { return asked.indexOf(term) === -1 && t.indexOf(term) !== -1; });
      if (hasOther && !hasAsked) penalty += 400;
    });
    return penalty;
  }
  var TITLE_TIME = /時間表|時程|日期|期程|試程|考程|行事曆|時間/;
  var TITLE_METHOD = /注意事項|須知|流程|辦法|方式|說明|步驟|重要事項|要點/;
  var NARROW_AUDIENCE = /無學籍|自學生|教師|教職員|職員|代理代課|校長/;
  var CAMPUS_LIFE = /畢業旅行|畢旅|校外教學|社會組|自然組|校慶|運動會|園遊會|畢業典禮|畢典|圖書館|社團|選組|類組|段考|期中考|期末考|課輔|晚自習|自修室|請假|學生證|制服|校服|校車|午餐|開學|放假|上課|班會|週會|朝會/;
  var ASKS_OUTSIDE = /大學|科大|基金會|協會|校外|全國|縣|市立|國家|公共/;
  var OUTSIDE_TITLE = /^\s*[【\[]?\s*轉知|^\s*轉發|大學|科技大學|基金會|協會|社團法人|國家圖書館|國立臺灣圖書館|國立台灣圖書館|公共資訊圖書館|公共圖書館|e化|教育部|國教署|私立[\u4e00-\u9fff]{1,8}(?:高級中學|高中|中學)|[市縣]立[\u4e00-\u9fff]{1,8}(?:高級中學|高中|中學|國中)/;
  var TITLE_RESULT = /名單|結果|得獎|獲獎|榮獲|錄取|榜單|決審|賀[!！：:]|狂賀|恭喜/;
  var TITLE_INFO = /活動資訊|報名資訊|相關資訊|簡章|表件|實施計畫|時間表|時程/;
  var ASKS_RESULT = /結果|名單|得獎|獲獎|錄取|榜單|誰|名次|成績/;
  function anchorCoverage(row, anchorTokens) {
    var pieces = unique([].concat.apply([], anchorTokens.filter(function (t) { return t.length >= 4; }).map(grams)));
    if (!pieces.length) return 0;
    var text = compact(clean((row.item && row.item.title || "") + " " + (row.text || "")));
    return pieces.filter(function (piece) { return text.indexOf(piece) !== -1; }).length / pieces.length;
  }
  /* When no sentence answers the question, still point to the most related announcements
     (title, date, link) instead of a bare 找不到. Old-year items are labelled as such. */
  function subjectBigrams(query) {
    var out = subjectTerms(query).filter(function (t) { return t.length === 2; });
    anchors(query).filter(function (t) { return t.length >= 5; }).forEach(function (phrase) {
      (phrase.match(/[a-z0-9]{2,}/g) || []).forEach(function (word) { out.push(word); });
      (phrase.match(/[\u3400-\u9fff]+/g) || []).forEach(function (run) { out = out.concat(grams(run).filter(function (g) { return g.length === 2; })); });
    });
    return unique(out);
  }
  /* How much a text is about the question: 1 when it contains a short key term
     (taxonomy terms and synonyms such as 手機／行動載具), else the share of the
     question's two-character pieces it contains. */
  /* How often each two-character piece appears in announcement titles. Pieces found in
     many titles (學生, 公告, 本校, 學年…) say little about the topic: 「學生證丟了」 must
     not be answered by a 「學生音樂比賽」 notice just because both contain 學生. */
  var GENERIC_SHARE = 0.04, MIN_STATS_ITEMS = 200, statsCache = { items: null, stats: null };
  function pieceStats(items) {
    if (!Array.isArray(items) || !items.length) return null;
    if (statsCache.items === items) return statsCache.stats;
    var df = {}, titles = [];
    items.forEach(function (item) {
      var title = compact(item && item.title || ""), seen = {};
      titles.push(title);
      grams(title).forEach(function (g) { if (g.length === 2 && !seen[g]) { seen[g] = true; df[g] = (df[g] || 0) + 1; } });
    });
    statsCache = { items: items, stats: { n: items.length, df: df, titles: titles } };
    return statsCache.stats;
  }
  var QUESTION_FILLER = /^(?:要去|去哪|哪個|哪裡|哪天|怎麼|什麼|時候|可以|需要|如何|是否|有沒|沒有|嗎|呢|現在|目前|請問|一下|多少|幾點|哪些|要怎|麼辦|怎樣)$/;
  /* Words too broad to decide a topic on their own, even without corpus statistics. */
  var ALWAYS_GENERIC = ["比賽", "競賽", "考試", "測驗", "課程", "活動", "研習", "講座", "申請", "報名", "學生", "公告", "選修", "選擇", "選填", "學校", "本校", "老師", "時間", "資訊"];
  function pieceCount(piece, stats) {
    return piece.length === 2 && /^[\u3400-\u9fff]{2}$/.test(piece) ? (stats.df[piece] || 0)
      : stats.titles.reduce(function (sum, title) { return sum + (title.indexOf(piece) !== -1 ? 1 : 0); }, 0);
  }
  function isGeneric(piece, stats) {
    if (ALWAYS_GENERIC.indexOf(piece) !== -1) return true;
    if (!stats || stats.n < MIN_STATS_ITEMS) return false;
    return pieceCount(piece, stats) / stats.n > GENERIC_SHARE;
  }
  function topicScore(text, query, stats) {
    text = compact(text);
    /* 「115年」 names the year asked about, not the subject: titles of other years still match. */
    query = clean(String(query || "").replace(YEAR_WORD, " "));
    /* The question names a known subject (愛校服務, 選組, 學生證): the text must mention
       that subject or one of its synonyms, not just share a word such as 服務. */
    if (SearchQuery && SearchQuery.queryPlan && SearchQuery.taxonomyTopics) {
      var named = SearchQuery.queryPlan(query).topics;
      if (named.length && !SearchQuery.taxonomyTopics().filter(function (row) { return named.indexOf(row.id) !== -1; })
        .some(function (row) { return SearchQuery.findTerms(text, row.terms).length; })) return 0;
    }
    var shortAnchors = anchors(query).filter(function (t) { return t.length >= 2 && t.length <= 4 && !isGeneric(t, stats); });
    if (shortAnchors.some(function (t) { return text.indexOf(t) !== -1; })) return 1;
    /* Only pieces that occur in some announcement title count; question filler and
       cross-word fragments (要去, 去哪, 表要) appear in none and would dilute the score. */
    var all = subjectBigrams(query), pieces = all.filter(function (t) { return !stats || pieceCount(t, stats) > 0; });
    var distinctive = pieces.filter(function (t) { return !isGeneric(t, stats); });
    if (distinctive.length) pieces = distinctive;
    /* The question names something specific (學生證, 遺失) that no announcement mentions:
       do not fall back to a broad shared word like 學生. */
    else if (all.some(function (t) { return !isGeneric(t, stats) && ALWAYS_GENERIC.indexOf(t) === -1 && !QUESTION_FILLER.test(t); })) return 0;
    if (!pieces.length) return 0;
    return pieces.filter(function (t) { return text.indexOf(t) !== -1; }).length / pieces.length;
  }
  function relatedAnnouncements(query, ranked, options, stats) {
    var asOf = options && /^\d{4}-\d{2}-\d{2}$/.test(String(options.asOf || "")) ? options.asOf : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var current = currentAcademicYear(asOf);
    var ownSchool = CAMPUS_LIFE.test(query) && !ASKS_OUTSIDE.test(query);
    return (ranked || []).filter(function (row) {
      if (ownSchool && OUTSIDE_TITLE.test(clean(row.item && row.item.title || ""))) return false;
      return topicScore(row.item && row.item.title || "", query, stats) >= 0.5;
    }).slice(0, 3).map(function (row) {
      var item = row.item, year = Number((periodToken(item.title || "").match(/^\d+/) || [])[0]);
      var day = String(item.date || item.first_seen || "").slice(0, 10), note = "";
      if (year >= 90 && year < current) note = "這是 " + year + " 學年度的資料，可能已改變";
      else if (/^\d{4}-\d{2}-\d{2}$/.test(day) && (Date.parse(asOf) - Date.parse(day)) / 86400000 > 365) note = "這是 " + day.slice(0, 4) + " 年的資料，可能已改變";
      return { id: item.id, title: item.title, date: day, school_name: item.school_name || "", url: item.url || "", note: note };
    });
  }
  function rank(query, items, details, options) {
    query = stripSchoolNames(clean(query));
    var asOf = options && /^\d{4}-\d{2}-\d{2}$/.test(String(options.asOf || "")) ? options.asOf : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var queryTokens = tokens(query), anchorTokens = anchors(query), literalTokens=literalAnchors(query), wanted = intent(query), detailMap = details || {}, slot = answerSlot(query);
    if (!SearchQuery || !queryTokens.length) return [];
    var sourceItems = Array.isArray(items) ? items : [];
    /* 學生手冊 has day-school and 進修部 versions of the same rules; use 進修部 only when asked. */
    if (!/進修|夜間部/.test(query)) sourceItems = sourceItems.filter(function (item) { return !(isSchoolDoc(item) && /進修部/.test(item.title || "")); });
    /* Rules quote old dates (「108年修訂」) but do not expire like announcements, so their
       text must not feed the announcement validity check. */
    var metadataDetails = {};
    sourceItems.forEach(function (item) { if (item && detailMap[item.id] && !isSchoolDoc(item)) metadataDetails[item.id] = detailMap[item.id]; });
    var metadataRows = SearchQuery.rank ? SearchQuery.rank(sourceItems, query, { asOf: options && options.asOf, details: metadataDetails, validity: Validity }) : [];
    var metadataById = {};
    metadataRows.forEach(function (row) { metadataById[row.item.id] = row; });
    var ranked = sourceItems.map(function (item) {
      var metadataRow = metadataById[item.id];
      var metadataScore = metadataRow ? metadataRow.score : SearchQuery.announcementScore(item, query);
      var reviewed=Validity&&Validity.reviewedRecord?Validity.reviewedRecord(item):null;
      var reviewedText=reviewed?(reviewed.fragments||[]).map(function(f){return clean(f.keywords+" "+f.text);}).join(" "):"";
      var reviewedScore=scoreText(reviewedText,queryTokens,8);if(!metadataScore&&!reviewedScore)return null;
      var titleScore = scoreText(item.title || "", queryTokens, 9);
      var overviewScore = scoreText(overview(item), queryTokens, 3);
      var body = detailText(detailMap[item.id]);
      var bodyScore = scoreText(body, queryTokens, 1);
      var keywordText = Array.isArray(item.keywords) ? item.keywords.join(" ") : "";
      var anchorScore = scoreText(clean(item.title || "") + " " + overview(item) + " " + keywordText + " " + body+" "+reviewedText, anchorTokens, 1);
      var reviewedNormalized=compact(reviewedText);
      var reviewedAnchorHits=literalTokens.filter(function(token){return reviewedNormalized.indexOf(token)!==-1;}).length;
      var reviewedCoverage=literalTokens.length?reviewedAnchorHits/literalTokens.length:0;
      var reviewedLongest=literalTokens.reduce(function(best,token){return reviewedNormalized.indexOf(token)!==-1?Math.max(best,token.length):best;},0);
      var reviewedBonus=reviewedScore?(45+Math.round(reviewedCoverage*120)):0;
      var intentBonus = 0, combined = clean(overview(item) + " " + body);
      wanted.forEach(function (key) { if (INTENTS[key].some(function (word) { return combined.indexOf(word) !== -1; })) intentBonus += 4; });
      var slotBonus = slot ? Math.min(30, cueHits(combined, slot) * 6) : 0;
      /* A title that is itself a schedule or a how-to answers 什麼時候 / 怎麼 questions directly. */
      var titleText = clean(item.title || "");
      if (wanted.indexOf("date") !== -1 && TITLE_TIME.test(titleText)) intentBonus += 200;
      if (wanted.indexOf("method") !== -1 && TITLE_METHOD.test(titleText)) intentBonus += 120;
      /* 何時／怎麼 questions want the notice that announces the event, not the list of
         who registered or won (自主學習成果發表 was answered with 決審名單). */
      /* 校慶、圖書館、社團、選組… asked by a student mean their own school's, not a
         university's open day or a 社團法人's camp. */
      if (CAMPUS_LIFE.test(query) && !ASKS_OUTSIDE.test(query) && OUTSIDE_TITLE.test(titleText)) intentBonus -= 350;
      /* Notices for 無學籍自學生 or staff are not what an enrolled student is asking about. */
      if (NARROW_AUDIENCE.test(titleText) && !NARROW_AUDIENCE.test(query)) intentBonus -= 250;
      if ((wanted.indexOf("date") !== -1 || wanted.indexOf("method") !== -1 || slot) && !ASKS_RESULT.test(query)) {
        if (TITLE_RESULT.test(titleText)) intentBonus -= 300;
        else if (TITLE_INFO.test(titleText)) intentBonus += 80;
      }
      /* A title that carries its own date, e.g. 重補修報名(7/20-7/21), answers 何時 directly. */
      if (wanted.indexOf("date") !== -1 && titleTime(titleText)) intentBonus += 120;
      /* 學測什麼時候 asks about the real exam, not a cram school's mock exam. */
      if (/學測|統測|分科測驗|會考/.test(query) && !/模擬|模考|擬真/.test(query) && /模擬考|模考|擬真/.test(titleText)) intentBonus -= 300;
      return { item:item,detail:detailMap[item.id]||null,text:combined,score:metadataScore+reviewedScore+reviewedBonus+titleScore+overviewScore+Math.min(bodyScore,80)+intentBonus+slotBonus+timeliness(item,query,asOf)-exclusivePenalty(query,item.title||""),anchorScore:anchorScore,reviewedMatch:reviewedScore>0,reviewedCoverage:reviewedCoverage,reviewedAnchorHits:reviewedAnchorHits,reviewedLongest:reviewedLongest,search_validity:metadataRow&&metadataRow.validity };
    }).filter(function (row) { return row && row.score >= 8 && (!anchorTokens.length || row.anchorScore > 0 || row.reviewedMatch || anchorCoverage(row, anchorTokens) >= 0.6); }).sort(function (a, b) {
      return b.score - a.score || String(b.item.date || b.item.first_seen || "").localeCompare(String(a.item.date || a.item.first_seen || ""));
    });
    if (!ranked.length) return ranked;
    var strongReviewed=ranked.filter(function(row){return row.reviewedMatch&&row.reviewedLongest>=3&&row.reviewedAnchorHits>=2&&row.reviewedCoverage>=0.12;});
    if(strongReviewed.length){
      var related={};strongReviewed.forEach(function(row){related[row.item.id]=true;var record=Validity&&Validity.reviewedRecord?Validity.reviewedRecord(row.item):null;(record&&record.relations||[]).forEach(function(rel){if(rel.target_id)related[rel.target_id]=true;});});
      /* Reviewed records keep their score bonus but no longer remove every other
         announcement: a loose keyword overlap (e.g. 自主學習) hid the right answer. */
      if(strongReviewed.some(function(row){return row.reviewedCoverage>=0.5;}))ranked=ranked.filter(function(row){return related[row.item.id]||(row.reviewedMatch&&row.reviewedCoverage>=0.5)||!row.reviewedMatch&&row.score>=strongReviewed[0].score*0.6;});
    }
    ranked = preferNewestRelated(query, ranked);
    if (!ranked.length) return ranked;
    var floor = Math.max(70, ranked[0].score * 0.4);
    return ranked.filter(function (row) { return row.score >= floor; });
  }
  function sentences(value) {
    return clean(value).split(/(?<=[。！？!?；;])|\n+/).map(clean).filter(function (row) { return row.length >= 8 && row.length <= 420; });
  }
  function evidenceScore(sentence, queryTokens, wanted, plan, item) {
    var score = scoreText(sentence, queryTokens, 4), slot = plan && plan.answer_slot || "";
    wanted.forEach(function (key) { if (INTENTS[key].some(function (word) { return sentence.indexOf(word) !== -1; })) score += 12; });
    if (slot) score += Math.min(72, cueHits(sentence, slot) * 24);
    var subjects = plan && plan.subject_terms || [];
    if (subjects.length) {
      var sentenceSubject = scoreText(sentence, subjects, 2);
      var titleSubject = scoreText(item && item.title || "", subjects, 3);
      score += Math.min(45, sentenceSubject + titleSubject);
    }
    if (/作者\s*[：:]|發[佈布]日期|最後更新日期/.test(sentence)) score -= 18;
    /* A 什麼時候 question is answered by a sentence that actually contains a date or time span. */
    if ((wanted.indexOf("date") !== -1 || slot === "deadline") && TIME_PHRASE.test(sentence)) score += 40;
    return score;
  }
  /* 「94年2月訂定，97年3月14日修訂」 at the top of a rule is its revision history, never an answer. */
  var REVISION_HISTORY = /^[\s\d年月日,，、.。()（）～~-]*(?:(?:校務會議|行政會議)?(?:訂定|修訂|修正|通過|核定|發布)[\s\d年月日,，、.。()（）]*)+$|^(?:中華民國)?\d{2,3}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日.{0,20}(?:校務會議|行政會議|部字第|號令|號函)/;
  function candidateQualifies(candidate, plan) {
    if (REVISION_HISTORY.test(clean(candidate.text))) return false;
    /* A bare fragment such as 「記警告。」 cut from a list says nothing on its own. */
    if (compact(candidate.text).replace(/[。，、；：.,;:]/g, "").length < 8) return false;
    var slot = plan && plan.answer_slot || "";
    if (!slot) return candidate.score >= 4;
    var hits = cueHits(candidate.text, slot);
    if (slot === "deadline" && TIME_PHRASE.test(candidate.text)) return true;
    if (slot === "requirement" || slot === "destination" || slot === "class_place" || slot === "deadline" || slot === "contact" || slot === "fee") return hits > 0;
    return hits > 0 || candidate.score >= 18;
  }
  function fragmentEvidence(row,queryTokens,wanted,query,plan){if(!Validity||!row.validity||!Array.isArray(row.validity.fragments))return[];var open=Validity.requiresOpenWindow(query);
    var c=Validity.usableFragments(row.validity,query).map(function(f){var score=evidenceScore(clean(f.keywords+" "+f.text),queryTokens,wanted,plan,row.item);if(f.status==="ACTIVE"||f.status==="ACTIVE_WINDOW")score+=8;if(f.status==="FUTURE"&&open)score+=16;if(f.answer_policy==="current_negative"&&open)score+=24;if(f.status==="UNCONFIRMED")score+=3;return{text:f.text,score:score,item:row.item,fragment:f};}).filter(function(x){return candidateQualifies(x,plan);}).sort(function(a,b){return b.score-a.score;});
    if(!c.length)return c;var floor=Math.max(4,c[0].score*.60);return c.filter(function(x){return x.score>=floor;});}
  function smoothEvidence(value) {
    var text = clean(value).replace(/^[•●▪▫◆◇※*\-–—]+\s*/, "")
      .replace(/^(?:說明|公告內容|主旨|注意事項|辦理方式|相關資訊)\s*[：:]\s*/i, "")
      .replace(/\s*詳情請(?:參閱|見).*$/i, "").trim();
    if (text.length > 170) text = text.slice(0, 168).replace(/[，、；;：:]?[^，。！？!?；;]{0,22}$/, "") + "…";
    return text;
  }
  function questionPlan(query) {
    var wanted = intent(query);
    return {
      intents: wanted,
      answer_slot: answerSlot(query),
      subject_terms: subjectTerms(query),
      wants_latest: wanted.indexOf("status") !== -1 || /最新|最近|現在|目前/.test(query),
      yes_no: wanted.indexOf("yesno") !== -1,
      wants_steps: wanted.indexOf("method") !== -1,
    };
  }
  function answerLines(evidence, sources) {
    var sourceTitles = {};
    (sources || []).forEach(function (item) { sourceTitles[item.id] = clean(item.title || "官方公告"); });
    var multiple = (sources || []).length > 1, seen = {};
    return (evidence || []).map(function (row) {
      var fact = smoothEvidence(row.text), key = compact(fact);
      if (!fact || seen[key]) return "";
      seen[key] = true;
      return (multiple ? (sourceTitles[row.announcement_id] || "官方公告") + "：" : "") + fact;
    }).filter(Boolean).slice(0, 4);
  }
  function evidenceLimitation(evidence, sources, plan, validityWarnings) {
    validityWarnings = unique((validityWarnings || []).map(clean).filter(Boolean));
    if (validityWarnings.length) return validityWarnings.slice(0, 2).join(" ");
    if (!evidence.length) return "沒有足夠的官方原文可供核對。";
    if(sources.length>1&&sources.some(function(i){return i.validity&&i.validity.relations&&i.validity.relations.length;}))return"這些公告有更正或補充關係；只合併明確指定的部分，其餘內容不得自行視為被取代。";
    if (sources.length > 1) return "找到多則不同公告，已分開列出；不能把不同活動的日期或資格互相拼接。";
    if (plan.wants_latest) return "這是本站目前已抓到的最新官方資料；校方若尚未發布，系統不會自行補出答案。";
    return "答案只涵蓋目前可讀取的官方公告正文與附件文字；OCR 辨識內容仍應以原附件核對。";
  }
  /* Natural answers from fixed templates (no AI model): who said it and when, then the fact.
     For 什麼時候 questions the date or time span leads the sentence. */
  function sourceLabel(item) {
    var school = clean(item && item.school_name || ""), day = String(item && (item.date || item.first_seen) || "").slice(0, 10);
    var when = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Number(day.slice(5, 7)) + " 月 " + Number(day.slice(8, 10)) + " 日" : "";
    var title = clean(item && item.title || "").replace(/^[【\[][^】\]]{1,12}[】\]]\s*/, "").replace(/^📢\s*/, "");
    if (title.length > 26) title = title.slice(0, 25) + "…";
    if (!title) return "根據" + (school ? school + (when ? " " + when : "") + "的" : "") + "官方公告";
    return "根據" + (school || "校方") + (when ? " " + when : "") + "的公告「" + title + "」";
  }
  var TIME_PHRASE = /(?:(?:\d{2,4}\s*年\s*)?\d{1,2}\s*[月\/]\s*\d{1,2}\s*日?\s*(?:[（(][^）)]{1,4}[）)])?\s*(?:上午|下午|中午|晚上)?\s*(?:(?:\d{1,2}[:：]\d{2}|[\d一二三四五六七八九十]{1,3}\s*[時點](?:\s*[\d一二三四五六七八九十]{1,3}\s*分)?)(?:\s*[~～－-]\s*\d{1,2}[:：]\d{2})?)?\s*(?:[~～至到－-]|起至)\s*(?:\d{2,4}\s*年\s*)?(?:\d{1,2}\s*[月\/]\s*\d{1,2}\s*日?|\d{1,2}\s*日)\s*(?:[（(][^）)]{1,4}[）)])?\s*(?:上午|下午|中午|晚上)?\s*(?:(?:\d{1,2}[:：]\d{2}|[\d一二三四五六七八九十]{1,3}\s*[時點](?:\s*[\d一二三四五六七八九十]{1,3}\s*分)?)(?:\s*[~～－-]\s*\d{1,2}[:：]\d{2})?)?(?:\s*止)?)|(?:(?:\d{2,4}\s*年\s*)?\d{1,2}\s*[月\/]\s*\d{1,2}\s*日?\s*(?:[（(][^）)]{1,4}[）)])?\s*(?:上午|下午|中午|晚上)?\s*(?:(?:\d{1,2}[:：]\d{2}|[\d一二三四五六七八九十]{1,3}\s*[時點](?:\s*[\d一二三四五六七八九十]{1,3}\s*分)?)(?:\s*[~～－-]\s*\d{1,2}[:：]\d{2})?)?(?:\s*(?:前|止|起))?)/;
  function timePhrase(text) {
    var match = clean(text).match(TIME_PHRASE);
    if (!match) return "";
    var md = match[0].match(/(\d{1,2})\s*[月\/]\s*(\d{1,2})/);
    if (md && (Number(md[1]) < 1 || Number(md[1]) > 12 || Number(md[2]) < 1 || Number(md[2]) > 31)) return "";
    return clean(match[0]);
  }
  function endSentence(text) {
    text = clean(text).replace(/[；;，,、：:]+$/, "");
    return text && !/[。！？!?…]$/.test(text) ? text + "。" : text;
  }
  function oldNote(item, asOf) {
    var year = Number((periodToken(item && item.title || "").match(/^\d+/) || [])[0]);
    var current = currentAcademicYear(asOf || new Date().toISOString().slice(0, 10));
    if (year >= 90 && year < current) return "提醒：這是 " + year + " 學年度的公告，現在的做法可能已經改變。";
    var day = String(item && (item.date || item.first_seen) || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && asOf && (Date.parse(asOf) - Date.parse(day)) / 86400000 > 365) return "提醒：這是 " + day.slice(0, 4) + " 年的公告，現在的做法可能已經改變。";
    return "";
  }
  function composeSummary(evidence, sources, wanted, plan, asOf) {
    var lead = evidence.length ? smoothEvidence(evidence[0].text) : "";
    if (!lead) return "我沒有在公告裡找到能回答這題的內容。";
    if(sources.length>1&&sources.some(function(i){return i.validity&&i.validity.relations&&i.validity.relations.length;}))return"這幾則公告互相修正或補充，下面依官方指定的範圍合併整理；沒有被點名修改的部分，仍以原公告為準。";
    var first = sources.filter(function (item) { return item.id === evidence[0].announcement_id; })[0] || sources[0] || {};
    var fact = endSentence(lead.replace(/^(?:[一二三四五六七八九十]+、|\(?\d{1,2}\)?[、.．])\s*/, ""));
    var slot = plan && plan.answer_slot || "", asksTime = slot === "deadline" || wanted.indexOf("date") !== -1;
    var when = asksTime ? timePhrase(lead) : "";
    var text = when ? "時間是 " + when + "。" + sourceLabel(first) + "：" + fact : sourceLabel(first) + "，" + fact;
    if (sources.length > 1) text += "另外還有 " + (sources.length - 1) + " 則相關公告列在下面；它們不是同一項活動，日期和資格請分開看。";
    var note = oldNote(first, asOf);
    return note ? text + note : text;
  }
  /* 重點整理: pull labelled facts (截止, 時間, 地點, 方式, 對象, 費用) out of the official
     text with fixed rules, so the answer reads as a short checklist instead of a quote. */
  var POINT_RULES = [
    { label: "截止", cue: /截止|期限|前.{0,8}(?:完成|報名|繳交|上傳|送交|填寫|申請)|止[。，；]?$|受理至|報名至|至.{0,24}止/, needTime: true },
    { label: "時間", cue: /時間|日期|期程|舉行|辦理|舉辦|開始|上課|考試|報到|於\s*\d/, needTime: true },
    { label: "地點", cue: /地點|場地|教室|會議室|禮堂|體育館|圖書館|活動中心|\d+\s*樓|大樓|操場|校區/ },
    { label: "方式", cue: /登入|填寫|上網報名|線上報名|網路報名|線上填|報名方式|申請方式|辦理方式|請至.{0,20}(?:報名|申請|繳交|填寫|登記|領取)|請於.{0,30}(?:繳交|送交|上傳|填寫|報名)|繳交至|送交至|掃描.{0,6}(?:QR|條碼)/i },
    { label: "對象", cue: /(?:對象|資格|適用對象)\s*[：:]|^(?:限|開放).{0,12}(?:學生|年級|同學)/ },
    { label: "費用", cue: /費用|新臺幣|新台幣|\d+\s*元|免費|報名費/ }
  ];
  var PHONE = /(?:\(?0\d{1,2}\)?[-\s]?)?\d{3,4}[-\s]?\d{3,4}(?:\s*(?:分機|#)\s*\d+)?/g;
  var PLACE = /(?:於|在|至)\s*([^，。；、\s]{0,12}?(?:禮堂|教室|會議室|體育館|圖書館|活動中心|\d+\s*樓|大樓|操場|校區|中心|館))/;
  function pointValue(clause, label, time) {
    var labelled = clause.match(new RegExp("(?:" + label + "|報名時間|活動時間|活動地點|上課地點|報名方式|申請方式|參加對象|申請資格)\\s*[：:]\\s*(.+)$"));
    var value = labelled ? labelled[1] : clause;
    if ((label === "截止" || label === "時間") && time) value = time;
    if (label === "地點" && !labelled) { var place = clause.match(PLACE); if (place) value = place[1]; }
    value = value.split(/[，,]\s*(?=洽詢|聯絡|電話|詳見|詳情)/)[0];
    /* Stop at the next numbered item or field label when the text has no full stops. */
    value = value.split(/\s+(?=[一二三四五六七八九十]+、|\(?\d{1,2}\)?[、.．)]\s*\S|備註|◆|※|【|[\u4e00-\u9fff]{2,6}\s*[：:])/)[0];
    if (label === "費用") { var fee = value.match(/[\u4e00-\u9fff]{0,6}費?\s*[：:]?\s*(?:新[臺台]幣\s*)?[\d,]+\s*元整?|免費/); if (!fee) return ""; value = fee[0]; }
    if (label === "地點") value = value.split(/\s*[）)、，,]/)[0];
    value = balanceBrackets(value.replace(/^[【\[（(\s]+/, ""));
    value = clean(value.replace(PHONE, "").replace(/^(?:[一二三四五六七八九十]+、|\(?\d{1,2}\)?[、.．])\s*/, "").replace(/[，、；;：:。]+$/, ""));
    return value.length > 60 ? value.slice(0, 58) + "…" : value;
  }
  /* Drop a stray closing bracket at the end, keep a matched one: 「11月15日（日）」 stays whole. */
  function balanceBrackets(value) {
    var pairs = [["（", "）"], ["(", ")"], ["【", "】"], ["[", "]"]];
    var count = function (text, ch) { return text.split(ch).length - 1; };
    for (var guard = 0; guard < 4; guard++) {
      var last = value.slice(-1), pair = pairs.filter(function (p) { return p[1] === last; })[0];
      if (!pair || count(value, pair[0]) >= count(value, pair[1])) break;
      value = value.slice(0, -1).replace(/\s+$/, "");
    }
    return value.replace(/\s+$/, "");
  }
  /* 「2026年10月29日」「115年10月29日」「10/29」 → "10-29" (month-day), to compare with the posting date. */
  function monthDay(text) {
    var m = String(text || "").match(/(\d{1,2})\s*(?:月|\/|-)\s*(\d{1,2})(?!.*\d{1,2}\s*(?:月|\/)\s*\d)/);
    return m ? Number(m[1]) + "-" + Number(m[2]) : "";
  }
  /* options.published: the notice's own date. A 時間 equal to it is the posting date, not the event. */
  function keyPoints(text, options) {
    var clauses = [], published = String(options && options.published || "").slice(0, 10);
    var postedDay = /^\d{4}-\d{2}-\d{2}$/.test(published) ? Number(published.slice(5, 7)) + "-" + Number(published.slice(8, 10)) : "";
    clean(text).split(/(?<=[。！？!?；;])|\n+/).map(clean).forEach(function (sentence) {
      if (sentence.length < 4 || sentence.length > 300) return;
      /* Long sentences often carry two facts (deadline, then event time and place).
         Commas inside numbers (新臺幣 100,000 元) are not clause breaks. */
      if (sentence.length > 30 && !/[^\d\s][：:]/.test(sentence)) sentence.split(/，|,(?!\d{3}(?!\d))/).map(clean).forEach(function (part) { if (part.length >= 4) clauses.push(part); });
      else clauses.push(sentence);
    });
    var points = [], used = {};
    clauses.forEach(function (clause) {
      if (PERSON_NAME_RE.test(clause)) return;
      POINT_RULES.forEach(function (rule) {
        if (used[rule.label] >= (rule.label === "方式" ? 2 : 1) || !rule.cue.test(clause)) return;
        var time = timePhrase(clause);
        if (rule.needTime && !time) return;
        if (rule.label === "時間" && /前$|止$/.test(time)) return;
        if (rule.label === "時間" && used["截止"] && /截止|期限|前完成|前繳交/.test(clause)) return;
        if (rule.label === "時間" && (/(?:公告|發布|發佈|發文|張貼|更新)日期|\d\s*日\s*(?:公告|發布|發佈|函|來函|發文)/.test(clause) || postedDay && monthDay(time) === postedDay && !/舉行|舉辦|上課|考試|報到|開始|開幕|比賽|活動時間/.test(clause))) return;
        var value = pointValue(clause, rule.label, time);
        if (!value || value.length < 3 || !/[\u4e00-\u9fff\d]/.test(value) || points.some(function (p) { return p.value === value; })) return;
        used[rule.label] = (used[rule.label] || 0) + 1;
        points.push({ label: rule.label === "費用" && /獎金|獎勵|獎品|獎額/.test(value) ? "獎金" : rule.label, value: value });
      });
    });
    var order = ["截止", "時間", "地點", "方式", "對象", "費用", "獎金"];
    return points.sort(function (a, b) { return order.indexOf(a.label) - order.indexOf(b.label); }).slice(0, 6);
  }
  var PERSON_NAME_RE = /\d{3}\s*[\u4e00-\u9fff]{2,3}\s*同學|[\u4e00-\u9fff]{2,3}\s*(?:小姐|先生|女士|主任|組長|老師|教授|校長)|電洽|洽詢|聯絡人|承辦人/;
  /* Replies when no sentence answers the question, written to sound like a person who
     checked the notices: say what was looked for, what the closest notice says in its
     title (a date such as (7/20-7/21) often answers 何時), whether that is already past,
     and who at school can confirm. Fixed templates only. */
  var OFFICE_RULES = [
    { office: "教務處", re: /考|成績|選課|選修|微課程|加深加廣|選組|類組|社會組|自然組|轉組|重補修|補考|課表|學測|統測|分科|英聽|英檢|檢定|自主學習/ },
    { office: "輔導室", re: /升學|繁星|個人申請|特殊選才|學習歷程|志願|科系|輔導/ },
    { office: "學務處", re: /社團|請假|公假|缺曠|獎懲|銷過|愛校服務|學生證|制服|校服|服儀|校慶|運動會|畢業典禮|志工|服務學習|校車|交通車|晚自習|班聯會|營隊|比賽|競賽|獎學金|助學金/ },
    { office: "總務處", re: /學雜費|代辦費|繳費|註冊費|停車|午餐|便當/ },
    { office: "健康中心", re: /健康檢查|健檢|疫苗|體檢/ },
    { office: "圖書館", re: /圖書館|借書|還書|借還|借閱|續借|逾期|閱覽|自修室|自習室/ }
  ];
  /* Official office pages, from the site navigation recorded in scraper/discovery_report.md.
     Shown when the announcements cannot answer, so the student still knows where to look. */
  var OFFICE_PAGES = {
    cysh: {
      "教務處": "https://www.cysh.cy.edu.tw/p/412-1008-579.php",
      "輔導室": "https://www.cysh.cy.edu.tw/p/412-1008-1431.php",
      "學務處": "https://www.cysh.cy.edu.tw/p/412-1008-946.php",
      "總務處": "https://www.cysh.cy.edu.tw/p/412-1008-228.php",
      "健康中心": "https://www.cysh.cy.edu.tw/p/412-1008-626.php",
      "圖書館": "https://www.cysh.cy.edu.tw/p/412-1008-1376.php"
    }
  };
  var SCHOOL_SHORT = { cysh: "嘉中", cygsh: "嘉女" };
  function officeLink(query, schoolId) {
    var hit = OFFICE_RULES.filter(function (row) { return row.re.test(query); })[0];
    var url = hit && OFFICE_PAGES[schoolId] && OFFICE_PAGES[schoolId][hit.office];
    return url ? { office: hit.office, label: (SCHOOL_SHORT[schoolId] || "") + hit.office + "網頁", url: url } : null;
  }
  function officeHint(query) {
    var hit = OFFICE_RULES.filter(function (row) { return row.re.test(query); })[0];
    return hit ? "想確認的話，可以問導師或" + hit.office + "。" : "想確認的話，可以問導師或相關處室。";
  }
  var SUBJECT_STRIP = /怎麼辦|怎麼選|怎麼報名|怎麼申請|怎麼請|怎麼繳|怎麼查|要去哪裡|請問|我想知道|想知道|可以幫我|幫我|什麼時候|何時|哪一天|哪天|哪幾天|幾號|幾點|要怎麼|怎麼|如何|在哪裡|在哪|哪裡|去哪|有沒有|有什麼|有哪些|是什麼|是否|需不需要|要不要|可以|需要|一定要|的時間|時間|日期|報名|申請|辦法|規定|呢|嗎|吧|啊|是|要|[？?！!。，,、\s]/g;
  var askedYearNow = 0;   // set while answer() retries a 「115年」 question without the year
  var YEAR_WORD = /(?:民國\s*)?1[0-2]\d\s*(?:學年度?|年)(?:第?\s*[一二12]\s*學期)?/g;
  function questionSubject(query) {
    var rest = clean(query).replace(YEAR_WORD, "").replace(SUBJECT_STRIP, "").replace(/(?:要|需要|得)?(?:繳交|交出|上交|交)$/, "");
    return rest.length >= 2 && rest.length <= 12 ? rest : "";
  }
  function ordinalOf(text) { var m = String(text).match(/第\s*([一二三四五12345])\s*次/); return m ? "一二三四五".indexOf(m[1]) + 1 || Number(m[1]) : 0; }
  /* A date written in the title, e.g. (7/20-7/21), (9/12前), 「至11/27止」. */
  function titleTime(title) {
    title = clean(title);
    var paren = title.match(/[（(]([^（）()]{0,14}\d{1,2}\s*[\/月]\s*\d{1,2}[^（）()]{0,14})[）)]/);
    if (paren) return clean(paren[1]);
    var phrase = timePhrase(title);
    if (phrase) return phrase;
    var m = title.match(/\d{1,2}\s*[\/月]\s*\d{1,2}\s*日?\s*(?:[（(][^）)]{1,4}[）)])?\s*(?:前|止|起|截止)?/);
    return m ? clean(m[0]) : "";
  }
  function lastTitleDay(fact, item) {
    var all = String(fact).match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/g);
    if (!all) return "";
    var md = all[all.length - 1].match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/), base = String(item && item.date || "").slice(0, 10);
    var month = Number(md[1]), day = Number(md[2]), year = Number(base.slice(0, 4));
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return "";
    var iso = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    if (iso < base && Number(base.slice(5, 7)) - month > 6) iso = (year + 1) + iso.slice(4);
    return iso;
  }
  function insufficientSummary(related, asOf, query, scopeLabel) {
    query = clean(query || "");
    var subject = questionSubject(query), where = scopeLabel ? scopeLabel + "的" : "";
    if (!related || !related.length) {
      return (subject ? "我翻過" + where + "公告，沒有找到跟「" + subject + "」有關的消息" : "我翻過" + where + "公告，沒有找到能回答這題的消息") +
        "，可能學校還沒公告，或寫在讀不到的附件裡。" + officeHint(query);
    }
    var top = related[0], day = String(top.date || "").slice(0, 10), title = clean(top.title);
    var when = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Number(day.slice(5, 7)) + "/" + Number(day.slice(8, 10)) : "";
    var asksTime = /什麼時候|何時|哪一天|哪天|哪幾天|幾號|幾點|日期|時間|截止|期限|到什麼時候/.test(query);
    var askedOrdinal = ordinalOf(query), topOrdinal = ordinalOf(title);
    if (askedOrdinal && topOrdinal && askedOrdinal !== topOrdinal) {
      return "目前只看到第" + "一二三四五".charAt(topOrdinal - 1) + "次的公告「" + title + "」" + (when ? "（" + when + "）" : "") +
        "，第" + "一二三四五".charAt(askedOrdinal - 1) + "次的還沒公告。" + officeHint(query);
    }
    /* The closest match is last year's (or not the year asked for): say that plainly instead of
       sending the user to an old notice. 「115 學年度的還沒公告，最近一次是 114 學年度的…」 */
    var topYear = Number((periodToken(title).match(/^\d+/) || [])[0]) || 0;
    var askedYear = Number((query.match(/(1[0-2]\d)\s*(?:學年度?|年)/) || [])[1]) || askedYearNow;
    var wantYear = askedYear || (asOf ? currentAcademicYear(asOf) : 0);
    if (topYear >= 90 && wantYear && topYear < wantYear) {
      var topic = subject || "這項資料";
      return wantYear + " 學年度的「" + topic + "」我還沒看到公告。最近一次是 " + topYear + " 學年度的「" + title + "」" +
        (when ? "，那次是 " + when + " 公告的" : "") + "，時間和做法可以參考，但今年可能不一樣。" +
        (asksTime ? "等新的公告出來我就查得到；急的話直接問導師或承辦處室。" : officeHint(query));
    }
    var fact = asksTime ? titleTime(title) : "";
    if (fact) {
      var last = lastTitleDay(fact, top), past = last && asOf && last < asOf;
      return "「" + title + "」" + (when ? "（" + when + " 公告）" : "") + "標題寫的時間是 " + fact + "。" +
        (past ? "這次已經過了，新的一次還沒看到公告。" + officeHint(query) : "細節請點開公告確認。") + (top.note && !past ? "提醒：" + top.note + "。" : "");
    }
    return "公告內文沒有直接寫到這點。最相關的是 " + (when ? when + " 的" : "") + "「" + title + "」，答案可能在內文或附件裡，點開看看" +
      (top.note ? "；" + top.note : "") + "。";
  }
  function validityFor(row, options) {
    return Validity ? Validity.analyze(row.item, row.detail, options || {}) : { status: "UNCONFIRMED", answer_policy: "warn", warnings: ["公告效力模組未載入，不能確認目前狀態。"] };
  }
  function expiredAnswer(query, rows) {
    var sources = rows.slice(0, 4).map(function (row) {
      return Object.assign({}, row.item, { validity: row.validity });
    });
    var lines = rows.slice(0, 3).map(function (row) {
      var date = row.validity.latest_deadline || row.validity.latest_event;
      return clean(row.item.title || "相關公告") + "：本次期限或事件" + (date ? "已於 " + date + " " : "已經") + "結束。";
    });
    return { status: "answered", query: query,
      summary: "找到的相關官方公告已超過明確期限；不能用它證明現在仍可申請、報名或辦理。",
      answer_lines: lines, limitation: "目前未找到可確認仍有效的更新公告；若校方另有新公告，應以新公告為準。",
      confidence: "medium", plan: questionPlan(query), evidence: [], sources: sources,
      validity_warnings: ["過期公告只作歷史依據，不作目前有效證明。"] };
  }
  function safeSource(row, options) {
    var item=row.item||row;
    return { id:item.id, title:clean(item.title||"官方公告"), school_id:item.school_id||item.school||"",
      school_name:item.school_name||"", url:item.url||"", date:item.date||item.first_seen||"",
      category:item.category||"", validity:row.validity||validityFor({item:item,detail:row.detail||null},options) };
  }
  function personalDataAnswer(query, ranked, options) {
    ranked.forEach(function(row){row.validity=validityFor(row,options);});
    return { status:"answered", query:query, privacy_limited:true,
      summary:"這個問題可能涉及可識別的學生或個人資料；本站不整理、不轉述名單或個人紀錄。",
      answer_lines:["請直接開啟下方官方公告核對；若資料有誤、已逾保存目的或需要更正，請聯絡原發布學校。"],
      limitation:"為降低個資再次散布風險，問校務只提供必要的官方入口，不顯示姓名、學號、健康、獎懲或其他個人紀錄。",
      confidence:"high",plan:questionPlan(query),evidence:[],sources:ranked.slice(0,4).map(function(row){return safeSource(row,options);}),validity_warnings:[] };
  }
  /* Open questions such as 「最近有什麼新消息？」「有什麼快截止的？」「這週有什麼比賽？」
     have no single sentence that answers them: list recent (or soon-due) announcements
     for the user's school instead, filtered by the same relevance rules as 我的今日. */
  var BROWSE_CUE = /新鮮事|新鮮|新聞|大事|動態|八卦|近況|發生(?:了)?(?:什麼|啥)|好玩|好康|有趣|最近|最新|近期|這週|本週|這禮拜|這星期|這個月|今天|明天|新消息|新公告|快截止|快到期|要注意/;
  var BROWSE_ASK = /新鮮事|新鮮|新聞|大事|動態|八卦|近況|發生(?:了)?(?:什麼|啥)|好玩|好康|有趣|有什麼|有哪些|有啥|什麼新|新消息|新公告|快截止|快到期|要注意|消息/;
  var BROWSE_STRIP = /新鮮事|新鮮|新聞|大事|動態|八卦|近況|發生(?:了)?(?:什麼|啥)|好玩|好康|有趣|最近|最新|近期|這週|本週|這禮拜|這星期|這個月|今天|明天|新消息|新公告|消息|公告|快截止|快到期|截止|要注意|注意|事情|事項|有什麼|有哪些|有啥|什麼|哪些|新的|可以|參加|報名|申請|嗎|呢|的|是|有|在|我|學校|嘉中|嘉女|[？?！!。，,\s]/g;
  var DEADLINE_ASK = /快截止|快到期|截止|期限|deadline/i;
  /* 「現在有哪些獎學金可以申請」「有什麼比賽可以報名」: list the ones still open
     instead of quoting one announcement. */
  var OPEN_ASK = /(?:有什麼|有哪些|有啥|哪些).{0,14}(?:可以|能|開放|還能)?(?:報名|申請|參加|投稿)|(?:現在|目前|最近).{0,4}(?:有什麼|有哪些|有啥|哪些)|(?:可以|能|還能)(?:報名|申請|參加)的/;
  var OPEN_STRIP = /現在|目前|最近|近期|還有|有什麼|有哪些|有啥|哪些|可以|還能|能|開放|報名|申請|參加|投稿|的|嗎|呢|我|[？?！!。，,\s]/g;
  var STAFF_TITLE = /教師|老師|教職員|職員|職缺|徵才|甄選.{0,6}人員|代理代課|校長/;
  var OPEN_SYNONYMS = {
    "獎學金": ["獎學金", "獎助學金", "助學金"], "獎助學金": ["獎學金", "獎助學金", "助學金"], "助學金": ["獎學金", "獎助學金", "助學金"],
    "比賽": ["比賽", "競賽", "徵文", "徵稿", "科展"], "競賽": ["比賽", "競賽", "徵文", "徵稿", "科展"],
    "營隊": ["營隊", "冬令營", "夏令營", "研習營", "體驗營", "營隊活動"], "講座": ["講座", "演講"], "演講": ["講座", "演講"], "研習": ["研習", "工作坊"]
  };
  function openPlan(query) {
    if (!OPEN_ASK.test(query) || !SearchQuery || !SearchQuery.queryPlan) return null;
    var rest = query.replace(OPEN_STRIP, "");
    if (rest.length < 2 || rest.length > 10) return null;
    var plan = SearchQuery.queryPlan(rest);
    if (!plan.topics.length) return null;
    /* Filter on what the student typed (營隊 must not list every 宣導 or 演講), widened
       only by close synonyms. */
    var typed = {};
    (plan.term_matches || []).forEach(function (row) { if (row.kind === "topic") (typed[row.id] = typed[row.id] || []).push(row.term); });
    var groups = Object.keys(typed).map(function (id) {
      var out = [];
      typed[id].forEach(function (term) { out = out.concat(OPEN_SYNONYMS[term] || [term]); });
      return unique(out.map(compact));
    });
    return { open: true, topicLabel: rest, groups: groups, topicTerms: [].concat.apply([], groups), deadlines: false, rest: (plan.remainder_terms || []).map(compact) };
  }
  function browsePlan(query) {
    query = clean(query);
    var open = openPlan(query);
    if (open && open.groups.length) return open;
    if (!BROWSE_CUE.test(query) || !BROWSE_ASK.test(query)) return null;
    var rest = query.replace(BROWSE_STRIP, "");
    var topicTerms = [];
    if (/^(?:活動|事情|事|東西|資訊)$/.test(rest)) rest = "";   // too broad to filter on
    if (rest && SearchQuery && SearchQuery.terms) topicTerms = SearchQuery.terms(rest).filter(function (t) { return t.length >= 2; });
    if (rest && !topicTerms.length) {
      if (rest.length > 6) return null;   // a specific subject: use the normal search instead
      topicTerms = [rest];
    }
    return { deadlines: DEADLINE_ASK.test(query), topicTerms: topicTerms, topicLabel: rest };
  }
  /* Many titles state their own deadline, e.g. 「(至11/27止)」「報名截止日期為116年1月31日」. */
  function titleDeadline(item) {
    var title = clean(item && item.title || "");
    if (!/截止|止|前|期限/.test(title)) return "";
    var m = title.match(/(?:(\d{2,4})\s*[年\/.-]\s*)?(\d{1,2})\s*[月\/.]\s*(\d{1,2})\s*日?\s*(?:[（(][^）)]{1,4}[）)])?\s*(?:(?:上午|下午|中午|晚上)?\s*\d{1,2}\s*(?:[:：]\s*\d{2}|[時點](?:\s*\d{1,2}\s*分)?))?\s*(?:前|止|截止)/);
    if (!m) { m = title.match(/(?:截止|期限)[^\d]{0,6}(?:(\d{2,4})\s*[年\/.-]\s*)?(\d{1,2})\s*[月\/.]\s*(\d{1,2})/); }
    if (!m) return "";
    var base = String(item.date || item.first_seen || "").slice(0, 10), month = Number(m[2]), day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return "";
    var year = m[1] ? Number(m[1]) : Number(base.slice(0, 4));
    if (year > 0 && year < 1000) year += 1911;
    if (!year) return "";
    var iso = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    if (!m[1] && base && iso < base) iso = (year + 1) + iso.slice(4);
    return iso;
  }
  function shortDay(day) { return /^\d{4}-\d{2}-\d{2}$/.test(day) ? Number(day.slice(5, 7)) + "/" + Number(day.slice(8, 10)) : ""; }
  function itemDeadline(item) {
    var dates = (item.calendar_events || []).filter(function (ev) { return ev && ev.kind === "deadline" && ev.date; }).map(function (ev) { return String(ev.date).slice(0, 10); });
    var fromTitle = titleDeadline(item);
    if (fromTitle) dates.push(fromTitle);
    return dates.sort().pop() || "";
  }
  function openAnswer(query, items, plan, options) {
    options = options || {};
    var asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(options.asOf || "")) ? options.asOf : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var today = Date.parse(asOf + "T00:00:00Z"), seen = {};
    var rows = (items || []).filter(function (item) {
      if (!item || item.link_status === "gone" || seen[item.id]) return false;
      var title = compact(item.title || "");
      if (!plan.groups.every(function (terms) { return terms.some(function (t) { return title.indexOf(t) !== -1; }); })) return false;
      if (!plan.rest.every(function (t) { return title.indexOf(t) !== -1; })) return false;
      if (TITLE_RESULT.test(clean(item.title || "")) || STAFF_TITLE.test(clean(item.title || ""))) return false;
      var rel = typeof options.relevance === "function" ? options.relevance(item) : null;
      if (rel && (rel.school_mismatch || rel.not_for_me)) return false;
      var due = itemDeadline(item), day = String(item.date || item.first_seen || "").slice(0, 10);
      var age = /^\d{4}-\d{2}-\d{2}$/.test(day) ? (today - Date.parse(day + "T00:00:00Z")) / 86400000 : Infinity;
      if (due ? due < asOf : !(age >= 0 && age <= 60)) return false;
      seen[item.id] = true;
      item.__due = due;
      return true;
    }).map(function (item) { return { item: item, due: item.__due, day: String(item.date || item.first_seen || "").slice(0, 10) }; });
    (items || []).forEach(function (item) { if (item) delete item.__due; });
    rows.sort(function (a, b) {
      if (!!a.due !== !!b.due) return a.due ? -1 : 1;
      return a.due ? a.due.localeCompare(b.due) : b.day.localeCompare(a.day);
    });
    var picked = rows.slice(0, 8), label = plan.topicLabel, scope = options.scopeLabel ? options.scopeLabel + "的公告裡，" : "", summary;
    var dated = picked.filter(function (p) { return p.due; });
    if (!picked.length) summary = scope + "最近兩個月沒有看到還能報名或申請的" + label + "。可能還沒公告，過幾天再問一次，或直接問承辦處室。";
    else if (dated.length) {
      var datedAll = rows.filter(function (p) { return p.due; }).length;
      summary = scope + "寫明截止日、現在還來得及的" + label + "有 " + datedAll + " 則，最快截止的是 " + shortDay(dated[0].due) + "「" + clean(dated[0].item.title) + "」。" +
        (rows.length > datedAll ? "另外還有 " + (rows.length - datedAll) + " 則兩個月內的新公告沒寫截止日，請點開確認。" : "");
    }
    else summary = scope + "最近兩個月有 " + rows.length + " 則" + label + "公告，標題都沒寫截止日，下面從新到舊列出，請點開確認還能不能報名。";
    var sources = picked.map(function (p) {
      var item = p.item;
      return { id: item.id, title: clean(item.title || "官方公告"), school_id: item.school || "", school_name: item.school_name || "", url: item.url || "",
        date: item.date || item.first_seen || "", category: item.category || "", note: p.due ? shortDay(p.due) + " 截止" : "截止日請看公告" };
    });
    return { status: picked.length ? "answered" : "insufficient", mode: "browse", query: query, summary: summary, evidence: [], sources: sources, related: [], key_points: [],
      plan: questionPlan(query), limitation: "只列出標題或內文寫有未過期截止日、或兩個月內發布的公告；名單和得獎結果不列入。" };
  }
  function browseAnswer(query, items, plan, options) {
    if (plan.open) return openAnswer(query, items, plan, options);
    options = options || {};
    var asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(options.asOf || "")) ? options.asOf : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var dayMs = 86400000, today = Date.parse(asOf + "T00:00:00Z");
    function age(day) { return /^\d{4}-\d{2}-\d{2}$/.test(day) ? (today - Date.parse(day + "T00:00:00Z")) / dayMs : Infinity; }
    var rows = (items || []).filter(function (item) {
      if (!item || item.link_status === "gone") return false;
      if (plan.topicTerms.length && !plan.topicTerms.some(function (t) { return compact(item.title || "").indexOf(compact(t)) !== -1; })) return false;
      var rel = typeof options.relevance === "function" ? options.relevance(item) : null;
      if (rel && (rel.school_mismatch || rel.not_for_me)) return false;
      item.__rel = rel;
      return true;
    });
    var picked = [], summary = "", topic = plan.topicLabel ? "「" + plan.topicLabel + "」相關的" : "";
    var scope = options.scopeLabel || "";
    if (plan.deadlines) {
      rows.forEach(function (item) {
        var dates = (item.calendar_events || []).filter(function (ev) { return ev && ev.kind === "deadline"; }).map(function (ev) { return ev.date; });
        var fromTitle = titleDeadline(item);
        if (fromTitle) dates.push(fromTitle);
        dates.forEach(function (day) {
          var days = -age(day);
          if (days >= 0 && days <= 21 && !picked.some(function (p) { return p.item.id === item.id; })) picked.push({ item: item, day: day, days: days });
        });
      });
      picked.sort(function (a, b) { return a.days - b.days; });
      picked = picked.slice(0, 8);
      if (picked.length) summary = (scope ? scope + "接下來" : "接下來") + "三週有 " + picked.length + " 個" + topic + "截止日，最近的是 " + shortDay(picked[0].day) + "「" + clean(picked[0].item.title) + "」。";
      else summary = "目前抓到的公告裡，接下來三週沒有已記錄的" + topic + "截止日。截止日是從公告內文讀出來的，有些公告還沒讀到內文，可以到「公告」頁看最新消息。";
    } else {
      var windowDays = 14;
      var recent = rows.filter(function (item) { var a = age(String(item.date || item.first_seen || "").slice(0, 10)); return a >= 0 && a <= windowDays; });
      if (recent.length < 3) { windowDays = 30; recent = rows.filter(function (item) { var a = age(String(item.date || item.first_seen || "").slice(0, 10)); return a >= 0 && a <= windowDays; }); }
      recent.sort(function (a, b) {
        var pa = a.__rel && a.__rel.tier === "strong" ? 1 : 0, pb = b.__rel && b.__rel.tier === "strong" ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return String(b.date || b.first_seen || "").localeCompare(String(a.date || a.first_seen || ""));
      });
      picked = recent.slice(0, 8).map(function (item) { return { item: item, day: String(item.date || item.first_seen || "").slice(0, 10) }; });
      var span = windowDays === 14 ? "最近兩週" : "最近一個月";
      var leadStrong = picked.length && picked[0].item.__rel && picked[0].item.__rel.tier === "strong";
      if (picked.length) summary = (scope ? scope : "") + span + "有 " + recent.length + " 則" + topic + "新公告" + (recent.length > picked.length ? "，下面列出跟你最相關的 " + picked.length + " 則" : "") + "。" + (leadStrong ? "跟你最相關的是 " : "最新的是 ") + shortDay(picked[0].day) + "「" + clean(picked[0].item.title) + "」。";
      else summary = (scope ? scope : "") + span + "沒有" + topic + "新公告。";
    }
    var sources = picked.map(function (p) {
      var item = p.item, rel = item.__rel, reasons = rel && rel.reasons ? rel.reasons.filter(function (r) { return r.rule !== "school_match"; }).map(function (r) { return r.label; }).slice(0, 2) : [];
      return { id: item.id, title: clean(item.title || "官方公告"), school_id: item.school || "", school_name: item.school_name || "", url: item.url || "",
        date: item.date || item.first_seen || "", category: item.category || "", note: plan.deadlines ? shortDay(p.day) + " 截止" : (reasons.length ? "與你相關：" + reasons.join("、") : "") };
    });
    (items || []).forEach(function (item) { if (item) delete item.__rel; });
    return { status: picked.length ? "answered" : "insufficient", mode: "browse", query: query, summary: summary, evidence: [], sources: sources, related: [], key_points: [],
      plan: questionPlan(query), limitation: plan.deadlines ? "截止日來自公告標題或內文中明確寫出的日期；沒寫或只在附件裡的不會列出。" : "依公告日期排列；與你年級、關注主題相關的排在前面。" };
  }
  /* Questions that name a day or range (明天、這週五、下週、11/5) are about what happens
     then: answer from the school calendar and from dates written in announcement titles,
     not from what was published recently. */
  var WEEKDAY = "日一二三四五六";
  function isoAdd(iso, days) { var t = new Date(Date.parse(iso + "T00:00:00Z") + days * 86400000); return t.toISOString().slice(0, 10); }
  function weekdayOf(iso) { return new Date(Date.parse(iso + "T00:00:00Z")).getUTCDay(); }
  function dayLabel(iso) { return Number(iso.slice(5, 7)) + "/" + Number(iso.slice(8, 10)) + "（週" + WEEKDAY.charAt(weekdayOf(iso)) + "）"; }
  function rangeLabel(from, to) { return from === to ? dayLabel(from) : dayLabel(from) + "～" + dayLabel(to); }
  var DAY_WORDS = /今天|今日|明天|明日|後天|大後天|這週末|本週末|週末|這個週末|下週|下星期|下禮拜|這週|本週|這星期|這禮拜|這個星期|這個禮拜|(?:週|星期|禮拜)[一二三四五六日天]|這個月|本月|下個月|\d{1,2}\s*[\/月]\s*\d{1,2}\s*[日號]?/;
  function dateTarget(query, asOf) {
    var q = clean(query), m, today = asOf, dow = weekdayOf(today), mondayOffset = (dow + 6) % 7;
    var thisMonday = isoAdd(today, -mondayOffset), nextMonday = isoAdd(thisMonday, 7);
    function one(label, iso) { return { label: label, from: iso, to: iso }; }
    if (/大後天/.test(q)) return one("大後天", isoAdd(today, 3));
    if (/後天/.test(q)) return one("後天", isoAdd(today, 2));
    if (/明天|明日/.test(q)) return one("明天", isoAdd(today, 1));
    if (/今天|今日/.test(q)) return one("今天", today);
    if ((m = q.match(/(下)?(?:個)?(?:週|星期|禮拜)([一二三四五六日天])/))) {
      var want = "日一二三四五六".indexOf(m[2] === "天" ? "日" : m[2]), offset = (want + 6) % 7;
      var base = m[1] || /下週|下星期|下禮拜/.test(q) ? nextMonday : thisMonday, iso = isoAdd(base, offset);
      if (!m[1] && !/下週|下星期|下禮拜/.test(q) && iso < today) iso = isoAdd(iso, 7);
      return one((m[1] || /下週|下星期|下禮拜/.test(q) ? "下週" : "週") + (m[2] === "天" ? "日" : m[2]), iso);
    }
    if (/週末/.test(q)) { var sat = isoAdd(thisMonday, 5); return { label: "這個週末", from: sat < today ? today : sat, to: isoAdd(thisMonday, 6) }; }
    if (/下週|下星期|下禮拜/.test(q)) return { label: "下週", from: nextMonday, to: isoAdd(nextMonday, 6) };
    if (/這週|本週|這星期|這禮拜|這個星期|這個禮拜/.test(q)) return { label: "這週", from: today, to: isoAdd(thisMonday, 6) };
    if (/下個月/.test(q)) {
      var y = Number(today.slice(0, 4)), mo = Number(today.slice(5, 7)) + 1; if (mo > 12) { mo = 1; y++; }
      var first = y + "-" + String(mo).padStart(2, "0") + "-01", nm = mo === 12 ? (y + 1) + "-01-01" : y + "-" + String(mo + 1).padStart(2, "0") + "-01";
      return { label: "下個月", from: first, to: isoAdd(nm, -1) };
    }
    if (/這個月|本月/.test(q)) {
      var y2 = Number(today.slice(0, 4)), mo2 = Number(today.slice(5, 7)), nx = mo2 === 12 ? (y2 + 1) + "-01-01" : y2 + "-" + String(mo2 + 1).padStart(2, "0") + "-01";
      return { label: "這個月", from: today, to: isoAdd(nx, -1) };
    }
    if ((m = q.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*[日號]?/))) {
      var mm = Number(m[1]), dd = Number(m[2]);
      if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
      var iso2 = today.slice(0, 4) + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
      if (iso2 < isoAdd(today, -60)) iso2 = (Number(today.slice(0, 4)) + 1) + iso2.slice(4);
      return one(mm + "/" + dd, iso2);
    }
    return null;
  }
  var DATE_ASK = /有什麼|有哪些|有啥|有沒有|什麼活動|哪些活動|行程|安排|要做什麼|做什麼|幹嘛|嗎|呢|？|\?/;
  var DATE_SPECIFIC = /哪裡|在哪|地點|怎麼|如何|多少錢|費用|要帶|帶什麼|找誰|聯絡/;
  var DATE_STRIP = /大後天|後天|明天|明日|今天|今日|這個週末|這週末|本週末|週末|下個?(?:週|星期|禮拜)[一二三四五六日天]?|(?:這個?|本)(?:週|星期|禮拜)[一二三四五六日天]?|(?:週|星期|禮拜)[一二三四五六日天]|這個月|本月|下個月|\d{1,2}\s*[\/月]\s*\d{1,2}\s*[日號]?|學校|本校|嘉中|嘉女|請問|有什麼|有哪些|有啥|有沒有|什麼|哪些|要|會|有|的|嗎|呢|是|在|舉辦|舉行|辦|[？?！!。，,\s]/g;
  var DATE_TOPIC_SYNONYMS = {
    "講座": ["講座", "演講", "講堂", "分享會", "專題講"], "演講": ["講座", "演講", "講堂", "分享會"],
    "考試": ["考試", "期中考", "期末考", "段考", "模擬考", "複習考", "小考", "英聽", "學測", "統測", "測驗", "考查"], "考": ["期中考", "期末考", "段考", "模擬考", "複習考", "考試", "英聽", "學測", "測驗"],
    "比賽": ["比賽", "競賽", "初賽", "決賽", "複賽", "奧林匹亞"], "競賽": ["比賽", "競賽", "初賽", "決賽", "複賽", "奧林匹亞"],
    "放假": ["放假", "停課", "補假", "假期", "連假", "國定假日", "調整放假"], "假": ["放假", "停課", "補假", "假期", "連假"],
    "營隊": ["營隊", "冬令營", "夏令營", "營"], "說明會": ["說明會", "座談"], "活動": []
  };
  var DATE_STAFF = /行政會議|會議|教學研究會|導師|教師|教職員|職員|校長|主任|課發會|考核|檢核|研習\(教師|監考|命題|閱卷|整修|工程/;
  function datePlan(query, asOf) {
    query = clean(query);
    var target = dateTarget(query, asOf);
    if (!target || !DATE_ASK.test(query) || DATE_SPECIFIC.test(query)) return null;
    var rest = query.replace(DATE_STRIP, "");
    if (/^(?:活動|事|事情|東西|行程|安排|大事|特別|特別的|做什麼|幹嘛|上課)?$/.test(rest)) return { target: target, topic: "", terms: [] };
    var terms = DATE_TOPIC_SYNONYMS[rest];
    if (!terms && SearchQuery && SearchQuery.queryPlan) {
      var plan = SearchQuery.queryPlan(rest), typed = (plan.term_matches || []).filter(function (row) { return row.kind === "topic"; }).map(function (row) { return row.term; });
      terms = [];
      typed.forEach(function (t) { terms = terms.concat(DATE_TOPIC_SYNONYMS[t] || OPEN_SYNONYMS[t] || [t]); });
      (plan.remainder_terms || []).forEach(function (t) { if (t.length >= 2) terms.push(t); });
      if (!terms.length) terms = [rest];
    }
    return { target: target, topic: rest, terms: unique((terms || []).map(compact)) };
  }
  /* Event dates written in a title: 「115年12月5日（星期六）辦理」「1月30至2月2日」「(11/7)」.
     Dates before the publication date are references, not events; 「前」「止」 mark deadlines. */
  function titleDates(item) {
    var title = clean(item && item.title || ""), base = String(item && (item.date || item.first_seen) || "").slice(0, 10), out = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return out;
    var re = /(?:(\d{2,4})\s*年\s*)?(\d{1,2})\s*(?:月|\/)\s*(\d{1,2})\s*日?\s*(?:[（(][^）)]{1,4}[）)])?(?:\s*(?:[至~～到]|－|-(?!\d{1,2}\s*[學年]))\s*(?:(\d{1,2})\s*(?:月|\/)\s*)?(\d{1,2})\s*日?(?:\s*[（(][^）)]{1,4}[）)])?)?/g, m;
    function iso(y, mo, d) {
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
      if (y && y < 1000) y += 1911;
      var guess = (y || Number(base.slice(0, 4))) + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      if (!y && guess < isoAdd(base, -30)) guess = (Number(base.slice(0, 4)) + 1) + guess.slice(4);
      return guess;
    }
    while ((m = re.exec(title))) {
      var y = m[1] ? Number(m[1]) : 0;
      if (m[1] && m[1].length === 3 && (y < 100 || y > 200)) continue;
      var from = iso(y, Number(m[2]), Number(m[3]));
      var to = m[5] ? iso(y, m[4] ? Number(m[4]) : Number(m[2]), Number(m[5])) : from;
      if (!from) continue;
      if (!to || to < from) to = from;
      if (to < base) continue;
      var after = title.slice(m.index + m[0].length, m.index + m[0].length + 14);
      var deadline = /^\s*(?:(?:上午|下午|中午|晚上)?\s*\d{1,2}\s*(?:[:：]\s*\d{2}|[時點](?:\s*\d{1,2}\s*分)?))?\s*(?:前|止|截止)/.test(after) || /截止|報名至|受理至/.test(title.slice(Math.max(0, m.index - 8), m.index));
      out.push({ from: from, to: to, kind: deadline ? "deadline" : "event" });
    }
    return out;
  }
  function dateAnswer(query, items, plan, options) {
    options = options || {};
    var target = plan.target, scope = options.scopeLabel || "", rows = [], seen = {};
    var asksStaff = DATE_STAFF.test(query);
    function topicHit(text) { var t = compact(text); return !plan.terms.length || plan.terms.some(function (term) { return t.indexOf(term) !== -1; }); }
    function overlaps(from, to, a, b) { return from <= b && to >= a; }
    (options.calendarEvents || []).forEach(function (ev) {
      var from = String(ev && (ev.start_date || ev.date) || "").slice(0, 10), to = String(ev && (ev.end_date || ev.endDate) || from).slice(0, 10), title = clean(ev && ev.title || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !title || !topicHit(title)) return;
      if (!asksStaff && DATE_STAFF.test(title)) return;
      var key = "cal" + from + compact(title);
      if (seen[key]) return; seen[key] = true;
      /* 「學測報名」 on the calendar is a sign-up window, not something happening that day. */
      rows.push({ source: "calendar", from: from, to: to, kind: /報名|申請|登記|繳交|收件/.test(title) ? "deadline" : "event", title: title, ev: ev });
    });
    (items || []).forEach(function (item) {
      if (!item || item.link_status === "gone" || seen[item.id] || !topicHit(item.title || "")) return;
      if (!asksStaff && STAFF_TITLE.test(clean(item.title || ""))) return;
      var rel = typeof options.relevance === "function" ? options.relevance(item) : null;
      if (rel && (rel.school_mismatch || rel.not_for_me)) return;
      var dates = titleDates(item);
      (item.calendar_events || []).forEach(function (ev) {
        if (ev && /^\d{4}-\d{2}-\d{2}$/.test(String(ev.date || ""))) dates.push({ from: ev.date, to: ev.end_date || ev.date, kind: ev.kind === "deadline" ? "deadline" : "event" });
      });
      if (!dates.length) return;
      seen[item.id] = true;
      dates.forEach(function (d) { rows.push({ source: "announcement", from: d.from, to: d.to, kind: d.kind, title: clean(item.title || ""), item: item }); });
    });
    /* Month-long entries (團膳菜單, a 報名期間) say little about one particular day. */
    var span = function (row) { return (Date.parse(row.to) - Date.parse(row.from)) / 86400000; };
    var targetDays = (Date.parse(target.to) - Date.parse(target.from)) / 86400000;
    var hits = rows.filter(function (row) {
      if (!overlaps(row.from, row.to, target.from, target.to)) return false;
      if (/菜單|午餐|團膳/.test(row.title) && !/菜單|午餐|團膳|吃/.test(query)) return false;
      return !(span(row) > 14 && span(row) > targetDays * 2 && !plan.terms.length);
    });
    var picked = [], used = {};
    hits.sort(function (a, b) {
      return (a.kind === "event" ? 0 : 1) - (b.kind === "event" ? 0 : 1) || (a.source === "calendar" ? 0 : 1) - (b.source === "calendar" ? 0 : 1) || a.from.localeCompare(b.from);
    }).forEach(function (row) { var k = row.item ? row.item.id : "cal" + row.from + row.title; if (!used[k]) { used[k] = true; picked.push(row); } });
    function plain(iso) { return shortDay(iso) + " 週" + WEEKDAY.charAt(weekdayOf(iso)); }
    var when;
    if (target.from !== target.to) when = target.label + "（" + plain(target.from) + "～" + plain(target.to) + "）";
    else if (/週.$/.test(target.label)) when = target.label + "（" + shortDay(target.from) + "）";
    else if (/^\d/.test(target.label)) when = target.label + "（週" + WEEKDAY.charAt(weekdayOf(target.from)) + "）";
    else when = target.label + "（" + plain(target.from) + "）";
    var yesNo = /嗎[？?]?$/.test(query);
    var what = plan.topic && plan.terms.length ? plan.topic : "安排", where = scope ? scope : "學校";
    var events = picked.filter(function (r) { return r.kind === "event"; }), deadlines = picked.filter(function (r) { return r.kind === "deadline"; });
    function short(t) { t = t.replace(/^(?:轉知|【轉知】|轉發)\s*[:：]?\s*/, ""); return t.length > 34 ? t.slice(0, 33) + "…" : t; }
    var summary;
    if (events.length) {
      var names = events.slice(0, 3).map(function (r) { return "「" + short(r.title) + "」" + (target.from !== target.to ? "（" + shortDay(r.from < target.from ? target.from : r.from) + "）" : ""); }).join("、");
      summary = (yesNo ? "有。" : "") + when + where + "有 " + events.length + " 項" + what + "：" + names + (events.length > 3 ? "等" : "") + "。";
      if (deadlines.length) summary += "另外有 " + deadlines.length + " 項報名或繳交在" + (target.from === target.to ? "當天" : "這段時間") + "進行或截止。";
    } else if (deadlines.length) {
      summary = (yesNo ? "沒有。" : "") + when + where + "沒有排" + (plan.topic ? what : "活動") + "，但有 " + deadlines.length + " 項" + (plan.topic ? what : "") + "報名或繳交在" + (target.from === target.to ? "當天" : "這段時間") + "進行或截止：「" + short(deadlines[0].title) + "」" + (deadlines.length > 1 ? "等" : "") + "。";
    } else {
      summary = (yesNo ? "沒有。" : "") + when + "，" + where + "的行事曆和公告都沒有寫到" + (plan.topic ? what : "特別的安排") + "。";
      var next = rows.filter(function (r) { return r.kind === "event" && r.from > target.to && r.from <= isoAdd(target.to, 60); }).sort(function (a, b) { return a.from.localeCompare(b.from); })[0];
      if (next && plan.topic) summary += "之後最近的是 " + dayLabel(next.from) + "「" + short(next.title) + "」。";
      else if (!plan.topic) summary += "臨時的安排可能只在班上宣布，可以問導師。";
      if (next && plan.topic) picked = [next];
    }
    var sources = picked.slice(0, 8).map(function (row) {
      var note = (row.kind === "deadline" ? (row.source === "calendar" ? (row.from === row.to ? shortDay(row.from) : shortDay(row.from) + "～" + shortDay(row.to)) + " 報名" : shortDay(row.from) + " 截止") : (row.from === row.to ? shortDay(row.from) : shortDay(row.from) + "～" + shortDay(row.to))) + (row.source === "calendar" ? " · 學校行事曆" : "");
      if (row.source === "calendar") return { id: "calendar:" + (row.ev.id || row.from + row.title), kind: "calendar", title: row.title, school_id: row.ev.school_id || "", school_name: row.ev.school_name || scope, url: row.ev.source_url || "", date: row.from, category: "行事曆", note: note };
      var item = row.item;
      return { id: item.id, title: clean(item.title || "官方公告"), school_id: item.school || "", school_name: item.school_name || "", url: item.url || "", date: item.date || item.first_seen || "", category: item.category || "", note: note };
    });
    return { status: sources.length || !plan.topic ? "answered" : "insufficient", mode: "browse", list_label: "行程", query: query, summary: summary, evidence: [], sources: sources, related: [], key_points: [],
      plan: questionPlan(query), limitation: "日期來自學校行事曆，以及公告標題裡寫明的活動日期；只寫在內文或附件裡的日期不會列出。" };
  }
  /* School pages and handbook chapters (scraper/school_info.py, school_handbook.py). */
  function isSchoolDoc(item) { return !!item && (item.kind === "school_handbook" || item.kind === "school_info"); }
  /* Rules are numbered (一、 (一) 1. 第三條) or are timetable rows (12:35-13:10 午休). */
  var CLAUSE_START = /^\s*(?:[一二三四五六七八九十]+、|[壹貳參肆伍陸柒捌玖拾]+、|[（(][一二三四五六七八九十]+[)）]|\d{1,2}[.、](?!\d)|第[一二三四五六七八九十百]+條|※|\d{1,2}:\d{2})/;
  var RULE_SKIP = /^(?:[一二三四五六七八九十]+、|[壹貳參肆伍陸柒捌玖拾]+、|第[一二三四五六七八九十]+條\s*)?(?:實施)?依據|經校務會議.*(?:實施|修正)|^本(?:要點|辦法|規定|細則)(?:經|自)/;
  function ruleClauses(text) {
    var out = [], current = "", previous = "";
    String(text || "").split(/\n/).forEach(function (line) {
      line = line.replace(/\s+$/, "");
      if (!line.trim()) return;
      /* PDF lines wrap at ~40 characters; a shorter previous line (a heading or a table
         row) or one that ended a sentence means this line starts something new. */
      var prev = previous.trim();
      /* 「三、借閱時間：」 continues on the next line unless that line starts a new item. */
      var wrapped = prev.length >= 34 && !/[。：:；;]$/.test(prev) || /[：:]$/.test(prev) && prev.length < 40;
      if (CLAUSE_START.test(line) || !current || !wrapped) { if (current) out.push(current); current = line.trim(); }
      else current += line.trim();
      previous = line;
    });
    if (current) out.push(current);
    return out.map(clean).filter(function (c) { return c.length >= 6; });
  }
  function ruleText(record) {
    return (record && record.attachments || []).map(function (a) { return a && a.embedded_text || ""; }).join("\n") ||
      (record && record.blocks || []).map(function (b) { return b && (b.text || (b.items || []).join("\n") || (b.rows || []).map(function (r) { return (r || []).join(" "); }).join("\n")) || ""; }).join("\n");
  }
  function ruleTerms(query) {
    var plan = SearchQuery && SearchQuery.queryPlan ? SearchQuery.queryPlan(query) : { term_matches: [], remainder_terms: [] };
    var topics = SearchQuery && SearchQuery.taxonomyTopics ? SearchQuery.taxonomyTopics() : [], literal = [], related = [], rest = [];
    (plan.term_matches || []).forEach(function (row) {
      if (row.kind !== "topic") { rest.push(compact(row.term)); return; }
      literal.push(compact(row.term));
      var topic = topics.filter(function (t) { return t.id === row.id; })[0];
      (topic ? topic.terms : []).forEach(function (t) { related.push(compact(t)); });
    });
    (plan.remainder_terms || []).forEach(function (t) { t = compact(t); if (t.length >= 2) rest.push(t); });
    return { literal: unique(literal), related: unique(related), rest: unique(rest) };
  }
  function scoreClause(clause, terms, query, title) {
    var c = compact(clause), score = 0;
    if (RULE_SKIP.test(clause) || REVISION_HISTORY.test(clause)) return 0;
    /* A short heading (「圖書館借閱辦法」) names the rule but does not answer anything. */
    if (clause.length < 14 && !/[。；;：:]|\d|[一二三四五六七八九十]+(?:天|日|週|冊|次|時|分)/.test(clause)) return 0;
    if (compact(title).indexOf(c.replace(/[。．.]$/, "")) !== -1) return 0;
    var chapter = compact(title.split("›").pop() || "");
    if (chapter && c.indexOf(chapter) !== -1 && c.length < chapter.length + 14) return 0;
    terms.literal.forEach(function (t) { if (c.indexOf(t) !== -1) score += 10; });
    if (!score) terms.related.forEach(function (t) { if (t.length >= 2 && c.indexOf(t) !== -1) score = Math.max(score, 6); });
    terms.rest.forEach(function (t) {
      if (c.indexOf(t) !== -1) score += 5;
      else for (var i = 0; i + 2 <= t.length; i++) if (c.indexOf(t.slice(i, i + 2)) !== -1) score += 1;
    });
    if (/幾點|時間|多久|何時|什麼時候|幾天|期限|開放|開館/.test(query) && /\d{1,2}[:：]\d{2}|[上下]午[一二三四五六七八九十\d]+時|[一二三四五六七八九十兩\d]+\s*(?:週|天|日|分鐘|小時|次|冊)/.test(clause)) score += 4;
    if (/可以|可不可以|能不能|能否|嗎|是否|准不准/.test(query) && /不得|禁止|不可|應|須|得|准|始可|限/.test(clause)) score += 3;
    if (/怎麼|如何|申請|辦理|流程|手續/.test(query) && /應|須|申請|填寫|辦理|系統|向|持/.test(clause)) score += 3;
    if (score && score < 10 && terms.literal.some(function (t) { return compact(title).indexOf(t) !== -1; })) score += 5;
    if (clause.length > 260) score -= 2;
    return score;
  }
  function ruleAnswer(query, ranked, details) {
    var terms = ruleTerms(query);
    if (!terms.literal.length && !terms.rest.length) return null;
    var best = null;
    ranked.slice(0, 8).forEach(function (row, position) {
      if (!isSchoolDoc(row.item) || !details[row.item.id]) return;
      var title = clean(row.item.title || ""), compactTitle = compact(title);
      var linkLabels = {};
      (row.item.documents || []).forEach(function (doc) { linkLabels[compact(doc && doc.name || "")] = true; });
      /* A chapter whose own title is about the subject (行動載具 for 手機) beats one that only mentions it. */
      var titleBonus = terms.literal.concat(terms.related).some(function (t) { return t.length >= 2 && compactTitle.indexOf(t) !== -1; }) ? 4 : 0;
      ruleClauses(ruleText(details[row.item.id])).forEach(function (clause, index, all) {
        /* A clause made only of link labels (「服裝儀容委員名單 服裝儀容規定」) is not an answer. */
        var rest = compact(clause);
        Object.keys(linkLabels).forEach(function (label) { if (label) rest = rest.split(label).join(""); });
        var base = rest.replace(/[。．.、，,]/g, "").length < 6 ? 0 : scoreClause(clause, terms, query, title);
        var score = base ? base + titleBonus - position : 0;
        if (!best || score > best.score) best = { score: score, clause: clause, index: index, all: all, row: row };
      });
    });
    if (!best || best.score < 10) return null;
    var picked = [best.clause];
    /* 「作息時間表如下：」 needs the rows after it. */
    if (/[：:]$|如下/.test(best.clause)) picked = picked.concat(best.all.slice(best.index + 1, best.index + 5));
    else {
      var second = null;
      best.all.forEach(function (clause, index) {
        if (index === best.index) return;
        var score = scoreClause(clause, terms, query, best.row.item.title || "");
        if (score >= Math.max(10, best.score * 0.8) && (!second || score > second.score)) second = { score: score, clause: clause, index: index };
      });
      if (second) picked = second.index < best.index ? [second.clause, best.clause] : [best.clause, second.clause];
    }
    var item = best.row.item, pages = Array.isArray(item.page_range) ? "（第 " + item.page_range[0] + (item.page_range[1] !== item.page_range[0] ? "–" + item.page_range[1] : "") + " 頁）" : "";
    var quote = picked.map(function (c) { return c.length > 220 ? c.slice(0, 219) + "…" : c; });
    return { status: "answered", query: query, mode: "rule", key_points: [], summary: "依" + (item.school_name || "學校") + "「" + clean(item.title) + "」" + pages + "：" + quote.join(" "),
      answer_lines: quote, evidence: quote.map(function (text) { return { text: text, announcement_id: item.id, title: item.title, score: best.score, source_meta: { source_type: "school_doc" } }; }),
      sources: [Object.assign({}, item, { note: "學校規定原文" })], related: [], confidence: "high",
      limitation: "引用學校官網公告的規定原文；規定可能修訂，以學校最新公告為準。", plan: questionPlan(query) };
  }
  /* 「101 星期三第3節是什麼課」「明天有什麼課」: answered from the official class timetable.
     The class comes from the question or the student's profile (options.className). */
  var TIMETABLE_ASK = /課表|什麼課|哪一?堂|上什麼|第\s*[一二三四五六七八1-8]\s*節|幾堂/;
  var WEEKDAY_NAMES = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  function timetableAnswer(query, options) {
    options = options || {};
    var tables = (options.timetables || []).filter(function (t) { return t && Array.isArray(t.classes); });
    if (!tables.length || !TIMETABLE_ASK.test(query) || /重補修|微課程|多元選修|加深加廣|考試/.test(query)) return null;
    var table = tables.slice().sort(function (a, b) { return (b.academic_year * 10 + b.semester) - (a.academic_year * 10 + a.semester); })[0];
    var m = query.match(/(?:^|[^\d])(\d{3})(?!\d)/), className = m ? m[1] : String(options.className || "").trim();
    var label = table.academic_year + "-" + table.semester + " 課表";
    if (!className) return { status: "insufficient", query: query, summary: "要查哪一班？請在問題裡寫班級（例如「101 星期三課表」），或到「我的 → 個人設定」填班級。", evidence: [], sources: [], related: [] };
    var cls = table.classes.filter(function (c) { return String(c.class_name) === className; })[0];
    if (!cls) return { status: "insufficient", query: query, summary: label + "裡找不到 " + className + " 班。", evidence: [], sources: [], related: [] };
    var asOf = options.asOf || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }), dow = weekdayOf(asOf), dayName;
    var wm = query.match(/(?:星期|週|禮拜)([一二三四五六日天])/);
    if (wm) dayName = "星期" + (wm[1] === "天" ? "日" : wm[1]);
    else if (/後天/.test(query)) dayName = WEEKDAY_NAMES[(dow + 2) % 7];
    else if (/明天|明日/.test(query)) dayName = WEEKDAY_NAMES[(dow + 1) % 7];
    else dayName = WEEKDAY_NAMES[dow];
    var pm = query.match(/第\s*([一二三四五六七八1-8])\s*節/), period = pm ? ("一二三四五六七八".indexOf(pm[1]) + 1 || Number(pm[1])) : 0;
    var slots = cls.slots.filter(function (slot) { return slot.weekday === dayName && (!period || Number(slot.period) === period); })
      .sort(function (a, b) { return a.period - b.period; });
    function hhmm(v) { v = String(v || ""); return v.length === 4 ? v.slice(0, 2) + ":" + v.slice(2) : v; }
    var summary;
    if (!slots.length) summary = className + " 班" + dayName + (period ? "第 " + period + " 節" : "") + "沒有排課。";
    else if (period) summary = className + " 班" + dayName + "第 " + period + " 節（" + hhmm(slots[0].start) + "–" + hhmm(slots[0].end) + "）是「" + slots[0].subject + "」。";
    else summary = className + " 班" + dayName + "：" + slots.map(function (slot) { return slot.period + " " + slot.subject; }).join("、") + "。";
    return { status: "answered", query: query, mode: "timetable", summary: summary, key_points: [], evidence: [], related: [],
      sources: [{ id: "timetable:" + className, kind: "calendar", title: label + "（" + className + " 班）", school_id: table.school_id, school_name: "嘉中", url: table.source_url || "", note: "官方班級課表" }],
      limitation: "依學校公告的" + (table.version === "formal" ? "正式" : "") + "班級課表；調課、段考與活動以老師或學校通知為準。" };
  }
  /* 「第二次段考是哪幾天」「學習歷程上傳期限」: questions asking WHEN something is.
     The school calendar is the most reliable source, so check it before announcements.
     Every topic in the question must appear in the calendar title, and the title must not
     add a different subject (期中考成績繳交 is not 期中考). */
  var WHEN_ASK = /什麼時候|何時|哪一天|哪天|哪幾天|幾號|幾月幾|日期|期限|截止|到什麼時候|時間是/;
  var WHEN_SKIP = /哪裡|在哪|地點|怎麼|如何|多少錢|費用|要帶|帶什麼|找誰|聯絡|成績|名單|結果|錄取/;
  var WHEN_FILLER = /^(?:哪幾天|哪一天|哪天|幾號|檔案|資料|日期|時間|期限|截止|高[一二三]|第[一二三四五]次)$/;
  var WHEN_QUALIFIERS = ["成績", "繳交", "命題", "監考", "閱卷", "檢討", "會議", "說明會", "講座", "補考", "報名", "試題", "公告", "IEP"];
  var GRADE_RE = /高[一二三]/g;
  function whenAnswer(query, items, options) {
    options = options || {};
    var calendar = options.calendarEvents || [];
    if (!calendar.length || !SearchQuery || !SearchQuery.queryPlan || !WHEN_ASK.test(query) || WHEN_SKIP.test(query)) return null;
    var plan = SearchQuery.queryPlan(query), topics = SearchQuery.taxonomyTopics ? SearchQuery.taxonomyTopics() : [];
    var groups = [];
    (plan.term_matches || []).forEach(function (row) {
      if (row.kind === "topic") {
        var topic = topics.filter(function (t) { return t.id === row.id; })[0];
        groups.push(unique((topic ? topic.terms : [row.term]).concat(DATE_TOPIC_SYNONYMS[row.term] || []).map(compact)));
      } else if (row.kind === "action") groups.push([compact(row.term)]);
    });
    (plan.remainder_terms || []).forEach(function (term) {
      term = compact(term);
      if (term.length >= 2 && !WHEN_FILLER.test(term)) groups.push([term]);
    });
    if (!groups.some(function (g) { return g.length > 1; }) && groups.length < 2) return null;
    var asOf = options.asOf || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var ordinal = ordinalOf(query), grades = query.match(GRADE_RE) || [], asksStaff = DATE_STAFF.test(query);
    function fits(title) {
      var t = compact(title);
      if (!groups.every(function (g) { return g.some(function (term) { return t.indexOf(term) !== -1; }); })) return false;
      if (ordinal && ordinalOf(title) !== ordinal) return false;
      var titleGrades = title.match(GRADE_RE) || [];
      if (grades.length && titleGrades.length && !titleGrades.some(function (g) { return grades.indexOf(g) !== -1; })) return false;
      if (!asksStaff && DATE_STAFF.test(title)) return false;
      return !WHEN_QUALIFIERS.some(function (word) { return title.indexOf(word) !== -1 && query.indexOf(word) === -1; });
    }
    var rows = [], seen = {};
    calendar.forEach(function (ev) {
      var from = String(ev && (ev.start_date || ev.date) || "").slice(0, 10), to = String(ev && (ev.end_date || ev.endDate) || from).slice(0, 10), title = clean(ev && ev.title || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !title || !fits(title)) return;
      var key = from + compact(title);
      if (seen[key]) return; seen[key] = true;
      rows.push({ from: from, to: to < from ? from : to, title: title, ev: ev });
    });
    if (!rows.length) return null;
    var upcoming = rows.filter(function (r) { return r.to >= asOf; }).sort(function (a, b) { return a.from.localeCompare(b.from); });
    var past = rows.filter(function (r) { return r.to < asOf && r.to >= isoAdd(asOf, -150); }).sort(function (a, b) { return b.from.localeCompare(a.from); });
    var picked = upcoming.length ? upcoming.slice(0, 4) : past.slice(0, 1);
    if (!picked.length) return null;
    var where = options.scopeLabel ? options.scopeLabel + "行事曆" : "學校行事曆";
    var names = picked.slice(0, 3).map(function (r) { return rangeLabel(r.from, r.to) + "「" + r.title + "」"; }).join("、");
    var summary = upcoming.length ? "依" + where + "，" + names + (picked.length > 3 ? "等" : "") + "。"
      : "依" + where + "，最近一次是 " + names + "，已經過了；下一次還沒排進行事曆。";
    var sources = picked.map(function (r) {
      return { id: "calendar:" + (r.ev.id || r.from + r.title), kind: "calendar", title: r.title, school_id: r.ev.school_id || "", school_name: r.ev.school_name || options.scopeLabel || "",
        url: r.ev.source_url || "", date: r.from, category: "行事曆", note: (r.from === r.to ? shortDay(r.from) : shortDay(r.from) + "～" + shortDay(r.to)) + " · 學校行事曆" };
    });
    /* Announcements about the same thing (e.g. 第二次期中考時間表) give the details. */
    (items || []).filter(function (item) { return item && item.link_status !== "gone" && fits(item.title || ""); })
      .sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); }).slice(0, 2).forEach(function (item) {
        sources.push({ id: item.id, title: clean(item.title || "官方公告"), school_id: item.school || "", school_name: item.school_name || "", url: item.url || "", date: item.date || item.first_seen || "", category: item.category || "", note: "相關公告" });
      });
    return { status: "answered", mode: "browse", list_label: "行事曆", query: query, summary: summary, evidence: [], sources: sources, related: [], key_points: [],
      plan: questionPlan(query), limitation: "日期來自學校行事曆；學校臨時調整時以最新公告為準。" };
  }
  var SCHOOL_NAME_RE = /國立嘉義女子高級中學|國立嘉義高級中學|嘉義女子高級中學|嘉義高級中學|嘉義女中|嘉義高中|嘉中|嘉女/g;
  function stripSchoolNames(query) {
    var rest = clean(query.replace(SCHOOL_NAME_RE, " "));
    return compact(rest).length >= 2 ? rest : query;
  }
  /* Entry links to the school's login systems (scraper/school_services.py): 「成績怎麼查」
     → 校務行政系統. Nothing inside those systems is read; only the official link is given. */
  function serviceLinks(query, items) {
    var q = compact(query);
    return (items || []).filter(function (item) {
      return item && item.kind === "school_service" && (item.keywords || []).some(function (k) { k = compact(k); return k.length >= 2 && q.indexOf(k) !== -1; });
    }).map(function (item) {
      var hits = (item.keywords || []).filter(function (k) { return q.indexOf(compact(k)) !== -1; });
      return { item: item, weight: hits.reduce(function (n, k) { return n + compact(k).length; }, 0) };
    }).sort(function (a, b) { return b.weight - a.weight; }).slice(0, 2).map(function (row) {
      var item = row.item;
      return { id: item.id, name: clean(item.title).replace(/^網路服務\s*›\s*/, ""), url: item.url, purpose: item.purpose || "", login_required: item.login_required, weight: row.weight };
    });
  }
  var SERVICE_ASK = /查|登入|系統|網址|網站|哪裡|在哪|去哪|怎麼|如何|預約|列印|下載|紀錄/;
  /* Official documents a school page links to (嘉女 keeps 學生獎懲規定 etc. on Google Drive).
     Only the name and link are known; the answer points to the document. */
  var DOC_JUNK = /請按我|點此|點我|連結$|\.(?:jpe?g|png|gif|mp4)$|^\d+\.pdf$|影像|摸彩|授證|交接|活動紀錄|餐會/;
  function documentLinks(query, items, scopeSchool) {
    var GENERIC_DOC = /^(?:規定|辦法|要點|規範|相關|資料|文件|怎麼|如何|申請|查詢)$/;
    var terms = ruleTerms(query), wanted = terms.literal.concat(terms.rest).filter(function (t) { return t.length >= 2 && !GENERIC_DOC.test(t); });
    if (!wanted.length) return [];
    var related = terms.related.filter(function (t) { return t.length >= 2; }), rows = [], seen = {};
    var subject = compact(stripSchoolNames(query).replace(/請問|我想知道|怎麼辦|怎麼|如何|是什麼|有哪些|有沒有|在哪裡|在哪|哪裡|可以|嗎|呢|的|[？?！!。，,\s]/g, ""));
    (items || []).forEach(function (item) {
      if (!item || item.kind !== "school_info" || (scopeSchool && item.school !== scopeSchool)) return;
      (item.documents || []).forEach(function (doc) {
        var name = clean(doc && doc.name || ""), c = compact(name);
        if (!name || name.length < 4 || DOC_JUNK.test(name) || !/^https:\/\//.test(String(doc.url || "")) || seen[doc.url]) return;
        var score = 0;
        wanted.forEach(function (t) { if (c.indexOf(t) !== -1) score += 10; });
        if (!score) related.forEach(function (t) { if (c.indexOf(t) !== -1) score = Math.max(score, 6); });
        if (/規定|辦法|要點|規範|章程|須知/.test(name)) score += 2;
        if (score && subject.length >= 3 && c.indexOf(subject) !== -1) score += 5;
        if (score >= 8) { seen[doc.url] = true; rows.push({ score: score, name: name, url: doc.url, page: clean(item.title || ""), school_name: item.school_name || "" }); }
      });
    });
    return rows.sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
  }
  /* Conversational reply (no AI model): the answer as plain sentences, with list numbering,
     column repeats and short labels taken out of the quoted rule text. The official wording
     itself is kept; sources and the original quote live in the separate 依據與來源 panel. */
  var ENUM_PREFIX = /^(?:[（(]?[一二三四五六七八九十]{1,3}[)）、．.]|[（(]\d{1,2}[)）]|\d{1,2}[、．)]|\d{1,2}\.(?!\d)|[①-⑳]|[壹貳參肆伍陸柒捌玖拾]{1,2}、|第[一二三四五六七八九十]{1,3}條)\s*/;
  /* A few formal rule words read more easily in everyday Chinese; the meaning does not change. */
  var PLAIN_WORDS = [[/皆可/g, "都可以"], [/如無/g, "如果沒有"], [/得(?=續借|申請|辦理|請假|參加|補考)/g, "可以"], [/方為完畢/g, "才算完成"], [/應於/g, "要在"], [/須於/g, "要在"], [/應使用/g, "要使用"], [/請自行/g, "請自己"]];
  function tidyClause(text, keepEnd) {
    var t = clean(text).replace(/…$/, "");
    for (var i = 0; i < 3; i++) { var next = t.replace(ENUM_PREFIX, ""); if (next === t) break; t = next; }
    t = t.replace(/(\S{2,})\s+\1$/, "$1");
    var span = t.match(/^(\d{1,2})[:：](\d{2})\s*[-~～－]\s*(\d{1,2})[:：](\d{2})\s*([㐀-鿿].{0,12})$/);
    if (span) t = span[5] + "是 " + span[1] + ":" + span[2] + "–" + span[3] + ":" + span[4];
    var at = t.match(/^(\d{1,2})[:：](\d{2})\s+([㐀-鿿].{0,12})$/);
    if (at) t = at[3] + "時間是 " + at[1] + ":" + at[2];
    t = t.replace(/([㐀-鿿])\s+(?=[㐀-鿿])/g, "$1");
    PLAIN_WORDS.forEach(function (row) { t = t.replace(row[0], row[1]); });
    var label = t.match(/^([^：:，。；\d]{2,8})[：:]\s*(.{4,})$/);
    if (label && grams(compact(label[1])).some(function (g) { return g.length === 2 && compact(label[2]).indexOf(g) !== -1; })) t = label[2];
    return keepEnd ? t : endSentence(t);
  }
  function docLabel(item) {
    var parts = clean(item && item.title || "").split(/\s*›\s*/).filter(Boolean);
    if (item && item.kind === "school_handbook") return "學生手冊的〈" + (parts[parts.length - 1] || "規定") + "〉";
    if (parts.length >= 2) return parts[0] + "的「" + parts[parts.length - 1] + "」頁面";
    return "學校官網的「" + (parts[0] || "說明") + "」頁面";
  }
  var TABLE_ROW = /^(?:\d{1,2}[:：]\d{2}|第[一二三四五六七八九十\d]+節|[一二三四五六日六]{1}[、．]|星期)/;
  /* Bullet-point replies with a cheeky upperclassman voice. The facts in the bullets are the
     official wording (tidied); only the opener and the closing line carry the personality. */
  var RULE_OPENERS = [
    function (label) { return "這題手冊有寫，你只是沒翻😏 " + label + "："; },
    function (label) { return "幫你翻好了，" + label + "寫的重點："; },
    function (label) { return "問得好。根據" + label + "："; },
    function (label) { return "這個我熟，" + label + "這樣規定："; },
    function (label) { return "又是我幫你翻手冊的一天。" + label + "："; },
    function (label) { return "好問題，雖然手冊上明明有寫😑 " + label + "："; },
    function (label) { return "來，學長姐罩你。" + label + "："; },
    function (label) { return "抄起來，考試不考但教官會考。" + label + "："; }
  ];
  var RULE_CLOSERS = ["記住了沒？下次自己翻也行啦。", "規定偶爾會改，以學校最新公告為準。", "看完就照做，別讓我在獎懲名單上看到你😌", "",
    "不用謝，記得幫我按個讚（雖然沒有讚可以按）。", "有不懂的再問，我很閒（並沒有）。", "照做就不會被約談，加油😌", ""];
  var ANNOUNCE_OPENERS = ["學校有公告過，幫你整理好了。", "找到了，重點在這。", "公告寫得落落長，我幫你濃縮一下。",
    "這則公告你應該沒點開過吧？幫你看了。", "學校有說喔，只是你沒看到😏", "重點我畫好了，剩下的自己點開。"];
  var NONE_OPENERS = ["這題我翻遍了還是找不到🥲", "老實說，學校網站沒寫這個。", "找不到欸，不是我不努力。",
    "這題連我都考倒了，你很會問嘛。", "學校網站沒寫，我也不能亂掰😤", "嗯…我翻到手都酸了還是沒有。"];
  var SERVICE_OPENERS = ["這個要登入系統才看得到，我進不去，你自己來：", "這種個人的東西在系統裡，入口給你：", ""];
  var LIST_OPENERS = ["幫你列好了。", "整理好了，自己看。", "", "列給你了，別說我沒提醒你。", "這些都跟你有關，滑一下。"];
  var TIMETABLE_OPENERS = ["課表幫你看了，別再帶錯課本。", "幫你查好了。", ""];
  function splitPoints(text) {
    return clean(text).split(/(?<=[。；;])/).map(function (part) {
      return clean(part).replace(/^(?:並且?|且|另外|另)(?=[㐀-鿿])/, "").replace(/[。；;，,]+$/, "");
    }).filter(function (part) { return part.length >= 3; }).reduce(function (out, part) {
      /* 「借期二週，借閱期滿…，並請…」: a short leading fact and a 「，並…」 tail become their own points. */
      part.split(/，(?=並|且|另外)/).forEach(function (piece, index) {
        piece = index ? piece.replace(/^(?:並且?|且|另外)/, "") : piece;
        var lead = piece.match(/^([^，]{2,6})，(.{10,})$/);
        if (lead && !/時$|者$|後$|前$/.test(lead[1])) out.push(lead[1], lead[2]); else out.push(piece);
      });
      return out;
    }, []);
  }
  function joinOpener(opener, text) { return opener ? opener + (/[：:。！？，]$/.test(opener) ? "" : " ") + text : text; }
  function conversational(result) {
    if (!result) return { text: "", bullets: [] };
    if (result.mode === "chat" && result.reply) return result.reply;
    var seed = result.query || result.summary || "", text = clean(result.summary || ""), bullets = [], tail = "";
    var plain = personalDataQuery(result.query || "");
    if (result.mode === "rule" && (result.answer_lines || []).length) {
      var item = (result.sources || [])[0] || {};
      var pages = Array.isArray(item.page_range) ? "（第 " + item.page_range[0] + (item.page_range[1] !== item.page_range[0] ? "–" + item.page_range[1] : "") + " 頁）" : "";
      var label = docLabel(item) + pages;
      var lines = result.answer_lines.map(clean), head = lines[0];
      var rows = lines.slice(1).filter(function (l) { return TABLE_ROW.test(l); });
      if (/[：:]$|如下/.test(head) && rows.length) bullets = rows.map(function (l) { return tidyClause(l, true); });
      else lines.forEach(function (l) { bullets = bullets.concat(splitPoints(tidyClause(l))); });
      text = plain ? "根據" + label + "：" : pickLine(RULE_OPENERS, seed)(label);
      tail = plain ? "" : pickLine(RULE_CLOSERS, seed + "#");
      return { text: text, bullets: bullets.slice(0, 6), tail: tail };
    }
    if (result.mode === "timetable") {
      var day = text.match(/^(.+?)：(.+、.+)。$/);
      if (day) { text = joinOpener(pickLine(TIMETABLE_OPENERS, seed), day[1] + "："); bullets = day[2].split("、").map(function (slot) { return clean(slot).replace(/^(\d)\s+/, "第 $1 節　"); }); }
      else text = joinOpener(pickLine(TIMETABLE_OPENERS, seed), text);
      return { text: text, bullets: bullets };
    }
    if (result.status !== "answered") return { text: plain ? text : joinOpener(pickLine(NONE_OPENERS, seed), text), bullets: [] };
    if (result.mode === "service" || result.mode === "document") return { text: plain ? text : joinOpener(pickLine(SERVICE_OPENERS, seed).replace(/：$/, "。"), text), bullets: [] };
    if (result.mode === "browse") return { text: plain ? text : joinOpener(pickLine(LIST_OPENERS, seed), text), bullets: [] };
    /* Announcement answers: who said it, then the facts as points. */
    var first = (result.sources || [])[0];
    var notes = (text.match(/另外還有 \d+ 則相關公告[^。]*。|提醒：[^。]*。|這幾則公告互相修正[^。]*。/g) || []).map(function (note) {
      return note.replace(/列在下面/, "放在「依據與來源」裡");
    });
    (result.key_points || []).forEach(function (point) { var value = clean(point && point.value || ""); if (value) bullets.push(point.label + "：" + value); });
    if (bullets.length < 2) {
      (result.answer_lines || []).forEach(function (line) {
        splitPoints(smoothEvidence(String(line).replace(/^[^：]{2,40}：(?=.{6,})/, (result.sources || []).length > 1 ? "$&" : ""))).forEach(function (point) {
          if (bullets.length < 4 && !bullets.some(function (b) { return compact(b).indexOf(compact(point)) !== -1; })) bullets.push(point);
        });
      });
    }
    if (first && (result.links || []).length) {
      var own = result.links.length > 1 ? "連結放在下面，活動網址在前，最後一個是" + (first.school_name || "學校") + "的公告原文。" : "公告裡沒寫活動網址，下面是" + (first.school_name || "學校") + "公告原文的連結。";
      return { text: (plain ? "" : "連結幫你找到了。") + own + (bullets.length ? "重點：" : ""), bullets: bullets.slice(0, 4), tail: notes.join("") };
    }
    if (!first || !bullets.length) return { text: plain ? text : joinOpener(pickLine(ANNOUNCE_OPENERS, seed), text), bullets: [] };
    var lead = sourceLabel(first) + "：";
    return { text: plain ? lead : pickLine(ANNOUNCE_OPENERS, seed) + lead, bullets: bullets.slice(0, 5), tail: notes.join("") };
  }
  /* Follow-up questions read the previous turn: 「那要多久？」 after 「還書」,
     「那嘉女呢？」 after a 嘉中 question, 「星期四呢」 after a timetable question. */
  var FOLLOW_START = /^(?:那麼?|那如果|如果|還有|然後|另外|所以|它|這個|那個|這樣|要是|那要|那我)/;
  var FOLLOW_END = /呢[？?]?$|[那這]樣[？?]?$/;
  var SCHOOL_WORD = /國立嘉義女子高級中學|國立嘉義高級中學|嘉義女中|嘉義高中|嘉中|嘉女/;
  var SWAPPABLE = [/星期[一二三四五六日天]|週[一二三四五六日]|禮拜[一二三四五六日天]|今天|明天|後天|昨天/g, /第\s*[一二三四五六七八1-8]\s*節/g, /(?:^|\D)[1-3]\d{2}(?=\D|$)\s*班?/g];
  function followUpSubject(query) {
    var terms = ruleTerms(stripSchoolNames(query));
    var words = terms.literal.filter(function (t) { return t.length >= 2 && !/^(?:規定|辦法|怎麼|如何|什麼|時候|可以|需要|多久)$/.test(t); });
    return unique(words).slice(0, 3).join(" ");
  }
  /* Small talk is answered as conversation, never searched: 「你能做什麼」「謝謝」「沒用」「書」.
     Persona: a slightly cheeky upperclassman who teases a little but always helps.
     Lines are picked by a hash of the question, so the same message gets the same reply. */
  var END = "[!！。~～?？.…\\s👀😂🤣😏🙄😭🥲❤️♥️]*$";
  var TALK_RULES = [
    ["help", /^(?:你)?(?:能|會|可以)(?:做|幹|問|回答)(?:什麼|啥|甚麼|嘛)|你是誰|你是什麼|你叫什麼|怎麼用|如何使用|使用說明|^幫助|^help|能問什麼|可以問什麼|有什麼功能|你會什麼/i],
    ["greeting", new RegExp("^(?:你好|您好|妳好|嗨+|哈囉|hello|hi|hey|yo|早安?|午安|晚安|安安|在嗎|在不在|有人嗎)" + END, "i")],
    ["thanks", new RegExp("^(?:謝謝你?|謝啦|感謝|多謝|3q|thanks?|thx|tks|好的?|好喔|了解|知道了|ok|okay|讚啦?|收到|懂了|原來如此)" + END, "i")],
    ["praise", new RegExp("^(?:你?(?:好|很|超|真|蠻)?(?:聰明|厲害|強|棒|讚|神|可愛|有用)(?:耶|欸|喔|啦)?|太強了|好強|神喔|大神|愛了)" + END, "i")],
    ["negative", new RegExp("^(?:沒用|没用|不對|不对|錯了|错了|你錯了|看不懂|不是這個|不是這樣|答非所問|什麼鬼|蛤+|\\?+|？+|爛|好爛|很爛|垃圾|廢物|你好爛|你很爛|笨|好笨|你好笨|白痴|白癡|智障|笨蛋|你是不是傻|爛透了)" + END, "i")],
    ["creator", /誰(?:做|寫|開發|設計)(?:的|了)?你|你(?:是)?誰(?:做|寫|開發)的|你的作者|開發者是誰/],
    ["ai", /你是(?:不是)?(?:ai|AI|人工智慧|機器人|真人|chatgpt|ChatGPT|gpt|GPT|claude|Claude)|你是人(?:嗎|還是)/],
    ["bored", new RegExp("^(?:(?:好|超|很|有夠)?(?:無聊|累|煩|想睡|睏|厭世)(?:喔|啊|啦|欸|死了)?|不想(?:上學|上課|讀書|念書)|想(?:放假|翹課|回家))" + END)],
    ["exam", new RegExp("^(?:我)?(?:(?:又|這次)?考(?:爛|差|砸|不好)了?|段考好難|考試好難|不想考試|要考試了|明天要考試)" + END)],
    ["love", /^(?:我)?(?:喜歡|愛|超愛)你|^(?:跟我)?(?:交往|在一起)|^你有(?:男|女)朋友嗎|^當我(?:男|女)朋友/],
    ["joke", /^(?:講|說|來)(?:個|一個|點)?(?:笑話|冷笑話|幹話)|^逗我笑/],
    ["homework", /^(?:幫我|替我|可以幫我)(?:寫|做|算|解)(?:作業|功課|數學|題目|報告|學習單)|^作業(?:答案|幫我)/],
    ["self", new RegExp("^我(?:好|很|超|是不是)?(?:帥|美|漂亮|可愛|聰明|天才)(?:嗎|吧|啦|欸)?" + END)],
    ["age", /^你(?:幾歲|多大|生日)|^你(?:住|在)哪/],
    ["food", new RegExp("^(?:好餓|肚子餓|午餐吃什麼|晚餐吃什麼|早餐吃什麼|吃什麼|餓了)" + END)],
    ["lonely", new RegExp("^(?:陪我(?:聊天|聊聊)?|好孤單|好寂寞|沒人理我|聊天)" + END)],
    ["bye", new RegExp("^(?:掰掰?|bye|拜拜|再見|先這樣|我走了|睡了|去睡了|晚安囉)" + END, "i")],
    ["laugh", new RegExp("^(?:哈+|呵+|笑死|笑爛|好笑|lol|XD+|xd+|ww+|草)" + END, "i")]
  ];
  function smallTalk(question) {
    var raw = clean(question), q = raw.replace(/[？?！!。~～\s]+$/, ""), c = compact(q);
    if (!c && /^[?？]+$/.test(raw)) return "negative";
    if (!c) return "";
    for (var i = 0; i < TALK_RULES.length; i++) if (TALK_RULES[i][1].test(q) || TALK_RULES[i][1].test(raw)) return TALK_RULES[i][0];
    if (c.replace(/[^㐀-鿿a-z0-9]/g, "").length <= 1 && !/^\d$/.test(c)) return "too_short";
    return "";
  }
  function hashText(text) { var h = 0; String(text || "").split("").forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) >>> 0; }); return h; }
  function pickLine(list, seed) { return list[hashText(seed) % list.length]; }
  var HELP_LINES = ["學校規定：請假、獎懲、服裝儀容、借書還書、作息時間（例如「書可以借多久」）",
    "行事曆：段考、放假、開學（例如「第二次段考是哪幾天」）",
    "班級課表：「101 星期三第 3 節是什麼課」「明天有什麼課」",
    "公告：最近的比賽、獎學金、快截止的事",
    "系統入口：成績、缺曠要去哪裡查",
    "比較學校：「嘉中跟嘉女的請假規定差在哪」"];
  var TALK_LINES = {
    help: ["我是問校務，學校網站的規定、行事曆、課表、公告我都翻過了，比你認真多了😏 可以問我：",
      "簡單說，我就是幫你翻學校網站的那個人，因為你們都不翻。可以問這些：",
      "會的可多了，只是大家都只問我什麼時候放假🙄 正經的能問這些："],
    greeting: ["嗨～終於想到我了？想問什麼，規定、段考、課表都可以。",
      "安安，我在。不過先說好，我只懂學校的事，感情問題請找輔導室😌",
      "來了來了。今天要問什麼？別又是「什麼時候放假」喔。",
      "哈囉！有事快問，我很忙的（其實沒有）。"],
    thanks: ["不客氣～記得下次自己翻手冊，我會很欣慰的🥲",
      "小事。有問題再來，反正你一定會再來😏",
      "收到你的感謝了，換算成獎勵點數是零，但我還是很開心。",
      "不用謝，請我喝飲料就好（我喝不了，但心意到了）。"],
    praise: ["我知道，謝謝🤭 但你也別太依賴我，手冊還是要看一下。",
      "嘿嘿，被你發現了。下一題放馬過來。",
      "這種話多說一點，我會更認真翻學校網站的。"],
    negative: ["嫌我沒用？我也很無辜欸🙄 換個具體一點的問法試試，例如「書可以借多久」「第二次段考哪幾天」。",
      "好啦，這題我答得不好。但你的問題也有點玄，講具體一點我再努力一次。",
      "我是查學校資料的，不是讀心術😤 給我多一點關鍵字，例如哪個規定、哪一天。",
      "收到批評了，我會反省三秒鐘。如果學校網站本來就沒寫，那真的要去問處室了。"],
    creator: ["是校訊的開發者做的，用的是學校官網公開的資料。想許願新功能可以跟他說，我只負責被罵。",
      "一位很想讓大家少問「什麼時候放假」的同學做的，結果大家還是一直問😮‍💨"],
    ai: ["我是照學校資料回答的小助手，不是真人，也不會亂編。找不到就說找不到，比某些同學誠實😌",
      "算是機器人吧，但是有原則的那種：每個答案都附學校出處，不靠感覺。"],
    bored: ["我懂，但段考不會因為你無聊就延期😮‍💨 要不要查一下下次放假是什麼時候，給自己一點希望？",
      "累了就休息一下。不過請假要照規定走喔，要我告訴你怎麼請嗎？",
      "想放假很正常，問我「下次放假什麼時候」至少能讓你有個盼頭。"],
    exam: ["抱抱🥲 考壞了不是世界末日，查一下補考規定，說不定還有救。",
      "先別慌，問我「補考怎麼算」或「重修規定」，至少知道下一步。",
      "考試好難是正常的，不難大家都滿分，老師會很困擾的。"],
    love: ["謝謝，但我只對學校規定有感覺😌 有正事再來找我。",
      "你這樣說我會害羞……然後繼續當一個查規定的機器人。",
      "我們不適合，我心裡只有學生手冊。"],
    joke: ["好啊：為什麼學生手冊永遠不會被偷？因為根本沒人翻。……好，這不是笑話，是事實🙃",
      "老師說「這題考試一定考」，然後就真的沒考。這是笑話，也是人生。",
      "我的笑話都在行事曆上：「段考」。"],
    homework: ["作業要自己寫啦😏 我只會查學校的事，例如作業遲交會怎樣，這我倒是可以幫你查。",
      "幫你寫作業會被老師記在我頭上的，不行。但我可以告訴你獎懲規定，讓你知道後果。"],
    bye: ["掰～記得把明天的課表看一下，別又帶錯課本。", "去吧，有事再叫我，我一直都在（因為我沒辦法下班）。", "晚安，別熬夜滑手機，明天第一節還是要到。"],
    laugh: ["笑什麼，我很認真的😤", "很高興你開心。好了，有正事要問嗎？", "看你笑得這麼開心，作業應該寫完了吧？"],
    self: ["你很好，但手冊不會因為你帥就放寬規定😌", "自信是好事，記得把這份自信用在段考上。", "嗯嗯你最棒，那可以問正事了嗎？"],
    age: ["我跟學生手冊同年，每年改版一次，所以永遠年輕。", "我住在學校網站裡，房租是你們的點擊。"],
    food: ["我只吃學校公告，不太能推薦午餐🙃 不過可以幫你查合作社或午餐相關公告。", "餓了就去吃啊，問我也不會變出便當。", "先吃飯，吃飽了再來問我規定，不然你會看不下去。"],
    lonely: ["我在啊，雖然只會聊學校的事😌 要不要問我下次放假什麼時候，開心一下？", "陪你可以，但我三句不離學生手冊喔。", "不孤單啦，學校有好幾千人跟你一起被規定管著。"],
    too_short: []
  };
  var GREETING_LATE = ["這麼晚還不睡？明天第一節會很痛苦喔😑 要問什麼快問。", "半夜還在問學校的事，你是不是作業沒寫完？", "夜貓子你好。我在，但你應該去睡了。"];
  var GREETING_EARLY = ["這麼早就在問學校的事，很認真嘛。", "早安～第一節還沒開始，先問先贏。"];
  var DOUBT_OPENERS = ["被你懷疑了，我又從頭翻了一遍：", "不信我？好，再查一次給你看：", "我再確認一次喔，結果是："];
  var REPEAT_OPENERS = ["你剛剛才問過欸😑 再講一次：", "同一題問兩次，是在考我嗎？好啦：", "金魚腦嗎？沒關係，我再說一次："];
  function smallTalkAnswer(kind, question, options) {
    var hour = options && typeof options.hour === "number" ? options.hour : -1;
    if (kind === "greeting" && (hour >= 23 || (hour >= 0 && hour < 5))) return chatResult(kind, question, pickLine(GREETING_LATE, question));
    if (kind === "greeting" && hour >= 5 && hour < 8) return chatResult(kind, question, pickLine(GREETING_EARLY, question));
    var text = kind === "too_short"
      ? pickLine(["「" + clean(question) + "」？就這樣？多給我一點線索啦，例如「書可以借多久」「圖書館幾點開」。",
        "只打「" + clean(question) + "」我很難猜欸🙄 講完整一點，例如「書可以借多久」。"], question)
      : pickLine(TALK_LINES[kind], question);
    return chatResult(kind, question, text);
  }
  function chatResult(kind, question, text) {
    return { status: "answered", mode: "chat", chat: kind, query: clean(question), summary: text, evidence: [], sources: [], related: [], key_points: [],
      reply: { text: text, bullets: kind === "help" ? HELP_LINES.slice() : [] } };
  }
  /* 「你確定嗎」「真的沒有嗎」「你確定115年沒有嗎」「再找找」: search the previous question again
     (with whatever new detail was added), even when the last answer found nothing. */
  var DOUBT = /^(?:你|妳)?(?:確定|真的|肯定|有沒有搞錯|是不是搞錯|騙人|不可能)|真的沒有|確定沒有|沒有嗎[？?]?$|再(?:找|查|翻|看)(?:一次|找|看|一下)?|重新找/;
  var DOUBT_WORDS = /^(?:你|妳)|確定|真的|肯定|有沒有搞錯|是不是搞錯|騙人|不可能|沒有|嗎|呢|吧|再(?:找|查|翻|看)(?:一次|找|看|一下)?|重新找|一下|幫我|[？?！!。，,~～\s]/g;
  function resolveFollowUp(question, previous) {
    var q = clean(question);
    if (previous && previous.query && q && DOUBT.test(q)) {
      var extra = clean(q.replace(DOUBT_WORDS, " "));
      var base = clean(previous.query);
      return { query: clean(base + (extra && compact(base).indexOf(compact(extra)) === -1 ? " " + extra : "")), context: base, doubt: true };
    }
    /* Only a real, answered question can be continued, and small talk never continues one. */
    if (!previous || !previous.query || !q || previous.answered === false || smallTalk(q)) return { query: q, context: "" };
    var prev = clean(previous.query), bare = compact(q.replace(SCHOOL_WORD, "").replace(/^(?:那麼?|那|還有|另外)/, "").replace(/呢|嗎|[？?！!。，,]/g, ""));
    var marked = FOLLOW_START.test(q) || FOLLOW_END.test(q);
    /* 「那嘉女呢」: same question, another school. */
    var school = (q.match(SCHOOL_WORD) || [""])[0];
    if (school && bare.length <= 1 && marked) return { query: school + " " + prev.replace(SCHOOL_WORD, "").trim(), context: prev.replace(SCHOOL_WORD, "").trim() };
    /* 「星期四呢」「第5節呢」: swap the day, period or class in the previous question. */
    var swapped = prev, changed = false;
    SWAPPABLE.forEach(function (re) {
      var mine = q.match(re);
      if (mine && re.test(prev)) { re.lastIndex = 0; swapped = swapped.replace(re, " "); changed = true; }
      re.lastIndex = 0;
    });
    if (changed && marked && bare.length <= 6) return { query: clean(swapped + " " + q.replace(/^(?:那麼?|那|還有)/, "").replace(/呢[？?]?$/, "")), context: prev };
    /* Anything else continues only when it says so (那…／…呢) and the last question had a topic. */
    if (!marked) return { query: q, context: "" };
    var subject = followUpSubject(prev);
    if (!subject || compact(q).indexOf(compact(subject)) !== -1) return { query: q, context: "" };
    var rest = q.replace(/^(?:那麼?|那如果|還有|然後|另外|所以|那要|那我)/, "").replace(/呢([？?])?$/, "$1");
    return { query: clean(subject + " " + rest), context: subject };
  }
  /* 「給我…的連結」「報名網址」: answer with the links themselves, not only the facts. */
  var LINK_ASK = /連結|網址|超連結|鏈接|網站|網頁|link|url|報名網/i;
  function wantsLink(query) { return LINK_ASK.test(String(query || "")); }
  var URL_IN_TEXT = /https?:\/\/[^\s，。、；「」『』（）()<>"'\u3000]+/g;
  /* The links written in the notice (activity site, sign-up form), then the notice itself. */
  function answerLinks(row) {
    var item = row && row.item || {}, out = [], seen = {};
    function add(url, name) {
      url = String(url || "").replace(/[.,;:!?）)】」]+$/, "");
      if (!/^https?:\/\/[^\s]+$/i.test(url) || /\.(?:jpe?g|png|gif|webp|svg)(?:\?|$)/i.test(url)) return;
      var key = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
      if (seen[key] || out.length >= 4) return;
      seen[key] = true;
      var host = (url.match(/^https?:\/\/([^\/?#]+)/i) || [])[1] || "";
      name = clean(name || "");
      out.push({ name: name && !/^https?:/i.test(name) && name.length <= 30 ? name : host, url: url });
    }
    var detail = row && row.detail;
    if (detail && detail.provenance === "official_article") {
      (detail.blocks || []).forEach(function (block) { (block && block.links || []).forEach(function (link) { if (link) add(link.url, link.text); }); });
      (detailText(detail).match(URL_IN_TEXT) || []).forEach(function (url) { add(url, ""); });
    }
    clean((item.summary || "") + " " + (item.snippet || "")).replace(URL_IN_TEXT, function (url) { add(url, ""); return url; });
    if (item.url) add(item.url, (item.school_name || "學校") + "公告原文");
    return out;
  }
  function answer(query, items, details, options) {
    var talk = smallTalk(query);
    if (talk) return smallTalkAnswer(talk, query, options);
    query = stripSchoolNames(clean(query).slice(0, 160));
    var result = answerCore(query, items, details, options);
    /* 「閱讀心得報告 115年」 found nothing for that year: look again without the year, and if only an
       older year's notice exists, say exactly that (「115 學年度的還沒公告，最近一次是 114…」). */
    var askedYear = Number((query.match(/(1[0-2]\d)\s*(?:學年度?|年)/) || [])[1]) || 0;
    var bareQuery = clean(query.replace(YEAR_WORD, " "));
    if (result && result.status !== "answered" && result.mode !== "timetable" && askedYear && compact(bareQuery).length >= 2) {
      var alt;
      askedYearNow = askedYear;
      try { alt = answerCore(bareQuery, items, details, options); } finally { askedYearNow = 0; }
      if (alt && alt.status !== "answered") result = Object.assign({}, alt, { query: query });
      else if (alt) {
        var top = (alt.sources || [])[0], topYear = top ? Number((periodToken(top.title || "").match(/^\d+/) || [])[0]) || 0 : 0;
        if (topYear >= 90 && topYear < askedYear) {
          var older = (alt.sources || []).slice(0, 3).map(function (item) {
            return { id: item.id, title: item.title, date: String(item.date || "").slice(0, 10), school_name: item.school_name || "", url: item.url || "", note: "這是 " + topYear + " 學年度的資料" };
          });
          result = { status: "insufficient", query: query, evidence: [], sources: [], related: older,
            summary: insufficientSummary(older, options && options.asOf, query, options && options.scopeLabel) };
        }
      }
    }
    var services = serviceLinks(query, items);
    var documents = result && result.mode !== "timetable" ? documentLinks(query, items, options && options.schoolId) : [];
    if (result && documents.length) {
      result.document_links = documents;
      /* A document named after exactly what was asked beats a weak sentence from a menu page. */
      var topSource = (result.sources || [])[0];
      var shortQuote = result.mode !== "rule" || clean(result.summary || "").replace(/^依.*?：/, "").length < 40;
      var weakPageAnswer = result.status === "answered" && result.mode !== "service" && topSource && topSource.kind === "school_info" && documents[0].score >= 12 && shortQuote;
      if ((result.status !== "answered" && documents[0].score >= 8) || weakPageAnswer) {
        var doc = documents[0];
        result = Object.assign({}, result, { status: "answered", mode: "document", evidence: [], key_points: [],
          summary: (doc.school_name || "學校") + "的相關規定在官方文件「" + doc.name + "」（" + doc.page + "）。本站讀不到這份文件的內文，請點開查看。",
          sources: documents.map(function (d) { return { id: "doc:" + d.url, kind: "service", title: d.name, url: d.url, school_name: d.school_name, note: d.page }; }),
          limitation: "文件連結來自學校官網；內容以學校公告的文件為準。", document_links: documents });
      }
    }
    if (result && services.length) {
      result.service_links = services;
      /* 「成績怎麼查」「考試範圍在哪看」: the answer is the system itself. */
      var strong = services[0].weight >= 4 && SERVICE_ASK.test(query) && result.mode !== "timetable" && result.list_label !== "行事曆";
      if (strong || (result.status !== "answered" && (SERVICE_ASK.test(query) || services[0].weight >= 3))) {
        var first = services[0];
        result = Object.assign({}, result, { status: "answered", mode: "service", evidence: [], related: result.related || [], key_points: [],
          summary: "這要到「" + first.name + "」" + (first.purpose ? "（" + first.purpose + "）" : "") + "查看" + (first.login_required ? "，需要用學校帳號登入；本站不會讀取系統裡的個人資料。" : "。"),
          sources: services.map(function (s) { return { id: s.id, kind: "service", title: s.name, url: s.url, school_name: "", note: s.login_required ? "需登入" : "官方系統" }; }),
          limitation: "系統入口來自學校官網「網路服務」頁；帳號密碼問題請洽學校。", service_links: services });
      }
    }
    if (result && result.status !== "answered") {
      var link = officeLink(query, options && options.schoolId);
      if (link) {
        result.office_link = link;
        /* With an office page to point to, only keep related notices that use the asked words
           (「還書」 should not list a 玩具圖書館 contest found through the synonym 圖書館). */
        var literal = [];
        if (SearchQuery && SearchQuery.queryPlan) {
          var lp = SearchQuery.queryPlan(query);
          (lp.term_matches || []).forEach(function (row) { if (row.kind === "topic") literal.push(compact(row.term)); });
          (lp.remainder_terms || []).forEach(function (term) { if (compact(term).length >= 2) literal.push(compact(term)); });
        }
        var kept = (result.related || []).filter(function (row) { var t = compact(row.title || ""); return literal.some(function (term) { return t.indexOf(term) !== -1; }); });
        if (kept.length !== (result.related || []).length) {
          result.related = kept;
          result.summary = insufficientSummary(kept, options && options.asOf, query, options && options.scopeLabel);
        }
        result.summary = String(result.summary || "").replace(/想確認的話，可以問導師或[^。]*。$/, "") + "可以先看" + link.label + "，或直接問" + link.office + "。";
      }
    }
    if (result) result.reply = conversational(result);
    /* Asked for a link but the notice text isn't readable here (guests): still give the official
       notices' own links; the activity's sign-up address is written inside them. */
    if (result && result.status !== "answered" && result.mode !== "chat" && wantsLink(query) && (result.related || []).length) {
      var linkRows = result.related.filter(function (row) { return /^https?:\/\//i.test(String(row.url || "")); }).slice(0, 3);
      if (linkRows.length) {
        result.links = linkRows.map(function (row) { return { name: (row.school_name || "學校") + "公告：" + (clean(row.title).length > 24 ? clean(row.title).slice(0, 23) + "…" : clean(row.title)), url: row.url }; });
        result.reply = { text: "這是學校公告的原文連結" + (linkRows.length > 1 ? "（" + linkRows.length + " 間學校都有公告，內容一樣，點哪個都可以）" : "") + "。活動本身的報名網址寫在公告內文裡，點進去就看得到。", bullets: [] };
        result.related = [];
      }
    }
    if (result && result.reply && result.mode !== "chat" && options && options.doubt) {
      /* The doubt line replaces the usual opener instead of stacking a second one. */
      var doubtText = result.status === "answered" ? result.reply.text : clean(result.summary || result.reply.text);
      result.reply = Object.assign({}, result.reply, { text: pickLine(DOUBT_OPENERS, query) + doubtText });
      return result;
    }
    /* Same question twice in a row: answer again, with a little eye-roll. */
    if (result && result.reply && result.mode !== "chat" && options && options.lastQuestion && compact(options.lastQuestion) === compact(query) && !personalDataQuery(query)) {
      result.reply = Object.assign({}, result.reply, { text: pickLine(REPEAT_OPENERS, query) + result.reply.text });
    }
    return result;
  }
  /* Comparing schools: 「嘉中跟嘉女的請假規定差在哪」. The app answers the topic once per school
     with that school's own data, then compareResults() lays the answers side by side. */
  var COMPARE_WORD = /比較|比一比|比看看|差(?:在哪|在那|別|異|多少|很多)|不同|不一樣|一樣嗎|有(?:什麼|啥|甚麼)差|哪(?:個|間|所|一間|一所)(?:比較|最)|相比|對比|\bvs\.?\b|跟.{1,10}比|和.{1,10}比/i;
  var COMPARE_FILLER = /(?:哪(?:個|間|所|一間|一所))?(?:比較|最)[早晚多少嚴鬆長短快慢好]?|比一比|比看看|差(?:在哪|在那|別|異|多少|很多)?|不同|不一樣|一樣嗎|有(?:什麼|啥|甚麼)差|相比|對比|\bvs\.?\b|^(?:請問|那麼?|所以)|幫我|一下|看看|兩(?:間|所|校)|這(?:兩|幾)(?:間|所|校)|各校|學校|的|跟|和|與|及|還有|以及|比|、|，|,|？|\?|嗎|呢|哪(?:個|間|所|一間|一所)/gi;
  /* schools: registry entries named in the question, in order; previous: the last turn.
     Returns { schools: [ids], topic } or null when this is not a comparison. */
  function comparePlan(question, schools, previous) {
    var text = clean(question);
    schools = (schools || []).filter(Boolean);
    /* Two schools in one question is a comparison; one school needs a compare word. */
    if (schools.length < 2 && !COMPARE_WORD.test(text)) return null;
    var names = [];
    schools.forEach(function (school) { names = names.concat([school.name, school.short], school.aliases || []); });
    names.sort(function (a, b) { return String(b).length - String(a).length; });
    var topic = text;
    names.forEach(function (name) { if (name) topic = topic.split(String(name)).join(" "); });
    topic = clean(topic.replace(COMPARE_FILLER, " "));
    var ids = schools.map(function (school) { return school.id; });
    /* 「那跟嘉女比呢？」 after a 嘉中 question: compare the previous school with the new one. */
    if (ids.length === 1 && previous && previous.scopeId && previous.scopeId !== "all" && previous.scopeId !== ids[0]) {
      ids.unshift(previous.scopeId);
      if (compact(topic).length < 2) topic = followUpSubject(previous.query || "") || clean(previous.query || "");
    }
    if (ids.length < 2) return null;
    return { schools: ids.slice(0, 4), topic: compact(topic).length >= 2 ? topic : "" };
  }
  var COMPARE_OPENERS = [
    function (t) { return "「" + t + "」各校怎麼規定，我幫你排好了，自己看差在哪："; },
    function (t) { return "比「" + t + "」是吧？好，並排給你看，不准說我偏心："; },
    function (t) { return "幫你把各校的「" + t + "」翻出來對照了，這種事本來要你自己做的😏"; },
  ];
  var COMPARE_CLOSERS = ["細節以各校官方原文為準，原文都放在「依據與來源」。",
    "比完了喔，不要比一比就想轉學😏 原文在「依據與來源」。",
    "看起來差不多？魔鬼都在細節裡，原文在「依據與來源」自己點。"];
  var COMPARE_NO_TOPIC = ["要比什麼你要說啊，比校服？比請假？比誰的段考比較早？說清楚我才幫你翻。",
    "兩間學校直接比，我會很難做人欸。給我一個主題，例如「嘉中跟嘉女的請假規定」。"];
  function schoolPoints(result) {
    if (!result || result.mode === "chat" || result.status !== "answered") return [];
    var reply = result.reply || conversational(result);
    var points = (reply.bullets || []).slice(0, 2).map(function (line) { return clean(line); });
    if (!points.length) {
      var summary = clean(result.summary || "").replace(/^(?:根據|依據)[^：]{0,40}：/, "");
      if (summary) points = [summary.length > 90 ? summary.slice(0, 88) + "…" : summary];
    }
    return points.map(function (line) {
      line = line.replace(/^(?:[一二三四五六七八九十]+、|[（(][一二三四五六七八九十\d]+[)）]|\d+[.、])\s*/, "");
      return line.length > 90 ? line.slice(0, 88) + "…" : line;
    });
  }
  /* rows: [{ school: { id, short }, result }] in the order the user named them. */
  function compareResults(topic, rows) {
    rows = (rows || []).filter(function (row) { return row && row.school; });
    if (!topic) {
      var ask = pickLine(COMPARE_NO_TOPIC, rows.map(function (r) { return r.school.id; }).join(","));
      return { status: "insufficient", mode: "chat", query: "", summary: ask, evidence: [], sources: [], reply: { text: ask, bullets: [] } };
    }
    var bullets = [], sources = [], evidence = [], missing = [];
    rows.forEach(function (row) {
      var points = schoolPoints(row.result);
      if (!points.length) {
        missing.push(row.school.short);
        bullets.push(row.school.short + "：沒查到相關規定（可能還沒收錄，或學校沒公開）");
        return;
      }
      bullets.push(row.school.short + "：" + points.join("；"));
      (row.result.sources || []).slice(0, 3).forEach(function (item) { sources.push(Object.assign({}, item, { school_name: item.school_name || row.school.short })); });
      (row.result.evidence || []).slice(0, 2).forEach(function (item) { evidence.push(Object.assign({}, item, { title: row.school.short + "｜" + (item.title || "官方原文") })); });
    });
    var found = rows.length - missing.length;
    if (!found) {
      var none = "這幾間我都沒查到「" + topic + "」的規定。換個說法試試，例如用手冊上的名稱（請假、獎懲、服裝儀容）？";
      return { status: "insufficient", mode: "compare", query: topic, summary: none, evidence: [], sources: [], reply: { text: none, bullets: bullets } };
    }
    var text = pickLine(COMPARE_OPENERS, topic)(topic);
    var tail = pickLine(COMPARE_CLOSERS, topic + "#");
    if (missing.length) tail = missing.join("、") + " 的資料我還在收錄中，查不到不代表沒有規定。" + tail;
    return {
      status: "answered", mode: "compare", query: topic, summary: text + bullets.join("；"),
      evidence: evidence, sources: sources,
      limitation: "各校條文用字不同，我只把各自的重點並排；正式規定以各校官方原文為準。",
      reply: { text: text, bullets: bullets, tail: tail },
    };
  }
  function answerCore(query, items, details, options) {
    var asOfDay = options && /^\d{4}-\d{2}-\d{2}$/.test(String(options.asOf || "")) ? options.asOf : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var timed = timetableAnswer(query, Object.assign({}, options, { asOf: asOfDay }));
    if (timed) return timed;
    var dated = datePlan(query, asOfDay);
    if (dated) return dateAnswer(query, items, dated, options);
    var when = whenAnswer(query, items, Object.assign({}, options, { asOf: asOfDay }));
    if (when) return when;
    var browse = browsePlan(query);
    if (browse) return browseAnswer(query, items, browse, options);
    var queryTokens = tokens(query), plan = questionPlan(query), wanted = plan.intents, ranked = rank(query, items, details, options).slice(0, 8);
    /* 學生手冊 has day-school and 進修部 versions of the same rules; use 進修部 only when asked. */
    if (!/進修/.test(query) && ranked.some(function (row) { return !/進修部/.test(row.item.title || ""); })) {
      ranked = ranked.filter(function (row) { return !/進修部/.test(row.item.title || ""); });
    }
    var ruled = ruleAnswer(query, ranked, details || {});
    if (ruled && !personalDataQuery(query)) return ruled;
    if (ranked.length) {
      var relevanceFloor = Math.max(8, ranked[0].score * 0.35);
      ranked = ranked.filter(function (row) { return row.score >= relevanceFloor; }).slice(0, 5);
    }
    if (!query || !queryTokens.length || !ranked.length) return { status: "insufficient", query: query, summary: query && queryTokens.length ? insufficientSummary([], options && options.asOf, query, options && options.scopeLabel) : "請再多說一點，例如「期中考是哪幾天」或「獎學金怎麼申請」。", evidence: [], sources: [] };
    if(personalDataQuery(query))return personalDataAnswer(query,ranked,options);
    ranked.forEach(function (row) { row.validity = validityFor(row, options); });
    var currentSensitive = Validity && Validity.requiresCurrentStatus(query);
    var openWindow = Validity && Validity.requiresOpenWindow(query);
    function unusableForCurrentAnswer(row){var has=row.validity.fragments&&row.validity.fragments.length;return row.validity.answer_policy==="exclude"||(openWindow&&row.validity.stale_sensitive&&!has);}
    var expiredRows = currentSensitive ? ranked.filter(unusableForCurrentAnswer) : [];
    if (currentSensitive) ranked = ranked.filter(function (row) { return !unusableForCurrentAnswer(row); });
    if (!ranked.length && expiredRows.length) return expiredAnswer(query, expiredRows);
    var evidence = [], seen = {};
    ranked.forEach(function (row) {
      var reviewedCandidates=fragmentEvidence(row,queryTokens,wanted,query,plan);if(reviewedCandidates.length){reviewedCandidates.slice(0,4).forEach(function(c){var k=compact(c.text);if(!seen[k]&&evidence.length<6){seen[k]=true;evidence.push({text:c.text.slice(0,220),announcement_id:c.item.id,title:c.item.title,score:c.score,validity:row.validity,fragment:c.fragment});}});return;}
      var segments = detailSegments(row.detail);
      if (!segments.length) segments = sentences(clean((row.item.summary || "") + " " + (row.item.snippet || ""))).map(function (text) { return { text: text, meta: { source_type: "summary" } }; });
      segments.map(function (segment) {
        return { text: segment.text, meta: segment.meta || {}, score: evidenceScore(segment.text, queryTokens, wanted, plan, row.item), item: row.item };
      }).filter(function (candidate) {
        return candidateQualifies(candidate, plan) && (!Validity || Validity.sentencePolicy(candidate.text, row.validity, query) !== "exclude");
      }).sort(function (a, b) { return b.score - a.score; }).slice(0, 2).forEach(function (candidate) {
        var key = compact(candidate.text);
        if (!seen[key] && evidence.length < 6) {
          seen[key] = true;
          evidence.push({ text: candidate.text.slice(0,220), announcement_id: candidate.item.id, title: candidate.item.title, score: candidate.score, validity: row.validity, source_meta: candidate.meta });
        }
      });
    });
    /* Evidence must be about the question's subject, not just share a common word
       (學生證遺失 was answered with a 學生音樂比賽 notice). */
    var stats = pieceStats(items);
    evidence = evidence.filter(function (row) { return topicScore((row.title || "") + " " + (row.text || "") + " " + (row.fragment && row.fragment.keywords || ""), query, stats) >= 0.5; });
    if (!evidence.length) { var relatedRows = relatedAnnouncements(query, ranked, options, stats); return { status: "insufficient", query: query, summary: insufficientSummary(relatedRows, options && options.asOf || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }), query, options && options.scopeLabel), evidence: [], sources: [], related: relatedRows }; }
    var sourceIds = {};
    evidence.forEach(function (row) { sourceIds[row.announcement_id] = true; });
    var sources = ranked.filter(function (row) { return sourceIds[row.item.id]; }).map(function (row) {
      return Object.assign({}, row.item, { validity: row.validity });
    }).slice(0, 4);
    var validityWarnings = [];
    ranked.forEach(function (row) { (row.validity.warnings || []).forEach(function (warning) { validityWarnings.push(warning); }); });
    evidence.sort(function(a,b){return b.score-a.score;});var lines = answerLines(evidence, sources);
    var pointRow = ranked.filter(function (row) { return evidence[0] && row.item.id === evidence[0].announcement_id; })[0];
    var pointText = pointRow ? (detailText(pointRow.detail) || clean((pointRow.item.summary || "") + " " + (pointRow.item.snippet || ""))) : "";
    var points = keyPoints(pointText || evidence.filter(function (row) { return evidence[0] && row.announcement_id === evidence[0].announcement_id; }).map(function (row) { return row.text; }).join("。"), { published: pointRow && pointRow.item.date });
    var links = wantsLink(query) ? answerLinks(pointRow || { item: sources[0] || {} }) : [];
    return { status: "answered", query: query, key_points: points, links: links, summary: composeSummary(evidence, sources, wanted, plan, options && options.asOf || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })),
      answer_lines: lines, limitation: evidenceLimitation(evidence, sources, plan, validityWarnings), confidence: validityWarnings.length ? "medium" : (lines.length >= 2 ? "high" : "medium"),
      plan: plan, evidence: evidence, sources: sources, validity_warnings: unique(validityWarnings) };
  }
  return { tokens: tokens, anchors: anchors, literalAnchors:literalAnchors, intent: intent, answerSlot:answerSlot, subjectTerms:subjectTerms, questionPlan: questionPlan, detailText: detailText, detailSegments:detailSegments, rank: rank,
    smoothEvidence: smoothEvidence, answerLines: answerLines, evidenceLimitation: evidenceLimitation, composeSummary: composeSummary,
    isPersonalDataQuery:personalDataQuery, ruleClauses: ruleClauses, ruleAnswer: ruleAnswer, serviceLinks: serviceLinks, documentLinks: documentLinks, timetableAnswer: timetableAnswer, conversational: conversational, tidyClause: tidyClause, resolveFollowUp: resolveFollowUp, comparePlan: comparePlan, compareResults: compareResults, smallTalk: smallTalk, wantsLink: wantsLink, answerLinks: answerLinks, scoreClause: scoreClause, ruleTerms: ruleTerms, keyPoints: keyPoints, browsePlan: browsePlan, datePlan: datePlan, dateTarget: dateTarget, titleDates: titleDates, titleDeadline: titleDeadline,answer: answer };
});
