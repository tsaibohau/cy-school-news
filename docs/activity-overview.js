/* 活動總覽：所有學校公告裡還能報名的活動，不分學校，依類別與報名截止日排序。
   同一項活動被好幾間學校轉知時只列一次（用跨校比對的分組），並標出有哪些學校公告。
   只用公開的標題、日期、分類與截止日；不呼叫外部服務。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsActivityOverview = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var CATEGORIES = [
    { id: "contest", label: "競賽・徵件" },
    { id: "camp", label: "營隊・研習・講座" },
    { id: "admission", label: "升學・招生" },
    { id: "scholarship", label: "獎助學金" },
    { id: "other", label: "其他活動" }
  ];
  var UNDATED_DAYS = 30;          // without a known deadline, only recent notices count as still open
  var DATED_MAX_AGE_DAYS = 150;   // a deadline far after an old notice is usually a different year's date

  /* Categories that are never 「可報名活動」 for students across schools. */
  var SKIP_CATEGORY = { "教職員": true, "段考考試": true, "選課": true, "榮譽榜": true, "生活學務": true, "行政公告": true, "社團": true, "招生編班": true };
  var ACTIVITY_WORD = /報名|徵稿|徵選|甄選|徵件|徵求|招募|營隊|[^經]營[」』，,\s]|營$|營活動|競賽|比賽|大賽|挑戰賽|錦標賽|盃|研習|講座|工作坊|說明會|體驗|參訪|論壇|展演|音樂會|申請|招生|特殊選才|獎學金|助學金|補助|培訓|認證考試|檢定/;
  /* Results, reminders and forms are not activities to sign up for. */
  var NOT_OPEN = /提醒|繳交|切結書|注意事項|重申|得獎|獲獎|成績|名單|榜單|錄取|賀[！!：:]|恭賀|恭喜|成果發表|成果展|頒獎|結果|延期|取消|停辦|菜單|月票|失物|遺失物|彙編|指引|手冊|告知事項|宣導/;
  /* Notices for teachers or schools, not students. */
  var TEACHER_ONLY = /教師|老師|教職|師長|導師|校長|主任|組長|教材教法|教案|教學|課程實作|特色課程|教學平臺|學校補助|補助學術|研究機關|業者|調查案|會議資料|領隊會議|競賽規程|修審|績優|表揚|說明影片|工作計畫/;
  /* One school's own events (校慶、本校、班際…): not something other schools' students sign up for. */
  var OWN_SCHOOL = /本校|校內|班際|全校|校園|校慶|週年|運動會|高[一二三]\s*(?:英文|國文|數學|作文)|學季|加強班|English Corner|社團(?!法人)|家長同意書/i;
  var STUDENT_WORD = /學生|同學|高中生|高中職生|師生|青少年|青年|應屆/;

  function day(value) { var d = String(value || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""; }
  function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }
  function clean(text) { return String(text || "").replace(/\s+/g, " ").trim(); }

  /* The title decides first (schools file the same activity under different categories);
     the school's own category only when the title says nothing. */
  function categoryOf(item) {
    var title = clean(item && item.title), category = item && item.category;
    if (/獎學金|助學金|奬助學金|補助|物資贊助/.test(title)) return "scholarship";
    if (/營(?![業運養])|營隊|研習|講座|工作坊|論壇|研討會|體驗|參訪|課程/.test(title) && !/競賽|比賽|大賽/.test(title)) return "camp";
    if (/競賽|比賽|大賽|挑戰|錦標賽|盃|徵稿|徵選|徵件|徵文|徵圖|甄選|聯賽|奧林匹亞/.test(title)) return "contest";
    if (/招生|特殊選才|甄試|入學|升學|校系|學系|說明會/.test(title)) return "admission";
    if (category === "獎助學金") return "scholarship";
    if (category === "升學") return "admission";
    if (category === "競賽") return "contest";
    if (category === "研習活動") return "camp";
    return "other";
  }
  function isActivity(item) {
    if (!item || !item.title || SKIP_CATEGORY[item.category]) return false;
    var title = clean(item.title);
    if (NOT_OPEN.test(title) || OWN_SCHOOL.test(title)) return false;
    if (TEACHER_ONLY.test(title) && !STUDENT_WORD.test(title)) return false;
    if (item.category === "一般" || !item.category) return ACTIVITY_WORD.test(title);
    return true;
  }
  function deadlineOf(item, titleDeadline) {
    var dates = (item.calendar_events || []).filter(function (ev) { return ev && (ev.kind === "deadline" || ev.kind === "registration") && day(ev.date); }).map(function (ev) { return day(ev.date); });
    if (!dates.length && typeof titleDeadline === "function") { try { var t = day(titleDeadline(item)); if (t) dates.push(t); } catch (_) {} }
    return dates.sort()[0] || "";
  }
  function stripTags(title) {
    var stripped = clean(String(title || "").replace(/^\s*(?:[【\[][^】\]]{1,12}[】\]]\s*)+/, "")
      .replace(/^(?:轉知|轉發|函轉|檢送|公告|學生訊息|活動訊息|校外訊息|最新消息)\s*[-－:：_~、]?\s*/, ""));
    return stripped || clean(String(title || "").replace(/[【】\[\]]/g, ""));
  }

  /* items: announcements from every school. groups: CyNewsCrossSchool.build(items) (optional).
     Returns entries sorted by category, then deadline (soonest first), then undated ones (newest first). */
  function build(items, options) {
    options = options || {};
    var today = day(options.today) || new Date().toISOString().slice(0, 10);
    var groupOf = {};
    (options.groups || []).forEach(function (group) { (group.announcement_ids || []).forEach(function (id) { groupOf[id] = group; }); });
    /* A cross-school group counts when any school's notice reads as an activity; then every
       school's notice joins it (one school may title it just 「元智大學 2026 AI妙用大挑戰」). */
    var openGroup = {};
    (items || []).forEach(function (item) { var group = item && groupOf[item.id]; if (group && isActivity(item)) openGroup[group.id] = true; });
    var byKey = {};
    (items || []).forEach(function (item) {
      if (!item || !item.id) return;
      var inGroup = groupOf[item.id];
      if (inGroup ? !openGroup[inGroup.id] : !isActivity(item)) return;
      var posted = day(item.date || item.first_seen);
      if (!posted || posted > today) return;
      var group = groupOf[item.id], key = group ? group.id : "i-" + item.id;
      var entry = byKey[key];
      if (!entry) {
        entry = byKey[key] = { key: key, name: group ? group.name : stripTags(item.title), organizer: group ? group.organizer : "", category: categoryOf(item),
          deadline: "", first_date: posted, last_date: posted, schools: [], items: [] };
      }
      entry.items.push(item);
      if (posted < entry.first_date) entry.first_date = posted;
      if (posted > entry.last_date) entry.last_date = posted;
      var d = deadlineOf(item, options.titleDeadline);
      if (d && d >= posted && (!entry.deadline || d < entry.deadline)) entry.deadline = d;
    });
    var out = [];
    Object.keys(byKey).forEach(function (key) {
      var entry = byKey[key];
      if (entry.items.length > 1) {
        /* The category most of the schools filed it under. */
        var votes = {};
        entry.items.forEach(function (item) { var c = categoryOf(item); votes[c] = (votes[c] || 0) + 1; });
        entry.category = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a] || order(a) - order(b); })[0];
      }
      /* A cross-school group's deadline is the one most schools agree on. */
      var group = groupOf[entry.items[0].id];
      if (group && group.deadline) entry.deadline = group.deadline;
      if (entry.deadline) {
        if (entry.deadline < today) return;                                   // closed
        if (daysBetween(entry.last_date, entry.deadline) > DATED_MAX_AGE_DAYS) entry.deadline = "";
      }
      if (!entry.deadline && daysBetween(entry.last_date, today) > UNDATED_DAYS) return;
      var seen = {};
      entry.items.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.first_seen || "").localeCompare(String(b.first_seen || "")); });
      entry.schools = entry.items.filter(function (item) { if (seen[item.school]) return false; seen[item.school] = true; return true; })
        .map(function (item) { return { school: item.school, school_name: item.school_name || item.school, date: day(item.date || item.first_seen), id: item.id, title: item.title, url: item.url || "" }; });
      entry.days_left = entry.deadline ? daysBetween(today, entry.deadline) : null;
      entry.id = entry.schools[0].id;
      delete entry.items;
      out.push(entry);
    });
    return sort(mergeSameName(out, options.normalize), options.mode || "category");
  }
  /* Two entries with the same name (a group plus a school that worded it the same way) become one. */
  function mergeSameName(entries, normalize) {
    var norm = typeof normalize === "function" ? normalize : function (t) { return String(t).replace(/[\s「」『』【】()（）:：,，.。、\-－_~]/g, ""); };
    var byName = {}, out = [];
    entries.forEach(function (entry) {
      var key = norm(entry.name);
      var same = key && byName[key];
      if (!same) { if (key) byName[key] = entry; out.push(entry); return; }
      entry.schools.forEach(function (s) { if (!same.schools.some(function (t) { return t.school === s.school; })) same.schools.push(s); });
      same.schools.sort(function (a, b) { return a.date.localeCompare(b.date); });
      if (entry.deadline && (!same.deadline || entry.deadline < same.deadline)) { same.deadline = entry.deadline; same.days_left = entry.days_left; }
      if (entry.last_date > same.last_date) same.last_date = entry.last_date;
      if (entry.first_date < same.first_date) same.first_date = entry.first_date;
      if (!same.organizer) same.organizer = entry.organizer;
      same.id = same.schools[0].id;
    });
    return out;
  }
  function order(id) { for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return i; return CATEGORIES.length; }
  function byDeadline(a, b) {
    if (!!a.deadline !== !!b.deadline) return a.deadline ? -1 : 1;           // dated first
    if (a.deadline) return a.deadline.localeCompare(b.deadline) || b.schools.length - a.schools.length;
    return b.last_date.localeCompare(a.last_date) || b.schools.length - a.schools.length;
  }
  /* mode "category": by category, then deadline. mode "deadline": deadline only. */
  function sort(entries, mode) {
    return (entries || []).slice().sort(function (a, b) {
      if (mode !== "deadline") { var c = order(a.category) - order(b.category); if (c) return c; }
      return byDeadline(a, b);
    });
  }
  function label(id) { for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i].label; return "其他活動"; }
  /* 「11/6 截止・剩 5 天」「今天截止」「截止日請看公告」 */
  function deadlineLabel(entry) {
    if (!entry.deadline) return "截止日請看公告";
    var md = Number(entry.deadline.slice(5, 7)) + "/" + Number(entry.deadline.slice(8, 10));
    return entry.days_left === 0 ? "今天截止" : md + " 截止・剩 " + entry.days_left + " 天";
  }

  return { CATEGORIES: CATEGORIES.slice(), build: build, sort: sort, label: label, deadlineLabel: deadlineLabel, categoryOf: categoryOf, isActivity: isActivity };
});
