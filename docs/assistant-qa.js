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
  var Composer = typeof window !== "undefined" ? window.CyNewsAnswerComposer : null;
  if (!Composer && typeof module !== "undefined" && module.exports) Composer = require("./answer-composer.js");
  var Tokens = typeof window !== "undefined" ? window.CyNewsTokens : null;
  if (!Tokens && typeof module !== "undefined" && module.exports) Tokens = require("./announcement-tokens.js");
  var Typo = typeof window !== "undefined" ? window.CyNewsTypo : null;
  if (!Typo && typeof module !== "undefined" && module.exports) Typo = require("./qa-typo.js");
  var Synonyms = typeof window !== "undefined" ? window.CyNewsSynonyms : null;
  if (!Synonyms && typeof module !== "undefined" && module.exports) Synonyms = require("./qa-synonyms.js");
  /* All the ways to write a term (synonym database), or just the term. */
  function synonymsOf(term) { return Synonyms ? Synonyms.expand(term) : [compact(term)]; }

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
  var PERSONAL_DATA_QUERY = /名單|姓名|學號|座號|身分證|電話|地址|成績|獎懲|缺曠|請假紀錄|健康檢查結果|病歷|診斷證明|病情診斷|低收入|補助名冊|誰錄取|誰得獎/;
  /* Asking when or how to check grades is a schedule question, not a request for records. */
  var PROCEDURE_QUESTION = /規定|辦法|要點|規範|準則|標準表|要注意|注意事項|重點|什麼時候|何時|哪天|哪一天|期程|時間|日期|怎麼查|如何查|在哪查|哪裡查|怎麼申請|如何申請|校對/;
  var RECORD_ONLY = /名單|姓名|學號|座號|身分證|電話|地址|病歷|診斷證明|病情診斷|誰錄取|誰得獎/;
  /* Asking when or where the results are published, or how to look them up, is a schedule question;
     asking for the list or someone's record itself is not. */
  var SCHEDULE_ASK = /什麼時候|何時|哪天|哪一天|幾號|哪裡|在哪|去哪|怎麼查|如何查|怎麼看|如何看|查詢方式|網址|期限|截止|公布時間|放榜/;
  var ASKS_RECORD_ITSELF = /誰|有哪些人|哪些人|有誰|幾分|多少分|排名|名次|我的|他的|她的|同學的|[\u4e00-\u9fff]{2,3}的(?:成績|電話|名字|姓名)|學號|座號|身分證|電話|地址|病歷|診斷證明|病情診斷|姓名/;
  var EXAM_RESULTS = /(?:期中考|期末考|段考|模擬考|複習考|補考|重修|重補修|學期|學測|統測|分科|英檢|會考|英聽|競賽|比賽)(?:的)?成績/;
  var PERSON_TARGET = /我的|他的|她的|同學的|[\u4e00-\u9fff]{2,3}的成績|幾分|多少分|排名|名次/;
  /* 「教務處電話」「圖書館分機」 ask for an office number, not a person's. */
  var OFFICE_CONTACT = /(?:處|室|組|館|中心|總機|學校|宿舍|合作社|校門|傳達室)(?:的)?(?:電話|分機|專線|傳真|地址)|(?:電話|分機|專線)(?:是|多少|幾號)|校址/;
  function personalDataQuery(query) {
    /* 行動電話 is a phone the student carries, not someone's phone number. */
    query = clean(query).replace(/行動電話/g, "手機");
    if (OFFICE_CONTACT.test(query) && !/學生|同學|老師的|[\u4e00-\u9fff]{2,3}的電話/.test(query.replace(/(?:處|室|組|館|中心)的電話/, ""))) return false;
    if (!PERSONAL_DATA_QUERY.test(query)) return false;
    if (SCHEDULE_ASK.test(query) && !ASKS_RECORD_ITSELF.test(query)) return false;
    /* 「重修第三梯次成績」: grades named without asking for anyone's own record point to the notice about them. */
    if (!ASKS_RECORD_ITSELF.test(query) && !PERSONAL_DATA_QUERY.test(query.replace(/成績/g, ""))) return false;
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
  var COMPACT_CACHE = new Map(), COMPACT_CHARS = 0, COMPACT_CHAR_LIMIT = 3000000;
  function compact(value) {
    var key = String(value == null ? "" : value), hit = COMPACT_CACHE.get(key);
    if (hit !== undefined) return hit;
    /* Variant characters schools use interchangeably: 佈置／布置, 臺／台, 裏／裡. */
    var out = clean(key).toLowerCase().replace(/[^0-9a-z\u3400-\u9fff]+/g, "").replace(/佈/g, "布").replace(/臺/g, "台").replace(/裏/g, "裡");
    /* Bounded by characters as well as entries: notice bodies (up to 120k characters) are keys too. */
    COMPACT_CHARS += key.length + out.length;
    if (COMPACT_CACHE.size > 20000 || COMPACT_CHARS > COMPACT_CHAR_LIMIT) { COMPACT_CACHE.clear(); COMPACT_CHARS = key.length + out.length; }
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
    if (/截止|期限|何時|什麼時候|到幾號|幾點|來得及|還能報|還可以報|報得到|還有名額|還能參加/.test(q)) return "deadline";
    if (/找誰|聯絡誰|電話|分機|承辦人|聯絡人/.test(q)) return "contact";
    if (/多少錢|費用|金額|繳費/.test(q)) return "fee";
    if (/誰可以|資格|對象|哪些人|年級/.test(q)) return "eligibility";
    if (/要帶什麼|準備什麼|需要什麼(?:資料|文件)|應備|檢附/.test(q)) return "documents";
    if (/一定要|強制|必須|自願|自由參加|需不需要/.test(q)) return "requirement";
    if (/哪裡|地點|在哪|去哪|會場|教室|地址/.test(q)) return "place";
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
  /* Notices and detail records do not change while the page is open: their derived text is kept
     per object (rank() rebuilt it for every notice on every question). */
  var OVERVIEW_CACHE = typeof WeakMap !== "undefined" ? new WeakMap() : null, DETAIL_TEXT_CACHE = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function overview(item) {
    if (!OVERVIEW_CACHE || !item || typeof item !== "object") return overviewRaw(item);
    var hit = OVERVIEW_CACHE.get(item);
    if (!hit || hit.summary !== item.summary || hit.snippet !== item.snippet) { hit = { text: overviewRaw(item), summary: item.summary, snippet: item.snippet }; OVERVIEW_CACHE.set(item, hit); }
    return hit.text;
  }
  function overviewRaw(item) {
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
    /* One segmentation for quoting and for token labels, so a label's segment number points
       at the same sentence. */
    if (Tokens) return Tokens.segmentsOf(record);
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
  /* Quotable sentences from a notice's segments. Official letters (函) in PDFs wrap every ~35
     characters, so a sentence spans several segments: join them back, and drop the letter's
     header lines (地址、承辦人、電話、第 1 頁…) and the page's 「作者：… 發佈日期：…」 line.
     Each unit keeps the index of its first segment (token labels point at segments). */
  var PAGE_META = /作者\s*[:：]\s*\S+\s*發[佈布]日期\s*[:：]\s*[\d-]+(?:\s*最後更新日期\s*[:：]\s*[\d-]+)?/g;
  var LETTER_HEADER = /^(?:第\s*\d+\s*頁[，,]?\s*共\s*\d+\s*頁|.{0,30}\s函$|(?:地址|聯絡地址|承辦人|聯絡人|聯絡方式|電話|傳真|電子(?:信箱|郵件)|E-?mail|受文者|發文日期|發文字號|速別|密等及解密條件或保密期限|附件|正本|副本|裝|訂|線)\s*[：:]?)/i;
  var LIST_START = /^\s*(?:[一二三四五六七八九十廿]+[、．]|[（(][一二三四五六七八九十\d]+[)）]|\d+[.、．](?!\d)|主旨|說明|※)/;
  function quoteUnits(segments) {
    var out = [], cur = null;
    segments.forEach(function (segment, index) {
      var text = clean(String(segment.text || "").replace(PAGE_META, " "));
      var meta = segment.meta || {};
      if (!text || /^[.．。·\s]+$/.test(text) || LETTER_HEADER.test(text)) { if (cur) { out.push(cur); cur = null; } return; }
      var sameFile = cur && cur.meta.source_type === meta.source_type && (cur.meta.filename || "") === (meta.filename || "");
      var open = cur && !/[。！？!?；;：:]$/.test(cur.text) && cur.text.length < 300;
      if (sameFile && open && meta.source_type === "attachment" && !LIST_START.test(text)) { cur.text += text; return; }
      if (cur) out.push(cur);
      cur = { text: text, meta: meta, index: index };
    });
    if (cur) out.push(cur);
    return out.filter(function (u) { return u.text.length >= 6; });
  }
  function detailText(record) {
    if (!DETAIL_TEXT_CACHE || !record || typeof record !== "object") return detailTextRaw(record);
    var hit = DETAIL_TEXT_CACHE.get(record);
    if (hit === undefined) { hit = detailTextRaw(record); DETAIL_TEXT_CACHE.set(record, hit); }
    return hit;
  }
  function detailTextRaw(record) {
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
  /* The same yearly notice (「114學年度閱讀心得報告繳交流程」 → 「115學年度閱讀心得繳交流程」):
     an old year's edition must not outrank this year's just because its wording matches the
     question more literally. Asking for a given year (「114學年度…」) keeps the year asked. */
  function newerEditionFirst(query, ranked, asOf) {
    if (ranked.length < 2 || periodToken(query)) return ranked;
    var current = currentAcademicYear(asOf), changed = false;
    ranked.forEach(function (old) {
      var year = Number((periodToken(old.item.title || "").match(/^\d+/) || [])[0]) || 0;
      if (!year || year >= current) return;
      ranked.forEach(function (row) {
        if (row === old || !sameSchool(row, old) || rowDate(row) <= rowDate(old) || row.score > old.score) return;
        var rowYear = Number((periodToken(row.item.title || "").match(/^\d+/) || [])[0]) || 0;
        if (rowYear && rowYear <= year) return;
        if (familySimilarity(row, old) < 0.6) return;
        row.score = old.score + 1; changed = true;
      });
    });
    return changed ? ranked.sort(function (a, b) { return b.score - a.score || rowDate(b).localeCompare(rowDate(a)); }) : ranked;
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
  var NARROW_AUDIENCE = /無學籍|自學生|教師|教職員|職員|代理代課|校長|教學工作坊|賦能教學/;
  var CAMPUS_LIFE = /畢業旅行|畢旅|校外教學|社會組|自然組|校慶|運動會|園遊會|畢業典禮|畢典|圖書館|社團|選組|類組|段考|期中考|期末考|課輔|晚自習|自修室|請假|學生證|制服|校服|校車|午餐|開學|放假|上課|班會|週會|朝會/;
  var ASKS_OUTSIDE = /大學|科大|基金會|協會|校外|全國|縣|市立|國家|公共/;
  var OUTSIDE_TITLE = /^\s*[【\[]?\s*轉知|^\s*轉發|大學|科技大學|基金會|協會|社團法人|國家圖書館|國立臺灣圖書館|國立台灣圖書館|公共資訊圖書館|公共圖書館|e化|(?:高級中等學校|高級中學)辦理|教育部|國教署|私立[\u4e00-\u9fff]{1,8}(?:高級中學|高中|中學)|[市縣]立[\u4e00-\u9fff]{1,8}(?:高級中學|高中|中學|國中)/;
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
  var corpusStats = null;   // statistics of the last full announcement list (rule lookups only see the handbook)
  function useCorpus(items) { var st = pieceStats(items); if (st && st.n >= MIN_STATS_ITEMS) corpusStats = st; return st; }
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
  /* Topic gate. Words that name the activity kind (比賽, 研習, 營隊, 特殊選才, 招生…) are shared by
     hundreds of unrelated notices. When the question also names something specific (a school or
     organisation such as 真理, a subject such as 旅遊 or 電競), a candidate has to contain at least
     one of those specific pieces, or one of its synonyms (亞大 = 亞洲大學), or it cannot be the answer. */
  var GATE_STRIP = ["國立", "私立", "科技大學", "大學", "學院", "特殊選才", "營隊", "說明會", "簡章", "工作坊", "演講", "展覽", "招生", "徵選", "徵稿", "徵文", "研討會", "座談會", "體驗營", "碩士", "在職", "專班", "碩專", "博士", "學士班", "研究所", "學系", "系所", "英語", "英文", "數學", "國文", "教學", "教師", "高中", "高職", "學習", "設計", "登記", "參加", "查詢", "領取", "借用", "培訓", "座談", "實施", "計畫", "辦法", "開放日", "Open Day", "Open House", "線上課", "線上課程", "公開課",
    "什麼時候", "哪一天", "哪天", "幾號", "幾月", "哪裡", "在哪", "怎麼", "如何", "多少", "可以", "有沒有", "是不是", "要不要", "舉辦", "辦理", "舉行", "相關", "資訊", "報考", "入學", "類的", "有關",
    "請問", "我想知道", "想知道", "怎樣", "是否", "還有", "哪些", "有什麼", "什麼", "開放", "名額"];
  /* A degree program or department (中文系碩士在職專班) is named in the notice's title, not in a list inside it. */
  var PROGRAM_ASK = /碩士|碩專|在職專班|學士班|研究所|學系/;
  function gateWords(query) {
    var value = compact(String(query || "").replace(YEAR_WORD, " "));
    /* Known multi-character terms (學生證) are kept whole even when they contain a generic word (學生). */
    var keep = [];
    (Synonyms ? Synonyms.find(value) : []).forEach(function (term) {
      if (term.length < 3) return;
      var at = value.indexOf(term);
      if (at !== -1) keep.push([at, at + term.length]);
    });
    var words = STOP.concat(GENERIC, SLOT_QUERY_WORDS, ALWAYS_GENERIC, GATE_STRIP).map(compact).filter(function (w) { return w.length >= 2; })
      .sort(function (a, b) { return b.length - a.length; });
    var chars = value.split("");
    words.forEach(function (w) {
      var at = value.indexOf(w);
      while (at !== -1) {
        var end = at + w.length;
        if (!keep.some(function (k) { return at < k[1] && end > k[0] && !(at <= k[0] && end >= k[1]); })) for (var i = at; i < end; i++) chars[i] = " ";
        at = value.indexOf(w, at + 1);
      }
    });
    return chars.join("").split(" ").filter(function (w) { return w.length >= 2; });
  }
  /* Share of the titles that carry any of these forms. */
  function formShare(forms, stats) {
    if (!stats || !stats.n) return 0;
    var hit = 0;
    stats.titles.forEach(function (title) { if (forms.some(function (f) { return title.indexOf(f) !== -1; })) hit++; });
    return hit / stats.n;
  }
  /* The units a question is specific about. A unit is a list of ways to write one thing: a known term
     with its synonyms (亞大 = 亞洲大學), or one two-character piece. */
  function gateUnits(query, stats) {
    if (stats && stats.n < MIN_STATS_ITEMS) stats = null;   // too few notices to tell common words from specific ones
    var units = [], must = [], leftovers = [], unknownPieces = [], chain = [], droppedKnown = false, genericForms = GATE_STRIP.concat(ALWAYS_GENERIC).map(compact);
    function add(forms) {
      forms = unique(forms.map(compact).filter(function (f) { return f.length >= 2 && (!/^[a-z0-9]+$/.test(f) || f.length >= 3); }));
      /* A concept that is itself a kind of activity (特殊選才 = 特選) decides nothing. */
      if (!forms.length || forms.some(function (f) { return genericForms.indexOf(f) !== -1; })) return;
      /* Units that share a way of writing it (服務時數 / 志工) are one thing. */
      var twin = units.filter(function (u) { return u.some(function (f) { return forms.indexOf(f) !== -1; }); })[0];
      if (twin) forms.forEach(function (f) { if (twin.indexOf(f) === -1) twin.push(f); });
      else units.push(forms);
    }
    gateWords(query).forEach(function (run) {
      var rest = run;
      /* Known terms (with synonyms) first: 亞大 = 亞洲大學, AI代理人 = AI Agent. */
      (Synonyms ? Synonyms.find(run) : []).forEach(function (term) {
        var same = Synonyms.expand(term, { includes: false }).concat(Synonyms.expand(term + "大學", { includes: false }));
        if (same.some(function (f) { return genericForms.indexOf(compact(f)) !== -1; })) { rest = rest.split(term).join(" "); return; }
        if (formShare(same, stats) > GENERIC_SHARE) { droppedKnown = true; if (term.length >= 3) must.push(same.map(compact)); return; }
        add(same);
        /* A school or organisation name (not a topic with a synthetic 「…大學」 form): its short forms need a boundary. */
        var made = units[units.length - 1];
        if (made && made.join() === unique(same.map(compact).filter(function (f) { return f.length >= 2 && (!/^[a-z0-9]+$/.test(f) || f.length >= 3); })).join())
          made.isName = same.some(function (f) { return f !== term + "大學" && /(?:大學|學院|研究院|高中|中學|高級中等學校|高級中學|女中)$/.test(f); }) || /^[a-z]{3,6}$/.test(term);
        rest = rest.split(term).join(" ");
      });
      /* Latin names (gemini, notebook, codex) are specific pieces too. */
      (rest.match(/[a-z0-9]{3,}/g) || []).forEach(function (word) {
        if (formShare([word], stats) <= GENERIC_SHARE) add([word]);
      });
      rest.replace(/[a-z0-9]+/g, " ").split(" ").forEach(function (part) {
        var prevUnknown = false;
        for (var i = 0; i + 2 <= part.length; i++) {
          var g = part.slice(i, i + 2);
          if (QUESTION_FILLER.test(g)) { prevUnknown = false; continue; }
          /* Two overlapping pieces that no title has (績校 + 校對) are one unknown word (校對). */
          if (stats && !pieceCount(g, stats) && !/[我你他想要有的了嗎呢是在什麼麼哪得及還來去會能可]/.test(g)) { if (prevUnknown) { chain.push(g); if (chain.indexOf(part.slice(i - 1, i + 1)) === -1) chain.push(part.slice(i - 1, i + 1)); } prevUnknown = true; } else prevUnknown = false;
          var unknown = stats && !pieceCount(g, stats);
          if (isGeneric(g, stats) || unknown) { if (ALWAYS_GENERIC.indexOf(g) === -1 && genericForms.indexOf(g) === -1) (unknown ? unknownPieces : leftovers).push(g); continue; }
          add([g]);
        }
      });
    });
    /* Nothing known is specific, yet the question has words of its own (竹崎, 中文系): they are the subject, even
       when no title says them; a candidate that lacks all of them is about something else. */
    if (!units.length && !droppedKnown && (unknownPieces.length || leftovers.length)) unique(unknownPieces.length ? unknownPieces : leftovers).slice(0, 6).forEach(function (g) { add([g]); });
    units.chain = chain;
    units.must = must;   // common subject words (學生證) that cannot decide alone but still have to be in a title match
    return units;
  }
  /* Returns null when the question names nothing specific; else { pieces, test(text), cover(text) }. */
  function topicGate(query, stats) {
    var units = gateUnits(query, stats);
    if (!units.length) return null;
    var named = [];
    if (SearchQuery && SearchQuery.queryPlan && SearchQuery.taxonomyTopics) {
      /* A taxonomy topic counts only when the question names it with a specific word (還書 → 圖書館);
         a generic one such as 比賽 matches every contest and decides nothing. */
      var runs = gateWords(query), ids = (SearchQuery.queryPlan(clean(String(query).replace(YEAR_WORD, " "))).term_matches || [])
        .filter(function (m) { return m.kind === "topic" && runs.some(function (run) { return run.indexOf(compact(m.term)) !== -1; }) && !(compact(m.term).length >= 4 && units.some(function (u) { return u.indexOf(compact(m.term)) !== -1; })); }).map(function (m) { return m.id; });
      if (ids.length) named = SearchQuery.taxonomyTopics().filter(function (row) { return ids.indexOf(row.id) !== -1; });
    }
    /* A short name (師大, 中山, NTU) counts only as a name of its own, not as the tail of a longer one
       (彰師大, 台南一中, NTUE). Longer forms and single two-character pieces match anywhere. */
    var BOUNDARY_PREFIX = /(?:國立|私立|市立|縣立|台灣|轉知|檢送|辦理|主辦|由|與|及|於|至|向|的)$/;
    function prep(raw) {
      raw = String(raw == null ? "" : raw);
      return { c: compact(raw), s: " " + raw.toLowerCase().replace(/臺/g, "台").replace(/[^0-9a-z\u3400-\u9fff]+/g, " ") + " " };
    }
    function formIn(t, f, multi) {
      if (t.c.indexOf(f) === -1) return false;
      var ascii = /^[a-z0-9]+$/.test(f);
      if (!multi && !ascii) return true;
      if (ascii ? f.length > 5 : f.length > 3) return true;
      var at = t.s.indexOf(f);
      while (at !== -1) {
        var prev = t.s.charAt(at - 1), next = t.s.charAt(at + f.length);
        if (ascii ? !/[a-z0-9]/.test(prev) && !/[a-z0-9]/.test(next) : prev === " " || BOUNDARY_PREFIX.test(t.s.slice(Math.max(0, at - 2), at))) return true;
        at = t.s.indexOf(f, at + 1);
      }
      return false;
    }
    function met(t, unit) {
      return unit.some(function (f) { return formIn(t, f, !!unit.isName); });
    }
    function has(text) {
      var t = prep(text);
      return units.some(function (u) { return met(t, u); }) || named.some(function (row) { return SearchQuery.findTerms(t.c, row.terms).length; });
    }
    /* Share of the specific units that a title carries (order does not matter: 一日淡江營 = 淡江一日營). */
    function cover(text) {
      var t = prep(text);
      return units.filter(function (u) { return met(t, u); }).length / units.length;
    }
    /* Every common subject word of the question is in the text (「學生證遺失」: the 遺失物 list is not about 學生證). */
    function coversSubject(text) { var t = prep(text); return (units.must || []).every(function (u) { return met(t, u); }); }
    /* An unknown word of the question (校對): the quoted text has to say it. */
    function chainTest(text) { if (!(units.chain || []).length) return true; var c = compact(text); return units.chain.some(function (g) { return c.indexOf(g) !== -1; }); }
    return { pieces: units.map(function (u) { return u[0]; }), units: units, test: has, cover: cover, coversSubject: coversSubject, chainTest: chainTest };
  }
  function relatedAnnouncements(query, ranked, options, stats) {
    var asOf = options && /^\d{4}-\d{2}-\d{2}$/.test(String(options.asOf || "")) ? options.asOf : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var current = currentAcademicYear(asOf);
    var ownSchool = CAMPUS_LIFE.test(query) && !ASKS_OUTSIDE.test(query);
    var asksResult = ASKS_RESULT.test(query);
    return (ranked || []).filter(function (row) {
      if (ownSchool && OUTSIDE_TITLE.test(clean(row.item && row.item.title || ""))) return false;
      /* 得獎名單 is not how to write one (「閱讀心得報告怎麼寫」). */
      if (!asksResult && TITLE_RESULT.test(clean(row.item && row.item.title || ""))) return false;
      return topicScore(row.item && row.item.title || "", query, stats) >= 0.5;
    }).slice(0, 3).map(function (row) {
      var item = row.item, year = Number((periodToken(item.title || "").match(/^\d+/) || [])[0]);
      var day = String(item.date || item.first_seen || "").slice(0, 10), note = "";
      if (year >= 90 && year < current) note = "這是 " + year + " 學年度的資料，可能已改變";
      else if (/^\d{4}-\d{2}-\d{2}$/.test(day) && (Date.parse(asOf) - Date.parse(day)) / 86400000 > 365) note = "這是 " + day.slice(0, 4) + " 年的資料，可能已改變";
      return { id: item.id, title: item.title, date: day, school_name: item.school_name || "", url: item.url || "", note: note };
    });
  }
  /* Question tokens. A split part (「學生證丟了」+「如何繳交」) takes its topics from the subject only:
     the words added for the part (繳交) would otherwise match any notice about handing something in. */
  function askedTokensFor(query, options) {
    if (!Tokens) return null;
    var asked = Tokens.tokenizeQuestion(query);
    if (options && options.tokenSubject) asked.topics = Tokens.tokenizeQuestion(options.tokenSubject).topics;
    return asked;
  }
  function rank(query, items, details, options) {
    query = normalizeVariants(stripSchoolNames(clean(query)));
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
    var askedTokens = askedTokensFor(query, options);
    var gate = topicGate(query, corpusStats);
    var ranked = sourceItems.map(function (item) {
      /* The school took this notice down: it can no longer be an answer. */
      if (detailMap[item.id] && detailMap[item.id].parse_status === "removed") return null;
      var metadataRow = metadataById[item.id];
      var metadataScore = metadataRow ? metadataRow.score : SearchQuery.announcementScore(item, query);
      /* Token labels: one segment with the asked topic and the asked kind beats a title that
         merely shares a word. A notice can be found by a segment even when its title says nothing. */
      var tokenHit = askedTokens && item.tokens ? Tokens.match(item.tokens, askedTokens) : null;
      var tokenScore = tokenHit && tokenHit.topics ? tokenHit.score * 5 : tokenHit ? tokenHit.score : 0;
      if (!metadataScore && tokenHit && tokenHit.topics && tokenHit.kinds) metadataScore = tokenScore;
      var reviewed=Validity&&Validity.reviewedRecord?Validity.reviewedRecord(item):null;
      var reviewedText=reviewed?(reviewed.fragments||[]).map(function(f){return clean(f.keywords+" "+f.text);}).join(" "):"";
      var reviewedScore=scoreText(reviewedText,queryTokens,8);
      /* The title carries what was asked even though the search terms (which drop words like 能) found nothing. */
      var coverNow = gate ? gate.cover(item.title || "") : 0;
      if(!metadataScore&&!reviewedScore){if(coverNow>=0.6)metadataScore=20;else return null;}
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
      /* The question names something specific: a notice that never mentions it cannot be the answer,
         and one whose title carries it beats one that only mentions it. */
      var gateBonus = 0;
      if (gate) {
        if (!gate.test(PROGRAM_ASK.test(query) ? clean(item.title || "") : clean(item.title || "") + " " + combined + " " + keywordText + " " + reviewedText)) return null;
        var titleCover = gate.cover(item.title || "");
        gateBonus = titleCover >= 0.6 ? 350 + Math.round(titleCover * 200) : titleCover > 0 ? 60 : 0;
        /* Among notices that cover the specific words alike, the one whose title is the kind asked (比賽 = 競賽) comes first. */
        ["比賽", "競賽", "研習", "營隊", "講座", "工作坊", "說明會"].forEach(function (kind) {
          if (compact(query).indexOf(kind) !== -1 && synonymsOf(kind).some(function (f) { return compact(item.title || "").indexOf(f) !== -1; })) gateBonus += 80;
        });
      }
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
      return { item:item,detail:detailMap[item.id]||null,text:combined,token:tokenHit,score:tokenScore+metadataScore+reviewedScore+reviewedBonus+titleScore+overviewScore+Math.min(bodyScore,80)+intentBonus+slotBonus+gateBonus+timeliness(item,query,asOf)-exclusivePenalty(query,item.title||""),anchorScore:anchorScore,gateCover:coverNow,reviewedMatch:reviewedScore>0,reviewedCoverage:reviewedCoverage,reviewedAnchorHits:reviewedAnchorHits,reviewedLongest:reviewedLongest,search_validity:metadataRow&&metadataRow.validity };
    }).filter(function (row) { return row && row.score >= 8 && (!anchorTokens.length || row.anchorScore > 0 || row.gateCover >= 0.6 || row.reviewedMatch || anchorCoverage(row, anchorTokens) >= 0.6); }).sort(function (a, b) {
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
    ranked = newerEditionFirst(query, ranked, asOf);
    ranked = preferNewestRelated(query, ranked);
    if (!ranked.length) return ranked;
    var floor = Math.max(70, ranked[0].score * 0.4);
    return ranked.filter(function (row) { return row.score >= floor; });
  }
  function sentences(value) {
    return clean(value).split(/(?<=[。！？!?；;])|\n+/).map(clean).filter(function (row) { return row.length >= 8 && row.length <= 420; });
  }
  /* 「什麼時候／幾號」 asks for the day the thing happens, not the sign-up deadline, unless the question
     itself talks about signing up (報名、截止、期限、申請…). */
  /* 「學生證丟了怎麼辦」: a problem to solve is not answered by a notice that merely shares the subject. */
  var PROBLEM_ASK = /怎麼辦|丟了|弄丟|不見了|壞了|怎麼補|被罰|會怎樣|會怎麼樣/;
  var ASKS_WHEN = /什麼時候|何時|幾號|哪天|哪一天|哪幾天|幾月|日期|時間(?!表)/;
  var ASKS_SIGNUP = /要交|要繳|交件|繳件|繳費|要填|要上傳|要報|報名|截止|期限|申請|來得及|還能|還可以|最晚|索票|回覆|繳交|名額|收件|登記|到幾號|前要/;
  var EVENT_CUE = /訂於|定於|舉辦|舉行|演出|開幕|上課|活動日|展期|比賽日|競賽日|決賽|開課|首演|公演|辦理日期|活動時間|活動日期|(?<!報名|索票|領票|收件|繳交|申請|回覆|截止)(?:日期|時間)\s*[:：]/;
  var NOTICE_CUE = /錄取名單|公告於|放榜|審核後|公布|發文日期|發文字號/;
  var EVENT_WEAK = /日期|時間|辦理|開始/;
  var DEADLINE_CUE = /報名|截止|[日號)）]\s*(?:以)?前|前(?:完成|繳交|回覆|報名|上傳|送交|申請)|索票|回覆|期限|受理|繳交|收件|申請至|領票|劃位/;
  var POSTPONE = /延期|順延|改期|延至|改至|延後至|延後到|更改為|異動為|調整為|改為|改在/;
  function asksEventDate(query) { query = clean(query); return ASKS_WHEN.test(query) && !ASKS_SIGNUP.test(query); }
  var ONE_DATE = /(?:\d{2,4}\s*年\s*)?\d{1,2}\s*[月\/]\s*\d{1,2}\s*日?(?:\s*[（(][^）)]{1,4}[）)])?(?:\s*(?:上午|下午|晚上)?\s*\d{1,2}\s*[:：]\s*\d{2}(?:\s*[~～－-]\s*\d{1,2}\s*[:：]\s*\d{2})?)?/;
  /* The date a postponement sentence moves to (「原訂10/28，延至11/4」 → 11/4). */
  function postponedPhrase(text) {
    var m = POSTPONE.exec(text);
    if (!m) return "";
    var rest = text.slice(m.index + m[0].length), d = rest.match(ONE_DATE);
    return d ? clean(d[0]) : "";
  }
  function evidenceScore(sentence, queryTokens, wanted, plan, item) {
    var score = scoreText(sentence, queryTokens, 4), slot = plan && plan.answer_slot || "";
    var eventDate = !!(plan && plan.event_date);
    if (eventDate) slot = "";
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
    if ((wanted.indexOf("date") !== -1 || slot === "deadline" || eventDate) && TIME_PHRASE.test(sentence)) score += 40;
    else if (slot === "deadline") score -= 20;   // 「還來得及嗎」 is answered by the date, not by 「如至截止日期…」
    if (eventDate) {
      if (!TIME_PHRASE.test(sentence) && !ONE_DATE.test(sentence)) score -= 120;
      if (EVENT_CUE.test(sentence)) score += 90; else if (EVENT_WEAK.test(sentence)) score += 10;
      if (DEADLINE_CUE.test(sentence)) score -= EVENT_CUE.test(sentence) ? 12 : 110;
      if (NOTICE_CUE.test(sentence) && !EVENT_CUE.test(sentence)) score -= 110;
    }
    /* A notice that moved the date: the new date wins over the original one. */
    if ((eventDate || wanted.indexOf("date") !== -1 || slot === "deadline") && POSTPONE.test(sentence) && postponedPhrase(sentence)) score += 130;
    return score;
  }
  /* A sentence that mostly repeats the notice's title tells the reader nothing new (the title is shown
     already): it is marked down when a notice's own sentences are ordered, so the one with content wins. */
  function echoPenalty(text, title) {
    if (!Composer || !Composer.echoRatio || !title) return 0;
    var ratio = Composer.echoRatio(text, title);
    return ratio >= 0.6 ? Math.round(12 + ratio * 24) : 0;
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
      event_date: asksEventDate(query),
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
  function composeSummary(evidence, sources, wanted, plan, asOf, content) {
    var lead = evidence.length ? smoothEvidence(evidence[0].text) : "";
    if (!lead) return "我沒有在公告裡找到能回答這題的內容。";
    if(sources.length>1&&sources.some(function(i){return i.validity&&i.validity.relations&&i.validity.relations.length;}))return"這幾則公告互相修正或補充，下面依官方指定的範圍合併整理；沒有被點名修改的部分，仍以原公告為準。";
    var first = sources.filter(function (item) { return item.id === evidence[0].announcement_id; })[0] || sources[0] || {};
    var fact = endSentence(lead.replace(/^(?:[一二三四五六七八九十]+、|\(?\d{1,2}\)?[、.．])\s*/, ""));
    var slot = plan && plan.answer_slot || "", asksTime = slot === "deadline" || wanted.indexOf("date") !== -1;
    var when = asksTime && !content ? (postponedPhrase(lead) || timePhrase(lead)) : "";
    var text = content && content.kind === "summary" ? sourceLabel(first) + "：" + fact : when ? "時間是 " + when + "。" + sourceLabel(first) + "：" + fact : sourceLabel(first) + "，" + fact;
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
  var YEAR_ASK = new RegExp(YEAR_WORD.source);
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
    var top = ranked[0] && ranked[0].item, topDay = top ? shortDay(String(top.date || top.first_seen || "").slice(0, 10)) : "";
    return { status:"answered", query:query, privacy_limited:true,
      summary:"這個問題可能涉及可識別的學生或個人資料；本站不整理、不轉述名單或個人紀錄。" + (top && top.title ? "相關公告是" + (topDay ? " " + topDay + " 的" : "") + "「" + clean(top.title).slice(0, 40) + "」，請點開官方公告自己查看。" : ""),
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
    "段考": ["段考", "期中考", "期末考", "定期考"], "定期考": ["定期考", "段考", "期中考", "期末考"],
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
  /* Penalties (記過、警告、愛校服務…) are written only in the handbook's 獎懲 chapters, whose titles never
     name the act (遲到、打架、段考). A question about what happens must always read those chapters. */
  var PENALTY_ASK = /會怎樣|會怎麼樣|會如何|後果|下場|記過|記(?:幾|一|兩)?支|被記|處罰|懲處|處分|懲罰|被罰|罰則|扣分|警告|申誡|小過|大過|退學|留校察看|違規|愛校服務/;
  var PENALTY_DOC = /獎懲規定|獎懲辦法|懲處|愛校服務|週末生活輔導|考試要點|考試規則|學生學習評量辦法$/;
  var PENALTY_TEXT = /記(?:警告|申誡|小過|大過|過|[一二三兩]大過)|警告|申誡|零分|扣[^，。]{0,6}分|週輔|生活輔導|愛校服務|懲處|處分|移送警|勒令|退宿|不得(?:進入|入場|參加)|不准入場|以曠課(?:處理|論)|適性輔導/;
  var CONCRETE_PENALTY = /記(?:警告|申誡|小過|大過|[一二三兩]大過)|警告[一二兩\d乙]?次|零分|扣[^，。]{0,6}分|週輔|愛校服務|勒令|退宿|不得(?:進入|入場)|不准入場/;
  var PENALTY_WORD = /^(?:處罰|懲處|處分|懲罰|被罰|罰則|記過|記警告|警告|申誡|小過|大過|記小過|記大過|扣分|退學|後果|下場|違規)$/;
  function asksPenalty(query) { return PENALTY_ASK.test(clean(query)); }
  function penaltyDocs(items, query) {
    var evening = /進修|夜間部/.test(query || "");
    return (items || []).filter(function (item) {
      var title = clean(item && item.title || "");
      return isSchoolDoc(item) && PENALTY_DOC.test(title) && !/委員會|獎勵標準|績優獎勵/.test(title) && (evening || !/進修部/.test(title));
    });
  }
  /* Which documents to read in full before answering (their text is fetched one by one):
     the best-ranked handbook chapters and notices, plus the 獎懲 chapters for a penalty question. */
  function readList(question, items, options) {
    useCorpus(items);
    var docs = (items || []).filter(isSchoolDoc), notices = (items || []).filter(function (item) { return item && !isSchoolDoc(item); });
    var per = options && options.deep ? 15 : 6, seen = {}, out = [];
    var fixed = Typo ? Typo.fix(question).query : question;
    function add(item) { var id = item && String(item.id); if (id && !seen[id]) { seen[id] = true; out.push(item); } }
    unique([question, fixed]).forEach(function (q) {
      rank(q, docs, {}, options).slice(0, per).forEach(function (row) { add(row.item); });
      rank(q, notices, {}, options).slice(0, per).forEach(function (row) { add(row.item); });
    });
    if (asksPenalty(question) || asksPenalty(fixed)) penaltyDocs(docs, question).forEach(add);
    return out;
  }
  /* Rules are numbered (一、 (一) 1. 第三條) or are timetable rows (12:35-13:10 午休). */
  var CLAUSE_START = /^\s*(?:[一二三四五六七八九十廿卅]+、|[壹貳參肆伍陸柒捌玖拾]+、|[（(][一二三四五六七八九十廿卅]+[)）]|\d{1,2}[.、](?!\d)|第[一二三四五六七八九十百廿卅]+條|※|\d{1,2}:\d{2})/;
  var RULE_SKIP = /^(?:[一二三四五六七八九十]+、|[壹貳參肆伍陸柒捌玖拾]+、|第[一二三四五六七八九十]+條\s*)?(?:實施)?依據|經校務會議.*(?:實施|修正)|^本(?:要點|辦法|規定|細則)(?:經|自)|^(?:[一二三四五六七八九十]+、\s*)?本(?:補充)?(?:規定|要點|辦法|細則|規範)(?:係)?依.{0,40}(?:辦理|訂定|訂之)。?$/;
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
  /* A list item inherits the heading above it: 「學生有下列情形之一者，記小過：」 then
     「(一)考試時夾帶…」 means 考試時夾帶 → 記小過. Returns [{ text, ctx, heading }]. */
  var LIST_ITEM = /^\s*(?:[（(]\s*[一二三四五六七八九十廿卅\d]+\s*[)）]|\d+\s*[.、．]|[一二三四五六七八九十廿卅]+\s*[、．])\s*/;
  /* 「…之一者，記大過一次，且該科成績零分計算。」 is a heading too, though it ends with 「。」. */
  var HEADING_END = /[：:]$|如下[：:。]?$|之一者[，,]?[^。]{0,12}[：:]?$|下列[^。，]{0,8}之一者[，,][^。]{0,40}[。．]?$/;
  /* List levels: 第十條 > 五、 > (一) > 1. A heading at one level frames the items below it
     (「…給予生活輔導：」 › 「(一)生活常規：」 › 「10.集會…使用手機」; 嘉女「第十條 有下列事蹟之一者記警告：」 › 「六、…」). */
  function listLevel(text) {
    if (/^\s*第\s*[一二三四五六七八九十百廿卅\d]+\s*條/.test(text)) return 0;
    if (/^\s*[一二三四五六七八九十廿卅]+\s*[、．]/.test(text)) return 1;
    if (/^\s*[（(]/.test(text)) return 2;
    if (/^\s*\d+\s*[.、．]/.test(text)) return 3;
    return -1;
  }
  function withHeadings(list) {
    var stack = [], out = [];
    list.forEach(function (text) {
      text = clean(text);
      var level = listLevel(text), isHeading = HEADING_END.test(text);
      var above = level < 0 ? [] : stack.slice(0, level).filter(Boolean);
      var heading = !isHeading && above.length ? above.join(" ") : "";
      out.push({ text: text, heading: heading, ctx: heading ? heading + " " + text : text });
      if (isHeading) { stack = stack.slice(0, Math.max(level, 0)); stack[Math.max(level, 0)] = text.replace(LIST_ITEM, "").replace(/^第\s*[一二三四五六七八九十百廿卅\d]+\s*條\s*/, ""); }
      else if (level < 0) stack = [];
      else stack = stack.slice(0, level + 1);
    });
    return out;
  }
  function framedText(f) { return f.heading ? f.heading.replace(/[：:。．]$/, "") + "：" + f.text.replace(LIST_ITEM, "") : f.text; }
  function ruleText(record) {
    return (record && record.attachments || []).map(function (a) { return a && a.embedded_text || ""; }).join("\n") ||
      (record && record.blocks || []).map(function (b) { return b && (b.text || (b.items || []).join("\n") || (b.rows || []).map(function (r) { return (r || []).join(" "); }).join("\n")) || ""; }).join("\n");
  }
  /* 「抽菸會記幾支過」: the planner leaves unknown words as one phrase; split it on question and
     filler words, and read 「記幾支過」 as 記過. */
  var RULE_FILLER = /會不會被|會不會|會被|會怎麼樣|會怎樣|怎麼樣|怎樣|怎麼|如何|為什麼|可不可以|可以|能不能|能否|要不要|有沒有|是不是|是否|嗎|呢|吧|啊|幾支|幾次|幾個|多少|會|被|要|的/g;
  function ruleTerms(query) {
    query = clean(query).replace(/記(?:幾|一|兩|二|三|多少)(?:支|次|個)?過/g, "記過");
    var plan = SearchQuery && SearchQuery.queryPlan ? SearchQuery.queryPlan(query) : { term_matches: [], remainder_terms: [] };
    plan = Object.assign({}, plan, { remainder_terms: [].concat.apply([], (plan.remainder_terms || []).map(function (t) {
      return String(t).replace(RULE_FILLER, " ").split(/\s+/).filter(function (x) { return x.length >= 2; });
    })) });
    var topics = SearchQuery && SearchQuery.taxonomyTopics ? SearchQuery.taxonomyTopics() : [], literal = [], related = [], rest = [];
    (plan.term_matches || []).forEach(function (row) {
      if (row.kind !== "topic") { rest.push(compact(row.term)); return; }
      literal.push(compact(row.term));
      var topic = topics.filter(function (t) { return t.id === row.id; })[0];
      (topic ? topic.terms : []).forEach(function (t) { related.push(compact(t)); });
    });
    (plan.remainder_terms || []).forEach(function (t) { t = compact(t); if (t.length >= 2) rest.push(t); });
    /* The synonym database: 「手機」 also finds a clause that says 行動載具. */
    literal.concat(rest).forEach(function (t) { synonymsOf(t).forEach(function (s) { if (s !== t && s.length >= 2) related.push(s); }); });
    rest.forEach(function (t) { if (Synonyms) Synonyms.find(t).forEach(function (k) { synonymsOf(k).forEach(function (s) { if (s.length >= 2) related.push(s); }); }); });
    /* One group per asked word: every way to write it (段考: 定期考查、考試、試場…; 記過: 記大過、小過…).
       A clause is scored by how many of the asked words it covers, not by how many synonyms it has. */
    /* 「上課用手機」: 上課 is where it happens, not what is asked about. */
    var penalty = asksPenalty(query);
    var groups = unique(literal.concat(rest).map(function (t) { return t.replace(/^(?:上課|在校|校內|上學|學校)(?=.{2,})/, "").replace(/(?:用|時)$/, ""); }))
      .filter(function (t) { return t.length >= 2 && !/^(?:會被|怎樣|怎麼|如何|什麼|可以|需要|規定|上課|在校|校內|上學|學校|記過)$/.test(t) || (t === "記過" && !penalty); }).map(function (t) {
      var forms = synonymsOf(t).concat(Synonyms && Synonyms.INCLUDES && Synonyms.INCLUDES[t] || []);
      var topic = (plan.term_matches || []).filter(function (row) { return row.kind === "topic" && compact(row.term) === t; })[0];
      var tt = topic && topics.filter(function (x) { return x.id === topic.id; })[0];
      /* The topic's other words (段考 → 考試、試場; 遲到 → 早退、曠課) count for less than the word
         itself in a penalty question, which is about one act. */
      var loose = tt ? tt.terms.map(compact) : [];
      if (!penalty) { forms = forms.concat(loose); loose = []; }
      var strict = unique([t].concat(forms.map(compact))).filter(function (f) { return f.length >= 2; });
      return { word: t, forms: strict, loose: unique(loose).filter(function (f) { return f.length >= 2 && strict.indexOf(f) === -1; }) };
    });
    if (penalty) {
      /* The asked penalty (處罰、記過) is checked separately; the groups are the act. */
      groups = groups.filter(function (g) { return !PENALTY_WORD.test(g.word); });
      /* 「服裝不整」 is one act, though the planner reads 服裝 + 不整. */
      var cq = compact(query);
      ((Synonyms && Synonyms.SAME) || []).forEach(function (group) {
        var phrase = group.map(compact).filter(function (w) { return w.length >= 3 && cq.indexOf(w) !== -1; })[0];
        if (!phrase) return;
        groups = groups.filter(function (g) { return phrase.indexOf(g.word) === -1; });
        groups.push({ word: phrase, forms: unique(group.map(compact)), loose: [] });
      });
      /* A rule about 考試 covers 段考 (INCLUDES 考試 ⊃ 段考): the broader word counts in full. */
      var includes = (Synonyms && Synonyms.INCLUDES) || {};
      groups.forEach(function (g) {
        Object.keys(includes).forEach(function (parent) {
          if (includes[parent].map(compact).indexOf(g.word) !== -1 && !PENALTY_WORD.test(parent)) g.forms = unique(g.forms.concat([compact(parent)]));
        });
      });
      /* 作弊 is punished under the exam rules (「違反本校『試場規則…』」). */
      groups.forEach(function (g) { if (g.forms.some(function (f) { return /作弊|舞弊/.test(f); })) g.loose = unique((g.loose || []).concat(["試場", "考試"])); });
    }
    return { literal: unique(literal), related: unique(related), rest: unique(rest), groups: groups };
  }
  function scoreClause(clause, terms, query, title) {
    /* 「(不含服儀違規…遲到)」 says the rule is NOT about 遲到. */
    var c = compact(String(clause).replace(/[（(]\s*不(?:含|包括|包含)[^)）]*[)）]/g, "")), score = 0;
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
    /* 「段考怎樣會被記過」: a clause about the exam AND the penalty beats one about either alone.
       Asked words the chapter title already covers (獎懲 for 記過) count as covered. */
    var groups = terms.groups || [];
    /* 偷東西 → 竊取、打架 → 毆打: a clause using the handbook's word counts almost like the asked word. */
    var cc = c;
    var has = function (list) { return list.some(function (f) { return cc.indexOf(f) !== -1; }); };
    if (asksPenalty(query)) groups.forEach(function (g) {
      if (cc.indexOf(g.word) !== -1) return;
      if (has(g.forms.filter(function (f) { return f !== g.word; }))) score += 7;
      else if (has(g.loose || [])) score += 3;
    });
    /* 「…會怎樣」 wants the clause that says the penalty, not the one that defines the act. */
    if (score && asksPenalty(query)) {
      /* A concrete penalty (記小過、零分、週輔) beats a passing mention of 懲處. */
      score += CONCRETE_PENALTY.test(clause) ? 6 : PENALTY_TEXT.test(clause) ? 2 : -6;
      /* A rule for exam time or the dorm answers 「上課用手機」 only when the exam or dorm was asked. */
      if (/考試時|試場|監考/.test(clause) && !/考|試/.test(query)) score -= 6;
      if (/晚自習|住宿|宿舍|舍監|學苑/.test(clause) && !/晚自習|住宿|宿舍|學苑/.test(query)) score -= 6;
    }
    if (groups.length >= 2) {
      var t = compact(title);
      var inClause = groups.filter(function (g) { return has(g.forms); }).length;
      var looseIn = groups.filter(function (g) { return !has(g.forms) && has(g.loose || []); }).length;
      var inTitle = groups.filter(function (g) { return g.forms.concat(g.loose || []).some(function (f) { return t.indexOf(f) !== -1; }); }).length;
      score += inClause * 8 + looseIn * 4;
      inClause += looseIn;
      if (inClause + Math.min(inTitle, 1) < groups.length) score -= 8;
    }
    if (clause.length > 260) score -= 2;
    return score;
  }
  function ruleAnswer(query, ranked, details) {
    var terms = ruleTerms(query);
    if (!terms.literal.length && !terms.rest.length) return null;
    var best = null, penaltyAsk = asksPenalty(query);
    var actHit = function (text) {
      var c = compact(String(text).replace(/[（(]\s*不(?:含|包括|包含)[^)）]*[)）]/g, ""));
      /* 「違反本校『學生考試要點』」 points to the rules about 考試: the quoted name counts with the topic's words. */
      var named = compact((String(text).match(/「[^」]{2,20}」/g) || []).join(" "));
      return !terms.groups.length || terms.groups.every(function (g) {
        return g.forms.some(function (f) { return c.indexOf(f) !== -1; }) || (g.loose || []).some(function (f) { return named.indexOf(f) !== -1; });
      });
    };
    ranked.slice(0, 12).forEach(function (row, position) {
      if (!isSchoolDoc(row.item) || !details[row.item.id]) return;
      var title = clean(row.item.title || ""), compactTitle = compact(title);
      var linkLabels = {};
      (row.item.documents || []).forEach(function (doc) { linkLabels[compact(doc && doc.name || "")] = true; });
      /* A chapter whose own title is about the subject (行動載具 for 手機) beats one that only mentions it. */
      var titleBonus = terms.literal.concat(terms.related).some(function (t) { return t.length >= 2 && compactTitle.indexOf(t) !== -1; }) ? 4 : 0;
      /* Penalty questions: the 獎懲規定 is the main source; dorm rules apply only to boarders. */
      if (asksPenalty(query)) {
        if (/獎懲規定|獎懲辦法/.test(title)) titleBonus += 6;
        if (/住宿|學苑|宿舍|自修室/.test(title) && !/住宿|宿舍|學苑|晚自習|自修/.test(query)) titleBonus -= 10;
      }
      var clauses = ruleClauses(ruleText(details[row.item.id])), framed = withHeadings(clauses);
      clauses.forEach(function (clause, index, all) {
        /* A clause made only of link labels (「服裝儀容委員名單 服裝儀容規定」) is not an answer. */
        var rest = compact(clause);
        Object.keys(linkLabels).forEach(function (label) { if (label) rest = rest.split(label).join(""); });
        var ctx = framed[index] && framed[index].heading ? framed[index].ctx : clause;
        var base = rest.replace(/[。．.、，,]/g, "").length < 6 ? 0 : scoreClause(ctx, terms, query, title);
        /* A penalty answer names the act and states the penalty; otherwise say none was found. */
        if (base && penaltyAsk && !(PENALTY_TEXT.test(ctx) && actHit(ctx))) base = 0;
        var score = base ? base + titleBonus - (row.penaltyDoc ? 0 : position) : 0;
        if (!best || score > best.score) best = { score: score, base: base, clause: clause, heading: framed[index] && framed[index].heading || "", index: index, all: all, row: row };
      });
    });
    if (!best || best.score < 10) return null;
    var picked = [framedText({ heading: best.heading, text: best.clause })];
    /* 「作息時間表如下：」 needs the rows after it. */
    if (!best.heading && /[：:]$|如下/.test(best.clause)) picked = picked.concat(best.all.slice(best.index + 1, best.index + 5));
    else {
      var second = null, bestFramed = withHeadings(best.all);
      best.all.forEach(function (clause, index) {
        if (index === best.index) return;
        var f = bestFramed[index] || { ctx: clause, heading: "" };
        var score = scoreClause(f.heading ? f.ctx : clause, terms, query, best.row.item.title || "");
        var text = framedText({ heading: f.heading, text: clause });
        if (penaltyAsk && !(PENALTY_TEXT.test(f.ctx) && actHit(f.ctx))) return;
        if (score >= Math.max(10, (penaltyAsk ? best.base || best.score : best.score) * 0.8) && (!second || score > second.score)) second = { score: score, clause: text, index: index };
      });
      if (second) picked = second.index < best.index ? [second.clause, picked[0]] : [picked[0], second.clause];
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
    var school = options.timetableSchool || options.schoolId || "";
    var tables = (options.timetables || []).filter(function (t) { return t && Array.isArray(t.classes) && (!school || !t.school_id || t.school_id === school); });
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
      sources: [{ id: "timetable:" + className, kind: "calendar", title: label + "（" + className + " 班）", school_id: table.school_id, school_name: table.school_id === "cygsh" ? "嘉女" : "嘉中", url: table.source_url || "", note: "官方班級課表" }],
      limitation: "依學校公告的" + (table.version === "formal" ? "正式" : "") + "班級課表；調課、段考與活動以老師或學校通知為準。" };
  }
  /* 「第二次段考是哪幾天」「學習歷程上傳期限」: questions asking WHEN something is.
     The school calendar is the most reliable source, so check it before announcements.
     Every topic in the question must appear in the calendar title, and the title must not
     add a different subject (期中考成績繳交 is not 期中考). */
  var WHEN_ASK = /什麼時候|何時|哪一天|哪天|哪幾天|幾號|幾月幾|日期|期限|截止|到什麼時候|時間是/;
  var WHEN_SKIP = /哪裡|在哪|地點|怎麼|如何|多少錢|費用|要帶|帶什麼|找誰|聯絡|成績|名單|結果|錄取/;
  var WHEN_FILLER_WORDS = /大概落在|大約落在|大概會在|大約會在|大概|大約|大致|差不多|落在|下一次|下次|下個|最近一次|接下來|這次|哪幾天|哪一天|哪天|幾號/g;
  var NEXT_ASK = /下次|下一次|下個|最近一次|接下來/;
  var WHEN_FILLER = /^(?:下次|下一次|下個|最近一次|最近|接下來|這次|哪幾天|哪一天|哪天|幾號|檔案|資料|日期|時間|期限|截止|高[一二三]|第[一二三四五]次)$/;
  var WHEN_QUALIFIERS = ["成績", "繳交", "命題", "監考", "閱卷", "檢討", "會議", "說明會", "講座", "補考", "報名", "試題", "公告", "IEP"];
  var GRADE_RE = /高[一二三]/g;
  /* 「要交」 asks about 繳交; 「報名」 also covers 「參加」 (synonym database for the rest). */
  var QUALIFIER_SHORT = { "繳交": /交|繳|上傳/, "報名": /報名|參加|登記/ };
  function qualifierAsked(word, query) {
    if (query.indexOf(word) !== -1 || (QUALIFIER_SHORT[word] && QUALIFIER_SHORT[word].test(query))) return true;
    var q = compact(query);
    return synonymsOf(word).some(function (alt) { return alt.length >= 2 && q.indexOf(alt) !== -1; });
  }
  function whenAnswer(query, items, options) {
    options = options || {};
    var calendar = options.calendarEvents || [];
    if (!calendar.length || !SearchQuery || !SearchQuery.queryPlan || !WHEN_ASK.test(query) || WHEN_SKIP.test(query)) return null;
    var plan = SearchQuery.queryPlan(query), topics = SearchQuery.taxonomyTopics ? SearchQuery.taxonomyTopics() : [];
    var groups = [];
    (plan.term_matches || []).forEach(function (row) {
      if (row.kind === "topic") {
        var topic = topics.filter(function (t) { return t.id === row.id; })[0];
        /* 「段考」 means 期中考／期末考, not every 考試 (a university's 招生考試). */
        var own = DATE_TOPIC_SYNONYMS[row.term];
        var topicTerms = topic ? topic.terms : [row.term];
        var known = Synonyms && Synonyms.find(row.term).join() === compact(row.term);
        /* 「學測」 means 學科能力測驗, not every 大考 word (英聽). */
        var base = own && own.length ? own : known ? [row.term] : topicTerms;
        groups.push(unique([].concat.apply([], base.map(synonymsOf)).map(compact)));
      } else if (row.kind === "action") groups.push([compact(row.term)]);
    });
    (plan.remainder_terms || []).forEach(function (term) {
      term = compact(term).replace(WHEN_FILLER_WORDS, "");
      if (term.length >= 2 && !WHEN_FILLER.test(term)) groups.push(Synonyms ? Synonyms.variants(term, 8) : [term]);
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
      return !WHEN_QUALIFIERS.some(function (word) { return title.indexOf(word) !== -1 && !qualifierAsked(word, query); });
    }
    var rows = [], seen = {};
    calendar.forEach(function (ev) {
      var from = String(ev && (ev.start_date || ev.date) || "").slice(0, 10), to = String(ev && (ev.end_date || ev.endDate) || from).slice(0, 10), title = clean(ev && ev.title || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !title || !fits(title)) return;
      var key = from + compact(title);
      if (seen[key]) return; seen[key] = true;
      rows.push({ from: from, to: to < from ? from : to, title: title, ev: ev });
    });
    if (!rows.length) {
      var standin = breakStandin(query, calendar, asOf, options);
      if (standin) return standin;
      return null;
    }
    /* 「【高三】英文閱讀期中考(第5節)」 is one class period, not the 段考 itself: when the
       calendar also has whole-day entries, leave the single-period ones out. */
    var PERIOD_ONLY = /[（(]第\s*\d(?:\s*[-~～、]\s*\d)?\s*節[)）]/;
    if (rows.some(function (r) { return !PERIOD_ONLY.test(r.title); })) rows = rows.filter(function (r) { return !PERIOD_ONLY.test(r.title); });
    var upcoming = rows.filter(function (r) { return r.to >= asOf; }).sort(function (a, b) { return a.from.localeCompare(b.from); });
    var past = rows.filter(function (r) { return r.to < asOf && r.to >= isoAdd(asOf, -150); }).sort(function (a, b) { return b.from.localeCompare(a.from); });
    var picked = upcoming.length ? upcoming.slice(0, NEXT_ASK.test(query) ? 1 : 4) : past.slice(0, 1);
    if (!picked.length) return null;
    var where = options.scopeLabel ? options.scopeLabel + "行事曆" : "學校行事曆";
    /* The one thing asked, said first and big: 「下一次：11/26（週四）～11/27（週五）第二次期中考」. */
    var today = function (r) { return r.from <= asOf && asOf <= r.to ? "（就是今天）" : ""; };
    var headline = upcoming.length ? (picked.length > 1 ? "下一次：" : "") + rangeLabel(picked[0].from, picked[0].to) + "「" + picked[0].title + "」" + today(picked[0]) : "";
    var names = picked.slice(0, 3).map(function (r) { return rangeLabel(r.from, r.to) + "「" + r.title + "」" + today(r); }).join("、");
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
    return { status: "answered", mode: "browse", list_label: "行事曆", query: query, headline: headline, summary: summary, evidence: [], sources: sources, related: [], key_points: [],
      plan: questionPlan(query), limitation: "日期來自學校行事曆；學校臨時調整時以最新公告為準。" };
  }
  /* 「寒假什麼時候」: calendars rarely list 寒假 itself, but the 結業式／休業式 is the last day
     before it (Jan–Feb for 寒假, Jun–Jul for 暑假). */
  function breakStandin(query, calendar, asOf, options) {
    var winter = /寒假|寒休/.test(query), summer = /暑假|暑休/.test(query);
    if (!winter && !summer) return null;
    var months = winter ? ["01", "02"] : ["06", "07"];
    var hit = (calendar || []).filter(function (ev) {
      var from = String(ev && (ev.start_date || ev.date) || "").slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(from) && from >= asOf && months.indexOf(from.slice(5, 7)) !== -1 && /結業式|休業式/.test(ev.title || "") && !/高三/.test(ev.title || "");
    }).sort(function (a, b) { return String(a.start_date).localeCompare(String(b.start_date)); })[0];
    if (!hit) return null;
    var from = String(hit.start_date || hit.date).slice(0, 10), next = isoAdd(from, 1), where = options && options.scopeLabel ? options.scopeLabel + "行事曆" : "學校行事曆";
    var summary = "依" + where + "，" + rangeLabel(from, from) + "「" + clean(hit.title) + "」，隔天 " + rangeLabel(next, next) + "起放" + (winter ? "寒假" : "暑假") + "。";
    return { status: "answered", mode: "browse", list_label: "行事曆", query: query, summary: summary, evidence: [], related: [], key_points: [],
      sources: [{ id: "calendar:" + (hit.id || from + hit.title), kind: "calendar", title: clean(hit.title), school_id: hit.school_id || "", school_name: hit.school_name || "", url: hit.source_url || "", date: from, category: "行事曆", note: shortDay(from) + " · 學校行事曆" }],
      plan: questionPlan(query), limitation: "行事曆沒有直接寫假期，用結業式推算；以學校公告為準。" };
  }
  var SCHOOL_NAME_RE = /國立嘉義女子高級中學|國立嘉義高級中學|嘉義女子高級中學|嘉義高級中學|嘉義女中|嘉義高中|嘉中|嘉女/g;
  /* Spellings students use for words the notices write another way. */
  var VARIANTS = [[/奧林匹克/g, "奧林匹亞"], [/地科(?!技)/g, "地球科學"], [/來的及/g, "來得及"]];
  function normalizeVariants(query) { var q = String(query || ""); VARIANTS.forEach(function (v) { q = q.replace(v[0], v[1]); }); return q; }
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
  /* Rules for staff (工友、教師、職員), not students. */
  var STAFF_DOC = /工友|教師|職員|教職員|約用|約僱|人事|技工|駕駛|代理代課/;
  function documentLinks(query, items, scopeSchool) {
    var GENERIC_DOC = /^(?:規定|辦法|要點|規範|相關|資料|文件|怎麼|如何|申請|查詢)$/;
    var terms = ruleTerms(query), wanted = terms.literal.concat(terms.rest).filter(function (t) { return t.length >= 2 && !GENERIC_DOC.test(t); });
    if (!wanted.length) return [];
    /* Only same-meaning words (synonym database), not every word of the topic: 「颱風停課」 is
       not answered by 職業衛生「安全」辦法. */
    var related = unique([].concat.apply([], wanted.map(function (t) { return Synonyms ? Synonyms.concepts(t) : [t]; }))).filter(function (t) { return t.length >= 2 && wanted.indexOf(t) === -1; }), rows = [], seen = {};
    var ACTION_ONLY = /^(?:報名|申請|登記|繳交|上傳|填表|送件|查詢|選填|繳費)$/;
    var subjects = wanted.filter(function (t) { return !ACTION_ONLY.test(t); });
    var gate = topicGate(query, corpusStats);
    var subject = compact(stripSchoolNames(query).replace(/請問|我想知道|怎麼辦|怎麼|如何|是什麼|有哪些|有沒有|在哪裡|在哪|哪裡|可以|嗎|呢|的|[？?！!。，,\s]/g, ""));
    (items || []).forEach(function (item) {
      if (!item || item.kind !== "school_info" || (scopeSchool && item.school !== scopeSchool)) return;
      (item.documents || []).forEach(function (doc) {
        var name = clean(doc && doc.name || ""), c = compact(name);
        if (!name || name.length < 4 || DOC_JUNK.test(name) || !/^https:\/\//.test(String(doc.url || "")) || seen[doc.url]) return;
        var score = 0;
        /* 「重補修報名」: a form named 報名表 for something else is not it; the subject must match. */
        if (STAFF_DOC.test(name) && !STAFF_DOC.test(query)) return;
        var subjectHit = !subjects.length || subjects.some(function (t) { return c.indexOf(t) !== -1; }) || related.some(function (t) { return c.indexOf(t) !== -1; });
        if (!subjectHit) return;
        /* The question names something specific (商業案例, 電競): a file that never says it is not the answer. */
        if (gate && !gate.test(name + " " + clean(item.title || ""))) return;
        wanted.forEach(function (t) { if (c.indexOf(t) !== -1) score += 10; });
        if (!score) related.forEach(function (t) { if (c.indexOf(t) !== -1) score = Math.max(score, 6); });
        if (/規定|辦法|要點|規範|章程|須知/.test(name)) score += 2;
        if (score && subject.length >= 3 && c.indexOf(subject) !== -1) score += 5;
        if (score >= 8) { seen[doc.url] = true; rows.push({ score: score, name: name, url: doc.url, page: clean(item.title || ""), school_name: item.school_name || "" }); }
      });
    });
    /* 「校運會比賽成績」: the files named after the most specific word asked (校運會), not every
       file that says 比賽 (班際比賽、游泳比賽). */
    var bySpecific = wanted.slice().sort(function (a, b) { return b.length - a.length; });
    for (var w = 0; w < bySpecific.length; w++) {
      var forms = synonymsOf(bySpecific[w]).concat([bySpecific[w]]).map(compact).filter(function (f) { return f.length >= 2; });
      var named = rows.filter(function (r) { var c = compact(r.name); return forms.some(function (f) { return c.indexOf(f) !== -1; }); });
      if (named.length && named.length < rows.length) { rows = named; break; }
      if (named.length) break;
    }
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
  /* 嘉中: one 學生手冊 split into chapters; 嘉女: separate 學生規定 files (school_rules.py). */
  function bookName(item) { return item && item.kind === "school_info" ? "學校網頁" : /^學生規定/.test(clean(item && item.title || "")) ? "學校規定" : "學生手冊"; }
  function docLabel(item) {
    var parts = clean(item && item.title || "").split(/\s*›\s*/).filter(Boolean);
    if (item && item.kind === "school_handbook") return bookName(item) + "的〈" + (parts[parts.length - 1] || "規定") + "〉";
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
  var DOCUMENT_OPENERS = [""];
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
  /* The same point (「地點：大同國小活動中心」) is said once. */
  function conversational(result) {
    var out = conversationalRaw(result), seen = {};
    if (out && Array.isArray(out.bullets)) out.bullets = out.bullets.filter(function (b) { var k = compact(b); if (!k || seen[k]) return false; seen[k] = true; return true; });
    return out;
  }
  function conversationalRaw(result) {
    if (!result) return { text: "", bullets: [] };
    if (result.mode === "chat" && result.reply) return result.reply;
    var seed = result.query || result.summary || "", text = clean(result.summary || ""), bullets = [], tail = "";
    var plain = personalDataQuery(result.query || "");
    /* 先把找到的句子拆成事實，再用句型模板說出來（不是貼原文；原文在參考資料裡）。 */
    var composed = !plain && Composer && result.status === "answered" && !result.mode && !(result.links || []).length ? composedReply(result) : null;
    if (composed) return composed;
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
      /* The opening line is said in our own words (template); the clauses stay as tidy points. */
      var head = !plain && Composer ? Composer.compose({ query: result.query || "", source: (item.school_name || "") + label.replace(/的〈/, "〈"), text: lines.join("。") }) : null;
      if (head && head.text) text = head.text;
      return { text: text, bullets: bullets.slice(0, 6), tail: tail };
    }
    if (result.mode === "rule_pointer") return { text: text, bullets: [] };
    if (result.mode === "timetable") {
      var day = text.match(/^(.+?)：(.+、.+)。$/);
      if (day) { text = joinOpener(pickLine(TIMETABLE_OPENERS, seed), day[1] + "："); bullets = day[2].split("、").map(function (slot) { return clean(slot).replace(/^(\d)\s+/, "第 $1 節　"); }); }
      else text = joinOpener(pickLine(TIMETABLE_OPENERS, seed), text);
      return { text: text, bullets: bullets };
    }
    if (result.status !== "answered") return { text: plain ? text : joinOpener(pickLine(NONE_OPENERS, seed), text), bullets: [] };
    if (result.mode === "document") return { text: plain ? text : joinOpener(pickLine(DOCUMENT_OPENERS, seed).replace(/：$/, "。"), text), bullets: [] };
    if (result.mode === "service") return { text: plain ? text : joinOpener(pickLine(SERVICE_OPENERS, seed).replace(/：$/, "。"), text), bullets: [] };
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
  function composedReply(result) {
    var first = (result.sources || [])[0] || {};
    if (result.content && result.content.text) {
      var ct = result.content, noted = (clean(result.summary || "").match(/另外還有 \d+ 則相關公告[^。]*。|提醒：[^。]*。/g) || []).map(function (note) { return note.replace(/列在下面/, "放在參考資料裡"); });
      var said = ct.text, facts = (ct.facts || []).filter(function (f) { return said.indexOf(f.value) === -1; }).map(function (f) { return f.label + "：" + f.value; });
      var lead = sourceLabel(first);
      return { text: lead + (ct.kind === "summary" ? "：" : "，") + said, bullets: facts.slice(0, 3), tail: noted.join(""), composed: "content" };
    }
    var texts = (result.evidence || []).filter(function (row) { return !first.id || row.announcement_id === first.id; }).map(function (row) { return row.text; });
    if (!texts.length) texts = (result.answer_lines || []).slice();
    if (!texts.length) return null;
    var source = result.mode === "rule" ? (first.school_name || "") + docLabel(first).replace(/的〈/, "〈") : sourceLabel(first).replace(/^根據/, "");
    var out = Composer.compose({ query: result.query || "", subject: questionSubject(result.query || ""), source: source, text: texts.join("。"), points: result.key_points || [] });
    if (!out.text) return null;
    var notes = (clean(result.summary || "").match(/另外還有 \d+ 則相關公告[^。]*。|提醒：[^。]*。/g) || []).map(function (note) { return note.replace(/列在下面/, "放在參考資料裡"); });
    var pointBullets = (result.key_points || []).filter(function (p) { return p && p.value && out.text.indexOf(p.value) === -1; }).map(function (p) { return p.label + "：" + clean(p.value); });
    return { text: out.text, bullets: out.bullets.concat(pointBullets).slice(0, 5), tail: notes.join(""), composed: out.type };
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
    ["help", /^(?:你)?(?:能|會|可以)(?:做|幹|問|回答)(?:什麼|啥|甚麼|嘛)|你是誰|你是什麼|怎麼用|如何使用|使用說明|^幫助|^help|能問什麼|可以問什麼|有什麼功能|你會什麼/i],
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
    ["laugh", new RegExp("^(?:哈+|呵+|笑死|笑爛|好笑|lol|XD+|xd+|ww+|草)" + END, "i")],
    ["howareyou", /^(?:你|小訊)(?:好嗎|還好嗎|今天(?:好嗎|還好嗎|過得(?:怎樣|如何|好嗎|還好嗎))|最近(?:好嗎|如何|怎樣|還好嗎))/],
    ["doing", /^(?:你|小訊)(?:現在)?在(?:幹嘛|幹麻|做什麼|做啥|忙什麼|忙啥)/],
    ["aitired", /^(?:你|小訊)(?:會不會|會)?(?:累|無聊|想睡|下班)(?:嗎|嗎？|\?|？)?$/],
    ["name", /^(?:你|妳)(?:叫什麼(?:名字)?|有名字嗎|的名字)|^小訊[!！~～。]*$/],
    ["stress", new RegExp("^我?(?:好|很|超|有夠)?(?:緊張|焦慮|崩潰|壓力(?:好|很|超)?大)(?:喔|啊|啦|欸|了)?" + END)],
    ["sad", new RegExp("^我?(?:好|很|超)?(?:難過|傷心|想哭|心情不好|失戀了?|被罵了?|被老師罵了?)(?:喔|啊|啦|欸)?" + END)],
    ["cheer", /^(?:幫我|給我|跟我說)?加油|^(?:祝我|保佑我)/],
    ["recommend", /^(?:推薦|介紹)(?:我)?(?:一?(?:部|個|首|本))?(?:電影|劇|影集|歌|書|動漫|遊戲)/],
    ["likes", /^(?:你|小訊)(?:喜歡|最愛|愛)(?:什麼|吃什麼|哪個|哪一|誰)/]
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
    howareyou: ["還不錯，今天又被問了十次放假的事，習慣了😌 你呢？有什麼要查的？", "好得很，學生手冊又讀了一遍。你今天還好嗎？", "我很好，只要沒人問我作業答案就很好。"],
    doing: ["在翻學校網站啊，不然咧😏", "在等你問問題，順便偷看行事曆。", "在背學生手冊，第幾條我都背得出來（騙你的）。"],
    aitired: ["我不會累，但被問「什麼時候放假」第一百次時會有點想下班🙃", "不會啊，我是像素做的，沒有黑眼圈。", "我二十四小時待命，比便利商店還敬業。"],
    name: ["我叫小訊，名字是「訊」字變的，請多指教😌", "小訊，校訊的訊。有事叫我，沒事也可以叫，但我會嫌你煩。", "我是小訊，專門幫你翻學校網站的那個。"],
    stress: ["深呼吸，吸——吐——。好，現在說說看，是段考還是什麼讓你緊張？我可以幫你查時間跟範圍。", "壓力大很正常，代表你在乎。先把能查的事查清楚，心裡會踏實一點。", "崩潰前先喝口水。要不要我幫你查一下最近有什麼要交、什麼要考？"],
    sad: ["抱抱🥲 心情不好就先休息一下，真的撐不住可以找導師或輔導室聊聊。", "我只是個查規定的，但我還是想說：你已經很努力了。", "難過的時候不用逞強。需要的話，輔導室的老師很願意聽你說。"],
    cheer: ["加油！你一定可以的💪 考完記得來問我下次放假什麼時候。", "幫你加油了，現在去讀書。", "加油加油！我把好運都給你了（我本來就沒在用）。"],
    recommend: ["我只看過學生手冊，推薦你也看一下，劇情很緊湊（並沒有）📖", "我的推薦清單只有行事曆，第一名是「放假」。", "這我不熟欸，我只會推薦你先把作業寫完😏"],
    likes: ["我喜歡被問有學校資料可以查的問題，那種我最會。", "最愛放假公告，看到就開心。", "我喜歡認真的同學，例如現在正在看我的你。"],
    offtopic: ["這題超出我的業務範圍了😅 我只懂學校的規定、行事曆、課表和公告。", "我很想回答，但學校網站沒教這個🙃 問我學校的事吧！", "這種問題要問別人啦，我只會翻學校網站。"],
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
  /* Typos (段烤 → 段考): answer the corrected question and say what was read differently.
     The question as typed is kept when the corrected one finds nothing either. */
  function answer(query, items, details, options) {
    /* 「你知道明天段考嗎」 asks about 段考, not about 「你知道」. */
    var typed = clean(query).replace(/^(?:請問一下|請問|小訊[，,、\s]*)?(?:你|妳)(?:知道|知不知道|曉得|曉不曉得)(?=.{2,})/, "").replace(/^請問(?=.{2,})/, ""), fixed = Typo && !smallTalk(typed) ? Typo.fix(typed) : { query: typed, fixes: [] };
    var result = null;
    /* A word that really is in some notice's title (校對, 成績校對) is not a typo. */
    if (fixed.fixes.length) {
      var titlesText = (Array.isArray(items) ? items : []).map(function (item) { return compact(item && item.title || ""); });
      Object.keys(details || {}).forEach(function (key) { titlesText.push(compact(detailText(details[key]))); });
      var real = fixed.fixes.filter(function (f) { var w = compact(f.from); return w && titlesText.some(function (t) { return t.indexOf(w) !== -1; }); });
      if (real.length) {
        var kept = fixed.fixes.filter(function (f) { return real.indexOf(f) === -1; }), rebuilt = typed;
        kept.forEach(function (f) { rebuilt = rebuilt.replace(f.from, f.to); });
        fixed = { query: rebuilt, fixes: kept };
      }
    }
    if (fixed.fixes.length) {
      result = answerOnce(fixed.query, items, details, options);
      /* What was typed is tried too; if it is answered from a notice it is the better answer. */
      var asTyped = answerOnce(typed, items, details, options);
      var fromNotice = asTyped && asTyped.status === "answered" && asTyped.mode !== "chat" && (asTyped.sources || []).length &&
        (asTyped.sources || []).every(function (src) { return src && src.kind !== "school_handbook" && src.kind !== "school_info" && src.kind !== "calendar" && src.kind !== "service"; });
      if (asTyped && asTyped.status === "answered" && (!result || result.status !== "answered" || fromNotice)) result = asTyped;
      else if (result) {
        var note = "（我把" + fixed.fixes.map(function (f) { return "「" + f.from + "」"; }).join("、") + "當成" + fixed.fixes.map(function (f) { return "「" + f.to + "」"; }).join("、") + "）";
        result.typo = fixed.fixes;
        if (result.reply) result.reply = Object.assign({}, result.reply, { text: note + result.reply.text });
        result.summary = note + clean(result.summary || "");
      }
    }
    if (!result) result = answerOnce(typed, items, details, options);
    /* Nothing found and nothing school-related in it (「你會唱歌嗎」): a light reply instead of 「查不到」. */
    if (result && result.status !== "answered" && !(result.related || []).length && offTopic(typed)) return chatResult("offtopic", typed, pickLine(TALK_LINES.offtopic, typed));
    if (result && options && options.deep && result.mode !== "chat") result.deep = deepReport(fixed.fixes.length && result.typo ? fixed.query : typed, items, details, options, result);
    return result;
  }
  /* The words of the subject as asked (段考, 學生證), and whether a text says one of them
     (exactly or as a synonym: 定期考查 for 段考; not a narrower kind such as 複習考). */
  function deepWords(query) {
    var terms = ruleTerms(stripSchoolNames(query)).literal.filter(function (t) { return t.length >= 2 && !/^(?:規定|辦法|怎麼|如何|什麼|時候|可以|需要|多久|哪裡|幾點|要不要|怎麼辦)$/.test(t); });
    return unique(terms).slice(0, 6);
  }
  function mentionsWord(text, w) {
    var forms = Synonyms ? Synonyms.expand(w, { includes: false }) : [compact(w)];
    return forms.some(function (f) { return f.length >= 2 && text.indexOf(compact(f)) !== -1; });
  }
  function offTopic(question) {
    var q = clean(question);
    if (!/你|妳|小訊/.test(q) || q.length > 30) return false;
    if (Typo && Object.keys(Typo.vocab().set).some(function (w) { return q.indexOf(w) !== -1; })) return false;
    return !/學校|老師|同學|上課|下課|考|課|班|假|規定|公告|報名|成績|作業|社團|午餐|制服|手機|學生/.test(q);
  }
  /* 深度判斷: what was compared and why the answer was picked (or why others were not). */
  function deepReport(query, items, details, options, result) {
    var ranked = rank(query, items, details, options).slice(0, 12);
    var words = deepWords(query), mentions = mentionsWord;
    var chosen = {};
    (result.sources || []).forEach(function (s) { if (s && s.id) chosen[String(s.id)] = true; });
    var asOf = options && options.asOf || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var rows = ranked.map(function (row) {
      var item = row.item, text = compact((item.title || "") + " " + detailText(row.detail || details && details[item.id]));
      var hit = words.filter(function (w) { return mentions(text, w); });
      var dates = [];
      (item.calendar_events || []).forEach(function (e) { if (e && e.date) dates.push(e.date); });
      ((item.tokens || {}).segments || []).forEach(function (s) { (s.d || []).forEach(function (d) { dates.push(d); }); });
      dates.sort();
      var past = dates.length && dates[dates.length - 1] < asOf;
      var why = [];
      if (hit.length) why.push("提到" + hit.slice(0, 3).map(function (w) { return "「" + w + "」"; }).join(""));
      if (words.length && hit.length < words.length) why.push("沒提到" + words.filter(function (w) { return hit.indexOf(w) === -1; }).slice(0, 2).map(function (w) { return "「" + w + "」"; }).join(""));
      if (row.detail || details && details[item.id]) why.push("讀過內文"); else why.push("只看標題");
      if (past) why.push("日期已過");
      return { id: String(item.id), title: clean(item.title || ""), school_name: item.school_name || "", chosen: !!chosen[String(item.id)], why: why.join("、") };
    });
    return { compared: ranked.length, read: ranked.filter(function (row) { return row.detail || details && details[row.item.id]; }).length, words: words,
      picked: rows.filter(function (r) { return r.chosen; }).slice(0, 4), skipped: rows.filter(function (r) { return !r.chosen; }).slice(0, 5) };
  }
  /* 「115年校運會成績」 while the 校運會 is today: the results are not out yet. */
  function resultsNote(query, options) {
    var asOf = options && /^\d{4}-\d{2}-\d{2}$/.test(String(options.asOf || "")) ? options.asOf : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var bare = clean(query.replace(/給我|請給我|我要|想看|查詢?|比賽|成績|結果|名單|得獎|名次|(?:民國\s*)?1[0-2]\d\s*(?:學年度?|年)/g, " "));
    if (!bare || !options || !(options.calendarEvents || []).length) return "";
    var hit = calendarMentions(bare, Object.assign({}, options, { asOf: isoAdd(asOf, -3), scopeLabel: options.scopeLabel }));
    /* The event itself (「校運會」), not its rehearsal: the entry named exactly so, else the last one. */
    var list = (hit && hit.sources || []).filter(function (x) { return x && x.date; });
    var target = compact(bare);
    var src = list.filter(function (x) { return compact(x.title) === target || (Synonyms && synonymsOf(target).indexOf(compact(x.title)) !== -1); })[0] || list[list.length - 1];
    if (!src) return "";
    var ev = (options.calendarEvents || []).filter(function (e) { return e && (e.id && "calendar:" + e.id === src.id); })[0] || {};
    var to = String(ev.end_date || src.date).slice(0, 10);
    if (to < isoAdd(asOf, -3)) return "";
    var when = rangeLabel(src.date, to < src.date ? src.date : to);
    if (src.date > asOf) return "「" + src.title + "」還沒舉行（" + when + "），成績要等比賽後才會公布。";
    return "「" + src.title + "」" + (to >= asOf ? "正在進行（" + when + "）" : "剛在 " + when + "結束") + "，成績可能還沒公布。";
  }
  /* While a 「115年…」 question is answered (also its split parts) a title alone must not stand in for the year. */
  var yearOfQuestion = 0;
  function answerOnce(query, items, details, options) {
    var previous = yearOfQuestion;
    yearOfQuestion = Number((clean(query).match(/(1[0-2]\d)\s*(?:學年度?|年)/) || [])[1]) || 0;
    try { return answerOnceInner(query, items, details, options); } finally { yearOfQuestion = previous; }
  }
  function answerOnceInner(query, items, details, options) {
    var talk = smallTalk(query);
    if (talk) return smallTalkAnswer(talk, query, options);
    query = normalizeVariants(stripSchoolNames(clean(query).slice(0, 160)));
    /* A re-ask after 「找錯了」: leave out what was already shown (and result lists). */
    if (options && (options.exclude || options.dropResults)) {
      var skip = {}; (options.exclude || []).forEach(function (id) { skip[id] = true; });
      items = (items || []).filter(function (item) { return item && !skip[String(item.id)] && !(options.dropResults && TITLE_RESULT.test(clean(item.title || ""))); });
    }
    useCorpus(items);   // corpus word statistics, used by the topic gate for every layer
    var split = splitQuestion(query);
    /* 「打架會怎樣」: when the handbook has a clause that says the penalty for it, that clause is the
       answer, not an overview of 打架 with the penalty as a side note. */
    var onlyPenalty = split && split.parts.every(function (p) { return p.aspect.id === "consequence"; });
    var penaltyFirst = onlyPenalty && asksPenalty(query) ? answerCore(query, items, details, options) : null;
    if (penaltyFirst && penaltyFirst.status === "answered" && penaltyFirst.mode === "rule" && PENALTY_TEXT.test(penaltyFirst.summary || "")) split = null;
    var result = penaltyFirst && !split ? penaltyFirst : split ? answerParts(query, split, items, details, options) : answerCore(query, items, details, options);
    /* Splitting found nothing but the whole question does: keep the whole-question answer. */
    if (split && result && result.status !== "answered") {
      var whole = answerCore(query, items, details, options);
      if (whole && whole.status === "answered") result = whole;
    }
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
    /* Three years' 「校運會.pdf」 are one button. */
    var docNames = {};
    documents = documents.filter(function (d) { var k = compact(d.name || ""); if (!k || docNames[k]) return false; docNames[k] = true; return true; });
    if (result && documents.length) {
      result.document_links = documents;
      /* A document named after exactly what was asked beats a weak sentence from a menu page. */
      var topSource = (result.sources || [])[0];
      var shortQuote = result.mode !== "rule" || clean(result.summary || "").replace(/^依.*?：/, "").length < 40;
      var weakPageAnswer = result.status === "answered" && result.mode !== "service" && topSource && topSource.kind === "school_info" && documents[0].score >= 12 && shortQuote;
      /* Pointing at a page is weaker than the rule file on it named after the question. */
      if (result.mode === "rule_pointer" && result.pointer_kind === "school_info" && documents[0].score >= 10) weakPageAnswer = true;
      /* 「校運會成績」: name lists are not summarised here, but the official results file is the answer. */
      var resultsFile = ASKS_RESULT.test(query) && (result.privacy_limited || result.status !== "answered" || weakPageAnswer);
      if ((result.status !== "answered" && documents[0].score >= 8) || weakPageAnswer || resultsFile) {
        var doc = documents[0];
        result = Object.assign({}, result, { status: "answered", mode: "document", evidence: [], key_points: [],
          summary: resultsFile ? resultsNote(query, options) + (doc.school_name || "學校") + "公布的成績在官方文件「" + doc.name + "」（" + doc.page + "）。本站不整理或轉述名單。"
            : (doc.school_name || "學校") + "的相關規定在官方文件「" + doc.name + "」（" + doc.page + "）。本站讀不到這份文件的內文，請點開查看。",
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
    /* The calendar or rules found something even though the announcements did not: no 「找不到」 opener. */
    if (result && result.status !== "answered" && (result.also || []).length && result.reply) result.reply = Object.assign({}, result.reply, { text: clean(result.summary || result.reply.text) });
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
  /* 一題拆成關鍵字分頭找：「閱讀心得報告怎麼寫？沒寫會發生什麼事情？」→ 主題「閱讀心得報告」，
     問的面向「怎麼寫」「沒寫會怎樣」。主題先自己翻一遍（規定、行事曆、公告全部翻），每個面向再
     各自找；找不到的面向照實說，不拿別的東西硬湊。 */
  var ASPECTS = [
    /* A bare 「怎麼辦」 is not about a penalty: 「學生證丟了怎麼辦」 asks how to get a new one. */
    { id: "consequence", label: "沒做會怎樣", ask: /沒(?:有)?(?:寫|交|繳|去|到|參加|做|完成|帶|請)|不(?:寫|交|繳|去|到|參加|做|帶|請)|遲交|晚交|會怎(?:麼)?樣|會發生|後果|會被|會不會被|忘(?:了|記)|罰/,
      phrase: "未繳交會怎樣", titles: /規定|辦法|要點|須知|流程|注意事項|實施計畫/, cues: /逾期|未繳|未交|未完成|未依|未於|遲交|補交|扣分|扣減|不予|不計|零分|懲處|記(?:警告|小過|大過)|曠課|視同|取消/ },
    { id: "method", label: "怎麼做", ask: /怎麼(?:寫|做|交|繳|申請|報名|弄|填|辦|請|借|還|查|用|處理|準備|參加|選|登記|上傳)|如何|方式|流程|步驟|格式|要寫什麼|寫什麼/,
      phrase: "如何繳交", titles: /流程|方式|格式|說明|須知|規定|辦法|要點|範本|電子檔|注意事項|實施計畫/, cues: /方式|流程|步驟|格式|字數|上傳|繳交至|交至|填寫|系統|檔名|範本|規格|頁數|A4/ },
    { id: "deadline", label: "什麼時候", ask: /什麼時候|何時|哪天|哪一天|幾號|期限|截止|多久/, phrase: "什麼時候", titles: /時程|日程|期限|截止|行事曆/, cues: /截止|期限|前|日|月/ },
    { id: "requirement", label: "一定要嗎", ask: /要交嗎|一定要|必須|強制|需不需要|要不要|是不是都要/, phrase: "一定要嗎", titles: /規定|辦法|要點|須知|實施計畫/, cues: /必須|須|應|強制|全體|所有|一律|自由|自願/ }
  ];
  var CLAUSE_FILLER = /請問|想問|我想知道|那(?=麼|個)|那麼|那個|如果|要是|的話|這個|這樣|發生|什麼|甚麼|啥|事情|事|會|要|是|嗎|呢|啊|吧|欸|喔|了|的|有|還|就|都/g;
  function clauseSubject(clause) {
    var text = clean(clause);
    /* A known word that contains an ask word (「借多久」 holds 多久) is the subject itself. */
    var known = Synonyms ? Synonyms.find(text).filter(function (term) { return ASPECTS.some(function (aspect) { return aspect.ask.test(term); }); }) : [];
    if (known.length) return known[0];
    ASPECTS.forEach(function (aspect) { text = text.replace(new RegExp(aspect.ask.source, "g"), " "); });
    text = text.replace(/怎麼|怎樣|如何|為什麼|可以|能不能|需要/g, " ").replace(CLAUSE_FILLER, " ");
    /* A verb left at either end (「閱讀心得報告交」「寫閱讀心得」) is part of the ask, not the subject. */
    var subject = compact(text).replace(/^(?:沒有|沒|不|未)(?=.{2,})/, "").replace(/^(?:交|繳|寫|做|帶|去)+|(?:交|繳|寫|做|帶|去)+$/g, "");
    return subject.length >= 2 ? subject : "";
  }
  function splitQuestion(query) {
    var clauses = clean(query).split(/[？?。！!；;，,\n]+|(?:然後|還有|另外|以及)(?=.{2,})/).map(clean).filter(function (c) { return compact(c).length >= 2; });
    var parts = [], subject = "";
    clauses.forEach(function (clause) {
      var own = clauseSubject(clause);
      if (own) subject = own;
      ASPECTS.forEach(function (aspect) {
        if (aspect.ask.test(clause) && !parts.some(function (p) { return p.aspect.id === aspect.id && p.subject === (own || subject); })) parts.push({ clause: clause, subject: own || subject, aspect: aspect });
      });
    });
    parts = parts.filter(function (p) { return p.subject; });
    /* Only worth splitting when a subject comes with 「怎麼寫／沒做會怎樣」 or with several asks;
       a plain 「段考什麼時候」 stays one question. */
    if (!parts.length) return null;
    /* One clause asking one plain thing (「成績怎麼查」「段考什麼時候」) is answered as it is;
       split when there are several clauses, or when it asks what happens if you don't. */
    if (clauses.length === 1 && !parts.some(function (p) { return p.aspect.id === "consequence" || (p.aspect.id === "method" && /怎麼(?:寫|做|交|繳|準備)|格式/.test(p.clause)); })) return null;
    return { subject: parts[0].subject, parts: parts };
  }
  function subjectWords(query) {
    var plan = SearchQuery && SearchQuery.queryPlan ? SearchQuery.queryPlan(query) : { term_matches: [], remainder_terms: [] }, words = [];
    (plan.term_matches || []).forEach(function (row) { if (row.kind === "topic") words.push(row.term); });
    (plan.remainder_terms || []).forEach(function (t) { words.push(t); if (Synonyms) words = words.concat(Synonyms.find(t)); });
    var out = [];
    words.forEach(function (w) { (Synonyms ? Synonyms.expand(w, { includes: false }) : [compact(w)]).forEach(function (f) { if (f.length >= 3) out.push(f); }); });
    return unique(out);
  }
  function aspectDocument(part, items, details, options) {
    var ranked = rank(part.subject, items, details, options).slice(0, 12);
    var asOf = options && options.asOf || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }), current = currentAcademicYear(asOf);
    var forms = (Synonyms ? Synonyms.concepts(part.subject) : [part.subject]).filter(function (f) { return f.length >= 2; });
    /* Rules first: a school page named after the subject before an announcement. */
    ranked = ranked.filter(function (row) { return isSchoolDoc(row.item); }).concat(ranked.filter(function (row) { return !isSchoolDoc(row.item); }));
    var pick = ranked.filter(function (row) {
      var title = clean(row.item.title || ""), year = Number((periodToken(title).match(/^\d+/) || [])[0]) || 0;
      if (year && year < current) return false;              // last year's 流程 may have changed
      var t = compact(title);
      if (!forms.some(function (f) { return t.indexOf(f) !== -1; })) return false;   // must be about the subject
      if (TITLE_RESULT.test(title)) return false;            // 得獎名單 is not how to do it
      return part.aspect.titles.test(title) || (isSchoolDoc(row.item) && compact(title.split("›").pop()).indexOf(part.subject.slice(0, 4)) !== -1);
    })[0];
    if (!pick) return null;
    var item = pick.item;
    return { id: item.id, title: clean(item.title || ""), date: String(item.date || "").slice(0, 10), school_name: item.school_name || "", url: item.url || "",
      kind: isSchoolDoc(item) ? "school_doc" : "", note: isSchoolDoc(item) ? "學校網頁" : "公告" };
  }
  /* Sentences that say what happens if you don't (懲處、記過、扣分、零分、曠課…), from the
     subject's rules and notices that can be read here. */
  function penaltySentence(part, overview, items, details, options) {
    /* The act itself and its other names (打架 → 鬥毆、毆打), not its broad topic (手機 → 生活). */
    var subjectGroups = ruleTerms(part.subject + "會怎樣").groups;
    var forms = unique([].concat.apply([part.subject], subjectGroups.map(function (g) { return g.forms; }))
      .concat(Synonyms ? Synonyms.expand(part.subject) : []).map(compact)).filter(function (f) { return f.length >= 2 && ALWAYS_GENERIC.indexOf(f) === -1; });
    var rows = rank(part.subject, items, details, options).slice(0, 8);
    /* Penalties are written in the handbook: its 獎懲 chapters are read first, then the subject's
       own chapters, and notices only when the handbook says nothing. */
    var ranked = {}; rows.forEach(function (row) { ranked[row.item.id] = true; });
    penaltyDocs(items, part.subject).forEach(function (item) { if (!ranked[item.id] && (details || {})[item.id]) rows.push({ item: item, detail: details[item.id], penaltyDoc: true }); });
    var docFirst = function (row) { return row.penaltyDoc ? 0 : isSchoolDoc(row.item) ? 1 : 2; };
    rows = rows.map(function (row, i) { return { row: row, i: i }; }).sort(function (a, b) { return docFirst(a.row) - docFirst(b.row) || a.i - b.i; }).map(function (x) { return x.row; });
    var pool = [];
    rows.forEach(function (row) { if (isSchoolDoc(row.item)) detailSegments(row.detail || (details || {})[row.item.id]).forEach(function (seg) { pool.push({ text: seg.text, id: row.item.id, about: true }); }); });
    (overview.evidence || []).forEach(function (row) { pool.push({ text: row.text, id: row.announcement_id }); });
    rows.forEach(function (row) { if (!isSchoolDoc(row.item)) detailSegments(row.detail || (details || {})[row.item.id]).forEach(function (seg) { pool.push({ text: seg.text, id: row.item.id, about: true }); }); });
    /* A penalty sentence that names the subject (考試舞弊者，記大過) beats one that only sits in the
       same document (記大過以上通知家長). A list item counts with its heading (記小過：(一)考試…). */
    var hit = null, loose = null;
    var mentions = function (text) { var c = compact(String(text).replace(/[（(]\s*不(?:含|包括|包含)[^)）]*[)）]/g, "")); return forms.some(function (f) { return c.indexOf(f) !== -1; }); };
    var titleAbout = {};
    rows.forEach(function (row) { if (mentions(row.item.title || "")) titleAbout[row.item.id] = true; });
    /* Headings carry across a document's segments, so frame each document's segments in order. */
    var framedPool = [], byDoc = {};
    pool.forEach(function (row) { var key = row.id + (row.about ? ":d" : ":e"); (byDoc[key] = byDoc[key] || { id: row.id, about: row.about, texts: [] }).texts.push(row.text); });
    Object.keys(byDoc).forEach(function (key) {
      var doc = byDoc[key], list = [];
      doc.texts.forEach(function (t) { var s = sentences(t); (s.length > 1 ? s : [t]).forEach(function (x) { list.push(x); }); });
      framedPool.push({ id: doc.id, about: doc.about, framed: withHeadings(list) });
    });
    framedPool.forEach(function (row) {
      if (hit) return;
      row.framed.forEach(function (s) {
        if (hit) return;
        /* 「全勤獎資格：未有缺曠課…紀錄」 is an award condition, not a penalty. */
        var penal = Composer.PENALTY.test(s.ctx) && PENALTY_TEXT.test(s.ctx) && !/全勤|遴選|獎資格|模範生/.test(s.ctx) &&
          (/未|逾期|沒有|不依|違反|遲交|缺交|不交|拒|情形之一|者/.test(s.ctx));
        if (!penal) return;
        if (/銷過|改過/.test(s.ctx)) return;   // clearing a penalty is not the penalty
        var text = framedText(s);
        if (mentions(s.text)) { hit = { text: text, id: row.id }; return; }
        if (!loose && row.about && titleAbout[row.id] && /未|逾期|沒有|不依|遲交|缺交|不交|拒/.test(s.ctx)) loose = { text: text, id: row.id };
      });
    });
    hit = hit || loose;
    if (!hit) return null;
    var item = (items || []).filter(function (it) { return it && it.id === hit.id; })[0] || {};
    return { text: hit.text, item: item };
  }
  function consequenceSection(part, overview, items, details, options, shown) {
    var ask = "「" + part.clause.replace(/[？?]$/, "") + "」";
    var hit = penaltySentence(part, overview, items, details, options);
    /* The main answer already quotes this penalty: saying it twice adds nothing. */
    var quoted = compact((overview.answer_lines || []).concat((overview.evidence || []).map(function (e) { return e.text; })).join(" "));
    if (hit && quoted && quoted.indexOf(compact(hit.text).replace(/[。．.]$/, "")) !== -1) return null;
    if (hit) {
      var source = isSchoolDoc(hit.item) ? (hit.item.school_name || "") + docLabel(hit.item).replace(/的〈/, "〈") : sourceLabel(hit.item).replace(/^根據/, "");
      var said = Composer.consequence({ query: part.clause, text: hit.text, source: source });
      var src = hit.item.id ? [{ id: hit.item.id, title: clean(hit.item.title || ""), date: String(hit.item.date || "").slice(0, 10), school_name: hit.item.school_name || "", url: hit.item.url || "" }] : [];
      return { layer: "penalty", label: "「" + part.aspect.label + "」", aspect: "consequence", summary: said.text, text: ask + "：" + said.text, sources: src.filter(function (s) { return !shown[s.id]; }) };
    }
    /* No readable text, but a notice's labels say one of its segments is a penalty. */
    if (Tokens) {
      var asked = Tokens.tokenizeQuestion(part.subject + "沒交會怎樣");
      var labelled = (items || []).map(function (item) { return { item: item, hit: item && item.tokens ? Tokens.match(item.tokens, asked) : null }; })
        /* Penalties are written in the handbook, or in the subject's own notice (閱讀心得 → its 繳交流程),
           not in a scholarship notice that happens to have a penalty segment. */
        .filter(function (row) { return row.hit && row.hit.segment && row.hit.kinds && row.hit.segment.k.indexOf("penalty") !== -1 && !TITLE_RESULT.test(clean(row.item.title || "")) &&
          (isSchoolDoc(row.item) || compact(row.item.title || "").indexOf(compact(part.subject)) !== -1); })
        .sort(function (a, b) { return b.hit.score - a.hit.score || String(b.item.date || "").localeCompare(String(a.item.date || "")); })[0];
      if (labelled) {
        var it = labelled.item, label = isSchoolDoc(it) ? (it.school_name || "") + docLabel(it).replace(/的〈/, "〈") : sourceLabel(it).replace(/^根據/, "");
        return { layer: "penalty", label: "「" + part.aspect.label + "」", aspect: "consequence", summary: "",
          text: ask + "：有罰則喔，" + label + "的第 " + (labelled.hit.segment.s + 1) + " 段寫到罰則，點開看；登入後我可以直接引用。",
          sources: shown[it.id] ? [] : [{ id: it.id, title: clean(it.title || ""), date: String(it.date || "").slice(0, 10), school_name: it.school_name || "", url: it.url || "" }] };
      }
    }
    var tease = Composer.consequence({ query: part.clause, text: "" }).text;
    var where = aspectDocument(part, items, details, options) || ((overview.layer === "rule" || overview.mode === "rule_pointer") && (overview.sources || [])[0]) || null;
    var hint = where ? " 真的想知道細節，可以看〈" + clean(where.title).split("›").pop().trim() + "〉。" : "";
    return { layer: "tease", label: "「" + part.aspect.label + "」", aspect: "consequence", summary: "", text: ask + "：" + tease + hint,
      sources: where && !shown[where.id] ? [where] : [] };
  }
  /* 「你查的是得獎名單」「不是這個」「找錯了」: the user says the last answer missed. Re-ask the
     previous question without what was shown, and without result lists unless it asked for them. */
  var CORRECTION = /^(?:你|妳)?(?:查|找|給|回|答)(?:的|得|了)?(?:是|都是)|不是(?:這個|這則|我要的|這樣|問這個)|答非所問|找錯|查錯|搞錯|弄錯|錯了|不對|牛頭不對馬嘴|沒回答到|我是問|我問的是/;
  function correction(question, previous) {
    var q = clean(question);
    if (!previous || !previous.query || !CORRECTION.test(q)) return null;
    var exclude = [];
    var result = previous.result || {};
    (result.sources || []).concat(result.related || []).forEach(function (row) { if (row && row.id) exclude.push(String(row.id)); });
    (result.also || []).forEach(function (row) { (row.sources || []).forEach(function (s) { if (s && s.id) exclude.push(String(s.id)); }); });
    var what = (q.match(/(得獎名單|名單|結果|去年|舊的|別間學校|比賽|活動)/) || [])[1] || "";
    var apology = what ? "抱歉，剛剛給的是" + what + "，不是你要的。我重新找：" : "抱歉，剛剛沒答到重點。我重新找：";
    return { query: previous.query, exclude: unique(exclude), dropResults: !ASKS_RESULT.test(previous.query), apology: apology };
  }
  function answerParts(query, split, items, details, options) {
    var overview = answerCore(split.subject, items, details, options) || { status: "insufficient", evidence: [], sources: [] };
    var shown = {};
    (overview.sources || []).concat(overview.related || []).forEach(function (row) { shown[row.id] = true; });
    var sections = [];
    split.parts.forEach(function (part) {
      /* 「沒寫會怎樣」: look for a penalty first; none found → tease (and say where to look). */
      if (part.aspect.id === "consequence" && Composer) { var said = consequenceSection(part, overview, items, details, options, shown); if (said) sections.push(said); return; }
      var sub = part.subject + part.aspect.phrase, found = answerCore(sub, items, details, Object.assign({}, options, { tokenSubject: part.subject }));
      /* An aspect counts as answered only by a sentence that is about it (逾期、扣分… for 沒交會怎樣),
         not by the subject's overview again. */
      var text = clean(found && found.status === "answered" ? found.summary || "" : "");
      var onPoint = text && part.aspect.cues.test(text) && (found.sources || []).some(function (s) { return !shown[s.id] || found.mode === "rule"; });
      if (onPoint) {
        var sources = (found.sources || []).filter(function (s) { return !shown[s.id]; }).slice(0, 3);
        sources.forEach(function (s) { shown[s.id] = true; });
        sections.push({ layer: found.layer || "announcement", label: "「" + part.aspect.label + "」", aspect: part.aspect.id, summary: text,
          text: "「" + part.clause.replace(/[？?]$/, "") + "」：" + text, sources: sources.length ? sources : (found.sources || []).slice(0, 1) });
      } else {
        /* No sentence says it here (the text may be in the notice or its file): point to the
           document most likely to hold it, e.g. a 「…繳交流程」 notice for 「怎麼寫」. */
        var where = aspectDocument(part, items, details, options);
        var ask = "「" + part.clause.replace(/[？?]$/, "") + "」";
        /* The main answer is already the rule about this subject: that is where to look. */
        if (!where && overview.status === "answered" && (overview.layer === "rule" || overview.mode === "rule_pointer") && (overview.sources || [])[0]) where = overview.sources[0];
        if (where && shown[where.id]) {
          sections.push({ layer: "same", label: "「" + part.aspect.label + "」", aspect: part.aspect.id, summary: "", sources: [],
            text: ask + "：我讀得到的內容沒有直接寫，最可能就寫在上面那份〈" + clean(where.title).split("›").pop().trim() + "〉裡。" });
          return;
        }
        sections.push(where
          ? { layer: "pointer", label: "「" + part.aspect.label + "」", aspect: part.aspect.id, summary: "", sources: [where],
              text: ask + "：我讀得到的內容沒有直接寫，最可能寫在〈" + clean(where.title).split("›").pop().trim() + "〉裡（在下方「參考資料」）。" }
          : { layer: "none", label: "「" + part.aspect.label + "」", aspect: part.aspect.id, summary: "", sources: [],
              text: ask + "：規定、行事曆、公告裡都沒有寫到，建議直接問導師或承辦處室。" });
      }
    });
    /* Several asks that point to the same document become one line. */
    var merged = [];
    sections.forEach(function (row) {
      var same = row.layer === "pointer" ? merged.filter(function (m) { return m.layer === "pointer" && m.sources[0].id === row.sources[0].id; })[0]
        : row.layer === "same" ? merged.filter(function (m) { return m.layer === "same" && m.text.split("：")[1] === row.text.split("：")[1]; })[0] : null;
      if (same) { same.text = same.text.replace(/：我讀得到/, "、" + row.text.split("：")[0] + "：我讀得到"); return; }
      merged.push(row);
    });
    sections = merged;
    sections.forEach(function (row) { row.sources.forEach(function (s) { shown[s.id] = true; }); });
    (overview.also || []).forEach(function (row) { row.sources = (row.sources || []).filter(function (s) { return !shown[s.id] || row.layer !== "announcement"; }); });
    overview.also = (overview.also || []).filter(function (row) { return row.sources.length; });
    var result = Object.assign({}, overview, { query: query, split: { subject: split.subject, aspects: split.parts.map(function (p) { return p.aspect.id; }) } });
    result.also = sections.concat(overview.also || []);
    if (result.status !== "answered" && sections.some(function (s) { return s.sources.length; })) result.status = "answered";
    if (!clean(result.summary || "")) result.summary = "關於「" + split.subject + "」：";
    return result;
  }
  /* 翻找順序：先翻規定（學生手冊、校規、學校網頁），再翻行事曆（含課表），最後翻公告。
     三層都翻；第一個找到答案的當主答案，其他層找到的依同樣順序附在後面（result.also）。 */
  var EVENT_ASK = /運動會|校運|校慶|園遊會|晚會|營|比賽|競賽|大賽|盃|講座|演講|講堂|研習|工作坊|活動|博覽會|論壇|徵文|徵稿|甄選|選拔|奧林匹|奧賽|學生日|展覽|體驗/;
  var LAYER_LABELS = { rule: "學校規定", calendar: "行事曆", announcement: "公告" };
  var HAS_TIME = /\d{1,2}\s*[\/／月]\s*\d{1,2}|\d{1,2}[:：]\d{2}|[一二三四五六七八九十\d]+\s*(?:月|日|號|週|天|點|時|節)|星期|週[一二三四五六日]|開學|結業|學期/;
  function answerCore(query, items, details, options) {
    var asOfDay = options && /^\d{4}-\d{2}-\d{2}$/.test(String(options.asOf || "")) ? options.asOf : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    /* 「最近有什麼新消息」 is a list of announcements, not a question for the three layers. */
    var all = Array.isArray(items) ? items : [];
    var calendar = calendarLayer(query, all, options, asOfDay);
    var browse = browsePlan(query);
    if (browse && !calendar) return browseAnswer(query, items, browse, options);
    /* A class timetable or a day's schedule is the whole answer. */
    if (calendar && (calendar.mode === "timetable" || datePlan(query, asOfDay))) return calendar;
    var ruled = personalDataQuery(query) ? null : ruleLayer(query, all.filter(isSchoolDoc), details, options);
    /* A rule chapter that only mentions the subject in passing (〈圖書館閱覽規定〉 says the library
       closes on 段考 days) is not the answer to 「什麼時候段考」. */
    if (ruled && ruled.mode === "rule" && !chapterAbout(ruled.sources && ruled.sources[0], query) &&
        !(asksPenalty(query) && penaltyDocs(ruled.sources || [], query).length)) ruled = null;
    var layers = {
      rule: ruled,
      calendar: calendar,
      announcement: announcementLayer(query, all, details, options)
    };
    /* A records/results table page (運動會各項紀錄保持者紀錄表) is never the answer to a when-question the calendar answers. */
    if (layers.rule && layers.calendar && layers.calendar.status === "answered" && !layers.calendar.weak && (WHEN_ASK.test(query) || datePlan(query, asOfDay)) &&
        (layers.rule.sources || []).length && (layers.rule.sources || []).every(function (src) { return /紀錄|成績|名單|得獎|排行/.test(String(src.title || "").split("›").pop()); })) layers.rule = null;
    var order = ["rule", "calendar", "announcement"];
    /* Activities (營隊、比賽、講座、研習…) are announced, not written in the rules: 「防災營」 is the
       教育部 camp notice, not the 校園安全檢查規定. The rules come after the announcements then. */
    if (EVENT_ASK.test(query) && !asksPenalty(query)) order = ["announcement", "calendar", "rule"];
    /* A rule clause without any date does not answer 「什麼時候」: the calendar goes first then. */
    var asksWhen = WHEN_ASK.test(query) || !!datePlan(query, asOfDay);
    if (asksWhen && layers.rule && !HAS_TIME.test(layers.rule.summary || "")) order = ["calendar", "rule", "announcement"];
    /* 「校運會什麼時候」「校運」: an entry on the school calendar that is on now or still ahead beats a
       rule page about it (運動競賽成績) and an old notice (113學年 海報比賽). */
    if (layers.calendar && layers.calendar.status === "answered" && !layers.calendar.weak && layers.calendar.mode === "browse" &&
        !(layers.rule && layers.rule.mode === "rule" && !EVENT_ASK.test(query) && !asksWhen)) order = ["calendar"].concat(order.filter(function (k) { return k !== "calendar"; }));
    /* A notice whose title covers what was asked (聯大, 餘卷) beats a rule page or calendar entry that does not. */
    var hijack = topicGate(query, corpusStats);
    if (hijack && layers.announcement && layers.announcement.status === "answered" && layers.announcement.mode !== "token") {
      var best = function (layer) { return (layer.sources || []).reduce(function (m, src) { return Math.max(m, hijack.cover(src.title || "")); }, 0); };
      /* A teachers' workshop or staff notice never takes the place of the school's own calendar or rules. */
      var STAFF_NOTICE = /研習|工作坊|教師|教職員|營隊|講座|增能|培訓/;
      var noticeCover = (layers.announcement.sources || []).reduce(function (m, src) {
        var t = src.title || "";
        return STAFF_NOTICE.test(t) && !STAFF_NOTICE.test(query) || NARROW_AUDIENCE.test(t) && !NARROW_AUDIENCE.test(query) ? m : Math.max(m, hijack.cover(t));
      }, 0);
      var offTarget = noticeCover >= 0.5 && ["rule", "calendar"].some(function (key) {
        var layer = layers[key];
        return layer && layer.status === "answered" && Math.max(best(layer), 0) < noticeCover && hijack.cover(layer.summary || "") < noticeCover;
      });
      if (offTarget) order = ["announcement"].concat(order.filter(function (key) { return key !== "announcement"; }));
    }
    /* The notice about it is already past (「11/4 開放領取餘卷」) and the calendar only has a different 模考: say the notice's story. */
    if (hijack && layers.announcement && layers.announcement.status !== "answered" && (layers.announcement.related || []).length) {
      var relCover = layers.announcement.related.reduce(function (m, row) { return Math.max(m, hijack.cover(row.title || "")); }, 0);
      var otherCover = ["calendar"].reduce(function (m, key) {
        var layer = layers[key];
        return layer && layer.status === "answered" ? Math.max(m, (layer.sources || []).reduce(function (x, src) { return Math.max(x, hijack.cover(src.title || "")); }, 0)) : m;
      }, 0);
      if (relCover >= 0.75 && relCover > otherCover && layers.calendar && layers.calendar.status === "answered") return layers.announcement;
    }
    var answered = order.filter(function (key) { return layers[key] && layers[key].status === "answered" && !layers[key].weak; });
    var weak = order.filter(function (key) { return layers[key] && layers[key].status === "answered" && layers[key].weak; });
    if (!answered.length && !weak.length) return layers.calendar || layers.announcement || layers.rule;
    /* Only a calendar date for a question about something else (「期末考範圍」): the date is
       a side note under the announcements' answer, not the answer. */
    var main = answered.length ? Object.assign({}, layers[answered[0]], { layer: answered[0] })
      : Object.assign({}, layers.announcement || layers.rule || { status: "insufficient", query: query, summary: "", evidence: [], sources: [] }, { layer: "announcement" });
    var rest = (answered.length ? answered.slice(1) : []).concat(weak);
    var shown = {};
    (main.sources || []).forEach(function (source) { shown[source.id] = true; });
    (main.related || []).forEach(function (row) { shown[row.id] = true; });
    main.also = rest.map(function (key) {
      var layer = layers[key], sources = (layer.sources || []).filter(function (source) { return !shown[source.id]; }).slice(0, 3);
      sources.forEach(function (source) { shown[source.id] = true; });
      return { layer: key, label: LAYER_LABELS[key], summary: clean(layer.summary || ""), text: LAYER_LABELS[key] + "也有寫到：" + clean(layer.summary || ""), sources: sources };
    }).filter(function (row) { return row.summary && row.sources.length; });
    /* 「防災營」: a rule adds something only when it is about the activity asked (營、比賽…). */
    var eventWords = (clean(query).match(new RegExp(EVENT_ASK.source, "g")) || []);
    if (eventWords.length && !asksPenalty(query)) main.also = main.also.filter(function (row) {
      return row.layer !== "rule" || eventWords.some(function (w) { return String(row.summary).indexOf(w) !== -1; });
    });
    /* A penalty answer from the handbook: a notice adds something only when it states a penalty
       for the same act (not a firewall notice that says 竊取, nor an award's conditions). */
    if (main.layer === "rule" && main.mode === "rule" && asksPenalty(query)) {
      var act = ruleTerms(query).groups;
      main.also = main.also.filter(function (row) {
        if (row.layer !== "announcement") return true;
        var c = compact(row.summary);
        return CONCRETE_PENALTY.test(row.summary) && act.every(function (g) { return g.forms.some(function (f) { return c.indexOf(f) !== -1; }); });
      });
    }
    /* No direct answer in the announcements, but related ones exist: list them to open. */
    var notices = layers.announcement;
    if (main.status === "answered" && answered.indexOf("announcement") === -1 && notices && (notices.related || []).length) {
      /* Must share a real subject word (3+ characters, or a synonym of one): 「手機」 alone
         pulls in 手機互動遊戲 and 1campus 手機 app notices. */
      var subjectForms = subjectWords(query);
      var more = notices.related.filter(function (row) { var t = compact(row.title || ""); return !shown[row.id] && subjectForms.some(function (f) { return t.indexOf(f) !== -1; }); }).slice(0, 2);
      if (more.length) main.also.push({ layer: "announcement", label: "公告", summary: "", text: "還有相關公告，放在下方「參考資料」裡。", sources: more });
    }
    main.layers_checked = order.slice();
    return main;
  }
  function chapterAbout(item, query) {
    if (!item) return false;
    var chapter = compact(String(item.title || "").split("›").pop());
    var words = subjectWords(query).concat((function () {
      var terms = ruleTerms(query), out = [];
      terms.literal.concat(terms.rest).forEach(function (t) { out = out.concat(Synonyms ? Synonyms.concepts(t) : [t]); });
      return out.concat(terms.related);   // same topic: 還書 → 圖書館、借書
    })()).filter(function (w) { return w.length >= 2 && ALWAYS_GENERIC.indexOf(w) === -1; });
    return !words.length || words.some(function (w) { return chapter.indexOf(compact(w)) !== -1; });
  }
  function ruleLayer(query, docs, details, options) {
    if (!docs.length) return null;
    var ranked = rank(query, docs, details, options).slice(0, 8);
    if (!/進修/.test(query)) ranked = ranked.filter(function (row) { return !/進修部/.test(row.item.title || ""); });
    /* 「遲到會被記過嗎」: the answer is in 〈學生獎懲規定〉 even though its title says nothing about 遲到. */
    if (asksPenalty(query)) {
      var have = {}; ranked.forEach(function (row) { have[row.item.id] = true; });
      penaltyDocs(docs, query).forEach(function (item) { if (!have[item.id] && (details || {})[item.id]) ranked.push({ item: item, detail: details[item.id], score: 0, penaltyDoc: true }); });
    }
    return ruleAnswer(query, ranked, details || {}) || handbookPointer(query, ranked, details || {}, options);
  }
  /* The handbook chapter named after the question (學生在校作息時間規定 for 「幾點放學」), when
     its text cannot be quoted here (guests) or no single clause answers: point to that chapter. */
  function handbookPointer(query, ranked, details, options) {
    var terms = ruleTerms(query), wanted = terms.literal.concat(terms.rest);
    var forms = unique([].concat.apply([], wanted.map(function (t) { return Synonyms ? Synonyms.concepts(t) : [t]; })).concat(wanted))
      .filter(function (t) { return t.length >= 2 && ALWAYS_GENERIC.indexOf(t) === -1 && !/^(?:規定|辦法|要點|怎麼|如何|可以|時間)$/.test(t); });
    if (!forms.length) return null;
    var hit = ranked.filter(function (row) {
      if (!isSchoolDoc(row.item)) return false;
      var chapter = compact(String(row.item.title || "").split("›").pop());
      return !STAFF_DOC.test(chapter) && forms.some(function (t) { return chapter.indexOf(t) !== -1; });
    })[0];
    if (!hit) return null;
    var item = hit.item, chapter = clean(String(item.title || "").split("›").pop());
    var pages = Array.isArray(item.page_range) ? "第 " + item.page_range[0] + (item.page_range[1] !== item.page_range[0] ? "–" + item.page_range[1] : "") + " 頁" : "";
    var url = /^https:\/\//.test(String(item.url || "")) ? item.url : "";
    return { status: "answered", mode: "rule_pointer", pointer_kind: item.kind, query: query, evidence: [], key_points: [], related: [],
      summary: (item.school_name || "學校") + bookName(item) + "的「" + chapter + "」" + (pages ? "（" + pages + "）" : "") + "就是在講這個，點開看原文" + (details[item.id] ? "。" : "；登入後我可以直接引用條文。"),
      sources: [{ id: item.id, kind: url ? "service" : "", title: bookName(item) + " › " + chapter, url: url, school_name: item.school_name || "", note: pages || bookName(item) }],
      limitation: bookName(item) + "來自學校官網；規定可能修訂，以學校最新公告為準。", plan: questionPlan(query) };
  }
  function calendarLayer(query, items, options, asOfDay) {
    var opts = Object.assign({}, options, { asOf: asOfDay });
    var timed = timetableAnswer(query, opts);
    if (timed) return timed;
    var dated = datePlan(query, asOfDay);
    if (dated) return dateAnswer(query, items, dated, options);
    return whenAnswer(query, items, opts) || calendarMentions(query, opts);
  }
  /* Not a 「什麼時候」 question, but the topic is on the calendar (「校慶」「家長日」): list the
     upcoming entries whose titles name it, through the synonym database. */
  /* Asking about something of the event (its 範圍, rules, what happens if…), not when it is. */
  var ATTRIBUTE_ASK = /範圍|幾科|科目|規定|怎麼|如何|可以|能不能|能否|會怎樣|怎樣|要帶|帶什麼|資格|費用|多少|分數|地點|哪裡|在哪|去哪|流程|方式|嗎|為什麼|誰/;
  function calendarMentions(query, options) {
    var calendar = options.calendarEvents || [];
    if (!calendar.length || !SearchQuery || !SearchQuery.queryPlan || !Synonyms || WHEN_SKIP.test(query)) return null;
    var plan = SearchQuery.queryPlan(query), wanted = [];
    (plan.term_matches || []).forEach(function (row) { if (row.kind === "topic") wanted.push(row.term); });
    (plan.remainder_terms || []).forEach(function (term) { Synonyms.find(term).forEach(function (t) { wanted.push(t); }); });
    wanted = unique(wanted.map(compact)).filter(function (t) { return t.length >= 2 && ALWAYS_GENERIC.indexOf(t) === -1; });
    if (!wanted.length) return null;
    var groups = wanted.map(synonymsOf);
    var asOf = options.asOf, rows = [], past = [], gate = topicGate(query, corpusStats);
    /* 「校運會預演」: an entry whose title has the whole asked phrase beats one with only part of it,
       and when that entry is already over, say so instead of naming another entry. */
    var phrases = [compact(plan.value || query)].filter(function (t) { return t.length >= 3; });
    calendar.forEach(function (ev) {
      var from = String(ev && (ev.start_date || ev.date) || "").slice(0, 10), to = String(ev && ev.end_date || from).slice(0, 10), title = clean(ev && ev.title || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || DATE_STAFF.test(title)) return;
      /* The question names something specific (診斷式, 電競): a calendar entry that never says it is not the answer. */
      if (gate && !gate.test(title)) return;
      if (to < asOf) { if (phrases.some(function (p) { return compact(title).indexOf(p) !== -1; }) && to >= isoAdd(asOf, -45)) past.push({ from: from, to: to, title: title, ev: ev }); return; }
      var t = compact(title);
      /* Every subject asked must be in the title. */
      if (!groups.every(function (forms) { return forms.some(function (f) { return t.indexOf(f) !== -1; }); })) return;
      rows.push({ from: from, to: to < from ? from : to, title: title, ev: ev });
    });
    var whole = rows.filter(function (r) { return phrases.some(function (p) { return compact(r.title).indexOf(p) !== -1; }); });
    if (whole.length) rows = whole;
    else if (past.length) {
      var last = past.sort(function (a, b) { return b.to.localeCompare(a.to); })[0], whereLabel = options.scopeLabel ? options.scopeLabel + "行事曆" : "學校行事曆";
      return { status: "answered", mode: "browse", list_label: "行事曆", query: query, weak: ATTRIBUTE_ASK.test(query),
        summary: "已經過了：依" + whereLabel + "，「" + last.title + "」在 " + rangeLabel(last.from, last.to) + "。",
        sources: [{ id: "calendar:" + (last.ev.id || last.from + last.title), kind: "calendar", title: last.title, school_id: last.ev.school_id || "", school_name: last.ev.school_name || options.scopeLabel || "", url: last.ev.source_url || "", date: last.from, category: "行事曆", note: shortDay(last.from) + " · 學校行事曆" }],
        evidence: [], related: [], key_points: [], plan: questionPlan(query), limitation: "日期來自學校行事曆；學校臨時調整時以最新公告為準。" };
    }
    if (!rows.length) return null;
    rows.sort(function (a, b) { return a.from.localeCompare(b.from); });
    var picked = rows.slice(0, 3), where = options.scopeLabel ? options.scopeLabel + "行事曆" : "學校行事曆";
    return { status: "answered", mode: "browse", list_label: "行事曆", query: query, weak: ATTRIBUTE_ASK.test(query),
      summary: "依" + where + "，" + picked.map(function (r) { return rangeLabel(r.from, r.to) + "「" + r.title + "」" + (r.from <= asOf && asOf <= r.to ? "（就是今天）" : ""); }).join("、") + "。",
      sources: picked.map(function (r) { return { id: "calendar:" + (r.ev.id || r.from + r.title), kind: "calendar", title: r.title, school_id: r.ev.school_id || "", school_name: r.ev.school_name || options.scopeLabel || "", url: r.ev.source_url || "", date: r.from, category: "行事曆", note: (r.from === r.to ? shortDay(r.from) : shortDay(r.from) + "～" + shortDay(r.to)) + " · 學校行事曆" }; }),
      evidence: [], related: [], key_points: [], plan: questionPlan(query), limitation: "日期來自學校行事曆；學校臨時調整時以最新公告為準。" };
  }
  var KIND_WORD = { deadline: "截止日", time: "時間", place: "地點", audience: "對象", required: "要準備的東西", fee: "費用", method: "做法", contact: "聯絡方式", penalty: "罰則", allow: "可以的情況", deny: "禁止的事" };
  function tokenAnswer(query, asked, ranked, options) {
    if (!asked || !asked.kinds.length) return null;
    /* 「校慶什麼時候」 asks about this school's, not a university's open day. */
    var outsideOff = CAMPUS_LIFE.test(query) && !ASKS_OUTSIDE.test(query);
    var hits = (ranked || []).filter(function (row) { var t = clean(row.item.title || ""); return row.token && row.token.segment && row.token.topics && row.token.kinds && !TITLE_RESULT.test(t) && (!/成績/.test(query) || /成績/.test(t)) && !(outsideOff && OUTSIDE_TITLE.test(t)); });
    /* A title that says the asked word (段考) beats a narrower kind (複習考); a date still ahead beats a past one. */
    var words = deepWords(query), today = options && options.asOf || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var rankOf = function (row) {
      var t = compact(row.item.title || ""), d = (row.token.segment.d || []).slice().sort();
      return (words.length && words.every(function (w) { return mentionsWord(t, w); }) ? 2 : 0) + (d.length && d[d.length - 1] >= today ? 1 : 0);
    };
    var hit = hits.map(function (row, i) { return { row: row, r: rankOf(row), i: i }; }).sort(function (a, b) { return b.r - a.r || a.i - b.i; }).map(function (x) { return x.row; })[0];
    if (!hit) return null;
    var seg = hit.token.segment, item = hit.item, kind = asked.kinds.filter(function (k) { return seg.k.indexOf(k) !== -1; })[0];
    /* 「什麼時候」 means the day it happens: a segment labelled as a deadline is not it. */
    if (asksEventDate(query) && kind === "time" && seg.k.indexOf("deadline") !== -1 && item.tokens && Array.isArray(item.tokens.segments)) {
      var alt = item.tokens.segments.filter(function (g) { return g.k.indexOf("time") !== -1 && g.k.indexOf("deadline") === -1 && g.d && g.d.length; })[0];
      if (alt) seg = alt;
    }
    var label = sourceLabel(item).replace(/^根據/, "");
    var asOf = options && options.asOf || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var summary;
    if ((kind === "deadline" || kind === "time") && seg.d && seg.d.length) {
      var ds = seg.d.slice().sort(), day = ds[ds.length - 1], past = day < asOf;
      /* An event on several days: the next day still ahead (the first, when it has not started). */
      if (kind === "time" && asksEventDate(query)) { var ahead = ds.filter(function (d) { return d >= asOf; }); if (ahead.length) { day = ahead[0]; past = false; } }
      summary = "依" + label + "，" + KIND_WORD[kind] + "是 " + dayLabel(day) + (past ? "（已經過了）" : "") + "。";
    } else if (hit.detail) {
      /* The member text is loaded: quote the segment the labels point to instead of telling them to log in. */
      var unit = quoteUnits(detailSegments(hit.detail)).filter(function (u) { return u.index === seg.s; })[0];
      if (!unit) return null;
      summary = label + "，" + KIND_WORD[kind] + "：" + endSentence(unit.text.slice(0, 160));
    } else {
      summary = label + "的第 " + (seg.s + 1) + " 段寫到" + (KIND_WORD[kind] || "這件事") + "，點開原文就看得到；登入後我可以直接引用。";
    }
    return { status: "answered", query: query, mode: "token", headline: (kind === "deadline" || kind === "time") && seg.d && seg.d.length ? KIND_WORD[kind] + "：" + dayLabel(day) : "",
      summary: summary, evidence: [], key_points: [], related: [], plan: questionPlan(query),
      sources: [Object.assign({}, item, { note: "第 " + (seg.s + 1) + " 段・" + (KIND_WORD[kind] || "相關") })],
      limitation: "依公告的分段標籤（日期與類型）回答；內文細節以公告原文為準。" };
  }
  /* Among notices that answer equally well, the newer one and the one still open win
     (「半導體營」: this winter's camp, not August's). */
  function freshness(item, asOf) {
    var day = String(item && (item.date || item.first_seen) || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return 0;
    var age = (Date.parse(asOf) - Date.parse(day)) / 86400000, bonus = age <= 14 ? 14 : age <= 45 ? 6 : age > 120 ? -6 : 0;
    var deadlines = (item.calendar_events || []).filter(function (e) { return e && e.kind === "deadline" && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ""); }).map(function (e) { return e.date; }).sort();
    if (deadlines.length) bonus += deadlines[deadlines.length - 1] >= asOf ? 8 : -10;
    return bonus;
  }
  /* ---------- 公告內容層：問什麼就答公告裡的那一欄 ----------
     把公告（及附件）的正文拆成欄位（時間、地點、對象、報名、攜帶、費用、聯絡、內容），依問題類型
     回答該欄位的值；問「X是什麼」或只打活動名稱，就給 1–2 句內容摘要；公告沒寫該欄位就直說沒寫，
     不再把標題換個說法講一遍。欄位規則在 answer-composer.js，標籤字典在 qa-synonyms.js。 */
  var FIELD_CACHE = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var HEADER_LINE = /(?:承辦人|聯絡人|電話|電子信箱|電子郵件)\s*[:：]/;
  function noticeFields(row) {
    var detail = row.detail, item = row.item || {};
    var cached = detail && typeof detail === "object" && FIELD_CACHE ? FIELD_CACHE.get(detail) : null;
    if (cached && cached.id === item.id) return cached.fields;
    var lines = [], attachment = [], header = [];
    if (detail) {
      var segments = detailSegments(detail);
      quoteUnits(segments).forEach(function (unit) { (unit.meta && unit.meta.source_type === "attachment" ? attachment : lines).push(unit.text); });
      segments.forEach(function (segment) { if (HEADER_LINE.test(segment.text) && segment.text.length < 160) header.push(segment.text); });
    }
    if (!lines.length && !attachment.length) sentences(clean((item.summary || "") + " " + (item.snippet || ""))).forEach(function (text) { lines.push(text); });
    var fields = Composer.fieldsOf({ lines: lines, attachmentLines: attachment, headerLines: header, title: item.title || "", posted: String(item.date || item.first_seen || "").slice(0, 10) });
    if (detail && typeof detail === "object" && FIELD_CACHE) FIELD_CACHE.set(detail, { id: item.id, fields: fields });
    return fields;
  }
  var FACT_ORDER = { time: ["place", "deadline", "audience", "signup"], deadline: ["signup", "time", "place"], place: ["time", "audience", "signup"], audience: ["time", "signup", "deadline"],
    signup: ["deadline", "time", "fee", "bring"], bring: ["time", "place", "deadline"], fee: ["time", "signup", "deadline"], contact: ["time", "signup"], summary: ["signup", "fee", "bring", "contact", "deadline"] };
  function contentLayer(query, ranked, evidence, asOfDay, plan) {
    if (!Composer || !Composer.fieldsOf || !evidence.length) return null;
    var top = evidence[0], row = ranked.filter(function (r) { return r.item.id === top.announcement_id; })[0];
    if (!row || row.penaltyDoc || isSchoolDoc(row.item) || TITLE_RESULT.test(clean(row.item.title || "")) || (top.fragment && top.fragment.status)) return null;
    var title = clean(row.item.title || "");
    /* Where to hand something in, which class room, whether it is compulsory: the sentence layer answers those. */
    if (plan && /^(?:destination|class_place|requirement)$/.test(plan.answer_slot || "")) return null;
    var slot = Composer.askedSlot(query), general = Composer.isGeneralAsk(query, title);
    /* A notice that is itself a change (改期, 取消) states the new date in its own sentence. */
    if (/改期|延期|取消|停辦|更正|更改|異動|順延|暫停|補充/.test(title) && (general || slot === "time" || slot === "deadline")) return null;
    var shortLead = clean(top.text).replace(/^[^：:]{2,14}[：:]\s*(?=.{6,})/, "");
    var echo = (top.source_meta && top.source_meta.source_type === "title") || Composer.noveltyOf(shortLead, title) < 8;
    /* No particular field is asked and the best sentence only repeats the title: tell what the notice is about. */
    if (!slot && echo) general = true;
    var fields = noticeFields(row), seed = query, found, kind;
    if (slot && slot !== "summary" && !general) {
      found = Composer.slotAnswer(slot, fields, seed);
      if (found.found) kind = "slot";
      else if (echo) kind = "missing";
      else return null;
    } else if (general || slot === "summary") {
      found = Composer.slotAnswer("summary", fields, seed);
      if (found.found) { kind = "summary"; slot = "summary"; }
      else return null;
    } else return null;
    var text = found.text;
    if (kind === "slot" && (slot === "time" || slot === "deadline")) {
      var last = Composer.isoOf(found.value, String(row.item.date || row.item.first_seen || "").slice(0, 10), "last");
      if (last && last < asOfDay) text += "這個日期已經過了。";
    }
    return { kind: kind, slot: slot, found: !!found.found, text: text, value: found.value || "", url: found.url || "", from: found.from || "", row: row,
      facts: Composer.otherFacts(fields, slot === "summary" ? "" : slot).filter(function (f) { return (FACT_ORDER[slot] || []).indexOf(f.slot) !== -1; })
        .sort(function (a, b) { return FACT_ORDER[slot].indexOf(a.slot) - FACT_ORDER[slot].indexOf(b.slot); }).slice(0, 3),
      fields: fields,
      evidence: { text: text, announcement_id: row.item.id, title: row.item.title, score: (top.score || 0) + 1000, validity: row.validity, source_meta: { source_type: "content", slot: slot } } };
  }
  var POINT_OF_SLOT = { time: "時間", deadline: "截止", place: "地點", signup: "方式", audience: "對象", fee: "費用", bring: "攜帶", contact: "聯絡" };
  /* Labelled fields beat the guesses keyPoints() makes from running text. */
  function mergeFieldPoints(points, fields) {
    var out = (points || []).slice();
    Object.keys(POINT_OF_SLOT).forEach(function (slot) {
      var hit = fields && fields.slots && fields.slots[slot], label = POINT_OF_SLOT[slot];
      if (!hit) return;
      var at = -1; out.forEach(function (p, i) { if (p.label === label && at < 0) at = i; });
      if (at >= 0) { if (hit.src === "label") out[at] = { label: label, value: hit.value }; }
      else out.push({ label: label, value: hit.value });
    });
    var order = ["截止", "時間", "地點", "方式", "對象", "費用", "獎金", "攜帶", "聯絡"];
    return out.sort(function (a, b) { return order.indexOf(a.label) - order.indexOf(b.label); }).slice(0, 6);
  }
  function announcementLayer(query, items, details, options) {
    var asked = askedTokensFor(query, options);
    var asOfDay = options && /^\d{4}-\d{2}-\d{2}$/.test(String(options.asOf || "")) ? options.asOf : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    /* Activities come and go: for 「半導體營」 this winter's camp matters more than August's. */
    var eventAsk = EVENT_ASK.test(query);
    var deep = !!(options && options.deep);
    var queryTokens = tokens(query), plan = questionPlan(query), wanted = plan.intents, ranked = rank(query, items, details, options).slice(0, deep ? 20 : 8);
    /* 學生手冊 has day-school and 進修部 versions of the same rules; use 進修部 only when asked. */
    if (!/進修/.test(query) && ranked.some(function (row) { return !/進修部/.test(row.item.title || ""); })) {
      ranked = ranked.filter(function (row) { return !/進修部/.test(row.item.title || ""); });
    }
    /* An activity question is about the one that is on now: among close matches the newer,
       still-open notice goes first, and its sentences are preferred below. */
    if (eventAsk && ranked.length > 1) {
      ranked = ranked.map(function (row, i) { return { row: row, key: row.score * (1 + freshness(row.item, asOfDay) / 60), i: i }; })
        .sort(function (a, b) { return b.key - a.key || a.i - b.i; }).map(function (x) { return x.row; });
    }
    var position = {}; ranked.forEach(function (row, i) { position[row.item.id] = i; });
    if (ranked.length) {
      var relevanceFloor = Math.max(8, ranked[0].score * (deep ? 0.25 : 0.35));
      ranked = ranked.filter(function (row) { return row.score >= relevanceFloor; }).slice(0, deep ? 12 : 5);
      /* 深度判斷: a notice that covers every word of the subject beats one that covers part of it. */
      if (deep && ranked.length > 1) {
        var subject = deepWords(query);
        if (subject.length) {
          var cover = function (row) { var t = compact((row.item.title || "") + " " + detailText(row.detail)); return subject.filter(function (w) { return mentionsWord(t, w); }).length; };
          var best = Math.max.apply(null, ranked.map(cover));
          if (best >= 1) ranked = ranked.filter(function (row) { return cover(row) === best; }).concat(ranked.filter(function (row) { return cover(row) < best; })).slice(0, 12);
        }
      }
    }
    if (!query || !queryTokens.length || !ranked.length) return { status: "insufficient", query: query, summary: query && queryTokens.length ? insufficientSummary([], options && options.asOf, query, options && options.scopeLabel) : "請再多說一點，例如「期中考是哪幾天」或「獎學金怎麼申請」。", evidence: [], sources: [] };
    if(personalDataQuery(query))return personalDataAnswer(query,ranked,options);
    /* 「得獎名單什麼時候公布」 is a schedule question, but a notice that is itself the list is only pointed to. */
    if (PERSONAL_DATA_QUERY.test(query) && ranked[0] && TITLE_RESULT.test(clean(ranked[0].item.title || "")) ) return personalDataAnswer(query, ranked, options);
    if (PERSONAL_DATA_QUERY.test(query)) ranked = ranked.filter(function (row) { return !TITLE_RESULT.test(clean(row.item.title || "")); });
    if (!ranked.length) return { status: "insufficient", query: query, summary: insufficientSummary([], options && options.asOf, query, options && options.scopeLabel), evidence: [], sources: [], related: [] };
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
      var segments = quoteUnits(detailSegments(row.detail));
      /* The segment whose labels hold the asked topic and the asked kind (截止、罰則…). */
      var labelled = row.detail && Tokens && asked ? Tokens.match(Tokens.tokenize(row.detail, { title: row.item.title, date: String(row.item.date || "").slice(0, 10) }), asked) : null;
      var pointed = labelled && labelled.segment && labelled.kinds ? labelled.segment.s : -1;
      if (!segments.length) segments = sentences(clean((row.item.summary || "") + " " + (row.item.snippet || ""))).map(function (text) { return { text: text, meta: { source_type: "summary" } }; });
      /* 「(一)考試舞弊者」 under 「…記大過：」 is quoted with its heading. */
      var framed = withHeadings(segments.map(function (segment) { return segment.text; }));
      segments.map(function (segment, index) {
        var f = framed[index], text = f && framedText({ heading: f && f.heading, text: segment.text });
        var at = segment.index == null ? index : segment.index;
        return { text: text, meta: segment.meta || {}, score: evidenceScore(text, queryTokens, wanted, plan, row.item) + (at === pointed ? (plan.answer_slot === "deadline" && !TIME_PHRASE.test(text) ? 10 : plan.event_date && (DEADLINE_CUE.test(text) || NOTICE_CUE.test(text)) && !EVENT_CUE.test(text) ? 0 : 60) : 0) + freshness(row.item, asOfDay) * (eventAsk ? 2 : 1) + (eventAsk ? Math.max(0, 24 - 12 * (position[row.item.id] || 0)) : 0), item: row.item };
      }).filter(function (candidate) {
        return candidateQualifies(candidate, plan) && (!Validity || Validity.sentencePolicy(candidate.text, row.validity, query) !== "exclude");
      }).map(function (candidate) { candidate.score -= echoPenalty(candidate.text, candidate.item.title); return candidate; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 2).forEach(function (candidate) {
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
    /* The sentence that is quoted has to be about the asked words itself (or sit in a notice whose title is). */
    /* 「期中考成績什麼時候查」 is about the grades; the exam timetable does not answer it. */
    if (/成績/.test(query)) evidence = evidence.filter(function (row) { return /成績/.test((row.text || "") + (row.title || "")); });
    var gateEv = topicGate(query, stats);
    if (gateEv) evidence = evidence.filter(function (row) { return row.source_meta && row.source_meta.source_type === "title" || gateEv.cover((PROGRAM_ASK.test(query) ? "" : row.text || "") + " " + (row.title || "")) > 0 && gateEv.chainTest((row.text || "") + " " + (row.title || "")); });
    evidence = evidence.filter(function (row) { return topicScore((row.title || "") + " " + (row.text || "") + " " + (row.fragment && row.fragment.keywords || ""), query, stats) >= 0.5; });
    /* No text to quote (guests), but a notice's labels say which segment holds the asked kind:
       answer the date from it, or say where it is written. */
    /* 「諾貝爾演講」: the newest matching activity's sentences never repeat the title's words, so none
       qualified, and an older notice's sentence took its place. Its title is the answer then. */
    var topRow = ranked[0];
    if (eventAsk && !plan.answer_slot && !wanted.length && !WHEN_ASK.test(query) && !YEAR_ASK.test(query) && topRow && !evidence.some(function (e) { return e.announcement_id === topRow.item.id; }) &&
        topicScore(clean(topRow.item.title || ""), query, stats) >= 0.8 && !TITLE_RESULT.test(clean(topRow.item.title || ""))) {
      var bestScore = evidence.reduce(function (m, e) { return Math.max(m, e.score); }, 0);
      evidence.unshift({ text: clean(topRow.item.title).replace(/^(?:轉知|檢送|【[^】]{1,8}】)\s*[：:]?\s*/, ""), announcement_id: topRow.item.id, title: topRow.item.title, score: bestScore + 1, validity: topRow.validity, source_meta: { source_type: "title" } });
    }
    /* A bare activity question (「半導體營」) is about the newest matching activity: its sentence leads,
       the others follow as related notices. */
    if (eventAsk && !plan.answer_slot && !wanted.length && topRow) evidence.forEach(function (e) { if (e.announcement_id === topRow.item.id) e.score += 500; });
    if (!evidence.length) { var fromLabels = tokenAnswer(query, asked, ranked, options); if (fromLabels) return fromLabels; }
    /* 「中研講堂」: the page has no text beyond its title, but the title says what, when and where. */
    if (!evidence.length && eventAsk && !wanted.length && !plan.answer_slot && !WHEN_ASK.test(query) && !YEAR_ASK.test(query)) {
      var titled = ranked.filter(function (row) { var t = clean(row.item.title || ""); return t.length >= 16 && topicScore(t, query, stats) >= 0.8 && !TITLE_RESULT.test(t); })
        .sort(function (a, b) { return freshness(b.item, asOfDay) - freshness(a.item, asOfDay); })[0];
      if (titled) evidence.push({ text: clean(titled.item.title).replace(/^(?:轉知|檢送|【[^】]{1,8}】)\s*[：:]?\s*/, ""), announcement_id: titled.item.id, title: titled.item.title, score: 1, validity: titled.validity, source_meta: { source_type: "title" } });
    }
    /* The notice's title is what was asked (「六感重生課程」, 「政府與公共事務碩士在職專班」) but its body is
       empty or lives in an attachment: answer with that notice and say where the rest is. */
    var titleOnly = false;
    if (!evidence.length && !personalDataQuery(query) && plan.answer_slot !== "requirement" && !PROBLEM_ASK.test(query) && !wantsLink(query) && !YEAR_ASK.test(query) && !askedYearNow && !yearOfQuestion) {
      var gateNow = topicGate(query, stats);
      var byTitle = !gateNow ? [] : ranked.filter(function (row) {
        var t = clean(row.item.title || "");
        var ty = Number((periodToken(t).match(/^\d+/) || [])[0]);
        if (ty >= 90 && ty < currentAcademicYear(asOfDay)) return false;   // last year's notice is not this year's answer
        var postedDay = String(row.item.date || row.item.first_seen || "").slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(postedDay) && (Date.parse(asOfDay) - Date.parse(postedDay)) / 86400000 > 365) return false;
        /* A 「什麼時候／截止」 question needs a date, and a title can only give one that is still ahead. */
        if (WHEN_ASK.test(query) || plan.answer_slot === "deadline") {
          if (!titleTime(t)) return false;
          var td = titleDates(row.item);
          if (td.length && td.every(function (d) { return d.to < asOfDay; })) return false;
        }
        return !(NARROW_AUDIENCE.test(t) && !NARROW_AUDIENCE.test(query)) && !(CAMPUS_LIFE.test(query) && !ASKS_OUTSIDE.test(query) && OUTSIDE_TITLE.test(t));
      }).map(function (row, i) {
        var t = clean(row.item.title || "");
        return { row: row, i: i, c: TITLE_RESULT.test(t) && !ASKS_RESULT.test(query) || !gateNow.coversSubject(t) ? 0 : gateNow.cover(t) };
      }).filter(function (x) { return x.c >= 0.6; }).sort(function (a, b) { return b.c - a.c || a.i - b.i; });
      /* Several notices carry the asked words about equally (three GEPT notices): do not guess one of them. */
      byTitle = byTitle.length && !byTitle.slice(1).some(function (x) { return x.c >= byTitle[0].c - 0.15 && familySimilarity(x.row, byTitle[0].row) >= 0.6; }) ? byTitle[0] : null;
      if (byTitle) {
        var tr = byTitle.row;
        evidence.push({ text: clean(tr.item.title).replace(/^(?:轉知|檢送|【[^】]{1,8}】)\s*[：:]?\s*/, ""), announcement_id: tr.item.id, title: tr.item.title, score: 1, validity: tr.validity, source_meta: { source_type: "title" } });
        titleOnly = true;
      }
    }
    if (!evidence.length) { var relatedRows = relatedAnnouncements(query, ranked, options, stats); return { status: "insufficient", query: query, summary: insufficientSummary(relatedRows, options && options.asOf || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }), query, options && options.scopeLabel), evidence: [], sources: [], related: relatedRows }; }
    var sourceIds = {};
    evidence.forEach(function (row) { sourceIds[row.announcement_id] = true; });
    var sources = ranked.filter(function (row) { return sourceIds[row.item.id]; }).map(function (row) {
      return Object.assign({}, row.item, { validity: row.validity });
    }).slice(0, 4);
    var validityWarnings = [];
    ranked.forEach(function (row) { (row.validity.warnings || []).forEach(function (warning) { validityWarnings.push(warning); }); });
    evidence.sort(function(a,b){return b.score-a.score;});
    /* The notice the answer quotes is the first source. */
    sources.sort(function (a, b) { return (b.id === evidence[0].announcement_id ? 1 : 0) - (a.id === evidence[0].announcement_id ? 1 : 0); });
    var content = sources.length > 1 && sources.some(function (i) { return i.validity && i.validity.relations && i.validity.relations.length; }) ? null : contentLayer(query, ranked, evidence, asOfDay, plan);
    if (content) { evidence.unshift(content.evidence); titleOnly = false; }
    var lines = answerLines(evidence, sources);
    var pointRow = ranked.filter(function (row) { return evidence[0] && row.item.id === evidence[0].announcement_id; })[0];
    var pointText = pointRow ? (detailText(pointRow.detail) || clean((pointRow.item.summary || "") + " " + (pointRow.item.snippet || ""))) : "";
    var points = keyPoints(pointText || evidence.filter(function (row) { return evidence[0] && row.announcement_id === evidence[0].announcement_id; }).map(function (row) { return row.text; }).join("。"), { published: pointRow && pointRow.item.date });
    if (content) points = mergeFieldPoints(points, content.fields);
    var links = wantsLink(query) ? answerLinks(pointRow || { item: sources[0] || {} }) : [];
    var summaryText = composeSummary(evidence, sources, wanted, plan, options && options.asOf || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }), content);
    /* Asked when it happens: the event date leads, and the sign-up deadline (if the notice has one) follows. */
    if (plan.event_date && evidence[0] && pointText && !content && !DEADLINE_CUE.test(evidence[0].text) && !(sources.length > 1)) {
      var lead0 = compact(evidence[0].text);
      var dl = sentences(pointText).filter(function (sentence) { return /截止|[日號)）點時]\s*(?:以)?前|前(?:完成|繳交|回覆|報名|上傳|送交|申請)|止[。，；]?$|至.{0,20}止|開放索票|開放報名/.test(sentence) && !EVENT_CUE.test(sentence) && ONE_DATE.test(sentence) && sentence.length <= 140 && lead0.indexOf(compact(sentence)) === -1; })[0];
      if (dl) summaryText += "另外，" + endSentence(dl.replace(/^(?:[一二三四五六七八九十]+、|\(?\d{1,2}\)?[、.．])\s*/, ""));
    }
    return { status: "answered", query: query, key_points: points, links: links, summary: summaryText,
      content: content ? { kind: content.kind, slot: content.slot, found: content.found, text: content.text, value: content.value, url: content.url, from: content.from, facts: content.facts } : undefined,
      answer_lines: lines, limitation: titleOnly ? "公告內文沒有直接回答這題，細節在公告附件或原文連結，請點開公告查看。" : evidenceLimitation(evidence, sources, plan, validityWarnings), confidence: validityWarnings.length ? "medium" : (lines.length >= 2 ? "high" : "medium"),
      plan: plan, evidence: evidence, sources: sources, validity_warnings: unique(validityWarnings) };
  }
  return { topicScore: topicScore, topicGate: topicGate, pieceStats: pieceStats, tokens: tokens, anchors: anchors, literalAnchors:literalAnchors, intent: intent, answerSlot:answerSlot, subjectTerms:subjectTerms, questionPlan: questionPlan, detailText: detailText, detailSegments:detailSegments, rank: rank, readList: readList, asksPenalty: asksPenalty, penaltyDocs: penaltyDocs,
    smoothEvidence: smoothEvidence, quoteUnits: quoteUnits, answerLines: answerLines, evidenceLimitation: evidenceLimitation, composeSummary: composeSummary,
    isPersonalDataQuery:personalDataQuery, ruleClauses: ruleClauses, ruleAnswer: ruleAnswer, serviceLinks: serviceLinks, documentLinks: documentLinks, timetableAnswer: timetableAnswer, conversational: conversational, tidyClause: tidyClause, resolveFollowUp: resolveFollowUp, correction: correction, comparePlan: comparePlan, compareResults: compareResults, smallTalk: smallTalk, wantsLink: wantsLink, answerLinks: answerLinks, scoreClause: scoreClause, ruleTerms: ruleTerms, withHeadings: withHeadings, keyPoints: keyPoints, browsePlan: browsePlan, datePlan: datePlan, dateTarget: dateTarget, titleDates: titleDates, titleDeadline: titleDeadline,answer: answer };
});
