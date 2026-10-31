/* 公告總庫排序：最新在前、最早在前、依處室、依急迫性。
   處室：學校網站上的公告分類（輔導室、衛生組…）→ 標題開頭的【處室】→ 公告主題推測。
   急迫性：已驗證的截止日（calendar_events）或標題寫的截止日，越快到期越前面；已過期的排最後。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsAnnouncementSort = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var MODES = [
    { id: "newest", label: "最新在前" },
    { id: "oldest", label: "最早在前" },
    { id: "office", label: "依處室" },
    { id: "urgent", label: "依急迫性" }
  ];
  /* Offices in the order they are listed; 組 belong to their 處. */
  var OFFICES = [
    ["教務處", /教務|註冊組|教學組|試務|設備組|課務|實研組|選課/],
    ["學務處", /學務|訓育|生輔|生教|衛生組|體育組|課外活動|教官|軍訓|生活輔導|社團/],
    ["輔導室", /輔導|升學|生涯|特教|資源班|諮商|學習歷程/],
    ["總務處", /總務|事務組|出納|文書組|營繕|採購|招標/],
    ["圖書館", /圖書|閱讀/],
    ["實習處", /實習|實輔|就業|技藝/],
    ["人事室", /人事|教師研習|教職員/],
    ["主計室", /主計|會計/],
    ["資訊組", /資訊|資安|網路/],
    ["校長室", /校長|秘書|重大訊息/]
  ];
  /* Topic category → the office that usually handles it (used last). */
  var CATEGORY_OFFICE = {
    "段考考試": "教務處", "選課": "教務處", "招生編班": "教務處",
    "生活學務": "學務處", "社團": "學務處", "競賽": "學務處", "獎助學金": "學務處", "榮譽榜": "學務處",
    "升學": "輔導室", "教職員": "人事室"
  };
  /* Title words, used when the school gave no office (education-bureau forwards, 「最新消息」). */
  var TITLE_HINTS = [
    ["教務處", /段考|補考|重補修|成績|課程|選修|學測|統測|分科|英聽|考試|課表|轉學|學籍|註冊|教科書/],
    ["輔導室", /大學|科大|招生|甄選|特殊選才|升學|博覽會|學系|科系|生涯|心理|性平|性別平等/],
    ["學務處", /獎學金|助學金|助學|競賽|比賽|徵文|徵稿|營隊|志工|服務學習|反毒|交通安全|防制|宣導|健康|疫苗|健檢|午餐|社團|校外教學|運動會|體育|藝文/],
    ["總務處", /工程|修繕|停水|停電|標案|場地|車位|停車/],
    ["人事室", /教師|教職員|退休|甄選教師|代理|研習時數/]
  ];
  var OTHER = "其他（未標示處室）";

  function match(text) {
    text = String(text || "");
    for (var i = 0; i < OFFICES.length; i++) if (OFFICES[i][1].test(text)) return OFFICES[i][0];
    return "";
  }
  function office(item) {
    if (!item) return OTHER;
    var found = match(item.source_category);
    if (found) return found;
    var bracket = String(item.title || "").match(/^\s*[【\[]([^】\]]{1,12})[】\]]/);
    if (bracket) { found = match(bracket[1]); if (found) return found; }
    if (CATEGORY_OFFICE[item.category]) return CATEGORY_OFFICE[item.category];
    var title = String(item.title || "");
    for (var i = 0; i < TITLE_HINTS.length; i++) if (TITLE_HINTS[i][1].test(title)) return TITLE_HINTS[i][0];
    return OTHER;
  }
  function officeOrder(name) {
    for (var i = 0; i < OFFICES.length; i++) if (OFFICES[i][0] === name) return i;
    return OFFICES.length;
  }

  function day(value) { var d = String(value || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""; }
  function published(item) { return day(item && (item.date || item.first_seen)); }
  function daysBetween(from, to) { return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000); }

  /* The date something must be done by: a verified deadline, else a date the title states.
     titleDeadline (from 問校務) is optional. Returns "" when the notice has no deadline. */
  function deadline(item, today, titleDeadline) {
    var dates = [];
    (item && item.calendar_events || []).forEach(function (ev) {
      if (ev && (ev.kind === "deadline" || ev.kind === "event" || ev.kind === "registration") && day(ev.date)) dates.push(day(ev.date));
    });
    if (!dates.length && typeof titleDeadline === "function") {
      try { var t = day(titleDeadline(item)); if (t) dates.push(t); } catch (_) {}
    }
    if (!dates.length) return "";
    dates.sort();
    var upcoming = dates.filter(function (d) { return d >= today; });
    return upcoming.length ? upcoming[0] : dates[dates.length - 1];
  }
  /* { days, label, level } — level 0 = overdue/none … 4 = today */
  function urgency(item, today, titleDeadline) {
    var due = deadline(item, today, titleDeadline);
    if (!due) return { due: "", days: null, label: "", level: /重大|緊急|停課|颱風/.test(String(item && item.title || "") + String(item && item.source_category || "")) ? 1 : 0 };
    var days = daysBetween(today, due);
    if (days < 0) return { due: due, days: days, label: "已截止", level: -1 };
    if (days === 0) return { due: due, days: 0, label: "今天截止", level: 4 };
    if (days <= 3) return { due: due, days: days, label: "剩 " + days + " 天", level: 3 };
    if (days <= 7) return { due: due, days: days, label: "剩 " + days + " 天", level: 2 };
    return { due: due, days: days, label: Number(due.slice(5, 7)) + "/" + Number(due.slice(8, 10)) + " 截止", level: 1 };
  }

  function newestFirst(a, b) { return published(b).localeCompare(published(a)) || String(a.id).localeCompare(String(b.id)); }
  /* Returns a new array; never changes the input order in place. */
  function sort(items, mode, options) {
    options = options || {};
    var today = day(options.today) || new Date().toISOString().slice(0, 10);
    var list = (items || []).slice();
    if (mode === "oldest") return list.sort(function (a, b) { return published(a).localeCompare(published(b)) || String(a.id).localeCompare(String(b.id)); });
    if (mode === "office") return list.sort(function (a, b) {
      var oa = office(a), ob = office(b);
      return officeOrder(oa) - officeOrder(ob) || oa.localeCompare(ob) || newestFirst(a, b);
    });
    if (mode === "urgent") {
      var cache = {};
      var u = function (item) { var key = String(item.id); if (!cache[key]) cache[key] = urgency(item, today, options.titleDeadline); return cache[key]; };
      return list.sort(function (a, b) {
        var ua = u(a), ub = u(b);
        /* upcoming deadlines (soonest first) → notices without a deadline (newest first) → overdue */
        var ga = ua.days != null && ua.days >= 0 ? 0 : ua.days == null ? 1 : 2;
        var gb = ub.days != null && ub.days >= 0 ? 0 : ub.days == null ? 1 : 2;
        if (ga !== gb) return ga - gb;
        if (ga === 0) return ua.days - ub.days || newestFirst(a, b);
        if (ga === 1) return ub.level - ua.level || newestFirst(a, b);
        return ub.days - ua.days || newestFirst(a, b);
      });
    }
    return list.sort(newestFirst);
  }

  return { MODES: MODES.slice(), OTHER: OTHER, office: office, deadline: deadline, urgency: urgency, sort: sort,
    offices: function () { return OFFICES.map(function (row) { return row[0]; }).concat([OTHER]); } };
});
