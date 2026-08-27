/* Deterministic Today projection. No network, AI or second datastore. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsToday = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  function date(value) { return DATE.test(String(value || "")); }
  function diff(from, to) { return Math.round((Date.parse(to + "T00:00:00+08:00") - Date.parse(from + "T00:00:00+08:00")) / 86400000); }
  function dueLabel(today, due) {
    if (!date(due)) return "";
    var n = diff(today, due);
    if (n < 0) return "已逾期";
    if (n === 0) return "今天截止";
    if (n === 1) return "明天截止";
    return "剩 " + n + " 天";
  }
  function rangeDates(start, end) {
    var out = [], cursor = start, limit = 370;
    if (!date(start)) return out;
    end = date(end) && end >= start ? end : start;
    while (cursor <= end && limit-- > 0) { out.push(cursor); var d = new Date(cursor + "T12:00:00+08:00"); d.setDate(d.getDate() + 1); cursor = d.toISOString().slice(0, 10); }
    return out;
  }
  function relevanceLabel(result) {
    return (result && Array.isArray(result.reasons) ? result.reasons : []).slice(0, 3)
      .map(function (reason) { return String(reason.label || reason.matched_value || "").trim(); })
      .filter(Boolean).join("・");
  }
  function focusPlan(today, input) {
    var candidates = [], seen = {};
    function preference(sourceId) {
      if (!sourceId || typeof input.feedbackScore !== "function") return { score: 0, label: "" };
      var row = input.feedbackScore("announcement:" + sourceId) || {};
      return typeof row === "number" ? { score: row, label: "" } : { score: Number(row.score) || 0, label: String(row.label || "") };
    }
    function add(row) {
      var key = String(row.key || row.id || "");
      if (!key || seen[key]) return;
      seen[key] = true; candidates.push(row);
    }
    (input.tasks || []).forEach(function (task) {
      var days = date(task.due_date) ? diff(today, task.due_date) : null;
      if (days != null && days <= 3) add({ key: "task:" + task.id, id: task.id, kind: "task", title: task.title,
        date: task.due_date, reason: days < 0 ? "待辦已逾期" : (days === 0 ? "待辦今天截止" : dueLabel(today, task.due_date)),
        score: days < 0 ? 520 : (days === 0 ? 500 : 450 - days * 15), task: task });
      else if (days == null && Number(task.priority) >= 4) add({ key: "task:" + task.id, id: task.id, kind: "task",
        title: task.title, date: null, reason: "高優先待辦", score: 260 + Number(task.priority), task: task });
    });
    (input.deadlines || []).forEach(function (row) {
      if (row.task) return; // Tasks are already ranked above; do not duplicate them as deadlines.
      var days = diff(today, row.date);
      if (days < 0 || days > 3) return;
      var sourceId = row.source && row.source.id;
      var pref = preference(sourceId);
      if (pref.score <= -10) return;
      add({ key: sourceId ? "announcement:" + sourceId : "deadline:" + row.id, id: row.id, kind: "deadline",
        title: row.title, date: row.date, reason: dueLabel(today, row.date) + (pref.label ? "・" + pref.label : ""), score: (days === 0 ? 480 : 460 - days * 15) + pref.score,
        source: row.source || null });
    });
    (input.todayEvents || []).forEach(function (event) {
      add({ key: "event:" + event.id, id: event.id, kind: "event", title: event.title, date: today,
        reason: "今天的正式行程", score: 360, event: event });
    });
    (input.relevant || []).forEach(function (row) {
      var item = row.item, result = row.result;
      if (result.tier !== "strong") return;
      var pref = preference(item.id);
      if (pref.score <= -10) return;
      add({ key: "announcement:" + item.id, id: item.id, kind: "announcement", title: item.title,
        date: item.date || null, reason: "與你相關" + (relevanceLabel(result) ? "：" + relevanceLabel(result) : "") + (pref.label ? "・" + pref.label : ""),
        score: 330 + Number(result.priority || 0) / 100 + pref.score,
        source: item, relevance: result });
    });
    return candidates.sort(function (a, b) {
      if (a.score !== b.score) return b.score - a.score;
      var ad = a.date || "9999-12-31", bd = b.date || "9999-12-31";
      return ad === bd ? String(a.title).localeCompare(String(b.title), "zh-Hant") : ad.localeCompare(bd);
    }).slice(0, 5);
  }
  function build(input) {
    input = input || {};
    var today = date(input.today) ? input.today : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var until = input.days == null ? 7 : Math.max(1, Number(input.days));
    var official = Array.isArray(input.officialEvents) ? input.officialEvents : [];
    var announcementItems = Array.isArray(input.announcementItems) ? input.announcementItems : [];
    var tasks = Array.isArray(input.tasks) ? input.tasks.filter(function (task) { return task && !task.deleted_at && task.status !== "completed"; }) : [];
    var todayEvents = [], upcoming = [], upcomingReminders = [];
    official.forEach(function (event) {
      var dates = rangeDates(event.start_date || event.date, event.end_date);
      if (dates.indexOf(today) !== -1) todayEvents.push(event);
      else {
        var nextDate = dates.filter(function (d) { return d > today && diff(today, d) <= until; })[0];
        if (nextDate) upcoming.push(Object.assign({}, event, { date: nextDate }));
      }
    });
    var deadlines = [];
    announcementItems.forEach(function (item) {
      (Array.isArray(item.calendar_events) ? item.calendar_events : []).forEach(function (event) {
        if (!event || event.kind !== "deadline" || !date(event.date) ||
            (event.provenance !== "announcement_deadline" && event.provenance !== "verified_announcement_deadline")) return;
        var row = { id: String(item.id) + ":deadline:" + event.date, title: item.title, date: event.date, source: item };
        if (event.date === today) upcoming.push(row); else if (event.date > today && diff(today, event.date) <= until) deadlines.push(row);
      });
    });
    tasks.forEach(function (task) {
      if (date(task.due_date) && task.due_date >= today && diff(today, task.due_date) <= until) deadlines.push({ id: task.id, title: task.title, date: task.due_date, task: task });
    });
    var relevantRows = announcementItems.map(function (item) {
      var result = typeof input.relevance === "function" ? input.relevance(item, input.profile || {}) : null;
      return { item: item, result: result };
    }).filter(function (row) { return row.result && row.result.reasons && row.result.reasons.length; })
      .sort(function (a, b) { return Number(b.result.priority || 0) - Number(a.result.priority || 0); });
    var relevant = relevantRows.slice(0, 10).map(function (row) {
      return Object.assign({}, row.item, { assistant_relevance: row.result });
    });
    (Array.isArray(input.reminderRules) ? input.reminderRules : []).forEach(function (rule) {
      if (!rule || rule.enabled === false || rule.deleted_at || !date(rule.target_date)) return;
      var allowed = ["announcement_deadline", "announcement_event", "official_calendar_event", "task_due", "manual"];
      if (allowed.indexOf(rule.target_kind) === -1 || rule.target_date < today) return;
      var baseline = date(String(rule.schedule_baseline_at || "").slice(0, 10)) ? String(rule.schedule_baseline_at).slice(0, 10) : null;
      (Array.isArray(rule.offsets_days) ? rule.offsets_days : []).forEach(function (offset) {
        offset = Number(offset);
        if (!Number.isInteger(offset) || offset < 0 || offset > 365) return;
        var reminderDate = new Date(rule.target_date + "T00:00:00Z");
        reminderDate.setUTCDate(reminderDate.getUTCDate() - offset);
        var key = reminderDate.toISOString().slice(0, 10);
        if (key < today || (baseline && key < baseline) || diff(today, key) > until) return;
        upcomingReminders.push({ id: rule.id, title: rule.title || "提醒", date: key, offset_days: offset,
          target_kind: rule.target_kind, target_id: rule.target_id,
          provenance: rule.provenance || (rule.target_kind === "manual" ? "manual" : "verified") });
      });
    });
    upcomingReminders.sort(function (a, b) { return a.date.localeCompare(b.date) || String(a.id || "").localeCompare(String(b.id || "")); });
    deadlines.sort(function (a, b) { return a.date === b.date ? a.title.localeCompare(b.title, "zh-Hant") : (a.date < b.date ? -1 : 1); });
    var focusItems = focusPlan(today, { tasks: tasks, deadlines: deadlines, todayEvents: todayEvents, relevant: relevantRows,
      feedbackScore: input.feedbackScore });
    return { today, todayEvents, upcoming, deadlines, openTasks: tasks, relevantAnnouncements: relevant,
      upcomingReminders: upcomingReminders, focusItems: focusItems,
      briefLabel: focusItems.length ? "今天優先處理 " + focusItems.length + " 項" : "今天沒有明確需要處理的事項",
      dueLabel: function (due) { return dueLabel(today, due); } };
  }
  return { build: build, focusPlan: focusPlan, dueLabel: dueLabel, rangeDates: rangeDates, diff: diff };
});
