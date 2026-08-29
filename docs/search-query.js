/* Shared, deterministic search-term matching for announcements and Q&A. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsSearchQuery = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  /* A query matches every concept it names, while terms inside one concept are alternatives. */
  var GROUPS = [
    ["手機", "行動載具", "智慧型手機"],
    ["獎學金", "獎助學金", "助學金"],
    ["住宿", "宿舍", "學生宿舍", "宿舍生", "寢室"],
    ["考試", "段考", "測驗", "檢定"],
    ["社團", "社團活動", "社團選填"],
    ["申請", "申辦", "登記"],
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
  function concepts(query) {
    var value = compact(query), remainder = value, rows = [];
    GROUPS.forEach(function (group) {
      if (indexOfAny(value, group) === -1) return;
      rows.push(group.slice());
      group.forEach(function (term) { remainder = remainder.split(term).join(""); });
    });
    /* Preserve the user's non-synonym wording as an exact required term. */
    if (remainder.length >= 2) rows.push([remainder]);
    if (!rows.length && value) rows.push([value]);
    return rows;
  }
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

  return { compact: compact, concepts: concepts, terms: terms, matches: matches };
});
