/* 今日摘要：把「今天」投影整理成幾句話。全部固定規則，不呼叫任何 AI 模型。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsDailyBrief = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  var WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  var MAX_NAMES = 3;
  var TITLE_LIMIT = 24;

  function addDays(day, n) {
    var d = new Date(day + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function diff(from, to) {
    return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
  }
  function short(title) {
    var text = String(title || "").replace(/\s+/g, " ").trim();
    return text.length > TITLE_LIMIT ? text.slice(0, TITLE_LIMIT - 1) + "…" : text;
  }
  function names(rows, label) {
    var unique = [];
    rows.forEach(function (row) {
      var text = label(row);
      if (text && unique.indexOf(text) === -1) unique.push(text);
    });
    var shown = unique.slice(0, MAX_NAMES).join("、");
    return unique.length > MAX_NAMES ? shown + " 等 " + unique.length + " 項" : shown;
  }
  function dueWord(today, day) {
    var n = diff(today, day);
    if (n <= 0) return "今天";
    if (n === 1) return "明天";
    if (n === 2) return "後天";
    return n + " 天後";
  }
  function dateLabel(today) {
    var d = new Date(today + "T00:00:00Z");
    return (d.getUTCMonth() + 1) + " 月 " + d.getUTCDate() + " 日星期" + WEEKDAYS[d.getUTCDay()];
  }
  function itemDay(item) { return String(item && item.date || "").slice(0, 10); }
  function seenDay(item) {
    var raw = String(item && item.first_seen || "");
    if (!raw) return "";
    var t = Date.parse(raw);
    if (isNaN(t)) return raw.slice(0, 10);
    return new Date(t + 8 * 3600000).toISOString().slice(0, 10);  // 台灣時間
  }

  // 今天新出現的公告：公告日期是今天，或今天才收錄且公告日期不早於昨天（排除新上架學校一次收錄的舊公告）
  function newToday(items, today, isVisible) {
    var yesterday = addDays(today, -1);
    var bySchool = {};
    var total = 0;
    (items || []).forEach(function (item) {
      if (!item || (typeof isVisible === "function" && !isVisible(item))) return;
      var day = itemDay(item);
      var fresh = day === today || (seenDay(item) === today && DATE.test(day) && day >= yesterday);
      if (!fresh) return;
      var name = String(item.school_name || item.school || "其他");
      bySchool[name] = (bySchool[name] || 0) + 1;
      total += 1;
    });
    var parts = Object.keys(bySchool).sort(function (a, b) { return bySchool[b] - bySchool[a] || a.localeCompare(b, "zh-Hant"); })
      .map(function (name) { return name + " " + bySchool[name] + " 則"; });
    return { total: total, parts: parts };
  }

  /*
   * input: {
   *   today: "YYYY-MM-DD", nickname, projection（CyNewsToday.build 的結果）,
   *   announcementItems, isVisible(item), schoolShort（使用者的學校簡稱）
   * }
   * 回傳 { lines: [句子...], text: 全文 }
   */
  function compose(input) {
    input = input || {};
    var today = DATE.test(String(input.today || "")) ? input.today : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var p = input.projection || {};
    var lines = [];
    var who = String(input.nickname || "").trim();
    lines.push((who ? who + "，" : "") + "今天是 " + dateLabel(today) + "。");

    var todayEvents = Array.isArray(p.todayEvents) ? p.todayEvents : [];
    if (todayEvents.length) {
      lines.push((input.schoolShort ? input.schoolShort + "今天" : "今天的行事曆") + "：" + names(todayEvents, function (e) { return short(e.title); }) + "。");
    }

    var soon = [].concat(Array.isArray(p.upcoming) ? p.upcoming : [], Array.isArray(p.deadlines) ? p.deadlines : [])
      .filter(function (row) { return row && DATE.test(String(row.date || "")) && diff(today, row.date) >= 0 && diff(today, row.date) <= 3 && !row.task; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
    var deadlineRows = soon.filter(function (row) { return row.source || /截止|報名|繳交|期限/.test(String(row.title || "")); });
    if (deadlineRows.length) {
      lines.push("快到期：" + names(deadlineRows, function (r) { return short(r.title) + "（" + dueWord(today, r.date) + "）"; }) + "。");
    }

    var tasks = Array.isArray(p.openTasks) ? p.openTasks : [];
    var dueTasks = tasks.filter(function (t) { return t && DATE.test(String(t.due_date || "")) && t.due_date <= today; });
    if (dueTasks.length) {
      var overdue = dueTasks.filter(function (t) { return t.due_date < today; }).length;
      lines.push("你的待辦有 " + dueTasks.length + " 件" + (overdue ? "（含 " + overdue + " 件已過期）" : "今天到期") + "：" +
        names(dueTasks, function (t) { return short(t.title); }) + "。");
    }

    var fresh = newToday(input.announcementItems, today, input.isVisible);
    if (fresh.total) {
      lines.push("今天新增 " + fresh.total + " 則公告" + (fresh.parts.length > 1 ? "：" + fresh.parts.slice(0, 4).join("、") : "") + "。");
    }

    var relevant = Array.isArray(p.relevantAnnouncements) ? p.relevantAnnouncements : [];
    if (relevant.length) lines.push("與你最相關：" + short(relevant[0].title) + "。");

    var tomorrow = addDays(today, 1);
    var tomorrowEvents = (Array.isArray(p.upcoming) ? p.upcoming : []).filter(function (row) { return row && row.date === tomorrow && !row.source; });
    if (tomorrowEvents.length) lines.push("明天：" + names(tomorrowEvents, function (e) { return short(e.title); }) + "。");

    if (lines.length === 1) lines.push("今天沒有已知需要特別注意的事項，祝你順利。");
    return { lines: lines, text: lines.join("") };
  }

  return { compose: compose, newToday: newToday, dateLabel: dateLabel };
});
