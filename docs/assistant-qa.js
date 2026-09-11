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
  function rank(query, items, details, options) {
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
      return { item:item,detail:detailMap[item.id]||null,text:combined,score:metadataScore+reviewedScore+reviewedBonus+titleScore+overviewScore+Math.min(bodyScore,80)+intentBonus+slotBonus,anchorScore:anchorScore,reviewedMatch:reviewedScore>0,reviewedCoverage:reviewedCoverage,reviewedAnchorHits:reviewedAnchorHits,reviewedLongest:reviewedLongest,search_validity:metadataRow&&metadataRow.validity };
    }).filter(function (row) { return row && row.score >= 8 && (!anchorTokens.length || row.anchorScore > 0 || row.reviewedMatch); }).sort(function (a, b) {
      return b.score - a.score || String(b.item.date || b.item.first_seen || "").localeCompare(String(a.item.date || a.item.first_seen || ""));
    });
    if (!ranked.length) return ranked;
    var strongReviewed=ranked.filter(function(row){return row.reviewedMatch&&row.reviewedLongest>=3&&row.reviewedAnchorHits>=2&&row.reviewedCoverage>=0.12;});
    if(strongReviewed.length){
      var related={};strongReviewed.forEach(function(row){related[row.item.id]=true;var record=Validity&&Validity.reviewedRecord?Validity.reviewedRecord(row.item):null;(record&&record.relations||[]).forEach(function(rel){if(rel.target_id)related[rel.target_id]=true;});});
      ranked=ranked.filter(function(row){return related[row.item.id]||(row.reviewedMatch&&row.reviewedLongest>=3&&row.reviewedAnchorHits>=2&&row.reviewedCoverage>=0.12);});
    }
    var floor = Math.max(70, ranked[0].score * 0.55);
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
    return score;
  }
  function candidateQualifies(candidate, plan) {
    var slot = plan && plan.answer_slot || "";
    if (!slot) return candidate.score >= 4;
    var hits = cueHits(candidate.text, slot);
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
  function composeSummary(evidence, sources, wanted, plan) {
    var lead = evidence.length ? smoothEvidence(evidence[0].text) : "";
    if (!lead) return "目前資料不足，找不到可驗證的答案。";
    if(sources.length>1&&sources.some(function(i){return i.validity&&i.validity.relations&&i.validity.relations.length;}))return"找到互相修正或補充的官方文件，已依指定範圍合併；未被點名的內容仍沿用原文件。";
    if (sources.length > 1) return "找到 " + sources.length + " 則可能相關的官方資訊，已按公告分開整理；它們不是同一項活動，請逐項核對。";
    var slot = plan && plan.answer_slot || "", prefix = "依官方公告，最相關的重點是：";
    if (slot === "destination") prefix = "先說結論，送件／辦理位置的證據是：";
    else if (slot === "class_place") prefix = "先說結論，上課地點的證據是：";
    else if (slot === "deadline" || wanted.indexOf("date") !== -1) prefix = "先說結論，官方資料中的時間重點是：";
    else if (slot === "requirement") prefix = "依官方資料，是否必須參加的直接證據是：";
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
    if(PERSONAL_DATA_QUERY.test(query))return personalDataAnswer(query,ranked,options);
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
    if (!evidence.length) return { status: "insufficient", query: query, summary: "有找到可能相關的公告，但沒有找到能直接回答這個問題的官方句子。", evidence: [], sources: [] };
    var sourceIds = {};
    evidence.forEach(function (row) { sourceIds[row.announcement_id] = true; });
    var sources = ranked.filter(function (row) { return sourceIds[row.item.id]; }).map(function (row) {
      return Object.assign({}, row.item, { validity: row.validity });
    }).slice(0, 4);
    var validityWarnings = [];
    ranked.forEach(function (row) { (row.validity.warnings || []).forEach(function (warning) { validityWarnings.push(warning); }); });
    evidence.sort(function(a,b){return b.score-a.score;});var lines = answerLines(evidence, sources);
    return { status: "answered", query: query, summary: composeSummary(evidence, sources, wanted, plan),
      answer_lines: lines, limitation: evidenceLimitation(evidence, sources, plan, validityWarnings), confidence: validityWarnings.length ? "medium" : (lines.length >= 2 ? "high" : "medium"),
      plan: plan, evidence: evidence, sources: sources, validity_warnings: unique(validityWarnings) };
  }
  return { tokens: tokens, anchors: anchors, literalAnchors:literalAnchors, intent: intent, answerSlot:answerSlot, subjectTerms:subjectTerms, questionPlan: questionPlan, detailText: detailText, detailSegments:detailSegments, rank: rank,
    smoothEvidence: smoothEvidence, answerLines: answerLines, evidenceLimitation: evidenceLimitation, composeSummary: composeSummary,
    isPersonalDataQuery:function(query){return PERSONAL_DATA_QUERY.test(clean(query));},answer: answer };
});
