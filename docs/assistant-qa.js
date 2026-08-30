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
    place: ["哪裡", "地點", "在哪", "會場", "教室"],
    method: ["怎麼", "如何", "辦法", "流程", "報名", "申請", "要帶", "繳交"],
    person: ["誰", "對象", "資格", "哪些人", "學生", "年級"],
    status: ["現在", "目前", "已經", "還有", "最新", "公告了嗎"],
    yesno: ["是否", "有沒有", "需不需要", "需要", "可以嗎", "能不能", "會不會", "嗎"],
  };
  var STOP = ["請問", "我想知道", "想知道", "可以幫我", "幫我", "有沒有", "是否", "可以", "目前", "學校", "公告", "相關", "一下", "嗎", "呢", "啊", "的", "了", "是"];
  var GENERIC = ["有什麼", "什麼", "哪些", "最近", "目前", "相關", "規定", "辦法", "如何", "怎麼", "何時", "時間", "日期", "截止", "活動", "資訊", "資料", "請問", "快", "或"];

  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function compact(value) { return clean(value).toLocaleLowerCase("zh-TW").replace(/[^0-9a-z\u3400-\u9fff]+/g, ""); }
  function unique(rows) { var seen = {}; return rows.filter(function (row) { if (!row || seen[row]) return false; seen[row] = true; return true; }); }
  function tokens(query) {
    var normalized = compact(query), base = normalized;
    STOP.forEach(function (word) { base = base.split(word).join(""); });
    var out = clean(query).toLocaleLowerCase("zh-TW").split(/[\s,，。！？?、:：;；()（）]+/).filter(function (word) { return word.length >= 2; });
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
  function overview(item) {
    return clean([item && item.title, item && item.summary, item && item.snippet, item && item.category, item && item.source_category, item && item.school_name].filter(Boolean).join(" "));
  }
  function detailText(record) {
    if (!record || record.provenance !== "official_article") return "";
    var parts = [];
    (record.blocks || []).forEach(function (block) {
      if (block && block.text) parts.push(block.text);
      (block && block.items || []).forEach(function (item) { parts.push(item); });
      (block && block.rows || []).forEach(function (row) { parts.push((row || []).join(" ")); });
    });
    (record.attachments || []).forEach(function (file) {
      if (file && file.parse_status === "parsed" && file.embedded_text) parts.push(file.embedded_text);
    });
    return clean(parts.join(" ")).slice(0, 120000);
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
  function rank(query, items, details) {
    var queryTokens = tokens(query), anchorTokens = anchors(query), wanted = intent(query), detailMap = details || {};
    /* Fail closed.  Falling back to raw full-text ranking makes a missing or
       stale search module silently return unrelated announcements. */
    if (!SearchQuery || !queryTokens.length) return [];
    var ranked = (Array.isArray(items) ? items : []).map(function (item) {
      var metadataScore = SearchQuery.announcementScore(item, query);
      if (!metadataScore) return null;
      var titleScore = scoreText(item.title || "", queryTokens, 9);
      var overviewScore = scoreText(overview(item), queryTokens, 3);
      var body = detailText(detailMap[item.id]);
      var bodyScore = scoreText(body, queryTokens, 1);
      var anchorScore = scoreText(clean(item.title || "") + " " + overview(item) + " " + body, anchorTokens, 1);
      var intentBonus = 0, combined = clean(overview(item) + " " + body);
      wanted.forEach(function (key) { if (INTENTS[key].some(function (word) { return combined.indexOf(word) !== -1; })) intentBonus += 4; });
      return { item: item, detail: detailMap[item.id] || null, text: combined, score: metadataScore + titleScore + overviewScore + Math.min(bodyScore, 80) + intentBonus, anchorScore: anchorScore };
    }).filter(function (row) { return row && row.score >= 8 && (!anchorTokens.length || row.anchorScore > 0); }).sort(function (a, b) {
      return b.score - a.score || String(b.item.date || b.item.first_seen || "").localeCompare(String(a.item.date || a.item.first_seen || ""));
    });
    if (!ranked.length) return ranked;
    var floor = Math.max(70, ranked[0].score * 0.50);
    return ranked.filter(function (row) { return row.score >= floor; });
  }
  function sentences(value) {
    return clean(value).split(/(?<=[。！？!?；;])|\n+/).map(clean).filter(function (row) { return row.length >= 8 && row.length <= 420; });
  }
  function evidenceScore(sentence, queryTokens, wanted) {
    var score = scoreText(sentence, queryTokens, 4);
    wanted.forEach(function (key) { if (INTENTS[key].some(function (word) { return sentence.indexOf(word) !== -1; })) score += 12; });
    if (/作者\s*[：:]|發[佈布]日期|最後更新日期/.test(sentence)) score -= 18;
    return score;
  }
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
    if (sources.length > 1) return "找到多則不同公告，已分開列出；不能把不同活動的日期或資格互相拼接。";
    if (plan.wants_latest) return "這是本站目前已抓到的最新官方資料；校方若尚未發布，系統不會自行補出答案。";
    return "答案只涵蓋目前可讀取的公告正文與 PDF 文字，圖片型附件可能尚未包含。";
  }
  function composeSummary(evidence, sources, wanted) {
    var lead = evidence.length ? smoothEvidence(evidence[0].text) : "";
    if (!lead) return "目前資料不足，找不到可驗證的答案。";
    if (sources.length > 1) return "找到 " + sources.length + " 則可能相關的官方資訊，已按公告分開整理；它們不是同一項活動，請逐項核對。";
    var prefix = "依官方公告，最相關的重點是：";
    if (wanted.indexOf("date") !== -1) prefix = "先說結論，官方資料中的時間重點是：";
    else if (wanted.indexOf("method") !== -1) prefix = "依官方公告，辦理方式的重點是：";
    else if (wanted.indexOf("place") !== -1) prefix = "依官方公告，地點資訊是：";
    else if (wanted.indexOf("person") !== -1) prefix = "依官方公告，適用對象或資格的重點是：";
    return prefix + lead + (/[。！？!?]$/.test(lead) ? "" : "。") + "下方附有 " + sources.length + " 則可核對的官方來源。";
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
      return clean(row.item.title || "相關公告") + "：本次期限或事件" + (date ? "已於 " + date : "已經") + "結束。";
    });
    return { status: "answered", query: query,
      summary: "找到的相關官方公告已超過明確期限；不能用它證明現在仍可申請、報名或辦理。",
      answer_lines: lines, limitation: "目前未找到可確認仍有效的更新公告；若校方另有新公告，應以新公告為準。",
      confidence: "medium", plan: questionPlan(query), evidence: [], sources: sources,
      validity_warnings: ["過期公告只作歷史依據，不作目前有效證明。"] };
  }
  function answer(query, items, details, options) {
    query = clean(query).slice(0, 160);
    var queryTokens = tokens(query), plan = questionPlan(query), wanted = plan.intents, ranked = rank(query, items, details).slice(0, 8);
    if (ranked.length) {
      var relevanceFloor = Math.max(8, ranked[0].score * 0.35);
      ranked = ranked.filter(function (row) { return row.score >= relevanceFloor; }).slice(0, 5);
    }
    if (!query || !queryTokens.length || !ranked.length) return { status: "insufficient", query: query, summary: "目前資料不足，找不到可驗證的答案。", evidence: [], sources: [] };
    ranked.forEach(function (row) { row.validity = validityFor(row, options); });
    var currentSensitive = Validity && Validity.requiresCurrentStatus(query);
    var openWindow = Validity && Validity.requiresOpenWindow(query);
    function unusableForCurrentAnswer(row) { return row.validity.answer_policy === "exclude" || (openWindow && row.validity.stale_sensitive); }
    var expiredRows = currentSensitive ? ranked.filter(unusableForCurrentAnswer) : [];
    if (currentSensitive) ranked = ranked.filter(function (row) { return !unusableForCurrentAnswer(row); });
    if (!ranked.length && expiredRows.length) return expiredAnswer(query, expiredRows);
    var evidence = [], seen = {};
    ranked.forEach(function (row) {
      var sourceText = detailText(row.detail) || clean((row.item.summary || "") + " " + (row.item.snippet || ""));
      sentences(sourceText).map(function (sentence) { return { text: sentence, score: evidenceScore(sentence, queryTokens, wanted), item: row.item }; })
        .filter(function (candidate) { return candidate.score >= 4 && (!Validity || Validity.sentencePolicy(candidate.text, row.validity, query) !== "exclude"); })
        .sort(function (a, b) { return b.score - a.score; }).slice(0, 1).forEach(function (candidate) {
          var key = compact(candidate.text);
          if (!seen[key] && evidence.length < 4) { seen[key] = true; evidence.push({ text: candidate.text.slice(0, 220), announcement_id: candidate.item.id, title: candidate.item.title, score: candidate.score, validity: row.validity }); }
        });
    });
    if (!evidence.length) return { status: "insufficient", query: query, summary: "有找到可能相關的公告，但內容不足以可靠回答。", evidence: [], sources: [] };
    var sourceIds = {};
    evidence.forEach(function (row) { sourceIds[row.announcement_id] = true; });
    var sources = ranked.filter(function (row) { return sourceIds[row.item.id]; }).map(function (row) {
      return Object.assign({}, row.item, { validity: row.validity });
    }).slice(0, 4);
    var validityWarnings = [];
    ranked.forEach(function (row) { (row.validity.warnings || []).forEach(function (warning) { validityWarnings.push(warning); }); });
    var lines = answerLines(evidence, sources);
    return { status: "answered", query: query, summary: composeSummary(evidence, sources, wanted),
      answer_lines: lines, limitation: evidenceLimitation(evidence, sources, plan, validityWarnings), confidence: validityWarnings.length ? "medium" : (lines.length >= 2 ? "high" : "medium"),
      plan: plan, evidence: evidence, sources: sources, validity_warnings: unique(validityWarnings) };
  }
  return { tokens: tokens, anchors: anchors, intent: intent, questionPlan: questionPlan, detailText: detailText, rank: rank,
    smoothEvidence: smoothEvidence, answerLines: answerLines, evidenceLimitation: evidenceLimitation, composeSummary: composeSummary, answer: answer };
});
