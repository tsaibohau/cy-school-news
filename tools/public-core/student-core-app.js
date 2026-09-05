(function () {
  "use strict";

  var PAGE_SIZE = 40;
  var schools = [{ id: "cysh", name: "嘉中" }, { id: "cygsh", name: "嘉女" }, { id: "fjsh", name: "輔仁" }];
  var state = { items: [], timetables: [], calendar: [], query: "", school: "all", category: "all", visible: PAGE_SIZE };
  var el = {};

  function byId(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]; }); }
  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function schoolName(id) { var row = schools.find(function (school) { return school.id === id; }); return row ? row.name : id; }
  function officialUrl(value) {
    try {
      var url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && ["www.cysh.cy.edu.tw", "www.cygsh.cy.edu.tw", "rpage.fjsh.cy.edu.tw"].indexOf(url.hostname.toLowerCase()) !== -1;
    } catch (_) { return false; }
  }
  function formatDate(value) { var match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? Number(match[1]) + "/" + Number(match[2]) + "/" + Number(match[3]) : "日期未提供"; }

  function switchView(name) {
    ["timetable", "announcements", "assistant", "calendar"].forEach(function (view) {
      var panel = byId("view" + view.charAt(0).toUpperCase() + view.slice(1));
      if (panel) panel.hidden = view !== name;
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-view]"), function (button) {
      button.classList.toggle("active", button.dataset.view === name);
      button.setAttribute("aria-current", button.dataset.view === name ? "page" : "false");
    });
    window.scrollTo(0, 0);
  }

  function announcementCandidates() {
    var rows = state.items.filter(function (item) { return (state.school === "all" || item.school === state.school) && (state.category === "all" || item.category === state.category); });
    if (!state.query) return rows;
    if (window.CyNewsSearchQuery && typeof window.CyNewsSearchQuery.select === "function") return window.CyNewsSearchQuery.select(rows, state.query).map(function (row) { return row.item; });
    var terms = state.query.toLocaleLowerCase("zh-TW").split(/\s+/).filter(Boolean);
    return rows.filter(function (item) { var text = [item.title, item.summary, item.category, item.source_category].join(" ").toLocaleLowerCase("zh-TW"); return terms.every(function (term) { return text.indexOf(term) !== -1; }); });
  }
  function announcementCard(item, compact) {
    if (!officialUrl(item.url)) return "";
    var summary = clean(item.summary);
    return '<article class="card"><div class="card-meta"><span class="tag tag-' + esc(item.school) + '">' + esc(schoolName(item.school)) + '</span><span class="tag tag-cat">' + esc(item.category || "一般") + '</span><time datetime="' + esc(item.date || "") + '">' + esc(formatDate(item.date)) + '</time></div>' +
      '<h3 class="card-title"><a href="' + esc(item.url) + '" target="_blank" rel="noopener">' + esc(item.title || "未命名公告") + '</a></h3>' +
      (summary ? '<p class="card-snippet">' + esc(summary) + '</p>' : "") +
      (compact ? "" : '<div class="card-actions"><a class="btn-ghost" href="' + esc(item.url) + '" target="_blank" rel="noopener">查看官方原文</a></div>') + '</article>';
  }
  function renderAnnouncements() {
    var rows = announcementCandidates(), shown = rows.slice(0, state.visible);
    el.list.innerHTML = shown.map(function (item) { return announcementCard(item, false); }).join("") || '<p class="empty">找不到符合條件的公告，請換個關鍵字或清除篩選。</p>';
    el.countLine.textContent = "找到 " + rows.length + " 則公告" + (rows.length > shown.length ? "，目前顯示 " + shown.length + " 則" : "");
    el.loadMore.hidden = rows.length <= shown.length;
  }
  function renderCategories(categories) {
    var values = ["all"].concat((categories || []).filter(Boolean));
    el.catChips.innerHTML = values.map(function (category) { return '<button type="button" class="chip' + (category === state.category ? " active" : "") + '" data-category="' + esc(category) + '">' + esc(category === "all" ? "全部" : category) + '</button>'; }).join("");
  }

  function selectedTimetable() { return state.timetables.find(function (row) { return row.school_id === el.timetableSchool.value; }); }
  function populateClasses() {
    var table = selectedTimetable(), current = el.timetableClass.value;
    el.timetableClass.innerHTML = '<option value="">選擇班級</option>' + ((table && table.classes) || []).map(function (row) { return '<option value="' + esc(row.class_name) + '">' + esc(row.class_name) + ' 班</option>'; }).join("");
    if (Array.prototype.some.call(el.timetableClass.options, function (option) { return option.value === current; })) el.timetableClass.value = current;
    renderTimetable();
  }
  function renderTimetable() {
    var table = selectedTimetable(), className = el.timetableClass.value;
    if (!table || !className) { el.timetableResult.innerHTML = ""; el.timetableStatus.textContent = "選擇班級後顯示今天與整週課表。"; return; }
    var classRow = table.classes.find(function (row) { return row.class_name === className; });
    if (!classRow) { el.timetableStatus.textContent = "找不到這個班級的公開課表。"; return; }
    var weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五"];
    var dayIndex = new Date().getDay(), today = dayIndex >= 1 && dayIndex <= 5 ? weekdays[dayIndex - 1] : "";
    var todaySlots = classRow.slots.filter(function (slot) { return slot.weekday === today; }).sort(function (a, b) { return a.period - b.period; });
    var todayRows = todaySlots.length ? todaySlots.map(function (slot) { return '<div class="timetable-row"><span class="timetable-period">第 ' + esc(slot.period) + ' 節<small>' + esc(slot.start) + '–' + esc(slot.end) + '</small></span><strong>' + esc(slot.subject || "—") + '</strong></div>'; }).join("") : '<p class="empty">今天不是一般上課日；可展開下方查看整週課表。</p>';
    var periods = Array.from(new Set(classRow.slots.map(function (slot) { return slot.period; }))).sort(function (a, b) { return a - b; });
    var grid = periods.map(function (period) {
      var first = classRow.slots.find(function (slot) { return slot.period === period; });
      var cells = weekdays.map(function (weekday) { var slot = classRow.slots.find(function (row) { return row.period === period && row.weekday === weekday; }); return '<div class="timetable-grid-cell">' + esc(slot && slot.subject || "—") + '</div>'; }).join("");
      return '<div class="timetable-grid-row"><div class="timetable-grid-period">' + esc(period) + '<small>' + esc(first && first.start || "") + '</small></div>' + cells + '</div>';
    }).join("");
    var source = officialUrl(table.source_url) ? '<a href="' + esc(table.source_url) + '" target="_blank" rel="noopener">查看校方課表公告 ↗</a>' : "校方公告來源";
    el.timetableStatus.textContent = className + " 班・" + table.academic_year + " 學年度第 " + table.semester + " 學期・" + (table.version === "formal" ? "正式版" : "試行版");
    el.timetableResult.innerHTML = '<div class="timetable-note"><strong>' + esc(today || "整週課表") + '</strong><span>' + source + '</span></div><div class="timetable-today">' + todayRows + '</div><details class="timetable-week"><summary>查看整週課表</summary><div class="timetable-grid-wrap"><div class="timetable-grid timetable-grid-head"><div>節次</div>' + weekdays.map(function (day) { return '<div>' + esc(day.replace("星期", "週")) + '</div>'; }).join("") + '</div><div class="timetable-grid">' + grid + '</div></div></details>';
  }

  function ask(question) {
    var rows = window.CyNewsSearchQuery ? window.CyNewsSearchQuery.select(state.items, question).slice(0, 5).map(function (row) { return row.item; }) : [];
    el.assistantStatus.textContent = rows.length ? "找到 " + rows.length + " 則最相關的官方公告" : "目前的公開資料不足以回答，請換一種問法。";
    el.assistantAnswer.innerHTML = rows.length ? '<section class="assistant-result"><h3>先看這些官方依據</h3><p class="assistant-lead">候選版先提供可追溯的搜尋結果，不替校方做最終判定。</p><div class="list">' + rows.map(function (item) { return announcementCard(item, true); }).join("") + '</div></section>' : "";
  }
  function renderCalendar() {
    var school = el.calendarSchool.value, today = new Date().toISOString().slice(0, 10);
    var rows = state.calendar.filter(function (item) { return (school === "all" || item.school_id === school) && item.end_date >= today; }).slice(0, 40);
    el.calendarList.innerHTML = rows.map(function (item) { return '<article class="calendar-item"><time datetime="' + esc(item.start_date) + '">' + esc(formatDate(item.start_date)) + (item.end_date !== item.start_date ? "－" + esc(formatDate(item.end_date)) : "") + '</time><h3>' + esc(item.title) + '</h3><p>' + esc(schoolName(item.school_id)) + '・' + (officialUrl(item.source_url) ? '<a href="' + esc(item.source_url) + '" target="_blank" rel="noopener">官方校曆</a>' : "官方校曆") + '</p></article>'; }).join("") || '<p class="empty">目前沒有可顯示的近期公開行事。</p>';
  }

  function load() {
    el.refreshState.textContent = "更新中…";
    return Promise.all([
      fetch("data/public-announcements.json?_=" + Date.now(), { cache: "no-store" }).then(function (response) { if (!response.ok) throw new Error("announcements"); return response.json(); }),
      fetch("data/public-timetables.json?_=" + Date.now(), { cache: "no-store" }).then(function (response) { if (!response.ok) throw new Error("timetables"); return response.json(); }),
      fetch("data/public-calendar.json?_=" + Date.now(), { cache: "no-store" }).then(function (response) { if (!response.ok) throw new Error("calendar"); return response.json(); }),
    ]).then(function (results) {
      state.items = results[0].items || []; state.timetables = results[1].timetables || []; state.calendar = results[2].events || [];
      renderCategories(results[0].categories || []); populateClasses(); renderAnnouncements(); renderCalendar();
      var stamp = Date.parse(results[0].generated_at || ""); el.updatedAt.textContent = Number.isFinite(stamp) ? "・更新 " + new Date(stamp).toLocaleString("zh-TW", { hour12: false }) : "";
      el.refreshState.textContent = "已更新";
    }).catch(function () { el.refreshState.textContent = "載入失敗"; el.timetableStatus.textContent = "目前無法載入公開資料，請稍後再試。"; }).finally(function () { byId("appLoading").hidden = true; document.body.classList.add("app-ready"); });
  }

  function start() {
    ["list", "countLine", "loadMore", "catChips", "schoolFilter", "q", "refreshState", "updatedAt", "timetableSchool", "timetableClass", "timetableStatus", "timetableResult", "assistantForm", "assistantQuestion", "assistantStatus", "assistantAnswer", "calendarSchool", "calendarList"].forEach(function (id) { el[id] = byId(id); });
    el.refresh = byId("btnRefresh");
    schools.forEach(function (school) { var option = document.createElement("option"); option.value = school.id; option.textContent = school.name; el.schoolFilter.appendChild(option); });
    document.addEventListener("click", function (event) { var view = event.target.closest("button[data-view]"); if (view) switchView(view.dataset.view); });
    el.q.addEventListener("input", function () { state.query = clean(el.q.value); state.visible = PAGE_SIZE; renderAnnouncements(); });
    el.schoolFilter.addEventListener("change", function () { state.school = el.schoolFilter.value; state.visible = PAGE_SIZE; renderAnnouncements(); });
    el.catChips.addEventListener("click", function (event) { var button = event.target.closest("button[data-category]"); if (!button) return; state.category = button.dataset.category; state.visible = PAGE_SIZE; renderCategories(Array.from(new Set(state.items.map(function (item) { return item.category; })))); renderAnnouncements(); });
    el.loadMore.addEventListener("click", function () { state.visible += PAGE_SIZE; renderAnnouncements(); });
    el.timetableSchool.addEventListener("change", populateClasses); el.timetableClass.addEventListener("change", renderTimetable);
    el.assistantForm.addEventListener("submit", function (event) { event.preventDefault(); ask(clean(el.assistantQuestion.value)); });
    el.calendarSchool.addEventListener("change", renderCalendar); el.refresh.addEventListener("click", load);
    load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
