/* Canonical member-capability model. This module contains no DOM interception. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsCapabilities = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var KEYS = ["member_content", "assistant", "timetable", "calendar", "notifications"];
  var LABELS = {
    member_content: "會員摘要", assistant: "問校務", timetable: "課表",
    calendar: "行事曆", notifications: "訂閱通知",
  };

  function empty() {
    return { member_content: false, assistant: false, timetable: false, calendar: false, notifications: false };
  }
  function full() {
    return { member_content: true, assistant: true, timetable: true, calendar: true, notifications: true };
  }
  function normalize(value) {
    var out = empty();
    if (value && !Array.isArray(value) && typeof value === "object") {
      KEYS.forEach(function (key) { out[key] = value[key] === true; });
      return out;
    }
    (Array.isArray(value) ? value : []).forEach(function (row) {
      if (row && KEYS.indexOf(row.capability) !== -1) out[row.capability] = row.enabled === true;
    });
    return out;
  }
  function isEffectiveAdmin(access) {
    return !!(access && access.is_admin && ["owner", "co_admin"].indexOf(access.admin_role) !== -1);
  }
  function effective(access, value) {
    if (!access || access.status !== "approved") return empty();
    return isEffectiveAdmin(access) ? full() : normalize(value);
  }
  function has(map, key) { return KEYS.indexOf(key) !== -1 && normalize(map)[key]; }
  function any(map, keys) {
    var normalized = normalize(map);
    return keys.some(function (key) { return normalized[key] === true; });
  }
  function anyPersonal(map) { return any(map, ["assistant", "timetable", "calendar", "notifications"]); }
  function summary(map) {
    var normalized = normalize(map);
    var enabled = KEYS.filter(function (key) { return normalized[key]; }).map(function (key) { return LABELS[key]; });
    return enabled.length ? enabled.join("、") : "未開放功能";
  }
  function requirementForTab(tab) {
    if (tab === "assistant") return "assistant";
    if (tab === "timetable") return "timetable";
    if (tab === "calendar") return "calendar";
    if (["home", "today", "sub"].indexOf(tab) !== -1) return "personal";
    return null;
  }
  function allowsTab(map, tab) {
    var requirement = requirementForTab(tab);
    if (requirement === "personal") return anyPersonal(map);
    return !requirement || has(map, requirement);
  }

  return {
    KEYS: KEYS.slice(), LABELS: Object.assign({}, LABELS), empty: empty, full: full,
    normalize: normalize, effective: effective, isEffectiveAdmin: isEffectiveAdmin,
    has: has, any: any, anyPersonal: anyPersonal, summary: summary,
    requirementForTab: requirementForTab, allowsTab: allowsTab,
  };
});
