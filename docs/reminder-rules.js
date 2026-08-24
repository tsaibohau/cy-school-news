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

  root.CyNewsReminderRules = { PRESETS: PRESETS, normalizeTarget: normalizeTarget, createRule: createRule };
})(typeof window !== "undefined" ? window : globalThis);

