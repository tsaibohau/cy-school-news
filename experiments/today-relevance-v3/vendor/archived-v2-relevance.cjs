/* Explainable relevance engine; no ML, embeddings, or network calls. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsRelevance = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function clean(value) { return String(value == null ? "" : value).trim(); }
  function lower(value) { return clean(value).toLocaleLowerCase("zh-TW"); }
  function unique(values) { var seen = {}; return (values || []).filter(function (value) { var key = lower(value); if (!key || seen[key]) return false; seen[key] = true; return true; }); }
  function extractAudience(item) {
    item = item || {};
    var raw = [item.title, item.summary, item.snippet, item.body, item.audience_text].map(clean).filter(Boolean).join(" ");
    var grades = [];
    [[/(?:高一|一年級|高一新生)/g, 1], [/(?:高二|二年級)/g, 2], [/(?:高三|三年級)/g, 3]].forEach(function (entry) {
      if (entry[0].test(raw)) grades.push(entry[1]);
      entry[0].lastIndex = 0;
    });
    var allSchool = /全校/.test(raw);
    var classes = [];
    var single = /(?<!\d)(\d{3})\s*班/g, match;
    while ((match = single.exec(raw))) classes.push(match[1]);
    var range = /(?<!\d)(\d{3})\s*(?:-|–|—|至)\s*(\d{3})\s*班/g;
    while ((match = range.exec(raw))) {
      var start = Number(match[1]), end = Number(match[2]);
      if (end >= start && end - start <= 30) for (var n = start; n <= end; n += 1) classes.push(String(n));
    }
    return { grades: unique(grades), classes: unique(classes), all_school: allSchool };
  }
  function audienceFor(item) {
    var explicit = item && item.audience && typeof item.audience === "object" ? item.audience : {};
    var extracted = extractAudience(item);
    return {
      grades: unique((explicit.grades || []).concat(extracted.grades || [])).map(Number),
      classes: unique((explicit.classes || []).concat(extracted.classes || [])),
      all_school: !!(explicit.all_school || extracted.all_school),
    };
  }
  function reason(rule, sourceField, matchedValue, label) {
    return { rule: rule, source_field: sourceField, matched_value: matchedValue, label: label };
  }
  function calculate(item, profile, schoolRegistry) {
    item = item || {}; profile = profile || {};
    var audience = audienceFor(item), reasons = [], priority = 0;
    var school = clean(item.school || item.school_id), profileSchool = clean(profile.school_id);
    var schoolDef = schoolRegistry && schoolRegistry.find ? schoolRegistry.find(school) : null;
    var profileSchoolDef = schoolRegistry && schoolRegistry.find ? schoolRegistry.find(profileSchool) : null;
    var schoolMatch = !!school && !!profileSchool && school === profileSchool;
    var schoolMismatch = !!school && !!profileSchool && school !== profileSchool && !audience.all_school;
    if (schoolMatch) { priority += 120; reasons.push(reason("school_match", "school", school, profileSchoolDef ? profileSchoolDef.short : school)); }
    if (schoolMismatch) priority -= 160;
    var grade = Number(profile.grade_level);
    if (grade && audience.grades.indexOf(grade) >= 0) { priority += 100; reasons.push(reason("grade_explicit", "audience", "grade:" + grade, "高" + ["一", "二", "三"][grade - 1])); }
    var className = clean(profile.class_name);
    if (className && audience.classes.indexOf(className) >= 0) { priority += 110; reasons.push(reason("class_explicit", "audience", className, className + "班")); }
    var text = lower([item.title, item.summary, item.snippet, item.category].join(" "));
    unique(profile.tracked_keywords).forEach(function (keyword) { if (text.indexOf(lower(keyword)) >= 0) { priority += 50; reasons.push(reason("tracked_keyword", "text", keyword, keyword)); } });
    unique(profile.tracked_categories).forEach(function (category) { if (lower(item.category) === lower(category)) { priority += 30; reasons.push(reason("tracked_category", "category", category, category)); } });
    unique(profile.interests).forEach(function (interest) { if (text.indexOf(lower(interest)) >= 0) { priority += 20; reasons.push(reason("interest", "text", interest, interest)); } });
    var tier = priority >= 180 ? "strong" : priority > 0 ? "medium" : "none";
    return { tier: tier, priority: priority, reasons: reasons, audience: audience, school_mismatch: schoolMismatch };
  }
  // Today-only policy. Importance, audience, time, and availability stay
  // separate so a high-value announcement can still be excluded when stale.
  var TodayRankingPolicy = Object.freeze({
    version: "v2", frozenForBlindValidation: false, threshold: 45, maximumItems: 10,
    categoryImportance: Object.freeze({
      "段考考試": 28, "升學": 22, "獎助學金": 22, "招生編班": 20,
      "競賽": 18, "社團": 12, "研習活動": 10, "榮譽榜": 8,
      "行政公告": 8, "一般": 6
    }),
    ageDays: Object.freeze({ fresh: 7, recent: 30, useful: 90, stale: 180 }),
    weights: Object.freeze({ ageFresh: 18, ageRecent: 12, ageUseful: 4, ageStale: -10,
      ageOld: -20, unknownDate: -4, schoolMatch: 20, gradeMatch: 8,
      teacherRelated: -25, actionCue: 12, importance: 1 })
  });
  function dateValue(value) {
    var text = clean(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(Date.parse(text + "T00:00:00+08:00")) ? text : "";
  }
  function explicitDeadline(title) {
    var text = clean(title);
    if (!/(?:截止|期限|前繳|前報名|前申請|前確認|最後.*(?:報名|申請)|(?:申請|報名).{0,8}(?:至|止)|\d{1,2}[.\/]\s*\d{1,2}\s*前.{0,20}(?:申請|報名))/.test(text)) return "";
    var match = text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
    if (!match) {
      var roc = text.match(/(?:民國)?(1\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
      if (roc) match = [roc[0], String(Number(roc[1]) + 1911), roc[2], roc[3]];
    }
    if (!match) {
      var year = text.match(/(?:民國)?(1\d{2})(?:年|年度)|(?<!\d)(20\d{2})(?:年|年度)/);
      var shortDate = text.match(/(?<!\d)(\d{1,2})[.\/]\s*(\d{1,2})\s*前.{0,20}(?:申請|報名)/);
      if (year && shortDate) match = [shortDate[0], String(Number(year[1] || year[2]) + (year[1] ? 1911 : 0)), shortDate[1], shortDate[2]];
    }
    if (!match) return "";
    var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    var candidate = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    var time = Date.parse(candidate + "T00:00:00+08:00");
    return isFinite(time) && new Date(time).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }) === candidate ? candidate : "";
  }
  function explicitEventEnd(title) {
    var text = clean(title);
    if (!/(?:報名|申請|重補修)/.test(text)) return "";
    var yearMatch = text.match(/(?:民國)?(1\d{2})(?:年|年度)|(?<!\d)(20\d{2})(?:年|年度)/);
    if (!yearMatch) return "";
    var year = Number(yearMatch[1] || yearMatch[2]);
    if (year < 1911) year += 1911;
    var dates = [], match, range = /(?<!\d)(\d{1,2})\s*[./月]\s*(\d{1,2})\s*(?:日)?\s*(?:-|–|—|至|~|～)\s*(?:(\d{1,2})\s*[./月]\s*)?(\d{1,2})\s*日?/g;
    while ((match = range.exec(text))) {
      var month = Number(match[3] || match[1]), day = Number(match[4]);
      var value = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      var time = Date.parse(value + "T00:00:00+08:00");
      if (isFinite(time) && new Date(time).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }) === value) dates.push(value);
    }
    return dates.length ? dates[dates.length - 1] : "";
  }
  function todayScore(item, profile, today) {
    item = item || {}; profile = profile || {};
    today = dateValue(today) || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    var reasons = [], importance = Number(TodayRankingPolicy.categoryImportance[clean(item.category)] || 0);
    var audience = 0, temporal = 0, confidence = 1, eligible = true;
    var status = clean(item.lifecycle_status || "").toLowerCase();
    if (item.announcement_missing === true || ["missing", "archived", "tombstoned"].indexOf(status) >= 0) {
      eligible = false;
      reasons.push({ code: "announcement_unavailable", label: "公告已確認不可用", component: "eligibility" });
    }
    var school = clean(item.school || item.school_id), userSchool = clean(profile.school_id);
    var audienceData = audienceFor(item);
    if (school && userSchool && school !== userSchool && !audienceData.all_school) {
      eligible = false;
      reasons.push({ code: "school_mismatch", label: "學校不符", component: "audience" });
    } else if (school && userSchool && school === userSchool) {
      audience += TodayRankingPolicy.weights.schoolMatch;
      reasons.push({ code: "school_match", label: "符合學校", component: "audience" });
    }
    var grade = Number(profile.grade_level);
    if (grade && audienceData.grades.indexOf(grade) >= 0) {
      audience += TodayRankingPolicy.weights.gradeMatch;
      reasons.push({ code: "grade_match", label: "符合年級", component: "audience" });
    }
    if (item.teacher_related === true) {
      audience += TodayRankingPolicy.weights.teacherRelated;
      reasons.push({ code: "teacher_related", label: "主要與教師相關", component: "audience" });
    }
    var publication = dateValue(item.published_date || item.published_at || item.date || item.first_seen_date || item.first_seen);
    if (publication) {
      var age = Math.max(0, Math.floor((Date.parse(today + "T00:00:00+08:00") - Date.parse(publication + "T00:00:00+08:00")) / 86400000));
      if (age <= TodayRankingPolicy.ageDays.fresh) temporal += TodayRankingPolicy.weights.ageFresh;
      else if (age <= TodayRankingPolicy.ageDays.recent) temporal += TodayRankingPolicy.weights.ageRecent;
      else if (age <= TodayRankingPolicy.ageDays.useful) temporal += TodayRankingPolicy.weights.ageUseful;
      else if (age <= TodayRankingPolicy.ageDays.stale) temporal += TodayRankingPolicy.weights.ageStale;
      else temporal += TodayRankingPolicy.weights.ageOld;
      reasons.push({ code: "publication_age", label: "依公告日期調整時效", component: "temporal", days: age });
    } else {
      temporal += TodayRankingPolicy.weights.unknownDate;
      confidence = 0.65;
      reasons.push({ code: "date_unknown", label: "公告日期不明", component: "temporal" });
    }
    var text = lower(item.title || "");
    if (/截止|到期|最後.*(?:報名|申請)|停課|停班|考程異動|時程異動/.test(text)) {
      importance += TodayRankingPolicy.weights.actionCue;
      reasons.push({ code: "action_cue", label: "標題含時程或行動訊號", component: "importance" });
    }
    var deadline = item.deadline_verified === true ? dateValue(item.deadline_date) : explicitDeadline(item.title);
    var eventDate = item.event_date_verified === true ? dateValue(item.event_date) : explicitEventEnd(item.title);
    var validUntil = item.valid_until_verified === true ? dateValue(item.valid_until) : "";
    (Array.isArray(item.calendar_events) ? item.calendar_events : []).forEach(function (event) {
      if (!event || !dateValue(event.date)) return;
      if (event.kind === "deadline" &&
          ["announcement_deadline", "verified_announcement_deadline"].indexOf(event.provenance) >= 0) deadline = deadline || event.date;
      else if (event.kind !== "deadline" &&
          ["announcement_event", "official_school_calendar", "verified_announcement_event"].indexOf(event.provenance) >= 0) {
        eventDate = eventDate || event.date;
        validUntil = validUntil || dateValue(event.end_date);
      }
    });
    var targetDate = deadline || eventDate;
    if (targetDate) {
      var remaining = Math.floor((Date.parse(targetDate + "T00:00:00+08:00") - Date.parse(today + "T00:00:00+08:00")) / 86400000);
      if (remaining < 0 && !(validUntil && dateValue(validUntil) >= today)) {
        eligible = false;
        reasons.push({ code: deadline ? "deadline_passed" : "verified_date_passed", label: "時程日期已過", component: "eligibility" });
      } else if (remaining >= 0 && remaining <= 7) {
        temporal += remaining <= 3 ? 24 : 16;
        reasons.push({ code: "verified_date_soon", label: "已驗證日期將近", component: "temporal" });
      }
    }
    var total = importance * TodayRankingPolicy.weights.importance + audience + temporal;
    return { eligible: eligible, score: Math.max(0, Math.min(100, total)), threshold: TodayRankingPolicy.threshold,
      components: { importance: importance, audience: audience, temporal: temporal }, confidence: confidence, reasons: reasons };
  }
  function rankToday(items, profile, today) {
    return (Array.isArray(items) ? items : []).map(function (item) {
      return { item: item, result: todayScore(item, profile, today) };
    }).filter(function (row) { return row.result.eligible && row.result.score >= TodayRankingPolicy.threshold; })
      .sort(function (a, b) { return b.result.score - a.result.score ||
        String(a.item.id || a.item.announcement_id || "").localeCompare(String(b.item.id || b.item.announcement_id || "")); })
      .slice(0, TodayRankingPolicy.maximumItems);
  }
  function label(result) { return result.reasons.slice(0, 3).map(function (item) { return item.label; }).join("・"); }
  return { extractAudience: extractAudience, audienceFor: audienceFor, calculate: calculate, label: label,
    TodayRankingPolicy: TodayRankingPolicy, todayScore: todayScore, rankToday: rankToday };
});
