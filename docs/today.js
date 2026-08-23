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
  function build(input) {
    input = input || {};
    var today = date(input.today) ? input.today : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var until = input.days == null ? 7 : Math.max(1, Number(input.days));
    var official = Array.isArray(input.officialEvents) ? input.officialEvents : [];
    var announcementItems = Array.isArray(input.announcementItems) ? input.announcementItems : [];
    var tasks = Array.isArray(input.tasks) ? input.tasks.filter(function (task) { return task && !task.deleted_at && task.status !== "completed"; }) : [];
    var todayEvents = [], upcoming = [];
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
    var relevant = announcementItems.filter(function (item) {
      var result = typeof input.relevance === "function" ? input.relevance(item, input.profile || {}) : null;
      return result && result.reasons && result.reasons.length;
    }).slice(0, 10);
    deadlines.sort(function (a, b) { return a.date === b.date ? a.title.localeCompare(b.title, "zh-Hant") : (a.date < b.date ? -1 : 1); });
    return { today, todayEvents, upcoming, deadlines, openTasks: tasks, relevantAnnouncements: relevant,
      dueLabel: function (due) { return dueLabel(today, due); } };
  }
  return { build: build, dueLabel: dueLabel, rangeDates: rangeDates, diff: diff };
});
