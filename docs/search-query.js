/* Shared, deterministic search-term matching for announcements and Q&A. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsSearchQuery = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  /* A query matches every concept it names, while terms inside one concept are alternatives. */
  var GROUPS = [
    { terms: ["手機", "行動載具", "智慧型手機"], topic: true },
    { terms: ["獎學金", "獎助學金", "助學金"], topic: true },
    { terms: ["住宿", "宿舍", "學生宿舍", "宿舍生", "寢室"], topic: true },
    { terms: ["考試", "段考", "測驗", "檢定"], topic: true },
    { terms: ["社團", "社團活動", "社團選填"], topic: true },
    { terms: ["申請", "申辦", "登記"], topic: false },
  ];

  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function compact(value) { return clean(value).toLocaleLowerCase("zh-TW").replace(/[^0-9a-z\u3400-\u9fff]+/g, ""); }
  function unique(rows) { var seen = {}; return rows.filter(function (row) { if (!row || seen[row]) return false; seen[row] = true; return true; }); }
  function indexOfAny(value, choices) {
    var found = -1;
    choices.forEach(function (choice) {
      var at = value.indexOf(choice);
      if (at !== -1 && (found === -1 || at < found)) found = at;
    });
    return found;
  }
  function queryGroups(query) {
    var value = compact(query), remainder = value, rows = [];
    GROUPS.forEach(function (group) {
      if (indexOfAny(value, group.terms) === -1) return;
      rows.push({ terms: group.terms.slice(), topic: group.topic });
      group.terms.forEach(function (term) { remainder = remainder.split(term).join(""); });
    });
    /* Preserve the user's non-synonym wording as an exact required term. */
    if (remainder.length >= 2) rows.push({ terms: [remainder], topic: !rows.length });
    if (!rows.length && value) rows.push({ terms: [value], topic: true });
    return rows;
  }
  function concepts(query) { return queryGroups(query).map(function (group) { return group.terms; }); }
  function terms(query) {
    return unique(concepts(query).reduce(function (out, group) { return out.concat(group); }, []));
  }
  function matches(text, query) {
    var haystack = compact(text);
    if (!compact(query)) return true;
    return concepts(query).every(function (group) {
      return group.some(function (term) { return haystack.indexOf(term) !== -1; });
    });
  }
  function hasAny(text, terms) { return terms.some(function (term) { return text.indexOf(term) !== -1; }); }
  function primaryText(item) {
    return compact([item && item.title, item && item.category, item && item.source_category].filter(Boolean).join(" "));
  }
  function secondaryText(item) {
    return compact([item && item.summary, item && item.snippet].filter(Boolean).join(" "));
  }
  function primaryTopicsMatch(item, query) {
    var primary = primaryText(item), topics = queryGroups(query).filter(function (group) { return group.topic; });
    return !topics.length || topics.every(function (group) { return hasAny(primary, group.terms); });
  }
  /* A topic named by the user must be visible in the title/category.  Body text is evidence,
     not permission to reclassify an unrelated announcement such as 申請入學 as 宿舍申請. */
  function announcementScore(item, query) {
    var groups = queryGroups(query), primary = primaryText(item), secondary = secondaryText(item), score = 0;
    if (!compact(query)) return 1;
    if (!primaryTopicsMatch(item, query)) return 0;
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i], inPrimary = hasAny(primary, group.terms), inSecondary = hasAny(secondary, group.terms);
      if (!inPrimary && !inSecondary) return 0;
      score += inPrimary ? (group.topic ? 100 : 45) : 8;
    }
    if (primary.indexOf(compact(query)) !== -1) score += 35;
    return score;
  }

  return { compact: compact, concepts: concepts, terms: terms, matches: matches,
    primaryTopicsMatch: primaryTopicsMatch, announcementScore: announcementScore };
});
