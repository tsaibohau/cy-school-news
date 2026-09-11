(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsAnnouncementCleanup = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var RULE_VERSION = 1;
  var POLICY_WORDS = /校規|學生手冊|請假規定|行政辦法|自治規章|實施要點|長期有效|常設服務|服務說明|法規|規定/;
  var EVENT_WORDS = /比賽|競賽|講座|營隊|研習|說明會|工作坊|參訪|演講|活動|測驗|考試|補考|會議/;
  var CONTINUING_WORDS = /長期|常設|持續|即日起|全年|不限期|辦法|規定|要點|服務/;
  var REVISION_WORDS = /修正版|更新版|更正版|更正公告|第二次修正|第[二三四五六七八九十\d]+次修正|最新版|更新|修正/;

  function pad(value) { return String(value).padStart(2, "0"); }
  function isoDate(year, month, day) {
    var date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return year + "-" + pad(month) + "-" + pad(day);
  }
  function datesIn(text) {
    var rows = [], seen = {};
    String(text || "").replace(/(?<!\d)(20\d{2}|1\d{2})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})\s*日?/g, function (all, rawYear, month, day, offset) {
      var year = Number(rawYear); if (year < 1911) year += 1911;
      var value = isoDate(year, Number(month), Number(day));
      if (value && !seen[value]) { seen[value] = true; rows.push({ value: value, offset: offset, raw: all }); }
      return all;
    });
    String(text || "").replace(/(?:同年|至|到|~|～)\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g, function (all, month, day, offset) {
      var prior = rows.filter(function (row) { return row.offset < offset; }).sort(function (a, b) { return b.offset - a.offset; })[0];
      if (!prior) return all;
      var value = isoDate(Number(prior.value.slice(0, 4)), Number(month), Number(day));
      if (value && !seen[value]) { seen[value] = true; rows.push({ value: value, offset: offset, raw: all }); }
      return all;
    });
    return rows;
  }
  function contextAround(text, date) {
    text = String(text || "");
    return text.slice(Math.max(0, date.offset - 28), Math.min(text.length, date.offset + date.raw.length + 28));
  }
  function isDeadlineDate(text, date) {
    text = String(text || "");
    var before = text.slice(Math.max(0, date.offset - 28), date.offset);
    var after = text.slice(date.offset + date.raw.length, date.offset + date.raw.length + 10);
    return /(?:止|前|截止)/.test(after) || /(?:截止|期限|報名至|申請至|繳件至|收件至|徵件至|投稿至|延長至)\s*$/.test(before);
  }
  function sourceHash(item) {
    var value = [item.id, item.title, item.date, item.category, item.source_category, item.summary, item.snippet, item.detail_revision]
      .map(function (part) { return String(part || ""); }).join("\u001f");
    var hash = 2166136261;
    for (var i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return "cleanup-v1-" + (hash >>> 0).toString(16).padStart(8, "0");
  }
  function normalizeBaseTitle(value) {
    return String(value || "").toLowerCase()
      .replace(REVISION_WORDS, "").replace(/[（(][^）)]*(?:修正|更新|更正)[^）)]*[）)]/g, "")
      .replace(/[\s\-—_：:、，,。．()（）\[\]【】]/g, "");
  }
  function termEnd(text) {
    var match = String(text || "").match(/(?<!\d)(1\d{2}|20\d{2})\s*(?:學年度|學年)(?:\s*[-第]?\s*([12一二])\s*(?:學期)?)?/);
    if (!match) return null;
    var startYear = Number(match[1]); if (startYear < 1911) startYear += 1911;
    var semester = match[2] === "1" || match[2] === "一" ? 1 : match[2] === "2" || match[2] === "二" ? 2 : 0;
    return { value: semester === 1 ? isoDate(startYear + 1, 2, 1) : isoDate(startYear + 1, 8, 1), label: match[0] };
  }
  function candidate(item, reason, confidence, relatedDate, detail) {
    return { announcement_id: String(item.id), item: item, reason: reason, confidence: confidence,
      related_date: relatedDate || "", detail: detail || "", source_hash: sourceHash(item), rule_version: RULE_VERSION };
  }
  function scan(items, decisions, options) {
    items = Array.isArray(items) ? items.filter(function (row) { return row && row.id; }) : [];
    decisions = Array.isArray(decisions) ? decisions : [];
    options = options || {};
    var today = String(options.today || new Date().toISOString().slice(0, 10));
    var current = {};
    decisions.forEach(function (row) { if (row && row.announcement_id) current[row.announcement_id] = row; });
    var deleted = {};
    decisions.forEach(function (row) { if (row && row.action === "delete") deleted[row.announcement_id] = true; });
    var active = items.filter(function (item) { return !deleted[item.id]; });
    var newerByBase = {};
    active.forEach(function (item) {
      if (!REVISION_WORDS.test(String(item.title || ""))) return;
      var key = String(item.school || "") + "\u001f" + normalizeBaseTitle(item.title);
      var prior = newerByBase[key];
      if (!prior || String(item.date || item.first_seen || "") > String(prior.date || prior.first_seen || "")) newerByBase[key] = item;
    });
    var results = [];
    active.forEach(function (item) {
      var title = String(item.title || ""), text = [title, item.summary, item.snippet].join(" ");
      var hash = sourceHash(item), previous = current[item.id];
      if (previous && previous.action === "keep" && previous.source_hash === hash && Number(previous.rule_version || 0) === RULE_VERSION) return;
      var parsedDates = datesIn(text), deadlineDates = [], eventDates = [];
      parsedDates.forEach(function (date) {
        var context = contextAround(text, date);
        if (isDeadlineDate(text, date)) deadlineDates.push(date);
        if (EVENT_WORDS.test(context) && !/(?:版|更新|修正)\s*$/.test(contextAround(text, date).slice(0, 32))) eventDates.push(date);
      });
      deadlineDates.sort(function (a, b) { return b.value.localeCompare(a.value); });
      eventDates.sort(function (a, b) { return b.value.localeCompare(a.value); });
      var deadline = deadlineDates[0], eventDate = eventDates[0];
      if (deadline && deadline.value < today) {
        results.push(candidate(item, "deadline_passed", "high", deadline.value, "明確截止日期已過")); return;
      }
      if (eventDate && eventDate.value < today && EVENT_WORDS.test(text) && !CONTINUING_WORDS.test(text)) {
        results.push(candidate(item, "event_ended", "medium", eventDate.value, "單次活動日期已過")); return;
      }
      var term = termEnd(text);
      if (term && term.value < today && !POLICY_WORDS.test(text)) {
        results.push(candidate(item, "term_ended", "medium", term.value, term.label + " 已結束")); return;
      }
      var key = String(item.school || "") + "\u001f" + normalizeBaseTitle(title), newer = newerByBase[key];
      if (newer && newer.id !== item.id && String(newer.date || newer.first_seen || "") >= String(item.date || item.first_seen || "")) {
        results.push(candidate(item, "replaced", "low", String(newer.date || ""), "可能由「" + String(newer.title || "") + "」取代"));
      }
    });
    return results.sort(function (a, b) {
      var rank = { high: 0, medium: 1, low: 2 };
      return rank[a.confidence] - rank[b.confidence] || String(b.related_date).localeCompare(String(a.related_date));
    });
  }
  return { RULE_VERSION: RULE_VERSION, scan: scan, datesIn: datesIn, sourceHash: sourceHash, normalizeBaseTitle: normalizeBaseTitle };
});
