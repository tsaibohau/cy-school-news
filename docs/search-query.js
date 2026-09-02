/* Metadata-first retrieval shared by the announcement library and school Q&A. */
(function (root, factory) {
  var taxonomy = root.CyNewsSearchTaxonomy;
  if (!taxonomy && typeof module !== "undefined" && module.exports) taxonomy = require("./search-taxonomy.js");
  var api = factory(taxonomy || { version: 0, topics: [], actions: [] }, root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsSearchQuery = api;
})(typeof window !== "undefined" ? window : this, function (taxonomy, root) {
  "use strict";

  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function compact(value) { return clean(value).toLocaleLowerCase("zh-TW").replace(/[^0-9a-z\u3400-\u9fff]+/g, ""); }
  function unique(rows) { var seen = {}; return rows.filter(function (row) { if (!row || seen[row]) return false; seen[row] = true; return true; }); }
  var planCache = {};
  var fieldCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var labelCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var validityCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var STUDENT_TERMS = ["學生", "新生", "住宿生", "入住", "報到", "家長", "寢室", "床位", "舍監", "工讀生"];
  var STAFF_TERMS = ["職缺", "徵才", "甄選", "遞補", "人員", "幹事", "面試", "任用"];
  var FACETS = [
    { id: "regulation", terms: ["規定", "辦法", "要點", "規範", "準則", "標準"] },
    { id: "procedure", terms: ["流程", "步驟", "操作", "說明", "指南"] },
    { id: "result", terms: ["結果", "名單", "錄取", "分發"] },
    { id: "location", terms: ["地點", "位置", "哪裡", "教室", "站牌"] },
    { id: "availability", terms: ["開放時間", "開館時間", "營業時間", "開放", "開館"] }
  ];
  function allRules() { return (taxonomy.topics || []).map(function (row) { return { kind: "topic", row: row }; })
    .concat((taxonomy.actions || []).map(function (row) { return { kind: "action", row: row }; })); }
  function findTerms(value, choices) { return (choices || []).filter(function (term) { return value.indexOf(compact(term)) !== -1; })
    .sort(function (a, b) { return compact(b).length - compact(a).length; }); }
  function queryPlan(query) {
    var cacheKey = clean(query), cached = planCache[cacheKey];
    if (cached) return cached;
    var original = compact(query), value = original, topics = [], actions = [], matched = [], termMatches = [], facets = [];
    FACETS.forEach(function (facet) {
      var found = findTerms(original, facet.terms);
      if (!found.length) return;
      facets.push(facet.id);
      found.forEach(function (term) { termMatches.push({ kind: "facet", id: facet.id, term: compact(term) }); });
    });
    ["請問", "幫我", "我想知道", "有沒有", "有什麼", "有哪些", "怎麼辦", "如何", "怎麼", "辦法", "規定", "資訊", "公告", "相關", "現在", "目前", "最新", "什麼時候", "何時", "日期", "截止", "期限", "時間", "流程", "方式", "需不需要", "需要", "上繳", "可以", "可否", "能否", "還能不能", "能不能", "還能", "是否", "會不會", "使用", "一下", "這個", "這", "能", "嗎", "呢"].forEach(function (word) {
      value = value.split(compact(word)).join("");
    });
    var remainder = value;
    termMatches.filter(function (row) { return row.kind === "facet"; }).forEach(function (row) {
      remainder = remainder.split(row.term).join("");
    });
    allRules().forEach(function (rule) {
      var found = findTerms(value, rule.row.terms);
      if (!found.length) return;
      (rule.kind === "topic" ? topics : actions).push(rule.row.id);
      found.forEach(function (term) {
        remainder = remainder.split(compact(term)).join("");
        termMatches.push({ kind: rule.kind, id: rule.row.id, term: compact(term) });
      });
      matched = matched.concat(found);
    });
    ["以及", "還有", "或者", "與", "和", "或", "的", "之", "是"].forEach(function (word) {
      remainder = remainder.split(compact(word)).join("");
    });
    var remainderTerms = clean(remainder).split(/\s+/).map(compact).filter(function (word) { return word.length >= 2; });
    if (!remainderTerms.length && remainder.length >= 2) remainderTerms = [remainder];
    var plan = { value: value, topics: unique(topics), actions: unique(actions), facets: unique(facets),
      terms: unique(matched), term_matches: termMatches, remainder_terms: unique(remainderTerms),
      remainder: remainderTerms.join("") };
    planCache[cacheKey] = plan;
    return plan;
  }
  function itemFields(item) {
    item = item || {};
    var cached = fieldCache && fieldCache.get(item);
    if (cached) return cached;
    var fields = {
      title: compact(item.title),
      primary: compact([item.title, item.category, item.source_category].filter(Boolean).join(" ")),
      supporting: compact([item.summary, item.snippet].filter(Boolean).join(" "))
    };
    if (fieldCache && item && typeof item === "object") fieldCache.set(item, fields);
    return fields;
  }
  function primaryText(item) { return itemFields(item).primary; }
  function titleText(item) { return itemFields(item).title; }
  function supportingText(item) { return itemFields(item).supporting; }
  function labelsFromPrimary(item, kind) {
    var field = kind === "topic" ? "topics" : "actions", stored = item && item[field];
    if (Array.isArray(stored) && Number(item.classification_version) === Number(taxonomy.version)) return stored;
    var cached = labelCache && labelCache.get(item);
    if (cached && cached[kind]) return cached[kind];
    var primary = primaryText(item), rules = kind === "topic" ? (taxonomy.topics || []) : (taxonomy.actions || []);
    var labels = rules.filter(function (row) { return findTerms(primary, row.terms).length; }).map(function (row) { return row.id; });
    if (labelCache && item && typeof item === "object") {
      cached = cached || {};
      cached[kind] = labels;
      labelCache.set(item, cached);
    }
    return labels;
  }
  function includesAll(values, wanted) { return wanted.every(function (value) { return values.indexOf(value) !== -1; }); }
  function hasWord(text, word) { return !word || text.indexOf(word) !== -1; }
  function hasAny(text, words) { return (words || []).some(function (word) { return text.indexOf(compact(word)) !== -1; }); }
  function ruleById(kind, id) { return allRules().filter(function (rule) { return rule.kind === kind && rule.row.id === id; })[0]; }
  function hasRule(text, kind, id) {
    var rule = ruleById(kind, id);
    return !!(rule && findTerms(text, rule.row.terms).length);
  }
  function exactTermsFor(plan, kind, id) {
    return unique((plan.term_matches || []).filter(function (row) { return row.kind === kind && row.id === id; })
      .map(function (row) { return row.term; }));
  }
  function facetById(id) { return FACETS.filter(function (row) { return row.id === id; })[0]; }
  function fieldHit(text, words) { return (words || []).some(function (word) { return hasWord(text, word); }); }
  function bigrams(value) {
    value = compact(value);
    var out = [];
    for (var i = 0; i < value.length - 1; i += 1) out.push(value.slice(i, i + 2));
    return unique(out);
  }
  function phraseCoverage(text, phrase) {
    phrase = compact(phrase);
    if (!phrase) return 1;
    if (hasWord(text, phrase)) return 1;
    if (phrase.length < 4) return 0;
    var grams = bigrams(phrase);
    if (!grams.length) return 0;
    return grams.filter(function (gram) { return hasWord(text, gram); }).length / grams.length;
  }
  function actionRequired(id) {
    var rule = ruleById("action", id);
    return !!(rule && rule.row.retrieval === "required");
  }
  function terms(query) {
    var plan = queryPlan(query), rows = [];
    allRules().forEach(function (rule) {
      var selected = rule.kind === "topic" ? plan.topics : plan.actions;
      if (selected.indexOf(rule.row.id) !== -1) rows = rows.concat(rule.row.terms);
    });
    rows = rows.concat(plan.remainder_terms || []);
    return unique(rows.map(compact));
  }
  function concepts(query) { return terms(query).map(function (term) { return [term]; }); }
  function matches(text, query) {
    var plan = queryPlan(query), value = compact(text);
    if (!plan.value) return true;
    return plan.topics.every(function (id) { return allRules().some(function (rule) { return rule.kind === "topic" && rule.row.id === id && findTerms(value, rule.row.terms).length; }); }) &&
      hasWord(value, plan.remainder);
  }
  function primaryTopicsMatch(item, query) { return includesAll(labelsFromPrimary(item, "topic"), queryPlan(query).topics); }
  function reviewedSearchText(item, options) {
    var validity = validityApi(options), record = validity && validity.reviewedRecord ? validity.reviewedRecord(item) : null;
    if (!record) return "";
    return compact((record.fragments || []).map(function (fragment) {
      return clean(fragment.keywords) + " " + clean(fragment.text);
    }).join(" "));
  }
  function termEvidenceScore(fields, reviewed, term) {
    var titleCoverage = phraseCoverage(fields.title, term);
    var primaryCoverage = phraseCoverage(fields.primary, term);
    var reviewedCoverage = phraseCoverage(reviewed, term);
    var supportingCoverage = phraseCoverage(fields.supporting, term);
    if (titleCoverage >= 0.6) return 310 * titleCoverage;
    if (primaryCoverage >= 0.6) return 190 * primaryCoverage;
    if (reviewedCoverage >= 0.6) return 235 * reviewedCoverage;
    if (supportingCoverage >= 0.72) return 35 * supportingCoverage;
    return 0;
  }
  function announcementScore(item, query, options) {
    var plan = queryPlan(query), title = titleText(item), primary = primaryText(item), supporting = supportingText(item);
    if (!plan.value) return 1;
    var fields = itemFields(item), reviewed = reviewedSearchText(item, options);
    var primaryTopics = labelsFromPrimary(item, "topic"), score = 0, topicInPrimary = false, weakTopic = false;

    /* Fielded retrieval: all evidence contributes a score.  Strong title and
       source matches rank first; a summary-only hit remains a low-confidence
       fallback so imperfect classifications never turn a search into zero. */
    var missingTopics = 0;
    plan.topics.forEach(function (id) {
      var exactTopicTerms = exactTermsFor(plan, "topic", id);
      if (hasRule(title, "topic", id)) { score += 220; topicInPrimary = true; }
      else if (hasRule(primary, "topic", id)) { score += 160; topicInPrimary = true; }
      else if (hasRule(supporting, "topic", id)) { score += 40; weakTopic = true; }
      else { score -= 220; missingTopics += 1; }
      if (fieldHit(title, exactTopicTerms)) score += 150;
      else if (fieldHit(primary, exactTopicTerms)) score += 80;
      else if (fieldHit(supporting, exactTopicTerms)) score += 18;
    });

    /* Unknown subjects can also be found in a summary, but rank below an
       explicit title/category/source match. */
    (plan.remainder_terms || []).forEach(function (term) {
      var evidence = termEvidenceScore(fields, reviewed, term);
      if (evidence) score += evidence;
      else score -= plan.topics.length ? 95 : 150;
    });

    /* Process words are ranking signals.  Specific processes receive a
       larger penalty when absent, but do not erase a related result. */
    plan.actions.forEach(function (id) {
      var exactActionTerms = exactTermsFor(plan, "action", id);
      if (hasRule(title, "action", id)) score += 70;
      else if (hasRule(primary, "action", id)) score += 42;
      else if (hasRule(supporting, "action", id)) score += 10;
      else score -= actionRequired(id) ? 180 : 32;
      if (fieldHit(title, exactActionTerms)) score += 95;
      else if (fieldHit(primary, exactActionTerms)) score += 45;
      else if (fieldHit(supporting, exactActionTerms)) score += 10;
    });

    plan.facets.forEach(function (id) {
      var facet = facetById(id), words = facet ? facet.terms : [];
      if (fieldHit(title, words)) score += 185;
      else if (fieldHit(primary, words)) score += 110;
      else if (fieldHit(supporting, words)) score += 28;
      else score -= 75;
    });
    if (plan.topics.length && plan.facets.length &&
        plan.topics.every(function (id) { return hasRule(title, "topic", id); }) &&
        plan.facets.every(function (id) { var facet = facetById(id); return facet && fieldHit(title, facet.terms); })) score += 220;

    if (plan.topics.length && plan.actions.length) {
      var titleHasTopic = plan.topics.every(function (id) { return hasRule(title, "topic", id); });
      var titleHasAction = plan.actions.every(function (id) { return hasRule(title, "action", id); });
      if (titleHasTopic && titleHasAction) score += 110;
      else if (titleHasTopic && plan.actions.some(function (id) { return hasRule(supporting, "action", id); })) score += 35;
    }

    /* A different known subject in a title is a conflict signal, not an
       absolute rejection.  It leaves a weak fallback available only when
       there are no better source-level matches. */
    if (weakTopic && primaryTopics.some(function (id) { return plan.topics.indexOf(id) === -1; })) score -= 90;

    /* This is a student-facing service.  A query that does not explicitly
       ask about staff work prefers student-service notices, while still
       leaving staff notices searchable when words such as 職缺 or 幹事 are
       supplied by the user. */
    var queryAsksStaff = hasAny(plan.value, STAFF_TERMS);
    if (plan.topics.length && !queryAsksStaff) {
      if (hasAny(primary + " " + supporting, STUDENT_TERMS)) score += 85;
      if (hasAny(primary + " " + supporting, STAFF_TERMS)) score -= 140;
    }

    if (missingTopics && plan.topics.length) score = Math.min(score, weakTopic ? 75 : 25);
    if (hasWord(title, plan.value)) score += 260;
    else if (hasWord(primary, plan.value)) score += 120;
    else if (hasWord(supporting, plan.value)) score += 35;
    return Math.max(0, score);
  }
  function queryExactTerms(plan) {
    return unique((plan.term_matches || []).map(function (row) { return row.term; }).concat(plan.remainder_terms || []));
  }
  function specificityBonuses(items, plan) {
    var words = queryExactTerms(plan), total = Math.max(1, items.length), out = {};
    words.forEach(function (word) {
      var count = items.reduce(function (sum, item) {
        return sum + (hasWord(primaryText(item) + supportingText(item), word) ? 1 : 0);
      }, 0);
      out[word] = Math.min(3.5, 1 + Math.log((total + 1) / (count + 1)));
    });
    return out;
  }
  function validityApi(options) {
    if (options && options.validity) return options.validity;
    if (root && root.CyNewsAnnouncementValidity) return root.CyNewsAnnouncementValidity;
    if (typeof module !== "undefined" && module.exports) {
      try { return require("./announcement-validity.js"); } catch (_) { return null; }
    }
    return null;
  }
  function temporalScore(item, query, plan, score, options) {
    var validity = validityApi(options);
    if (!validity) return { score: score, validity: null };
    var current = validity.requiresCurrentStatus(query), actionSensitive = !!plan.actions.length;
    if (!current && !actionSensitive) return { score: score, validity: null };
    var detail = options && options.details && options.details[item.id], asOf = options && options.asOf || "";
    var cached = !detail && validityCache && validityCache.get(item);
    var analysis = cached && cached.asOf === asOf ? cached.analysis : validity.analyze(item, detail, { asOf: asOf });
    if (!detail && validityCache) validityCache.set(item, { asOf: asOf, analysis: analysis });
    var open = validity.requiresOpenWindow(query), status = analysis.status;
    if (status === "ACTIVE_WINDOW") score += open ? 140 : (current ? 85 : 55);
    else if (status === "ACTIVE") score += current ? 65 : 35;
    else if (status === "PARTIAL_ACTIVE") {
      var currentNegative = open && (analysis.fragments || []).some(function (fragment) { return fragment.answer_policy === "current_negative"; });
      score = currentNegative ? score + 180 : score * (open ? 0.52 : 0.78);
    }
    else if (status === "FUTURE") score = score * (open ? 0.42 : 0.72);
    else if (status === "EXPIRED") score = score * (open ? 0.14 : (current ? 0.25 : 0.34));
    else if (status === "UNCONFIRMED") score -= 12;
    return { score: Math.max(1, score), validity: analysis };
  }
  function publicationTimestamp(item) {
    var direct = clean(item && (item.date || item.published_at || ""));
    var match = direct.match(/(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (!match) match = clean(item && item.snippet).match(/發佈日期\s*[:：]?\s*(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (!match) return 0;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  function academicYear(item) {
    var match = clean(item && item.title).match(/(?:^|\D)(1\d{2})(?:學年度|學年)/);
    return match ? Number(match[1]) : 0;
  }
  function freshnessScore(item, query, options) {
    var validity = validityApi(options), current = validity && validity.requiresCurrentStatus ? validity.requiresCurrentStatus(query) : /現在|目前|最新|本學期|這學期/.test(query);
    if (!current) return 0;
    var published = publicationTimestamp(item), asOf = Date.parse(options && options.asOf || "");
    if (!published || !Number.isFinite(asOf)) return 0;
    var days = Math.max(0, (asOf - published) / 86400000);
    if (days <= 180) return 210;
    if (days <= 365) return 110;
    if (days <= 730) return 30;
    if (days > 1095) return -45;
    return 0;
  }
  function rank(items, query, options) {
    items = Array.isArray(items) ? items : [];
    var plan = queryPlan(query), idf = specificityBonuses(items, plan);
    return items.map(function (item) {
      var score = announcementScore(item, query, options || {}), fields = itemFields(item), title = fields.title, primary = fields.primary, supporting = fields.supporting;
      if (!score) return null;
      queryExactTerms(plan).forEach(function (word) {
        var weight = idf[word] || 1;
        if (hasWord(title, word)) score += 60 * weight;
        else if (hasWord(primary, word)) score += 30 * weight;
        else if (hasWord(supporting, word)) score += 8 * weight;
      });
      var queryAsksStaff = hasAny(plan.value, STAFF_TERMS);
      if (plan.topics.length && !queryAsksStaff && hasAny(primary, STAFF_TERMS)) score *= 0.22;
      score += freshnessScore(item, query, options || {});
      var temporal = temporalScore(item, query, plan, score, options || {});
      return { item: item, score: Math.round(temporal.score * 100) / 100, validity: temporal.validity };
    }).filter(Boolean).sort(function (a, b) {
      var scoreGap = b.score - a.score;
      var nearTie = Math.abs(scoreGap) <= Math.max(a.score, b.score) * 0.015;
      if (!nearTie) return scoreGap;
      return academicYear(b.item) - academicYear(a.item) || publicationTimestamp(b.item) - publicationTimestamp(a.item) || scoreGap || String(b.item.date || "").localeCompare(String(a.item.date || ""));
    });
  }
  function cutoff(scores) {
    var best = Math.max.apply(null, scores.length ? scores : [0]);
    return best >= 120 ? Math.max(55, best * 0.50) : 1;
  }
  function select(items, query, options) {
    var rows = rank(items, query, options), plan = queryPlan(query), validity = validityApi(options);
    var broadOpenQuery = validity && validity.requiresOpenWindow(query) && !(plan.remainder_terms || []).length;
    if (broadOpenQuery && rows.some(function (row) { return row.validity && row.validity.status === "ACTIVE_WINDOW"; })) {
      rows = rows.filter(function (row) {
        if (row.validity && row.validity.status === "ACTIVE_WINDOW") return true;
        return !!(row.validity && (row.validity.fragments || []).some(function (fragment) { return fragment.answer_policy === "current_negative"; }));
      });
    }
    var floor = cutoff(rows.map(function (row) { return row.score; }));
    return rows.filter(function (row) { return row.score >= floor; });
  }
  return { compact: compact, concepts: concepts, terms: terms, matches: matches, queryPlan: queryPlan,
    primaryTopicsMatch: primaryTopicsMatch, announcementScore: announcementScore, cutoff: cutoff, rank: rank, select: select, taxonomyVersion: taxonomy.version };
});
