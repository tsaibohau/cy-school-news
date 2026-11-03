/* 公告 token 化：把一則公告（或一章規定）切成一段一段，每段各自標上
   主題（同義詞資料庫的概念＋搜尋分類）、類型（截止、時間、地點、對象、必備、費用、方式、
   罰則、聯絡、禁止、允許）、日期（YYYY-MM-DD）與年級。
   問題也用同一套規則切，比對時看的是「同一段」裡有沒有問的主題和問的類型，
   不再拿整則公告去比（一則公告常常同時講好幾件事）。

   公開資料只放這些標籤（不含原文）；原文仍是會員內容。切段規則與問校務引用原文時相同，
   所以標籤上的段號 s 對得回原文的那一句。 */
(function (root, factory) {
  var Synonyms = root.CyNewsSynonyms, Taxonomy = root.CyNewsSearchTaxonomy;
  if (!Synonyms && typeof module !== "undefined" && module.exports) Synonyms = require("./qa-synonyms.js");
  if (!Taxonomy && typeof module !== "undefined" && module.exports) Taxonomy = require("./search-taxonomy.js");
  var api = factory(Synonyms, Taxonomy);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsTokens = api;
})(typeof window !== "undefined" ? window : this, function (Synonyms, Taxonomy) {
  "use strict";

  var VERSION = 1, MAX_SEGMENTS = 60, MAX_TERMS = 8;
  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function compact(value) { return clean(value).toLowerCase().replace(/[^0-9a-z㐀-鿿]+/g, "").replace(/臺/g, "台"); }
  function unique(rows) { var seen = {}; return rows.filter(function (row) { if (!row || seen[row]) return false; seen[row] = true; return true; }); }

  /* ---------- 切段（與問校務引用原文用的是同一套） ---------- */
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
  function segmentsOf(record) {
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

  /* ---------- 主題：同義詞群的代表詞＋搜尋分類 ---------- */
  var topicRows = (Taxonomy && Taxonomy.topics || []).map(function (row) { return { id: row.id, terms: row.terms.map(compact).filter(Boolean).sort(function (a, b) { return b.length - a.length; }) }; });
  /* 同一個概念在公告裡怎麼寫都對到同一個代表詞：行動電話、行動載具 → 手機。 */
  function canonical(term) {
    var forms = Synonyms ? Synonyms.expand(term, { includes: false }) : [compact(term)];
    var group = Synonyms && Synonyms.SAME.filter(function (g) { return g.map(compact).indexOf(compact(term)) !== -1; })[0];
    return group ? compact(group[0]) : forms[0];
  }
  function topicsOf(text) {
    var c = compact(text), out = [];
    if (Synonyms) Synonyms.find(c).forEach(function (term) { out.push(canonical(term)); });
    topicRows.forEach(function (row) { if (row.terms.some(function (t) { return t.length >= 2 && c.indexOf(t) !== -1; })) out.push("#" + row.id); });
    return unique(out).slice(0, MAX_TERMS);
  }

  /* ---------- 類型 ---------- */
  var KINDS = [
    { id: "penalty", re: /懲處|記(?:警告|申誡|小過|大過|過)|申誡|扣(?:分|減|點)|不予計分|零分|以零分計|不計分|以曠課論|愛校服務|取消(?:資格|錄取|參加)|視同(?:放棄|未|曠)|不予(?:受理|核發|補)|罰/ },
    { id: "deadline", re: /截止|期限|[日號)）]\s*(?:以)?前|前(?:完成|報名|繳交|上傳|送交|填寫|申請|交)|受理至|報名至|收件至|至.{0,24}止|逾期/ },
    { id: "time", re: /\d{1,2}\s*[月\/／]\s*\d{1,2}|\d{1,2}\s*[:：]\s*\d{2}|(?:上午|下午|晚上)\s*\d|第\s*[一二三四五六七八\d]\s*節|星期[一二三四五六日天]|週[一二三四五六日]/ },
    { id: "place", re: /地點|場地|教室|會議室|禮堂|體育館|活動中心|\d+\s*樓|大樓|操場|校區|於.{0,10}(?:舉行|集合|報到)/ },
    { id: "audience", re: /對象|資格|適用|限(?:本校|高[一二三]|國[一二三]|.{0,6}學生)|全校|全體|高[一二三]|國[一二三]|新生|應屆|住宿生/ },
    { id: "required", re: /(?:應|須|需|請|要|務必|前|並)\s*(?:檢附|攜帶|備妥|準備|附上)|應備|檢附|證明文件|申請表|報名表|同意書/ },
    { id: "fee", re: /費用|新[臺台]幣|\d[\d,]*\s*元|免費|報名費|收費|退費/ },
    { id: "method", re: /方式|流程|步驟|格式|登入|填寫|上傳|線上|系統|網址|https?:\/\/|掃描|QR|送(?:交|至)|繳交至|交至|向.{0,8}(?:申請|報名|登記)/i },
    { id: "contact", re: /聯絡|洽詢|電話|分機|承辦|信箱|e-?mail/i },
    { id: "deny", re: /不得|禁止|不准|嚴禁|不可|不能/ },
    { id: "allow", re: /(?:^|[^不])(?:得|可以|准予|允許|開放)(?=[一-鿿])/ }
  ];
  function kindsOf(text) { return KINDS.filter(function (k) { return k.re.test(text); }).map(function (k) { return k.id; }); }

  /* ---------- 日期：民國、西元、月/日 → YYYY-MM-DD ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(y, m, d) { if (m < 1 || m > 12 || d < 1 || d > 31) return ""; return y + "-" + pad(m) + "-" + pad(d); }
  /* baseDay: the notice's own date; a bare 「11/20」 is the next such day on or after it (within a year). */
  function datesOf(text, baseDay) {
    var out = [], base = /^\d{4}-\d{2}-\d{2}$/.test(String(baseDay || "")) ? baseDay : "";
    var t = String(text).replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); });
    t.replace(/(\d{2,4})\s*[年.\/／-]\s*(\d{1,2})\s*[月.\/／-]\s*(\d{1,2})\s*日?/g, function (_, y, m, d) {
      var year = Number(y); if (year < 1000) year += 1911;
      var v = iso(year, Number(m), Number(d)); if (v) out.push(v); return " ";
    }).replace(/(\d{1,2})\s*(?:月\s*(\d{1,2})\s*日|[\/／]\s*(\d{1,2}))/g, function (_, m, d1, d2) {
      if (!base) return " ";
      var y = Number(base.slice(0, 4)), v = iso(y, Number(m), Number(d1 || d2));
      if (v && v < base && (Date.parse(base) - Date.parse(v)) / 86400000 > 60) v = iso(y + 1, Number(m), Number(d1 || d2));
      if (v) out.push(v); return " ";
    });
    return unique(out).slice(0, 4);
  }
  function gradesOf(text) {
    var out = [];
    (String(text).match(/高[一二三]|[一二三]年級/g) || []).forEach(function (g) { out.push("一二三".indexOf(g.replace(/高|年級/g, "")) + 1); });
    return unique(out.filter(Boolean)).sort();
  }

  /* tokenize(record, { title, date }) → [{ s, t, k, d, g }]: segment number, topics, kinds, dates,
     grades. Only segments that carry at least a topic or a kind are kept. */
  function tokenize(record, options) {
    options = options || {};
    var titleTopics = topicsOf(options.title || ""), out = [];
    segmentsOf(record).slice(0, 400).forEach(function (seg, index) {
      if (out.length >= MAX_SEGMENTS) return;
      var topics = topicsOf(seg.text), kinds = kindsOf(seg.text);
      /* 「依據…年…月…日…函辦理」 dates a letter, not the event. */
      var letter = /函|字第|號令|號函|^依據|發文/.test(seg.text);
      if (letter) kinds = kinds.filter(function (k) { return k !== "time" && k !== "deadline"; });
      if (!topics.length && !kinds.length) return;
      var row = { s: index, t: topics, k: kinds };
      var dates = letter ? [] : datesOf(seg.text, options.date);
      if (dates.length) row.d = dates;
      var grades = gradesOf(seg.text);
      if (grades.length) row.g = grades;
      out.push(row);
    });
    return { v: VERSION, title: titleTopics, segments: out };
  }

  /* ---------- 問題也切成 token ---------- */
  var ASK_KIND = [
    { id: "penalty", re: /沒(?:有)?(?:寫|交|繳|去|到|參加|做|完成|帶|請)|不(?:寫|交|繳|去|到|參加|做|帶|請)|遲交|遲到|會怎(?:麼)?樣|後果|會被|罰/ },
    { id: "deadline", re: /截止|期限|最晚|到幾號|什麼時候(?:要)?(?:交|繳|報名|申請)|何時(?:交|繳|報名)/ },
    { id: "time", re: /什麼時候|何時|幾點|哪天|哪一天|幾號|日期|時間/ },
    { id: "place", re: /哪裡|在哪|地點|教室|去哪/ },
    { id: "audience", re: /誰可以|資格|對象|幾年級|高[一二三](?:可以|能)/ },
    { id: "required", re: /要帶什麼|帶什麼|準備什麼|要準備|需要什麼|應備|附什麼/ },
    { id: "fee", re: /多少錢|費用|要錢|收費|免費嗎/ },
    { id: "method", re: /怎麼|如何|方式|流程|步驟|格式/ },
    { id: "contact", re: /找誰|問誰|電話|聯絡/ },
    { id: "allow", re: /可以|能不能|可不可以|能否|准不准/ }
  ];
  function tokenizeQuestion(question) {
    var q = clean(question), kinds = ASK_KIND.filter(function (k) { return k.re.test(q); }).map(function (k) { return k.id; });
    /* 「截止」 is a kind of time; 「沒交會怎樣」 is about the penalty, not the deadline. */
    if (kinds.indexOf("deadline") !== -1) kinds = kinds.filter(function (k) { return k !== "time"; });
    return { topics: topicsOf(q), kinds: kinds, grades: gradesOf(q) };
  }

  /* match(itemTokens, questionTokens) → best segment and a score.
     A segment with the asked topic AND the asked kind is what we want; the topic alone (or only
     in the title) counts for less. */
  function match(tokens, asked) {
    if (!tokens || !Array.isArray(tokens.segments) || !asked || !asked.topics.length) return null;
    var titleHit = asked.topics.filter(function (t) { return (tokens.title || []).indexOf(t) !== -1; }).length;
    var best = null;
    tokens.segments.forEach(function (seg) {
      var topicHit = asked.topics.filter(function (t) { return seg.t.indexOf(t) !== -1; }).length;
      var kindHit = asked.kinds.filter(function (k) { return seg.k.indexOf(k) !== -1; }).length;
      if (!topicHit && !(titleHit && kindHit)) return;
      var gradeOk = !asked.grades.length || !seg.g || seg.g.some(function (g) { return asked.grades.indexOf(g) !== -1; });
      var score = topicHit * 10 + (titleHit ? 6 : 0) + kindHit * (topicHit || titleHit ? 14 : 4) + (gradeOk ? 0 : -12);
      if (!best || score > best.score) best = { segment: seg, score: score, topics: topicHit, kinds: kindHit };
    });
    if (!best && titleHit) best = { segment: null, score: titleHit * 6, topics: 0, kinds: 0 };
    return best;
  }

  return { VERSION: VERSION, segmentsOf: segmentsOf, pushSegments: pushSegments, tokenize: tokenize, tokenizeQuestion: tokenizeQuestion,
    match: match, topicsOf: topicsOf, kindsOf: kindsOf, datesOf: datesOf, gradesOf: gradesOf, canonical: canonical, KINDS: KINDS.map(function (k) { return k.id; }) };
});
