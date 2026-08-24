(function (root) {
  "use strict";
  var PRESETS = Object.freeze({
    single: [1],
    standard: [3, 1, 0],
    intensive: [7, 3, 1, 0]
  });
  var VALID = new Set(["announcement_deadline", "announcement_event", "official_calendar_event", "task_due", "manual"]);

  function normalizeTarget(target) {
    if (!target || !VALID.has(target.kind) || typeof target.id !== "string" || !target.id) return null;
    if (typeof target.date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(target.date)) return null;
    return { kind: target.kind, id: target.id, date: target.date.slice(0, 10), provenance: target.provenance || target.kind };
  }

  function createRule(target, offsets, baseline) {
    var normalized = normalizeTarget(target);
    if (!normalized) return null;
    var safeOffsets = Array.from(new Set((offsets || []).filter(function (n) { return Number.isInteger(n) && n >= 0 && n <= 365; }))).sort(function (a, b) { return b - a; });
    if (!safeOffsets.length) return null;
    return { target: normalized, offsets_days: safeOffsets, baseline_at: baseline || new Date().toISOString(), enabled: true };
  }

  function shiftDate(date, deltaDays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !Number.isInteger(deltaDays)) return "";
    var parts = date.split("-").map(Number);
    var value = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + deltaDays));
    return value.toISOString().slice(0, 10);
  }

  function scheduleDates(rule, today) {
    if (!rule || rule.enabled === false || !rule.target || !/^\d{4}-\d{2}-\d{2}$/.test(String(today || ""))) return [];
    var target = normalizeTarget(rule.target);
    if (!target || target.date < today) return [];
    var baselineDate = typeof rule.baseline_at === "string" && /^\d{4}-\d{2}-\d{2}/.test(rule.baseline_at) ? rule.baseline_at.slice(0, 10) : today;
    var floor = baselineDate > today ? baselineDate : today;
    return Array.from(new Set(rule.offsets_days || [])).filter(function (offset) {
      return Number.isInteger(offset) && offset >= 0 && offset <= 365;
    }).map(function (offset) {
      return { offset_days: offset, date: shiftDate(target.date, -offset) };
    }).filter(function (row) {
      /* Past offsets and rules enabled after their send date never replay. */
      return row.date >= floor;
    }).sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : b.offset_days - a.offset_days); });
  }

  function nextReminder(rule, today) {
    var rows = scheduleDates(rule, today);
    return rows.length ? rows[0] : null;
  }

  root.CyNewsReminderRules = { PRESETS: PRESETS, normalizeTarget: normalizeTarget, createRule: createRule,
    shiftDate: shiftDate, scheduleDates: scheduleDates, nextReminder: nextReminder };
})(typeof window !== "undefined" ? window : globalThis);

