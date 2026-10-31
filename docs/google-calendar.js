/* 把要事加到使用者自己的行事曆。
   1. Google 日曆「新增活動」連結：開啟後內容已填好，使用者按「儲存」就寫進自己的 Google 日曆。
      不需要額外授權，本站也碰不到使用者的日曆。
   2. .ics 檔：一次把多件事匯入 Google、Apple 或 Outlook 日曆。
   都是整天的活動（截止日當天），時區為 Asia/Taipei。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsGoogleCalendar = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function day(value) { var d = String(value || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""; }
  function compactDay(d) { return d.replace(/-/g, ""); }
  function nextDay(d) {
    var t = new Date(Date.parse(d + "T00:00:00Z") + 86400000);
    return t.toISOString().slice(0, 10);
  }
  function safeUrl(value) { return /^https:\/\//.test(String(value || "")) ? String(value) : ""; }
  function clip(text, max) { text = String(text || "").replace(/\s+/g, " ").trim(); return text.length > max ? text.slice(0, max - 1) + "…" : text; }

  /* event: { title, date, endDate?, details?, url? } → Google Calendar link, or "" without a date. */
  function eventUrl(event) {
    var start = day(event && event.date);
    if (!start || !event.title) return "";
    var end = day(event.endDate) && day(event.endDate) >= start ? day(event.endDate) : start;
    var details = [clip(event.details, 600), safeUrl(event.url) ? "官方原文：" + safeUrl(event.url) : "", "（由校訊加入）"].filter(Boolean).join("\n");
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(clip(event.title, 120)) +
      "&dates=" + compactDay(start) + "/" + compactDay(nextDay(end)) +
      "&details=" + encodeURIComponent(details) +
      "&ctz=Asia%2FTaipei";
  }

  function escapeText(text) { return String(text || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  /* RFC 5545: lines longer than 75 octets continue on the next line after a space. */
  function fold(line) {
    var out = "", count = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], size = unescape(encodeURIComponent(ch)).length;
      if (count + size > 74) { out += "\r\n "; count = 1; }
      out += ch; count += size;
    }
    return out;
  }
  function uidPart(value) { return String(value || "").replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 80) || "item"; }
  /* events: [{ id, title, date, endDate?, details?, url? }] → .ics text (events without a date are skipped). */
  function ics(events, options) {
    var stamp = (options && options.now ? new Date(options.now) : new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//cy-school-news//校訊//ZH-TW", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:校訊要事", "X-WR-TIMEZONE:Asia/Taipei"];
    (events || []).forEach(function (event) {
      var start = day(event && event.date);
      if (!start || !event.title) return;
      var end = day(event.endDate) && day(event.endDate) >= start ? day(event.endDate) : start;
      lines.push("BEGIN:VEVENT",
        "UID:" + uidPart(event.id) + "-" + compactDay(start) + "@cy-school-news",
        "DTSTAMP:" + stamp,
        "DTSTART;VALUE=DATE:" + compactDay(start),
        "DTEND;VALUE=DATE:" + compactDay(nextDay(end)),
        "SUMMARY:" + escapeText(clip(event.title, 120)));
      var details = [clip(event.details, 600), safeUrl(event.url) ? "官方原文：" + safeUrl(event.url) : ""].filter(Boolean).join("\n");
      if (details) lines.push("DESCRIPTION:" + escapeText(details));
      if (safeUrl(event.url)) lines.push("URL:" + safeUrl(event.url));
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  return { eventUrl: eventUrl, ics: ics };
});
