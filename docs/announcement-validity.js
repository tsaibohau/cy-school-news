/* Conservative announcement validity layer for current school-affairs answers. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsAnnouncementValidity = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var CURRENT_WORDS = /現在|目前|今天|今日|明天|最新|最近|快截止|還能|仍能|還有|是否|可以|能不能|會不會|需不需要|已經/;
  var REGULATION_WORDS = /法規|規則|規定|要點|準則|規範|辦法|注意事項/;
  var AMENDMENT_WORDS = /修正|修訂|部分條文|發布令|停止適用|廢止/;
  var EVENT_WORDS = /年度|學年度|第\s*[一二三四五六七八九十0-9]+\s*(?:屆|次)|競賽|比賽|活動|研習|營隊|招生|報名|申請|推薦|繳費|健檢|施工|停電|補考|註冊/;
  var ACTION_EVENT_WORDS = /第\s*[一二三四五六七八九十0-9]+\s*(?:屆|次)|競賽|比賽|活動|研習|營隊|招生|報名|申請|推薦|繳費|健檢|施工|停電|補考|註冊/;
  var DEADLINE_WORDS = /截止|期限|收件|送件|報名|申請|推薦|繳費|繳交|反映|前完成|止/;
  var PROCEDURE_WORDS = /流程|方式|步驟|操作|入口|網站|帳號|驗證|應備文件|注意事項|保存|辦理方式/;
  var EMERGENCY_WORDS = /緊急|突發|臨時(?:停課|取消|調整)|因應(?:颱風|豪雨|地震).*?(?:停課|取消|延期)/;
  var PLANNED_WORDS = /施工|歲修|預定|計畫性|提前公告/;
  var UNTIL_NOTICE_WORDS = /另行通知|另行公告|直到恢復|暫停.*?至.*?通知|即日起.*?另行/;
  var MONEY_OR_CREDENTIALS = /新臺幣|\d[\d,]*\s*元|費用|金額|學校代碼|驗證碼|繳款帳號/;

  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function dateKey(year, month, day) {
    if (year >= 100 && year < 200) year += 1911;
    if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return "";
    var date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }
  function taipeiToday() {
    try { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }); }
    catch (_) { return new Date().toISOString().slice(0, 10); }
  }
  function validIso(value) { return /^20\d\d-\d\d-\d\d$/.test(String(value || "")) ? String(value) : ""; }
  function contextKind(context) {
    if (/發布日期|發佈日期|公告日期|最後更新|發文日期/.test(context)) return "publication";
    if (DEADLINE_WORDS.test(context)) return "deadline";
    if (/生效|施行|開始|開學|復課|啟用/.test(context)) return "effective";
    if (/舉行|辦理|時間|停電|停課|健檢|報到|比賽|活動|上課|發表/.test(context)) return "event";
    return "mentioned";
  }
  function pushMention(out, seen, text, start, end, iso) {
    if (!iso || seen[start + ":" + end]) return;
    seen[start + ":" + end] = true;
    var context = clean(text.slice(Math.max(0, start - 28), Math.min(text.length, end + 28)));
    out.push({ date: iso, kind: contextKind(context), context: context });
  }
  function dateMentions(value, baseDate) {
    var text = clean(value), out = [], seen = {}, match;
    var baseYear = Number((validIso(baseDate) || taipeiToday()).slice(0, 4));
    var full = /((?:20)?\d{2,4}|1\d{2})\s*(?:年|[\/.-])\s*(\d{1,2})\s*(?:月|[\/.-])\s*(\d{1,2})\s*日?/g;
    while ((match = full.exec(text))) pushMention(out, seen, text, match.index, full.lastIndex,
      dateKey(Number(match[1]), Number(match[2]), Number(match[3])));
    var shortDate = /(^|[^\d年\/.-])(\d{1,2})\s*(?:月|\/)\s*(\d{1,2})\s*日?/g;
    while ((match = shortDate.exec(text))) {
      var start = match.index + match[1].length;
      pushMention(out, seen, text, start, shortDate.lastIndex, dateKey(baseYear, Number(match[2]), Number(match[3])));
    }
    return out.sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  function detailText(record) {
    if (!record || record.provenance !== "official_article") return "";
    var parts = [];
    (record.blocks || []).forEach(function (block) {
      if (block && block.text) parts.push(block.text);
      (block && block.items || []).forEach(function (item) { parts.push(item); });
      (block && block.rows || []).forEach(function (row) { parts.push((row || []).join(" ")); });
    });
    (record.attachments || []).forEach(function (file) {
      if (file && file.parse_status === "parsed" && file.embedded_text) parts.push(file.embedded_text);
    });
    return clean(parts.join(" ")).slice(0, 120000);
  }
  function damagedText(value) {
    var text = clean(value);
    if (!text) return false;
    var hits = text.match(/(?:пј|гҖ|еҚ|иӘ|жң|дё|з”|й|Ӣ)/g) || [];
    return hits.length >= 5;
  }
  function attachmentState(detail) {
    var files = detail && Array.isArray(detail.attachments) ? detail.attachments : [];
    if (!files.length) return "none";
    if (files.some(function (file) { return file && file.parse_status === "parsed" && clean(file.embedded_text); })) return "readable";
    return "unread";
  }
  function inferredType(title, text) {
    var combined = clean(title + " " + text), hasRegulation = REGULATION_WORDS.test(title), hasEvent = EVENT_WORDS.test(combined), titleHasEvent = ACTION_EVENT_WORDS.test(title);
    if (EMERGENCY_WORDS.test(combined) && !PLANNED_WORDS.test(combined)) return "EMERGENCY";
    if (AMENDMENT_WORDS.test(combined)) return hasRegulation && !titleHasEvent ? "REGULATION_AMENDMENT" : "DEADLINE_MODIFICATION";
    if (hasRegulation && hasEvent && PROCEDURE_WORDS.test(combined)) return "MIXED";
    if (hasRegulation && !ACTION_EVENT_WORDS.test(combined)) return "REGULATION_STANDING";
    if (hasEvent || DEADLINE_WORDS.test(combined)) return PROCEDURE_WORDS.test(combined) ? "MIXED" : "DEADLINE";
    return "GENERAL_INFORMATION";
  }
  function explicitAnnotation(item, detail) {
    var value = item && item.validity || detail && detail.validity;
    return value && typeof value === "object" ? value : null;
  }
  function academicYearScope(value) {
    var match = clean(value).match(/(?:民國\s*)?(\d{2,4})\s*學年(?:度)?/);
    if (!match) return null;
    var year = Number(match[1]);
    if (year >= 1911) year -= 1911;
    if (year < 90 || year > 200) return null;
    return { year: year, starts: dateKey(year + 1911, 8, 1), ends: dateKey(year + 1912, 7, 31) };
  }
  function analyze(item, detail, options) {
    item = item || {}; options = options || {};
    var asOf = validIso(options.asOf) || taipeiToday();
    var body = detailText(detail), metadata = clean([item.title, item.summary, item.snippet].filter(Boolean).join(" "));
    var sourceText = clean(metadata + " " + body), title = clean(item.title), annotation = explicitAnnotation(item, detail);
    if (annotation) {
      var annotated = Object.assign({ source: "annotation", warnings: [], as_of: asOf }, annotation);
      if (!annotated.answer_policy) {
        annotated.answer_policy = annotated.status === "EXPIRED" ? "exclude" :
          (annotated.status === "UNCONFIRMED" || annotated.status === "PARTIAL_ACTIVE" ? "warn" : "allow");
      }
      if (!Array.isArray(annotated.warnings)) annotated.warnings = [];
      return annotated;
    }
    var type = inferredType(title, sourceText), mentions = dateMentions(sourceText, item.date || asOf), schoolYear = academicYearScope(sourceText);
    var deadlines = mentions.filter(function (row) { return row.kind === "deadline"; });
    var events = mentions.filter(function (row) { return row.kind === "event" || row.kind === "effective"; });
    var latestDeadline = deadlines.length ? deadlines[deadlines.length - 1].date : "";
    var latestEvent = events.length ? events[events.length - 1].date : "";
    var evidenceDamaged = damagedText(metadata) || damagedText(body), attachments = attachmentState(detail), warnings = [];
    if (evidenceDamaged) warnings.push("公告正文疑似編碼損壞，日期與資格必須重新抓取後確認。");
    if (item.detail_ref && !detail) warnings.push("公告正文或附件尚未成功讀取。");
    if (attachments === "unread") warnings.push("附件尚未取得可讀文字，資格與細節未完全確認。");
    if (!validIso(item.date) && !latestDeadline && !latestEvent) warnings.push("公告發布日期缺失，效力時間未完全確認。");
    if (UNTIL_NOTICE_WORDS.test(sourceText)) warnings.push("公告寫明另行通知，但尚未確認是否已有後續公告。");
    var status = "UNCONFIRMED", policy = warnings.length ? "warn" : "allow", staleSensitive = false;
    if (type === "REGULATION_STANDING" || type === "REGULATION_AMENDMENT") {
      status = warnings.length ? "UNCONFIRMED" : "ACTIVE";
    } else if (schoolYear && schoolYear.ends < asOf && !latestDeadline && !latestEvent) {
      status = "EXPIRED"; policy = "exclude"; staleSensitive = true;
    } else if (latestDeadline) {
      if (latestDeadline < asOf) {
        staleSensitive = true;
        if (type === "MIXED") { status = "PARTIAL_ACTIVE"; policy = "warn"; warnings.push("期限片段已過期；只能引用未綁定舊期限的內容並標示未確認。"); }
        else { status = "EXPIRED"; policy = "exclude"; }
      } else status = "ACTIVE_WINDOW";
    } else if (latestEvent) {
      if (latestEvent < asOf && (type === "DEADLINE" || type === "DEADLINE_MODIFICATION" || type === "EMERGENCY")) {
        status = "EXPIRED"; policy = "exclude";
      } else if (latestEvent > asOf) status = "FUTURE";
      else status = warnings.length ? "UNCONFIRMED" : "ACTIVE";
    } else if (UNTIL_NOTICE_WORDS.test(sourceText)) { status = "UNCONFIRMED"; policy = "warn"; }
    else if (type === "GENERAL_INFORMATION" || type === "MIXED") { status = "UNCONFIRMED"; policy = "warn"; }
    return { source: "inferred", as_of: asOf, document_type: type, status: status, answer_policy: policy,
      warnings: warnings, dates: mentions, latest_deadline: latestDeadline || null, latest_event: latestEvent || null,
      academic_year: schoolYear, evidence_level: body ? (attachments === "readable" ? "E2" : "E1") : "E0", stale_sensitive: staleSensitive };
  }
  function requiresCurrentStatus(query) { return CURRENT_WORDS.test(clean(query)); }
  function requiresOpenWindow(query) {
    var text = clean(query);
    return /申請|報名|繳費|推薦|送件|繳交/.test(text) && /現在|目前|今天|還能|仍能|可以|可否|能否|有哪些|快截止/.test(text) && !/如何|怎麼|方式|流程/.test(text);
  }
  function sentencePolicy(sentence, analysis, query) {
    if (!requiresCurrentStatus(query)) return "allow";
    analysis = analysis || {};
    var mentions = dateMentions(sentence, analysis.as_of), expiredDeadline = mentions.some(function (row) { return row.kind === "deadline" && row.date < analysis.as_of; });
    if (expiredDeadline) return "exclude";
    if (analysis.status === "EXPIRED") return "exclude";
    if (analysis.stale_sensitive && MONEY_OR_CREDENTIALS.test(sentence)) return "exclude";
    return analysis.answer_policy === "warn" ? "warn" : "allow";
  }
  function label(analysis) {
    var labels = { ACTIVE: "目前有效", ACTIVE_WINDOW: "期限內", FUTURE: "尚未生效／事件未開始", EXPIRED: "本次已過期",
      PARTIAL_ACTIVE: "部分有效", UNCONFIRMED: "效力未確認", EVIDENCE_DAMAGED: "證據損壞" };
    return labels[analysis && analysis.status] || "效力未確認";
  }
  return { analyze: analyze, dateMentions: dateMentions, detailText: detailText, damagedText: damagedText, academicYearScope: academicYearScope,
    requiresCurrentStatus: requiresCurrentStatus, requiresOpenWindow: requiresOpenWindow, sentencePolicy: sentencePolicy, label: label };
});
