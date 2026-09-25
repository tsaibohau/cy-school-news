(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CyNewsCalendarState = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
  function legacyId(row, index) { return "user:legacy:" + index + ":" + String(row.date || "") + ":" + String(row.title || ""); }
  function normalize(rows) {
    return (Array.isArray(rows) ? rows : []).filter(function (row) {
      return row && String(row.title || "").trim() && validDate(row.date);
    }).map(function (row, index) {
      return { id: String(row.id || legacyId(row, index)), title: String(row.title).trim(), date: String(row.date), notes: String(row.notes || "").trim() };
    });
  }
  function upsert(rows, event) {
    var normalized = normalize(rows), next = { id: String(event.id), title: String(event.title || "").trim(), date: String(event.date || ""), notes: String(event.notes || "").trim() };
    if (!next.id || !next.title || !validDate(next.date)) return normalized;
    var found = false;
    return normalized.map(function (row) { if (row.id !== next.id) return row; found = true; return next; }).concat(found ? [] : [next]);
  }
  function remove(rows, id) { return normalize(rows).filter(function (row) { return row.id !== String(id); }); }
  return { normalize: normalize, upsert: upsert, remove: remove };
});
