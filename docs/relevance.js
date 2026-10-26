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
  // Student-view rules derived from the 2026-10-26 manual review (嘉中高一, 30 items).
  var STAFF_ONLY = /教師|老師研習|同仁|教職員|人事|公務人力|人才庫|調查表|校長|主任會議|導師會議/;
  var STUDENT_WORDS = /學生|同學|高中生|學子|師生/;
  var OTHER_LEVEL = /國中|國小|幼兒園/;
  var SENIOR_ADMISSION = /特殊選才|招生簡章|學士班.*招生|甄選入學|個人申請|分科測驗|學測/;
  var STUDENT_ACTION = /報名|競賽|比賽|名單|成績|講座|徵件|營隊|校對|選課|檢定|英檢/;
  function notForMe(item, audience, profile) {
    var title = clean(item.title), grade = Number(profile.grade_level);
    if (grade && audience.grades.length && audience.grades.indexOf(grade) < 0 && !audience.all_school) return "other_grade";
    if (STAFF_ONLY.test(title) && !STUDENT_WORDS.test(title)) return "staff_only";
    if (OTHER_LEVEL.test(title)) return "other_school_level";
    if (grade && grade < 3 && (SENIOR_ADMISSION.test(title) || clean(item.category) === "升學")) return "senior_admission";
    return "";
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
    var excluded = notForMe(item, audience, profile);
    if (!excluded && STUDENT_ACTION.test(clean(item.title))) { priority += 40; reasons.push(reason("student_action", "title", "action", "可參加／需處理")); }
    var tier = priority >= 180 ? "strong" : priority > 0 ? "medium" : "none";
    return { tier: tier, priority: priority, reasons: reasons, audience: audience, school_mismatch: schoolMismatch, not_for_me: excluded };
  }
  function label(result) { return result.reasons.slice(0, 3).map(function (item) { return item.label; }).join("・"); }
  return { extractAudience: extractAudience, audienceFor: audienceFor, notForMe: notForMe, calculate: calculate, label: label };
});
