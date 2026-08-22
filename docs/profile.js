/* Versioned, privacy-minimized personal profile. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsProfile = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  var VERSION = 1;
  function list(value) {
    var source = Array.isArray(value) ? value : String(value || "").split(",");
    var seen = {};
    return source.map(function (item) { return String(item || "").trim(); })
      .filter(function (item) { var key = item.toLocaleLowerCase("zh-TW"); if (!item || seen[key]) return false; seen[key] = true; return true; });
  }
  function grade(value) {
    var n = Number(value);
    return n === 1 || n === 2 || n === 3 ? n : null;
  }
  function normalize(value) {
    value = value && typeof value === "object" ? value : {};
    return {
      schema_version: VERSION,
      school_id: String(value.school_id || "").trim(),
      grade_level: grade(value.grade_level),
      class_name: String(value.class_name || "").trim().slice(0, 20),
      interests: list(value.interests).slice(0, 20),
      tracked_categories: list(value.tracked_categories).slice(0, 20),
      tracked_keywords: list(value.tracked_keywords).slice(0, 30),
    };
  }
  function empty() { return normalize({}); }
  function toInputs(value) {
    var profile = normalize(value);
    return Object.assign({}, profile, {
      interests_text: profile.interests.join(", "),
      tracked_categories_text: profile.tracked_categories.join(", "),
      tracked_keywords_text: profile.tracked_keywords.join(", "),
    });
  }
  return { VERSION: VERSION, list: list, normalize: normalize, empty: empty, toInputs: toInputs };
});
