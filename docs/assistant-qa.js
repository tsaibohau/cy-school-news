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
    date: ["何時", "什麼時候", "日期", "截止", "幾點", "時間", "多久"],
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
  var PROCEDURE_QUESTION = /什麼時候|何時|哪天|哪一天|期程|時間|日期|怎麼查|如何查|在哪查|哪裡查|怎麼申請|如何申請|校對/;
  var RECORD_ONLY = /名單|姓名|學號|座號|身分證|電話|地址|病歷|診斷|誰錄取|誰得獎/;
  function personalDataQuery(query) {
    query = clean(query);
    if (!PERSONAL_DATA_QUERY.test(query)) return false;
    return RECORD_ONLY.test(query) || !PROCEDURE_QUESTION.test(query);
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
      if (titleYear <= current - 2) bonus -= 40;
      else if (titleYear === current - 1) bonus -= 15;
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
    return (ranked || []).filter(function (row) {
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
    var asOf = options && /^\d{4}-\d{2}-\d{2}$/.test(String(options.asOf || "")) ? options.asOf : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var queryTokens = tokens(query), anchorTokens = anchors(query), literalTokens=literalAnchors(query), wanted = intent(query), detailMap = details || {}, slot = answerSlot(query);
    if (!SearchQuery || !queryTokens.length) return [];
    var sourceItems = Array.isArray(items) ? items : [];
    var metadataRows = SearchQuery.rank ? SearchQuery.rank(sourceItems, query, { asOf: options && options.asOf, details: detailMap, validity: Validity }) : [];
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
      var anchorScore = scoreText(clean(item.title || "") + " " + overview(item) + " " + body+" "+reviewedText, anchorTokens, 1);
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
  function candidateQualifies(candidate, plan) {
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
    { label: "截止", cue: /截止|期限|前.{0,8}(?:完成|報名|繳交|上傳|送交|填寫|申請)|止[。，；]?$|受理至|報名至/, needTime: true },
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
    value = value.replace(/^[【\[（(\s]+/, "").replace(/[】\]）)\s]+$/, "");
    value = clean(value.replace(PHONE, "").replace(/^(?:[一二三四五六七八九十]+、|\(?\d{1,2}\)?[、.．])\s*/, "").replace(/[，、；;：:。]+$/, ""));
    return value.length > 60 ? value.slice(0, 58) + "…" : value;
  }
  function keyPoints(text) {
    var clauses = [];
    clean(text).split(/(?<=[。！？!?；;])|\n+/).map(clean).forEach(function (sentence) {
      if (sentence.length < 4 || sentence.length > 300) return;
      /* Long sentences often carry two facts (deadline, then event time and place). */
      if (sentence.length > 30 && !/[^\d\s][：:]/.test(sentence)) sentence.split(/[，,]/).map(clean).forEach(function (part) { if (part.length >= 4) clauses.push(part); });
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
        var value = pointValue(clause, rule.label, time);
        if (!value || value.length < 3 || !/[\u4e00-\u9fff\d]/.test(value) || points.some(function (p) { return p.value === value; })) return;
        used[rule.label] = (used[rule.label] || 0) + 1;
        points.push({ label: rule.label, value: value });
      });
    });
    var order = ["截止", "時間", "地點", "方式", "對象", "費用"];
    return points.sort(function (a, b) { return order.indexOf(a.label) - order.indexOf(b.label); }).slice(0, 6);
  }
  var PERSON_NAME_RE = /\d{3}\s*[\u4e00-\u9fff]{2,3}\s*同學|[\u4e00-\u9fff]{2,3}\s*(?:小姐|先生|女士|主任|組長|老師|教授|校長)|電洽|洽詢|聯絡人|承辦人/;
  function insufficientSummary(related, asOf) {
    if (!related || !related.length) return "我沒有在公告裡找到能回答這題的內容。可能校方還沒公告，或資訊在附件裡讀不到。";
    var top = related[0], day = String(top.date || "").slice(0, 10);
    var when = /^\d{4}-\d{2}-\d{2}$/.test(day) ? "（" + Number(day.slice(5, 7)) + " 月 " + Number(day.slice(8, 10)) + " 日）" : "";
    return "我沒有找到能直接回答這題的句子。最接近的是「" + clean(top.title) + "」" + when + "，你可以點開確認" + (top.note ? "；" + top.note : "") + "。";
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
  function answer(query, items, details, options) {
    query = clean(query).slice(0, 160);
    var queryTokens = tokens(query), plan = questionPlan(query), wanted = plan.intents, ranked = rank(query, items, details, options).slice(0, 8);
    if (ranked.length) {
      var relevanceFloor = Math.max(8, ranked[0].score * 0.35);
      ranked = ranked.filter(function (row) { return row.score >= relevanceFloor; }).slice(0, 5);
    }
    if (!query || !queryTokens.length || !ranked.length) return { status: "insufficient", query: query, summary: "目前資料不足，找不到可驗證的答案。", evidence: [], sources: [] };
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
    if (!evidence.length) { var relatedRows = relatedAnnouncements(query, ranked, options, stats); return { status: "insufficient", query: query, summary: insufficientSummary(relatedRows), evidence: [], sources: [], related: relatedRows }; }
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
    var points = keyPoints(pointText || evidence.filter(function (row) { return evidence[0] && row.announcement_id === evidence[0].announcement_id; }).map(function (row) { return row.text; }).join("。"));
    return { status: "answered", query: query, key_points: points, summary: composeSummary(evidence, sources, wanted, plan, options && options.asOf || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })),
      answer_lines: lines, limitation: evidenceLimitation(evidence, sources, plan, validityWarnings), confidence: validityWarnings.length ? "medium" : (lines.length >= 2 ? "high" : "medium"),
      plan: plan, evidence: evidence, sources: sources, validity_warnings: unique(validityWarnings) };
  }
  return { tokens: tokens, anchors: anchors, literalAnchors:literalAnchors, intent: intent, answerSlot:answerSlot, subjectTerms:subjectTerms, questionPlan: questionPlan, detailText: detailText, detailSegments:detailSegments, rank: rank,
    smoothEvidence: smoothEvidence, answerLines: answerLines, evidenceLimitation: evidenceLimitation, composeSummary: composeSummary,
    isPersonalDataQuery:personalDataQuery, keyPoints: keyPoints,answer: answer };
});
