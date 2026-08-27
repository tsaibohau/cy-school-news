/* Small, transparent preference signals for assistant ranking. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsAssistantFeedback = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var VERSION = 1;
  var WEIGHTS = { view: 1, add_task: 6, complete: 10, dismiss: -12 };
  function normalize(value) {
    value = value && typeof value === "object" ? value : {};
    var signals = {};
    Object.keys(value.signals || {}).slice(0, 500).forEach(function (key) {
      if (!/^announcement:[A-Za-z0-9._-]{1,100}$/.test(key)) return;
      var row = value.signals[key] || {}, score = Number(row.score) || 0;
      signals[key] = { score: Math.max(-40, Math.min(40, Math.round(score))),
        last_action: Object.prototype.hasOwnProperty.call(WEIGHTS, row.last_action) ? row.last_action : "",
        updated_at: typeof row.updated_at === "string" ? row.updated_at : "" };
    });
    return { version: VERSION, signals: signals };
  }
  function record(value, key, action, now) {
    var next = normalize(value), id = String(key || "");
    if (!/^announcement:[A-Za-z0-9._-]{1,100}$/.test(id) || !Object.prototype.hasOwnProperty.call(WEIGHTS, action)) return next;
    var old = next.signals[id] || { score: 0 };
    next.signals[id] = { score: Math.max(-40, Math.min(40, Number(old.score || 0) + WEIGHTS[action])), last_action: action,
      updated_at: now || new Date().toISOString() };
    return next;
  }
  function score(value, key) { return (normalize(value).signals[String(key || "")] || {}).score || 0; }
  function signal(value, key) { return normalize(value).signals[String(key || "")] || { score: 0, last_action: "", updated_at: "" }; }
  return { VERSION: VERSION, normalize: normalize, record: record, score: score, signal: signal };
});
