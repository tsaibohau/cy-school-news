/* Account-owned reminder intent. Trusted target time is resolved in Postgres;
 * this client sends only the verified account's task ID and reminder offsets. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsReminderRules = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var PRESETS = { single: [1], standard: [3, 1, 0], dense: [7, 3, 1, 0] };
  var PRESET_LABELS = { single: "單次", standard: "標準", dense: "密集", custom: "自訂" };

  function offsetsFor(preset, custom) {
    if (PRESETS[preset]) return PRESETS[preset].slice();
    if (preset !== "custom") return PRESETS.single.slice();
    var values = Array.isArray(custom) ? custom : String(custom || "").split(",");
    var parsed = values.map(function (value) { return String(value).trim(); });
    if (!parsed.length || parsed.some(function (value) { return !/^\d{1,3}$/.test(value) || Number(value) > 365; })) {
      throw new Error("custom offsets must contain 1 to 8 unique days");
    }
    var offsets = parsed.map(Number)
      .filter(function (value, index, all) { return all.indexOf(value) === index; })
      .sort(function (a, b) { return b - a; });
    if (!offsets.length || offsets.length > 8) throw new Error("custom offsets must contain 1 to 8 unique days");
    return offsets;
  }

  function nextReminderTime(dueDate, offsets, now) {
    if (!validDate(dueDate)) return null;
    var target = new Date(dueDate + "T00:00:00+08:00");
    if (isNaN(target.getTime())) return null;
    var after = now instanceof Date ? now : new Date(now || Date.now());
    return offsets.map(function (days) { return new Date(target.getTime() - days * 86400000); })
      .filter(function (date) { return date > after; })
      .sort(function (a, b) { return a - b; })[0] || null;
  }

  function validDate(value) {
    value = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split("-").map(Number);
    var parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return parsed.getUTCFullYear() === parts[0] && parsed.getUTCMonth() === parts[1] - 1 && parsed.getUTCDate() === parts[2];
  }
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

  /* Shared presentation model for subscription/task/detail surfaces. */
  function targetState(target, options, now) {
    var normalized = normalizeTarget(target);
    if (!normalized) return { status: "unverified", label: "沒有可驗證的提醒日期", manualAllowed: true, next: null };
    options = options || {};
    var next = nextReminderTime(normalized.date, offsetsFor(options.preset || "single", options.custom), now);
    if (!next) return { status: "past", label: "提醒日期已過", manualAllowed: true, next: null };
    return { status: "verified", label: "下一次提醒：" + next.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }), manualAllowed: false, next: next };
  }

  function subscriptionStatus(options) {
    options = options || {};
    var preset = PRESET_LABELS[options.preset] ? options.preset : "single";
    return {
      notification: options.notificationEnabled ? "新公告通知：開啟" : "新公告通知：關閉",
      reminder: options.reminderEnabled ? "提醒推播：已開啟" : "提醒推播：未開啟",
      preset: PRESET_LABELS[preset],
      next: options.reminderEnabled && options.next instanceof Date && !isNaN(options.next.getTime()) ? options.next : null,
    };
  }

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
    function upsertManual(targetId, date, preset, custom) {
      targetId = String(targetId || "").trim();
      var targetAt = validDate(date) ? new Date(date + "T00:00:00+08:00") : null;
      if (!targetId || targetId.length > 240 || !targetAt || isNaN(targetAt.getTime()) || targetAt <= new Date()) {
        return Promise.reject(new Error("manual reminder requires a future date"));
      }
      var offsets = offsetsFor(preset, custom);
      return context().then(function (ctx) {
        return ctx.client.from("user_reminder_rules").upsert({
          user_id: ctx.uid,
          target_kind: "manual",
          target_id: targetId,
          reminder_target_id: null,
          manual_target_at: targetAt.toISOString(),
          offsets_days: offsets,
          preset: preset,
          provenance: "manual",
          source_revision: "manual",
          enabled: true,
          disabled_at: null,
          deleted_at: null,
          schedule_baseline_at: new Date().toISOString(),
        }, { onConflict: "user_id,target_kind,target_id" }).then(function (result) {
          if (result.error) throw result.error;
          return { targetId: targetId, offsets: offsets, next: nextReminderTime(date, offsets) };
        });
      });
    }
    function listRules() {
      return context().then(function (ctx) {
        return ctx.client.from("user_reminder_rules")
          .select("id,target_kind,target_id,offsets_days,preset,enabled,schedule_baseline_at,disabled_at,deleted_at,provenance,resolved_target_at,resolved_target_title,resolved_source_url")
          .eq("user_id", ctx.uid)
          .is("deleted_at", null)
          .then(function (result) {
            if (result.error) throw result.error;
            return (result.data || []).map(function (row) {
              return Object.assign({}, row, {
                target_date: String(row.resolved_target_at || "").slice(0, 10),
                title: row.resolved_target_title || "提醒",
                source_url: row.resolved_source_url || "",
              });
            });
          });
      });
    }
    return { upsertTask: upsertTask, upsertManual: upsertManual, listRules: listRules };
  }

  return { PRESETS: PRESETS, PRESET_LABELS: PRESET_LABELS, offsetsFor: offsetsFor, normalizeTarget: normalizeTarget, createRule: createRule,
    scheduleDates: scheduleDates, nextReminder: nextReminder, nextReminderTime: nextReminderTime,
    targetState: targetState, subscriptionStatus: subscriptionStatus, createAdapter: createAdapter };
});
