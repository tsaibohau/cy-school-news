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
    var primaryTopics = labelsFromPrimary(item, "topic"), score = 0, topicInPrimary = false;

    /* Retrieval is deliberately recall-first, like a small fielded search
       engine: subject terms find candidates; process words (apply/register)
       improve their order but must never erase a relevant announcement. */
    plan.topics.forEach(function (id) {
      if (hasRule(title, "topic", id)) { score += 220; topicInPrimary = true; }
      else if (hasRule(primary, "topic", id)) { score += 160; topicInPrimary = true; }
      /* Summaries/snippets are not a trustworthy subject index: one can
         mention a dormitory while the announcement is actually a camp or an
         admission notice.  Keep them for ranking/evidence only. */
      else score = -10000;
    });
    if (score < 0) return 0;

    /* An unclassified subject still has a safe route: it must be named in a
       title/category/source field.  This prevents a stray body sentence from
       turning an unrelated announcement into the answer. */
    if (plan.remainder) {
      if (hasWord(title, plan.remainder)) score += 190;
      else if (hasWord(primary, plan.remainder)) score += 125;
      else return 0;
    }

    /* Process words rank results, rather than being an all-or-nothing gate. */
    plan.actions.forEach(function (id) {
      if (hasRule(title, "action", id)) score += 45;
      else if (hasRule(primary, "action", id)) score += 28;
      else if (hasRule(supporting, "action", id)) score += 8;
      else if (actionRequired(id)) score = -10000;
    });
    if (score < 0) return 0;

    /* A document whose title is clearly about a different known subject is
       not promoted merely because its summary happens to mention the query. */
    if (plan.topics.length && !topicInPrimary) return 0;

    if (hasWord(title, plan.value)) score += 260;
    else if (hasWord(primary, plan.value)) score += 120;
    else if (hasWord(supporting, plan.value)) score += 35;
    return score;
  }
  return { compact: compact, concepts: concepts, terms: terms, matches: matches, queryPlan: queryPlan,
    primaryTopicsMatch: primaryTopicsMatch, announcementScore: announcementScore, taxonomyVersion: taxonomy.version };
});
