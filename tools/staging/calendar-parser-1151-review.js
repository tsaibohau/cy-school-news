(function () {
  "use strict";

  var state = {
    events: [],
    school: "all",
    calendarMonth: new Date(2026, 8, 1),
    calendarSelected: "2026-09-01",
  };
  var schoolNames = { cysh: "嘉中", cygsh: "嘉女" };
  var el = {
    loadState: document.getElementById("loadState"),
    review: document.getElementById("calendarReview"),
    school: document.getElementById("schoolFilter"),
    title: document.getElementById("calendarTitle"),
    grid: document.getElementById("calendarGrid"),
    agendaTitle: document.getElementById("agendaTitle"),
    agenda: document.getElementById("agenda"),
    monthCount: document.getElementById("monthCount"),
    inventory: document.getElementById("monthInventory"),
    inventoryCount: document.getElementById("inventoryCount"),
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function isoDate(y, m, d) { return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
  function eventStart(ev) { return ev.start_date || ev.date || ""; }
  function eventEnd(ev) { return ev.end_date || ev.endDate || eventStart(ev); }
  function visibleEvents() {
    return state.events.filter(function (ev) { return state.school === "all" || ev.school_id === state.school; });
  }
  function eventsForDate(day) {
    return visibleEvents().filter(function (ev) {
      var start = eventStart(ev), end = eventEnd(ev);
      return start && end && start <= day && day <= end;
    });
  }
  function duplicateCount(ev) {
    return state.events.filter(function (row) {
      return row.school_id === ev.school_id && eventStart(row) === eventStart(ev) &&
        eventEnd(row) === eventEnd(ev) && row.title === ev.title;
    }).length;
  }
  function needsAttention(ev) {
    return ev.title === "元旦放" || duplicateCount(ev) > 1;
  }
  function schoolLabel(ev) { return schoolNames[ev.school_id] || ev.school_id || ""; }

  /* Keep the production calendar contract: 42 cells, inclusive range lookup,
     up to four event dots, and a date agenda rendered from the same rows. */
  function renderCalendar() {
    var y = state.calendarMonth.getFullYear(), m = state.calendarMonth.getMonth();
    el.title.textContent = y + "年" + (m + 1) + "月";
    var first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay());
    var html = ["日", "一", "二", "三", "四", "五", "六"].map(function (d) {
      return '<div class="calendar-weekday">' + d + "</div>";
    }).join("");
    for (var i = 0; i < 42; i++) {
      var day = new Date(start); day.setDate(start.getDate() + i);
      var key = isoDate(day.getFullYear(), day.getMonth(), day.getDate()), evs = eventsForDate(key);
      var classes = "calendar-day" + (day.getMonth() !== m ? " is-outside" : "") + (key === state.calendarSelected ? " is-selected" : "");
      html += '<button type="button" class="' + classes + '" data-day="' + key + '"><span class="day-number">' + day.getDate() + "</span>";
      if (evs.length) html += '<span class="day-dots">' + evs.slice(0, 4).map(function () { return '<i class="day-dot official" title="候選官方行事曆"></i>'; }).join("") + "</span>";
      html += "</button>";
    }
    el.grid.innerHTML = html;
    var monthKey = y + "-" + String(m + 1).padStart(2, "0");
    var monthRows = visibleEvents().filter(function (ev) { return eventStart(ev).slice(0, 7) === monthKey; });
    el.monthCount.textContent = (state.school === "all" ? "兩校" : schoolNames[state.school]) + "本月起始事件 " + monthRows.length + " 筆";
    document.querySelectorAll("button[data-month]").forEach(function (button) { button.classList.toggle("is-active", button.dataset.month === monthKey); });
    renderAgenda(state.calendarSelected);
    renderInventory(monthRows);
  }

  function renderAgenda(day) {
    var evs = eventsForDate(day);
    el.agendaTitle.textContent = day + " 的事件";
    el.agenda.innerHTML = evs.length ? evs.map(function (ev) {
      var start = eventStart(ev), end = eventEnd(ev), range = start !== end ? " · " + esc(start) + "–" + esc(end) : "";
      var copies = duplicateCount(ev), flag = ev.title === "元旦放" ? '<span class="candidate-flag">疑似截斷</span>' : (copies > 1 ? '<span class="candidate-flag">完全相同 ×' + copies + "</span>" : "");
      return '<article class="agenda-item' + (needsAttention(ev) ? " is-attention" : "") + '"><span class="agenda-mark"></span><div><h4>' + esc(ev.title) + flag + "</h4><p>候選官方行事曆" + range + " · " + esc(schoolLabel(ev)) + "</p></div></article>";
    }).join("") : '<p class="empty">這天沒有候選事件。</p>';
  }

  function renderInventory(rows) {
    rows = rows.slice().sort(function (a, b) { return eventStart(a).localeCompare(eventStart(b)) || a.title.localeCompare(b.title, "zh-Hant"); });
    el.inventoryCount.textContent = rows.length + " 筆；點一列跳到日期";
    el.inventory.innerHTML = rows.map(function (ev) {
      var start = eventStart(ev), end = eventEnd(ev), copies = duplicateCount(ev);
      var flag = ev.title === "元旦放" ? '<span class="candidate-flag">疑似截斷</span>' : (copies > 1 ? '<span class="candidate-flag">重複 ×' + copies + "</span>" : "");
      return '<button type="button" class="candidate-row" data-event-day="' + esc(start) + '"><time>' + esc(start) + (end !== start ? "–" + esc(end) : "") + "</time><strong>" + esc(ev.title) + flag + "</strong><small>" + esc(schoolLabel(ev)) + "</small></button>";
    }).join("") || '<p class="empty">本月沒有候選事件。</p>';
  }

  function showDay(school, day) {
    if (school) { state.school = school; el.school.value = school; }
    state.calendarSelected = day;
    state.calendarMonth = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, 1);
    renderCalendar();
    el.agenda.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  el.grid.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-day]");
    if (!button) return;
    state.calendarSelected = button.dataset.day;
    renderCalendar();
  });
  el.inventory.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-event-day]");
    if (button) showDay(null, button.dataset.eventDay);
  });
  el.school.addEventListener("change", function () { state.school = el.school.value; renderCalendar(); });
  document.getElementById("prevMonth").addEventListener("click", function () { state.calendarMonth.setMonth(state.calendarMonth.getMonth() - 1); renderCalendar(); });
  document.getElementById("nextMonth").addEventListener("click", function () { state.calendarMonth.setMonth(state.calendarMonth.getMonth() + 1); renderCalendar(); });
  document.querySelectorAll("button[data-month]").forEach(function (button) {
    button.addEventListener("click", function () { showDay(null, button.dataset.month + "-01"); });
  });
  document.querySelectorAll("button[data-jump]").forEach(function (button) {
    button.addEventListener("click", function () { var parts = button.dataset.jump.split("|"); showDay(parts[0], parts[1]); });
  });

  fetch("review/calendar-parser-1151/candidate-calendar-events.json", { cache: "no-store" }).then(function (response) {
    if (!response.ok) throw new Error("candidate HTTP " + response.status);
    return response.json();
  }).then(function (rows) {
    if (!Array.isArray(rows)) throw new Error("candidate 不是事件陣列");
    state.events = rows.filter(function (ev) { return ev && ev.title && /^202(?:6|7)-\d{2}-\d{2}$/.test(eventStart(ev)); });
    el.loadState.textContent = "已載入 " + state.events.length + " 筆隔離候選事件";
    el.review.hidden = false;
    renderCalendar();
  }).catch(function (error) {
    el.loadState.classList.add("is-error");
    el.loadState.textContent = "candidate 載入失敗：" + error.message;
  });
}());
