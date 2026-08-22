/* 嘉校快訊 前端邏輯(無框架) */
(function () {
  "use strict";

  function loadNotificationStateScript(done) {
    if (window.CyNewsNotificationState) {
      done();
      return;
    }
    var script = document.createElement("script");
    script.src = "notification-state.js";
    script.onload = done;
    script.onerror = done;
    document.head.appendChild(script);
  }

  function startApp() {
    var NotificationState = window.CyNewsNotificationState;
    if (!NotificationState) return;

    var LS_SEEN = "cyNews.lastSeen";
    var LS_EVENTS = "cyNews.calendarEvents.v1";
    var CalendarState = window.CyNewsCalendarState || (function () {
      function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
      function normalize(rows) {
        return (Array.isArray(rows) ? rows : []).filter(function (row) {
          return row && String(row.title || "").trim() && validDate(row.date);
        }).map(function (row, index) {
          return { id: String(row.id || "user:legacy:" + index + ":" + row.date + ":" + row.title), title: String(row.title).trim(), date: String(row.date), notes: String(row.notes || "").trim() };
        });
      }
      function upsert(rows, event) {
        var normalized = normalize(rows), next = { id: String(event.id), title: String(event.title || "").trim(), date: String(event.date || ""), notes: String(event.notes || "").trim() }, found = false;
        if (!next.id || !next.title || !validDate(next.date)) return normalized;
        return normalized.map(function (row) { if (row.id !== next.id) return row; found = true; return next; }).concat(found ? [] : [next]);
      }
      function remove(rows, id) { return normalize(rows).filter(function (row) { return row.id !== String(id); }); }
      return { normalize: normalize, upsert: upsert, remove: remove };
    })();
    var LS_READS = "cyNews.reads.v1";
    var PAGE_SIZE = 200;  // 最新清單一次渲染的則數,避免一口氣塞入上千張卡片
    var notificationState = NotificationState.load();
    var queueAccountMutation = function () {};

    var state = {
      data: null,
      school: "all",
      cat: "all",
      q: "",
      tab: "latest",
      calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      calendarSelected: new Date().toISOString().slice(0, 10),
      eventEditingId: null,
      officialEvents: [],
      userEvents: loadUserEvents(),
      reads: loadReads(),
      shown: PAGE_SIZE,
      archive: "none",  /* none | loading | loaded:歷史封存資料的載入狀態 */
      subscriptions: notificationState.subscriptions,
      lastSeen: localStorage.getItem(LS_SEEN) || "",
    };

    var $ = function (id) { return document.getElementById(id); };
    var el = {
      list: $("list"), subList: $("subList"), countLine: $("countLine"),
      updatedAt: $("updatedAt"), q: $("q"),
      schoolSeg: $("schoolSeg"), catChips: $("catChips"),
      viewLatest: $("viewLatest"), viewSub: $("viewSub"),
      tabLatest: $("tabLatest"), tabSub: $("tabSub"), subBadge: $("subBadge"),
      kwForm: $("kwForm"), kwInput: $("kwInput"), kwChips: $("kwChips"),
      btnNotify: $("btnNotify"), notifyState: $("notifyState"),
      btnRefresh: $("btnRefresh"),
      accountState: $("accountState"), accountLogin: $("accountLogin"), accountSwitch: $("accountSwitch"),
      accountLogout: $("accountLogout"),
      viewCalendar: $("viewCalendar"), tabCalendar: $("tabCalendar"), quickCalendar: $("quickCalendar"),
      calendarTitle: $("calendarTitle"), calendarGrid: $("calendarGrid"), agenda: $("agenda"), agendaTitle: $("agendaTitle"),
      prevMonth: $("prevMonth"), nextMonth: $("nextMonth"), todayCalendar: $("todayCalendar"),
      addEvent: $("addEvent"), eventFormWrap: $("eventFormWrap"), eventForm: $("eventForm"), cancelEvent: $("cancelEvent"),
      eventTitle: $("eventTitle"), eventDate: $("eventDate"), eventNotes: $("eventNotes"),
      eventFormTitle: $("eventFormTitle"),
      importantList: $("importantList"),
    };

    function loadUserEvents() {
      try { var rows = JSON.parse(localStorage.getItem(LS_EVENTS) || "[]"); return CalendarState ? CalendarState.normalize(rows) : (Array.isArray(rows) ? rows : []); }
      catch (e) { return []; }
    }
    function loadReads() {
      try { var rows = JSON.parse(localStorage.getItem(LS_READS) || "{}"); return rows && typeof rows === "object" && !Array.isArray(rows) ? rows : {}; }
      catch (e) { return {}; }
    }
    function saveReads() { localStorage.setItem(LS_READS, JSON.stringify(state.reads)); }
    function saveUserEvents() {
      state.userEvents = CalendarState ? CalendarState.normalize(state.userEvents) : state.userEvents;
      localStorage.setItem(LS_EVENTS, JSON.stringify(state.userEvents));
    }
    function editUserEvent(id) {
      var row = state.userEvents.find(function (ev) { return ev.id === String(id); });
      if (!row) return false;
      state.eventEditingId = row.id;
      el.eventForm.dataset.editingId = row.id;
      el.eventForm.dataset.editingDate = row.date;
      el.eventFormTitle.textContent = "編輯自己的事件";
      el.eventTitle.value = row.title;
      el.eventDate.value = row.date;
      el.eventNotes.value = row.notes || "";
      el.eventFormWrap.hidden = false;
      el.eventTitle.focus();
      return true;
    }
    function removeUserEvent(id) {
      state.userEvents = CalendarState ? CalendarState.remove(state.userEvents, id) : state.userEvents.filter(function (ev) { return ev.id !== String(id); });
      saveUserEvents();
      renderCalendar();
    }
    /* Keep handlers available to the generated agenda buttons across rerenders. */
    window.__cyNewsCalendarHandlers = {
      edit: function (id) {
        editUserEvent(id);
      },
      remove: function (id) {
        removeUserEvent(id);
      },
    };

    function setupAccountSync() {
      if (!el.accountState || !window.CyNewsAccountAuth || !window.CyNewsAccountSync) return;
      var auth = window.CyNewsAccountAuth.createController();
      if (!auth.isConfigured()) {
        var accountBox = document.getElementById("accountBox");
        if (accountBox) accountBox.hidden = true;
        return;
      }
      var lifecycle = new window.CyNewsAccountSync.AccountLifecycle({
        subscriptions: notificationState.subscriptions,
        reads: Object.keys(state.reads).map(function (id) { return { announcement_id: id, read_at: state.reads[id] }; }),
        preferences: { schema_version: 1, preferences: {} },
      }, localStorage);
      var syncGeneration = 0;
      var requestedUid = null;
      var readyUid = null;
      var accountPhase = "ANONYMOUS_READY";
      function status(text) { el.accountState.textContent = text; }
      function projectSubscriptions(rows) {
        var now = new Date().toISOString();
        var existing = {};
        notificationState.subscriptions.forEach(function (sub) {
          existing[sub.keyword.toLocaleLowerCase("zh-TW")] = sub;
        });
        return (rows || []).filter(function (row) { return !row.deleted_at && row.keyword; }).map(function (row) {
          var key = String(row.keyword).trim().toLocaleLowerCase("zh-TW");
          var old = existing[key];
          /* A subscription arriving from another device is new on this device:
             establish a local notification baseline now, never at its server age. */
          return { id: old ? old.id : String(row.id || "sub-" + key), keyword: row.keyword,
            createdAt: old ? old.createdAt : now };
        });
      }
      function publishState(merged) {
        notificationState.subscriptions = projectSubscriptions(merged.subscriptions);
        state.reads = {};
        (merged.reads || []).forEach(function (row) { if (row && row.announcement_id && row.read_at) state.reads[row.announcement_id] = row.read_at; });
        saveReads();
        NotificationState.save(notificationState);
        renderSub(); renderBadge();
        return merged;
      }
      function clearAccountOwnedView() {
        notificationState.subscriptions = [];
        state.reads = {};
        saveReads();
        NotificationState.save(notificationState);
        renderSub(); renderBadge();
      }
      function restoreAnonymous() {
        syncGeneration += 1;
        var anonymousState = lifecycle.logout();
        requestedUid = null;
        readyUid = null;
        accountPhase = "ANONYMOUS_READY";
        publishState(anonymousState);
      }
      function sync(uid) {
        var generation = ++syncGeneration;
        requestedUid = uid;
        readyUid = null;
        accountPhase = "ACCOUNT_RESOLVING";
        clearAccountOwnedView();
        function stillCurrent() {
          if (generation !== syncGeneration || requestedUid !== uid) throw new Error("account sync superseded");
        }
        status("同步中");
        var merged = null;
        auth.getClient().then(function (client) {
          stillCurrent();
          accountPhase = "REMOTE_LOADING";
          var adapter = window.CyNewsSupabaseSync.createAdapter(client, { isCurrent: function (currentUid) {
            return generation === syncGeneration && requestedUid === uid && currentUid === uid;
          }});
          var outbox = new window.CyNewsAccountSync.Outbox(localStorage, uid);
          return adapter.fetchRemoteState().then(function (remote) {
            stillCurrent();
            /* Do not mutate or publish account state until the verified UID's remote
               namespace has been fetched. The lifecycle remains anonymous while this
               transition is resolving, so no old account state can be adopted. */
            accountPhase = "MERGING";
            merged = lifecycle.login(uid, remote || {});
            accountPhase = "SYNCING";
            return adapter.pushState(merged).then(function () {
              stillCurrent();
              return adapter.drain(outbox, function (item) {
                return adapter.sendMutation(item);
              });
            });
          });
        }).then(function () {
          stillCurrent();
          readyUid = uid;
          accountPhase = "ACCOUNT_READY";
          publishState(merged);
          status("已同步");
          el.accountLogin.hidden = true;
          if (el.accountSwitch) el.accountSwitch.hidden = false;
          el.accountLogout.hidden = false;
        }).catch(function () {
          if (generation !== syncGeneration || requestedUid !== uid) return;
          if (merged) {
            readyUid = uid;
            accountPhase = "ACCOUNT_READY";
            publishState(merged);
            status("同步待完成");
            if (el.accountSwitch) el.accountSwitch.hidden = false;
            el.accountLogout.hidden = false;
          } else {
            status("已登入・同步待完成");
            el.accountLogin.hidden = true;
            if (el.accountSwitch) el.accountSwitch.hidden = false;
            el.accountLogout.hidden = false;
          }
        });
      }
      queueAccountMutation = function (type, payload) {
        if (lifecycle.active_account_id === window.CyNewsAccountSync.ANONYMOUS_ACCOUNT) {
          if (accountPhase === "ANONYMOUS_READY") lifecycle.applyMutation(type, payload);
          return;
        }
        if (accountPhase !== "ACCOUNT_READY" || !readyUid || lifecycle.active_account_id !== readyUid) return;
        lifecycle.applyMutation(type, payload);
        new window.CyNewsAccountSync.Outbox(localStorage, readyUid).enqueue({ type: type, payload: payload });
        status("等待同步");
      };
      function handleVerifiedSession() {
        return auth.getVerifiedSession().then(function (session) {
          var uid = session && session.user && session.user.id;
          if (typeof uid === "string" && uid) {
            if (uid === requestedUid) return;
            /* A verified session is authenticated before remote sync completes.
               Keep account controls truthful while the single transition runs. */
            status("已登入・同步中");
            el.accountLogin.hidden = true;
            if (el.accountSwitch) el.accountSwitch.hidden = false;
            el.accountLogout.hidden = false;
            sync(uid);
          } else if (requestedUid !== null || readyUid !== null || accountPhase !== "ANONYMOUS_READY") {
            restoreAnonymous();
            status("未登入"); el.accountLogin.hidden = false;
            if (el.accountSwitch) el.accountSwitch.hidden = true;
            el.accountLogout.hidden = true;
          }
        });
      }
      el.accountLogin.addEventListener("click", function () {
        syncGeneration += 1;
        requestedUid = null;
        readyUid = null;
        accountPhase = "AUTHENTICATING";
        clearAccountOwnedView();
        status("前往 Google 登入中");
        auth.signInWithGoogle().then(function (result) {
          if (result && result.error) throw result.error;
        }).catch(function () { status("登入失敗，請稍後再試"); handleVerifiedSession().catch(function () {}); });
      });
      if (el.accountSwitch) el.accountSwitch.addEventListener("click", function () {
        syncGeneration += 1;
        requestedUid = null;
        readyUid = null;
        accountPhase = "AUTHENTICATING";
        clearAccountOwnedView();
        status("選擇 Google 帳號中");
        auth.signInWithGoogle({ forceAccountChooser: true }).then(function (result) {
          if (result && result.error) throw result.error;
        }).catch(function () { status("切換帳號失敗，請稍後再試"); handleVerifiedSession().catch(function () {}); });
      });
      el.accountLogout.addEventListener("click", function () {
        syncGeneration += 1;
        requestedUid = null;
        readyUid = null;
        accountPhase = "AUTHENTICATING";
        clearAccountOwnedView();
        status("同步中");
        auth.signOut().then(function () {
          restoreAnonymous();
          status("未登入"); el.accountLogin.hidden = false;
          if (el.accountSwitch) el.accountSwitch.hidden = true;
          el.accountLogout.hidden = true;
        }).catch(function () { status("同步失敗"); });
      });
      auth.getClient().then(function () { return handleVerifiedSession(); })
        .catch(function () { status("未登入"); });
      /* Ignore callback URL parameters and event payloads; re-read the verified session. */
      auth.onAuthStateChange(function () { handleVerifiedSession().catch(function () {}); }).catch(function () {});
    }

    function syncSubscriptions() {
      state.subscriptions = notificationState.subscriptions;
    }

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function responseSource(response) {
      return response.headers && typeof response.headers.get === "function"
        ? response.headers.get("X-CyNews-Data-Source") : null;
    }

    function isFreshNetworkResponse(response) {
      var source = responseSource(response);
      if (source === "network") return true;
      if (source === "cache") return false;
      /* Before the new SW controls this page, a direct response is fresh. */
      return !(navigator.serviceWorker && navigator.serviceWorker.controller);
    }

    function fetchData() {
      return fetch("data/announcements.json?_=" + Date.now(), { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.json().then(function (data) {
            return { data: data, freshNetwork: isFreshNetworkResponse(r) };
          });
        })
        .then(function (result) {
          var data = result.data;
          var recentItems = Array.isArray(data.items) ? data.items.slice() : [];
          if (!Array.isArray(data.items)) data.items = [];
          if (state.archive === "loaded") {
            /* 已載入過封存資料:重新抓的檔案只有近一年,把封存部分接回去 */
            var ids = {};
            data.items.forEach(function (it) { ids[it.id] = true; });
            state.data.items.forEach(function (it) {
              if (!ids[it.id]) data.items.push(it);
            });
          }
          state.data = data;
          renderAll();
          if (result.freshNetwork) processFreshRecentNotifications(recentItems);
        })
        .catch(function () {
          if (!state.data) {
            el.list.innerHTML = '<p class="empty">目前離線且尚無快取資料,連上網路後再試一次。</p>';
          }
        });
    }

    /* 歷史封存資料:開站不載,搜尋或篩選時才背景載入一次 */
    function ensureArchive() {
      if (!state.data || state.archive !== "none") return;
      state.archive = "loading";
      renderLatest();
      fetch("data/archive.json?_=" + Date.now(), { cache: "no-store" })
        .then(function (r) {
          if (r.status === 404) return { items: [] }; /* 尚未產生封存檔,視為空 */
          if (!r.ok) throw new Error(r.status);
          return r.json();
        })
        .then(function (arc) {
          var ids = {};
          state.data.items.forEach(function (it) { ids[it.id] = true; });
          (arc.items || []).forEach(function (it) {
            if (!ids[it.id]) state.data.items.push(it);
          });
          state.archive = "loaded";
          renderAll();
        })
        .catch(function () { state.archive = "none"; renderLatest(); }); /* 離線等下次再試 */
    }

    /* ── 篩選與比對 ── */
    function itemText(it) {
      /* 含自動分類名稱:訂「段考」也能命中整個「段考考試」分類 */
      return (it.title + " " + (it.snippet || "") + " " +
        (it.category || "") + " " + (it.source_category || "")).toLowerCase();
    }
    function matchQuery(it, q) {
      if (!q) return true;
      var text = itemText(it);
      return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (tok) {
        return text.indexOf(tok) !== -1;
      });
    }
    function matchKeywords(it) {
      syncSubscriptions();
      if (!state.subscriptions.length) return false;
      var text = itemText(it);
      return state.subscriptions.some(function (sub) {
        return text.indexOf(sub.keyword.toLowerCase()) !== -1;
      });
    }
    function isNew(it) {
      return !!it.first_seen && (!state.lastSeen || it.first_seen > state.lastSeen);
    }
    function isUnread(it) { return isNew(it) && !state.reads[it.id]; }
    function isExplicitlyImportant(it) {
      return it && (it.important === true || it.importance === "high" || it.source_pin === "important");
    }
    function latestItems() {
      if (!state.data) return [];
      return state.data.items.filter(function (it) {
        if (state.school !== "all" && it.school !== state.school) return false;
        if (state.cat !== "all" && it.category !== state.cat) return false;
        return matchQuery(it, state.q);
      });
    }
    function subItems() {
      if (!state.data) return [];
      return state.data.items.filter(matchKeywords);
    }
    function newSubCount() {
      return subItems().filter(isNew).length;
    }

    /* ── 畫面渲染 ── */
    function displayDate(it) {
      /* 沒有公告日期時,退而顯示首次抓到的日期 */
      return it.date || (it.first_seen || "").slice(0, 10) || "—";
    }
    function calendarEvents() {
      var announcementEvents = [];
      (state.data && state.data.items || []).forEach(function (it) {
        /* Only explicit, provenance-bearing event records enter the calendar.
           it.date is publication date and is intentionally never used here. */
        (Array.isArray(it.calendar_events) ? it.calendar_events : []).forEach(function (ev) {
          if (!ev || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date) || !ev.title || !ev.provenance) return;
          announcementEvents.push({ id: "announcement:" + it.id + ":" + ev.date + ":" + ev.title,
            date: ev.date, endDate: ev.end_date || ev.date, title: ev.title, school: it.school_name,
            kind: ev.kind === "deadline" ? "deadline" : "announcement", url: it.url,
            sourceLabel: ev.kind === "deadline" ? "公告截止日期" : "公告事件" });
        });
      });
      return announcementEvents.concat(state.officialEvents).concat(state.userEvents.map(function (ev) {
        return { id: ev.id, date: ev.date, endDate: ev.date, title: ev.title, notes: ev.notes,
          kind: "user", sourceLabel: "我的事件" };
      }));
    }
    function isoDate(y, m, d) { return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
    function eventStart(ev) { return ev.start_date || ev.date || ""; }
    function eventEnd(ev) { return ev.end_date || ev.endDate || eventStart(ev); }
    function eventsForDate(day) {
      return calendarEvents().filter(function (ev) {
        var start = eventStart(ev), end = eventEnd(ev);
        return start && end && start <= day && day <= end;
      });
    }
    function renderCalendar() {
      var y = state.calendarMonth.getFullYear(), m = state.calendarMonth.getMonth();
      el.calendarTitle.textContent = y + "年" + (m + 1) + "月";
      var first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay()), today = new Date().toISOString().slice(0, 10);
      var html = ["日", "一", "二", "三", "四", "五", "六"].map(function (d) { return '<div class="calendar-weekday">' + d + '</div>'; }).join("");
      for (var i = 0; i < 42; i++) {
        var day = new Date(start); day.setDate(start.getDate() + i);
        var key = isoDate(day.getFullYear(), day.getMonth(), day.getDate()), evs = eventsForDate(key);
        var classes = "calendar-day" + (day.getMonth() !== m ? " is-outside" : "") + (key === today ? " is-today" : "") + (key === state.calendarSelected ? " is-selected" : "");
        html += '<button type="button" class="' + classes + '" data-day="' + key + '"><span class="day-number">' + day.getDate() + '</span>';
        if (evs.length) html += '<span class="day-dots">' + evs.slice(0, 4).map(function (ev) { return '<i class="day-dot ' + ev.kind + '" title="' + esc(ev.sourceLabel) + '"></i>'; }).join("") + '</span>';
        html += '</button>';
      }
      el.calendarGrid.innerHTML = html;
      renderAgenda(state.calendarSelected);
    }
    function renderAgenda(day) {
      var evs = eventsForDate(day);
      window.__cyNewsCalendarHandlers = {
        edit: function (id) {
          var row = state.userEvents.find(function (ev) { return ev.id === id; });
          if (!row) return;
          state.eventEditingId = row.id; el.eventFormTitle.textContent = "編輯自己的事件";
          el.eventTitle.value = row.title; el.eventDate.value = row.date; el.eventNotes.value = row.notes || "";
          el.eventFormWrap.hidden = false; el.eventTitle.focus();
        },
        remove: function (id) {
          state.userEvents = state.userEvents.filter(function (ev) { return ev.id !== id; });
          saveUserEvents(); renderCalendar();
        },
      };
      el.agendaTitle.textContent = day === new Date().toISOString().slice(0, 10) ? "今天" : day + " 的事件";
      el.agenda.innerHTML = evs.length ? evs.map(function (ev) {
        var start = eventStart(ev), end = eventEnd(ev);
        var range = start !== end ? ' · ' + esc(start) + '–' + esc(end) : '';
        return '<article class="agenda-item"><span class="agenda-mark ' + ev.kind + '"></span><div><h4>' + esc(ev.title) + '</h4><p>' + esc(ev.sourceLabel) + range + (ev.school ? ' · ' + esc(ev.school) : '') + (ev.notes ? ' · ' + esc(ev.notes) : '') + '</p>' + (ev.url ? '<a href="' + esc(ev.url) + '" target="_blank" rel="noopener">查看原始公告 ↗</a>' : '') + (ev.kind === "user" ? '<div class="event-actions"><button type="button" class="btn-ghost" data-edit-event="' + esc(ev.id) + '">編輯</button><button type="button" class="btn-ghost" data-delete-event="' + esc(ev.id) + '">刪除</button></div>' : '') + '</div></article>';
      }).join("") : '<p class="empty">這天沒有事件。選一個日期，或新增自己的事件。</p>';
      Array.prototype.forEach.call(el.agenda.querySelectorAll("button[data-edit-event]"), function (button) {
        button.addEventListener("click", function () {
          editUserEvent(button.dataset.editEvent);
        });
      });
      Array.prototype.forEach.call(el.agenda.querySelectorAll("button[data-delete-event]"), function (button) {
        button.addEventListener("click", function () {
          removeUserEvent(button.dataset.deleteEvent);
        });
      });
    }
    function loadOfficialEvents() {
      return fetch("data/calendar-events.json?_=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
        state.officialEvents = Array.isArray(rows) ? rows.filter(function (ev) { return ev && ev.date && ev.title && ev.provenance; }) : [];
        if (state.tab === "calendar") renderCalendar();
      }).catch(function () {});
    }
    function cardHTML(it) {
      var schoolClass = it.school === "cysh" ? "tag-cysh" : "tag-cygsh";
      var catClass = it.category === "榮譽榜" ? " cat-honor" : "";
      return '<article class="card' + catClass + '">' +
        (isUnread(it) ? '<span class="new-dot" title="未讀公告"></span>' : "") +
        '<div class="card-meta">' +
        '<span>' + esc(displayDate(it)) + '</span>' +
        '<span class="tag ' + schoolClass + '">' + esc(it.school_name) + '</span>' +
        '<span class="tag tag-cat">' + esc(it.category) + '</span>' +
        '<span class="read-state ' + (isUnread(it) ? 'is-unread' : '') + '">' + (isUnread(it) ? '未讀' : '已讀') + '</span>' +
        (isUnread(it) ? '<button type="button" class="mark-read" data-read-id="' + esc(it.id) + '">標記已讀</button>' : '') +
        '</div>' +
        '<h3 class="card-title"><a href="' + esc(it.url) + '" target="_blank" rel="noopener">' +
        esc(it.title) + '</a></h3>' +
        (it.snippet ? '<p class="card-snippet">' + esc(it.snippet) + '</p>' : "") +
        '</article>';
    }
    function renderImportant() {
      if (!el.importantList) return;
      var items = state.data ? state.data.items.filter(isExplicitlyImportant).slice(0, 3) : [];
      el.importantList.innerHTML = items.length ? items.map(function (it) {
        return '<article class="important-card"><span class="important-mark" aria-hidden="true">!</span><div><strong><a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.title) + '</a></strong><p>' + esc(it.school_name) + ' · ' + esc(displayDate(it)) + '</p></div></article>';
      }).join("") : '<p class="hint">目前沒有來源明確標記的重要公告。</p>';
    }
    function renderList(container, items, emptyMsg) {
      container.innerHTML = items.length
        ? items.map(cardHTML).join("")
        : '<p class="empty">' + emptyMsg + '</p>';
    }
    function renderLatest() {
      var items = latestItems();
      var shown = Math.min(state.shown, items.length);
      var rest = items.length - shown;
      el.countLine.textContent = (rest > 0
        ? "共 " + items.length + " 則公告(已顯示 " + shown + " 則)"
        : "共 " + items.length + " 則公告")
        + (state.archive === "loading" ? " · 搜尋歷史資料中…" : "");
      renderList(el.list, items.slice(0, shown),
        "找不到符合條件的公告,換個關鍵字或篩選試試。");
      if (rest > 0) {
        el.list.insertAdjacentHTML("beforeend",
          '<div class="more-wrap"><button type="button" id="btnMore" class="btn-ghost">' +
          "載入更多(還有 " + rest + " 則)</button></div>");
      }
    }
    function resetPaging() { state.shown = PAGE_SIZE; }
    function renderSub() {
      syncSubscriptions();
      var msg = state.subscriptions.length
        ? "目前沒有符合訂閱關鍵字的公告。"
        : "先在上方新增關鍵字,開始追蹤你在意的消息。";
      renderList(el.subList, subItems(), msg);
      renderKwChips();
    }
    function renderKwChips() {
      syncSubscriptions();
      el.kwChips.innerHTML = state.subscriptions.map(function (sub) {
        return '<span class="kw-chip">' + esc(sub.keyword) +
          '<button type="button" data-id="' + esc(sub.id) + '" aria-label="移除 ' + esc(sub.keyword) + '">×</button></span>';
      }).join("");
    }
    function renderControls() {
      var schools = [{ id: "all", short: "全部" }].concat(state.data.schools);
      el.schoolSeg.innerHTML = schools.map(function (s) {
        return '<button data-school="' + s.id + '"' +
          (state.school === s.id ? ' class="is-active"' : "") + ">" + esc(s.short) + "</button>";
      }).join("");

      var used = {};
      state.data.items.forEach(function (it) { used[it.category] = true; });
      var cats = ["all"].concat(state.data.categories.filter(function (c) { return used[c]; }));
      el.catChips.innerHTML = cats.map(function (c) {
        var label = c === "all" ? "全部分類" : c;
        return '<button class="chip' + (state.cat === c ? " is-active" : "") +
          '" data-cat="' + esc(c) + '">' + esc(label) + "</button>";
      }).join("");
    }
    function renderBadge() {
      var n = newSubCount();
      el.subBadge.hidden = n === 0;
      el.subBadge.textContent = n > 99 ? "99+" : String(n);
    }
    function renderUpdatedAt() {
      if (!state.data || !state.data.generated_at) return;
      var t = state.data.generated_at.replace("T", " ").slice(5, 16);
      el.updatedAt.textContent = "更新於 " + t;
    }
    function renderAll() {
      if (!state.data) return;
      renderControls();
      renderImportant();
      renderLatest();
      renderSub();
      renderBadge();
      renderUpdatedAt();
    }

    /* ── 通知 ── */
    function refreshNotifyState() {
      if (!("Notification" in window)) {
        el.btnNotify.hidden = true;
        el.notifyState.textContent = "此瀏覽器不支援通知";
        return;
      }
      if (window.Notification.permission === "granted") {
        el.btnNotify.hidden = true;
        el.notifyState.textContent = "通知已開啟:開啟本站時若有訂閱新訊會提醒你";
      } else if (window.Notification.permission === "denied") {
        el.btnNotify.hidden = true;
        el.notifyState.textContent = "通知已被封鎖,可到瀏覽器設定重新允許";
      } else {
        el.btnNotify.hidden = false;
        el.notifyState.textContent = "";
      }
    }
    function processFreshRecentNotifications(recentItems) {
      if (!("Notification" in window) || window.Notification.permission !== "granted") return;
      var candidates = NotificationState.findCandidates(recentItems, notificationState, itemText);
      if (!candidates.length) return;
      try {
        new window.Notification("嘉校快訊", {
          body: "有 " + candidates.length + " 則符合訂閱關鍵字的新公告",
          icon: "icons/icon-192.png",
        });
        /* 只有 Notification 建立成功後才寫入 IDs 與 first_seen 水位。 */
        NotificationState.markNotified(notificationState, candidates);
      } catch (e) { /* 通知建立失敗時不可寫入 notifiedIds */ }
    }

    /* ── 事件 ── */
    el.q.addEventListener("input", function () {
      state.q = el.q.value.trim();
      if (state.q) ensureArchive();
      resetPaging(); renderLatest();
    });
    el.schoolSeg.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-school]");
      if (!b) return;
      state.school = b.dataset.school;
      resetPaging(); renderControls(); renderLatest();
    });
    el.catChips.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-cat]");
      if (!b) return;
      state.cat = b.dataset.cat;
      if (state.cat !== "all") ensureArchive(); /* 分類瀏覽超出近一年範圍時需要完整資料 */
      resetPaging(); renderControls(); renderLatest();
    });
    function markRead(id) {
      var readAt = new Date().toISOString();
      state.reads[id] = readAt;
      saveReads();
      queueAccountMutation("read.upsert", { announcement_id: id, read_at: readAt });
      renderLatest(); renderSub();
    }
    el.list.addEventListener("click", function (e) {
      var readButton = e.target.closest("button[data-read-id]");
      if (readButton) {
        markRead(readButton.dataset.readId);
        return;
      }
      if (!e.target.closest("#btnMore")) return;
      state.shown += PAGE_SIZE;
      renderLatest();
      // 重新渲染後按鈕是新的節點,把焦點移回去,鍵盤操作才不會跳掉
      var next = document.getElementById("btnMore");
      if (next) next.focus();
    });
    el.subList.addEventListener("click", function (e) {
      var readButton = e.target.closest("button[data-read-id]");
      if (readButton) markRead(readButton.dataset.readId);
    });
    el.kwForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var kw = el.kwInput.value.trim();
      var added = NotificationState.addSubscription(notificationState, kw);
      if (!added) { el.kwInput.value = ""; return; }
      NotificationState.save(notificationState);
      queueAccountMutation("subscription.upsert", added);
      syncSubscriptions();
      el.kwInput.value = "";
      renderSub(); renderBadge();
    });
    el.kwChips.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-id]");
      if (!b) return;
      if (NotificationState.removeSubscription(notificationState, b.dataset.id)) {
        NotificationState.save(notificationState);
        queueAccountMutation("subscription.delete", { id: b.dataset.id, keyword: b.closest(".kw-chip").textContent.replace("×", "").trim(), deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      }
      syncSubscriptions();
      renderSub(); renderBadge();
    });
    el.btnNotify.addEventListener("click", function () {
      if (!("Notification" in window)) return;
      var permission = window.Notification.requestPermission();
      Promise.resolve(permission).then(function () {
        refreshNotifyState();
        /* 等待下一次成功的近期資料網路載入,此處不觸發通知。 */
      });
    });
    el.btnRefresh.addEventListener("click", function () {
      var before = state.data && state.data.generated_at;
      fetchData().then(function () {
        if (state.data && before && state.data.generated_at === before) {
          /* 資料沒變:誠實告知不是壞掉,是還沒到下一輪更新 */
          el.updatedAt.textContent =
            "已是最新(每小時自動更新,上次 " + before.slice(11, 16) + ")";
          setTimeout(renderUpdatedAt, 3000);
        }
      });
    });

    function switchTab(tab) {
      state.tab = tab;
      var latest = tab === "latest";
      el.viewLatest.hidden = !latest;
      if (el.viewCalendar) el.viewCalendar.hidden = tab !== "calendar";
      el.viewSub.hidden = tab !== "sub";
      el.tabLatest.classList.toggle("is-active", latest);
      if (el.tabCalendar) el.tabCalendar.classList.toggle("is-active", tab === "calendar");
      el.tabSub.classList.toggle("is-active", !latest);
      el.tabLatest.setAttribute("aria-current", latest ? "page" : "false");
      if (el.tabCalendar) el.tabCalendar.setAttribute("aria-current", tab === "calendar" ? "page" : "false");
      el.tabSub.setAttribute("aria-current", latest ? "false" : "page");
      if (tab === "calendar" && el.viewCalendar) { loadOfficialEvents(); renderCalendar(); }
      if (tab === "sub") {
        renderSub();
        // 看過訂閱頁後,把 UI「新」的基準點推進到現在;不影響通知去重。
        state.lastSeen = new Date().toISOString();
        localStorage.setItem(LS_SEEN, state.lastSeen);
        setTimeout(renderBadge, 400);
      }
      window.scrollTo(0, 0);
    }
    el.tabLatest.addEventListener("click", function () { switchTab("latest"); });
    el.tabSub.addEventListener("click", function () { switchTab("sub"); });
    if (el.tabCalendar) {
      el.tabCalendar.addEventListener("click", function () { switchTab("calendar"); });
      el.quickCalendar.addEventListener("click", function () { switchTab("calendar"); });
      el.calendarGrid.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-day]"); if (!b) return;
        state.calendarSelected = b.dataset.day; renderCalendar();
      });
      el.prevMonth.addEventListener("click", function () { state.calendarMonth.setMonth(state.calendarMonth.getMonth() - 1); renderCalendar(); });
      el.nextMonth.addEventListener("click", function () { state.calendarMonth.setMonth(state.calendarMonth.getMonth() + 1); renderCalendar(); });
      el.todayCalendar.addEventListener("click", function () { var now = new Date(); state.calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1); state.calendarSelected = now.toISOString().slice(0, 10); renderCalendar(); });
    el.addEvent.addEventListener("click", function () { state.eventEditingId = null; el.eventFormTitle.textContent = "新增自己的事件"; el.eventDate.value = state.calendarSelected; el.eventFormWrap.hidden = false; el.eventTitle.focus(); });
      el.cancelEvent.addEventListener("click", function () { el.eventFormWrap.hidden = true; });
      el.eventFormWrap.addEventListener("click", function (e) { if (e.target === el.eventFormWrap) el.eventFormWrap.hidden = true; });
      el.eventForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var title = el.eventTitle.value.trim(), date = el.eventDate.value || el.eventForm.dataset.editingDate;
        if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        var editingId = state.eventEditingId || el.eventForm.dataset.editingId;
        var eventId = editingId || "user:" + Date.now().toString(36);
        state.userEvents = CalendarState ? CalendarState.upsert(state.userEvents, { id: eventId, title: title, date: date, notes: el.eventNotes.value.trim() }) : state.userEvents;
        state.eventEditingId = null; el.eventForm.dataset.editingId = ""; el.eventForm.dataset.editingDate = "";
        saveUserEvents(); state.calendarSelected = date; state.calendarMonth = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1);
        el.eventForm.reset(); el.eventFormWrap.hidden = true; renderCalendar();
      });
    }

    /* ── PWA ── */
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js?v=17").catch(function () {});
      });
    }

    if (window.__CYNEWS_TEST__) {
      window.__cyNewsAppTest = {
        fetchData: fetchData,
        ensureArchive: ensureArchive,
        renderAll: renderAll,
        processFreshRecentNotifications: processFreshRecentNotifications,
        getState: function () { return state; },
        getNotificationState: function () { return notificationState; },
      };
    }

    refreshNotifyState();
    setupAccountSync();
    fetchData();
  }

  loadNotificationStateScript(startApp);
})();
