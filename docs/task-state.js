/* Personal Assistant M4 task domain. Deterministic, account-agnostic and local-first. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsTaskState = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var VERSION = 1;
  var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  function validDate(value) { return ISO_DATE.test(String(value || "")); }
  function validIso(value) { return typeof value === "string" && !isNaN(Date.parse(value)); }
  function nowIso(now) { return validIso(now) ? now : new Date().toISOString(); }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function idFor(value) {
    var input = text(value) || "task";
    var hash = 2166136261;
    for (var i = 0; i < input.length; i++) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    var hex = "";
    for (var j = 0; j < 8; j++) { hash ^= hash << 13; hash ^= hash >>> 17; hash ^= hash << 5; hex += (hash >>> 0).toString(16).padStart(8, "0"); }
    hex = (hex + "00000000000000000000000000000000").slice(0, 32);
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-4" + hex.slice(13, 16) + "-8" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    return "{" + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ":" + stable(value[key]); }).join(",") + "}";
  }
  function compare(a, b) {
    var at = validIso(a && a.updated_at) ? Date.parse(a.updated_at) : -1;
    var bt = validIso(b && b.updated_at) ? Date.parse(b.updated_at) : -1;
    if (at !== bt) return at > bt ? 1 : -1;
    var ad = !!(a && a.deleted_at), bd = !!(b && b.deleted_at);
    if (ad !== bd) return ad ? 1 : -1;
    var aj = stable(a || {}), bj = stable(b || {});
    return aj === bj ? 0 : (aj > bj ? 1 : -1);
  }
  function normalize(row, fallbackNow) {
    row = row && typeof row === "object" ? row : {};
    var id = text(row.id);
    var title = text(row.title);
    if (!id || !title) return null;
    var updated = nowIso(row.updated_at || row.updatedAt || fallbackNow);
    var created = nowIso(row.created_at || row.createdAt || updated);
    var priority = row.priority === "" || row.priority == null ? null : Number(row.priority);
    if (!isFinite(priority)) priority = null;
    if (priority != null) priority = Math.max(0, Math.min(5, Math.round(priority)));
    var status = row.status === "completed" ? "completed" : "open";
    return {
      id: id, title: title, status: status,
      due_date: validDate(row.due_date || row.dueDate) ? String(row.due_date || row.dueDate) : null,
      priority: priority,
      notes: text(row.notes),
      source_announcement_id: text(row.source_announcement_id || row.sourceAnnouncementId) || null,
      source_event_id: text(row.source_event_id || row.sourceEventId) || null,
      created_at: created, updated_at: updated,
      completed_at: validIso(row.completed_at || row.completedAt) ? (row.completed_at || row.completedAt) : (status === "completed" ? updated : null),
      deleted_at: validIso(row.deleted_at || row.deletedAt) ? (row.deleted_at || row.deletedAt) : null,
    };
  }
  function merge(local, remote) {
    var byId = {};
    (Array.isArray(local) ? local : []).concat(Array.isArray(remote) ? remote : []).forEach(function (row) {
      var normalized = normalize(row);
      if (!normalized) return;
      if (!byId[normalized.id] || compare(normalized, byId[normalized.id]) > 0) byId[normalized.id] = normalized;
    });
    return Object.keys(byId).sort().map(function (id) { return byId[id]; });
  }
  function applyMutation(rows, type, payload, now) {
    now = nowIso(now);
    payload = payload && typeof payload === "object" ? payload : {};
    var current = merge(rows, []);
    var id = text(payload.id) || (type === "task.create" ? idFor("task:" + Date.now().toString(36) + ":" + Math.random().toString(16).slice(2)) : "");
    if (!id) throw new Error("task id required");
    var old = current.find(function (row) { return row.id === id; });
    var next = normalize(Object.assign({}, old || {}, payload, { id: id, updated_at: payload.updated_at || now }), now);
    if (!next) throw new Error("task title required");
    if (type === "task.complete") {
      next.status = "completed"; next.completed_at = payload.completed_at || now; next.deleted_at = null;
    } else if (type === "task.reopen") {
      next.status = "open"; next.completed_at = null; next.deleted_at = null;
    } else if (type === "task.delete") {
      next.deleted_at = payload.deleted_at || now;
    } else if (type !== "task.create" && type !== "task.upsert" && type !== "task.update") {
      throw new Error("unsupported task mutation");
    }
    return merge(current.filter(function (row) { return row.id !== id; }), [next]);
  }
  function visible(rows) { return merge(rows, []).filter(function (row) { return !row.deleted_at; }); }
  function sortOpen(rows) {
    return visible(rows).filter(function (row) { return row.status !== "completed"; }).sort(function (a, b) {
      var ad = a.due_date || "9999-12-31", bd = b.due_date || "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      var ap = a.priority == null ? -1 : a.priority, bp = b.priority == null ? -1 : b.priority;
      if (ap !== bp) return ap > bp ? -1 : 1;
      return a.created_at < b.created_at ? -1 : (a.created_at > b.created_at ? 1 : 0);
    });
  }
  function verifiedDeadline(item) {
    var events = item && Array.isArray(item.calendar_events) ? item.calendar_events : [];
    var dates = events.filter(function (event) {
      return event && event.kind === "deadline" && validDate(event.date) &&
        (event.provenance === "announcement_deadline" || event.provenance === "verified_announcement_deadline");
    }).map(function (event) { return event.date; }).sort();
    return dates[0] || null;
  }
  function fromAnnouncement(item) {
    if (!item || !item.id || !text(item.title)) return null;
    return { id: idFor("announcement:" + String(item.id)), title: text(item.title), due_date: verifiedDeadline(item), priority: null,
      notes: "", source_announcement_id: String(item.id), source_event_id: null };
  }
  return { VERSION: VERSION, idFor: idFor, validDate: validDate, normalize: normalize, merge: merge, applyMutation: applyMutation,
    visible: visible, sortOpen: sortOpen, verifiedDeadline: verifiedDeadline, fromAnnouncement: fromAnnouncement };
});
