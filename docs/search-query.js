/* Metadata-first retrieval shared by the announcement library and school Q&A. */
(function (root, factory) {
  var taxonomy = root.CyNewsSearchTaxonomy;
  if (!taxonomy && typeof module !== "undefined" && module.exports) taxonomy = require("./search-taxonomy.js");
  var api = factory(taxonomy || { version: 0, topics: [], actions: [] });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsSearchQuery = api;
})(typeof window !== "undefined" ? window : this, function (taxonomy) {
  "use strict";

  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function compact(value) { return clean(value).toLocaleLowerCase("zh-TW").replace(/[^0-9a-z\u3400-\u9fff]+/g, ""); }
  function unique(rows) { var seen = {}; return rows.filter(function (row) { if (!row || seen[row]) return false; seen[row] = true; return true; }); }
  var STUDENT_TERMS = ["學生", "新生", "住宿生", "入住", "報到", "家長", "寢室", "床位", "舍監", "工讀生"];
  var STAFF_TERMS = ["職缺", "徵才", "甄選", "遞補", "人員", "幹事", "面試", "任用"];
  function allRules() { return (taxonomy.topics || []).map(function (row) { return { kind: "topic", row: row }; })
    .concat((taxonomy.actions || []).map(function (row) { return { kind: "action", row: row }; })); }
  function findTerms(value, choices) { return (choices || []).filter(function (term) { return value.indexOf(compact(term)) !== -1; }); }
  function queryPlan(query) {
    var value = compact(query), topics = [], actions = [], matched = [];
    ["請問", "我想知道", "有沒有", "怎麼辦", "如何", "怎麼", "辦法", "規定", "資訊", "公告", "相關", "現在", "目前", "最新", "什麼時候", "何時", "日期", "截止", "期限", "時間", "流程", "方式", "需不需要", "需要", "上繳", "可以", "能不能", "會不會", "嗎", "呢"].forEach(function (word) {
      value = value.split(compact(word)).join("");
    });
    var remainder = value;
    allRules().forEach(function (rule) {
      var found = findTerms(value, rule.row.terms);
      if (!found.length) return;
      (rule.kind === "topic" ? topics : actions).push(rule.row.id);
      found.forEach(function (term) { remainder = remainder.split(compact(term)).join(""); });
      matched = matched.concat(found);
    });
    return { value: value, topics: unique(topics), actions: unique(actions),
      terms: unique(matched), remainder: remainder.length >= 2 ? remainder : "" };
  }
  function primaryText(item) { return compact([item && item.title, item && item.category, item && item.source_category].filter(Boolean).join(" ")); }
  function titleText(item) { return compact(item && item.title); }
  function supportingText(item) { return compact([item && item.summary, item && item.snippet].filter(Boolean).join(" ")); }
  function labelsFromPrimary(item, kind) {
    var field = kind === "topic" ? "topics" : "actions", stored = item && item[field];
    if (Array.isArray(stored) && Number(item.classification_version) === Number(taxonomy.version)) return stored;
    var primary = primaryText(item), rules = kind === "topic" ? (taxonomy.topics || []) : (taxonomy.actions || []);
    return rules.filter(function (row) { return findTerms(primary, row.terms).length; }).map(function (row) { return row.id; });
  }
  function includesAll(values, wanted) { return wanted.every(function (value) { return values.indexOf(value) !== -1; }); }
  function hasWord(text, word) { return !word || text.indexOf(word) !== -1; }
  function hasAny(text, words) { return (words || []).some(function (word) { return text.indexOf(compact(word)) !== -1; }); }
  function ruleById(kind, id) { return allRules().filter(function (rule) { return rule.kind === kind && rule.row.id === id; })[0]; }
  function hasRule(text, kind, id) {
    var rule = ruleById(kind, id);
    return !!(rule && findTerms(text, rule.row.terms).length);
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
    if (plan.remainder) rows.push(plan.remainder);
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
  function announcementScore(item, query) {
    var plan = queryPlan(query), title = titleText(item), primary = primaryText(item), supporting = supportingText(item);
    if (!plan.value) return 1;
    var primaryTopics = labelsFromPrimary(item, "topic"), score = 0, topicInPrimary = false, weakTopic = false;

    /* Fielded retrieval: all evidence contributes a score.  Strong title and
       source matches rank first; a summary-only hit remains a low-confidence
       fallback so imperfect classifications never turn a search into zero. */
    plan.topics.forEach(function (id) {
      if (hasRule(title, "topic", id)) { score += 220; topicInPrimary = true; }
      else if (hasRule(primary, "topic", id)) { score += 160; topicInPrimary = true; }
      else if (hasRule(supporting, "topic", id)) { score += 40; weakTopic = true; }
      else score -= 90;
    });

    /* Unknown subjects can also be found in a summary, but rank below an
       explicit title/category/source match. */
    if (plan.remainder) {
      if (hasWord(title, plan.remainder)) score += 190;
      else if (hasWord(primary, plan.remainder)) score += 125;
      else if (hasWord(supporting, plan.remainder)) score += 35;
      else if (!plan.topics.length) return 0;
    }

    /* Process words are ranking signals.  Specific processes receive a
       larger penalty when absent, but do not erase a related result. */
    plan.actions.forEach(function (id) {
      if (hasRule(title, "action", id)) score += 45;
      else if (hasRule(primary, "action", id)) score += 28;
      else if (hasRule(supporting, "action", id)) score += 8;
      else if (actionRequired(id)) score -= 180;
    });

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

    if (hasWord(title, plan.value)) score += 260;
    else if (hasWord(primary, plan.value)) score += 120;
    else if (hasWord(supporting, plan.value)) score += 35;
    return Math.max(0, score);
  }
  function cutoff(scores) {
    var best = Math.max.apply(null, scores.length ? scores : [0]);
    return best >= 120 ? Math.max(55, best * 0.50) : 1;
  }
  function select(items, query) {
    var rows = (Array.isArray(items) ? items : []).map(function (item) {
      return { item: item, score: announcementScore(item, query) };
    }).filter(function (row) { return row.score > 0; }).sort(function (a, b) { return b.score - a.score; });
    var floor = cutoff(rows.map(function (row) { return row.score; }));
    return rows.filter(function (row) { return row.score >= floor; });
  }
  return { compact: compact, concepts: concepts, terms: terms, matches: matches, queryPlan: queryPlan,
    primaryTopicsMatch: primaryTopicsMatch, announcementScore: announcementScore, cutoff: cutoff, select: select, taxonomyVersion: taxonomy.version };
});
