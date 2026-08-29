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
    ["請問", "我想知道", "有沒有", "怎麼辦", "如何", "怎麼", "辦法", "規定", "資訊", "公告", "相關", "現在", "目前", "最新", "什麼時候", "何時", "日期", "截止", "需不需要", "需要", "上繳", "可以", "能不能", "會不會", "嗎", "呢"].forEach(function (word) {
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
  function secondaryText(item) { return compact([item && item.summary, item && item.snippet].filter(Boolean).join(" ")); }
  function labelsFromPrimary(item, kind) {
    var field = kind === "topic" ? "topics" : "actions", stored = item && item[field];
    if (Array.isArray(stored) && Number(item.classification_version) === Number(taxonomy.version)) return stored;
    var primary = primaryText(item), rules = kind === "topic" ? (taxonomy.topics || []) : (taxonomy.actions || []);
    return rules.filter(function (row) { return findTerms(primary, row.terms).length; }).map(function (row) { return row.id; });
  }
  function includesAll(values, wanted) { return wanted.every(function (value) { return values.indexOf(value) !== -1; }); }
  function hasWord(text, word) { return !word || text.indexOf(word) !== -1; }
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
      plan.actions.every(function (id) { return allRules().some(function (rule) { return rule.kind === "action" && rule.row.id === id && findTerms(value, rule.row.terms).length; }); }) && hasWord(value, plan.remainder);
  }
  function primaryTopicsMatch(item, query) { return includesAll(labelsFromPrimary(item, "topic"), queryPlan(query).topics); }
  function announcementScore(item, query) {
    var plan = queryPlan(query), primary = primaryText(item), secondary = secondaryText(item);
    if (!plan.value) return 1;
    var topics = labelsFromPrimary(item, "topic"), actions = labelsFromPrimary(item, "action");
    // Topics and actions are independent facets. A generic action cannot
    // substitute for the topic the user explicitly requested.
    if (!includesAll(topics, plan.topics) || !includesAll(actions, plan.actions)) return 0;
    if (plan.remainder && !hasWord(primary, plan.remainder) && !hasWord(secondary, plan.remainder)) return 0;
    var score = plan.topics.length * 120 + plan.actions.length * 55;
    if (hasWord(primary, plan.value)) score += 60;
    else if (plan.remainder && hasWord(primary, plan.remainder)) score += 24;
    else if (plan.remainder && hasWord(secondary, plan.remainder)) score += 6;
    return score || (hasWord(primary, plan.value) ? 20 : 0);
  }
  return { compact: compact, concepts: concepts, terms: terms, matches: matches, queryPlan: queryPlan,
    primaryTopicsMatch: primaryTopicsMatch, announcementScore: announcementScore, taxonomyVersion: taxonomy.version };
});
