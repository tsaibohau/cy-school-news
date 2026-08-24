/* Account-owned reminder intent. Trusted target time is resolved in Postgres;
 * this client sends only the verified account's task ID and reminder offsets. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsReminderRules = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var PRESETS = { single: [1], standard: [3, 1, 0], dense: [7, 3, 1, 0] };

  function offsetsFor(preset, custom) {
    if (PRESETS[preset]) return PRESETS[preset].slice();
    if (preset !== "custom") return PRESETS.single.slice();
    var values = Array.isArray(custom) ? custom : String(custom || "").split(",");
    var offsets = values.map(function (value) { return Number(String(value).trim()); })
      .filter(function (value) { return Number.isInteger(value) && value >= 0 && value <= 365; })
      .filter(function (value, index, all) { return all.indexOf(value) === index; })
      .sort(function (a, b) { return b - a; });
    if (!offsets.length || offsets.length > 8) throw new Error("custom offsets must contain 1 to 8 unique days");
    return offsets;
  }

  function nextReminderTime(dueDate, offsets, now) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate || ""))) return null;
    var target = new Date(dueDate + "T00:00:00+08:00");
    if (isNaN(target.getTime())) return null;
    var after = now instanceof Date ? now : new Date(now || Date.now());
    return offsets.map(function (days) { return new Date(target.getTime() - days * 86400000); })
      .filter(function (date) { return date > after; })
      .sort(function (a, b) { return a - b; })[0] || null;
  }

  function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
  function normalizeTarget(target) {
    var allowed = ["announcement_deadline", "announcement_event", "official_calendar_event", "task_due", "manual"];
    if (!target || allowed.indexOf(target.kind) === -1 || !String(target.id || "").trim() || !validDate(target.date)) return null;
    return { kind: target.kind, id: String(target.id), date: String(target.date), provenance: target.provenance || (target.kind === "manual" ? "manual" : "verified") };
  }
  function createRule(target, offsets, baseline) {
    target = normalizeTarget(target);
    if (!target) return null;
    var clean = (Array.isArray(offsets) ? offsets : []).map(Number)
      .filter(function (value) { return Number.isInteger(value) && value >= 0 && value <= 365; })
      .filter(function (value, index, all) { return all.indexOf(value) === index; })
      .sort(function (a, b) { return b - a; });
    if (!clean.length) return null;
    return { target_kind: target.kind, target_id: target.id, target_date: target.date, offsets_days: clean, schedule_baseline_at: baseline || new Date().toISOString(), provenance: target.provenance };
  }
  function shiftDate(value, days) {
    var date = new Date(value + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  function scheduleDates(rule, today) {
    if (!rule || !validDate(rule.target_date) || !validDate(today) || rule.target_date < today) return [];
    var baseline = String(rule.schedule_baseline_at || "").slice(0, 10);
    return rule.offsets_days.map(function (offset) { return { date: shiftDate(rule.target_date, -offset), offset_days: offset }; })
      .filter(function (row) { return row.date >= today && (!validDate(baseline) || row.date >= baseline); })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  function nextReminder(rule, today) { return scheduleDates(rule, today)[0] || null; }

  function createAdapter(options) {
    options = options || {};
    var auth = options.auth;
    if (!auth || typeof auth.getVerifiedSession !== "function" || typeof auth.getClient !== "function") throw new Error("verified auth controller required");
    function context() {
      return auth.getVerifiedSession().then(function (session) {
        var uid = session && session.user && session.user.id;
        if (typeof uid !== "string" || !uid) throw new Error("verified login required");
        return auth.getClient().then(function (client) { return { uid: uid, client: client }; });
      });
    }
    function upsertTask(task, preset, custom) {
      if (!task || !/^[0-9a-f-]{36}$/i.test(String(task.id || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(task.due_date || ""))) {
        return Promise.reject(new Error("task has no verified due date"));
      }
      var offsets = offsetsFor(preset, custom);
      return context().then(function (ctx) {
        return ctx.client.from("user_reminder_rules").upsert({
          user_id: ctx.uid,
          target_kind: "task_due",
          target_id: String(task.id),
          reminder_target_id: null,
          manual_target_at: null,
          offsets_days: offsets,
          preset: preset,
          enabled: true,
          disabled_at: null,
          deleted_at: null,
          schedule_baseline_at: new Date().toISOString(),
        }, { onConflict: "user_id,target_kind,target_id" }).then(function (result) {
          if (result.error) throw result.error;
          return { targetId: String(task.id), offsets: offsets, next: nextReminderTime(task.due_date, offsets) };
        });
      });
    }
    return { upsertTask: upsertTask };
  }

  return { PRESETS: PRESETS, offsetsFor: offsetsFor, normalizeTarget: normalizeTarget, createRule: createRule,
    scheduleDates: scheduleDates, nextReminder: nextReminder, nextReminderTime: nextReminderTime, createAdapter: createAdapter };
});
