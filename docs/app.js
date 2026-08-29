Warning: truncated output (original token count: 26194)
Total output lines: 1803

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
    var LS_SCHOOL = "cyNews.school.v1";
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
    var createTaskReminder = function () { return Promise.reject(new Error("account not ready")); };
    var accountAuth = null;

    var state = {
      data: null,
      school: loadSchool(),
      cat: "all",
      q: "",
      tab: "home",
      calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      calendarSelected: new Date().toISOString().slice(0, 10),
      eventEditingId: null,
      officialEvents: [],
      calendarStatus: "partial",
      userEvents: loadUserEvents(),
      reads: loadReads(),
      shown: PAGE_SIZE,
      archive: "none",  /* none | loading | loaded:歷史封存資料的載入狀態 */
      archivePromise: null,
      subscriptions: notificationState.subscriptions,
      tasks: [],
      profile: window.CyNewsProfile ? window.CyNewsProfile.empty() : {},
      accountUser: null,
      nickname: "",
      assistantFeedback: window.CyNewsAssistantFeedback ? window.CyNewsAssistantFeedback.normalize({}) : {},
      assistantAnswer: null,
      assistantScope: "preferred",
      assistantItems: {},
      personalizedNotifications: false,
      reminderPreset: "single",
      reminderCustomOffsets: "1",
      reminderRules: [],
      reminderDeviceActive: false,
      activeAccountId: "anonymous",
      lastSeen: localStorage.getItem(LS_SEEN) || "",
      detailCache: {},
      detailRequestGeneration: 0,
    };

    var $ = function (id) { return document.getElementById(id); };
    var el = {
      list: $("list"), subList: $("subList"), countLine: $("countLine"),
      updatedAt: $("updatedAt"), q: $("q"),
      schoolFilter: $("schoolFilter"), catChips: $("catChips"),
      viewHome: $("viewHome"), viewToday: $("viewToday"), viewLatest: $("viewLatest"), viewAssistant: $("viewAssistant"), viewSub: $("viewSub"),
      tabHome: $("tabHome"), tabToday: $("tabToday"), tabLatest: $("tabLatest"), tabAssistant: $("tabAssistant"), tabSub: $("tabSub"), subBadge: $("subBadge"),
      kwForm: $("kwForm"), kwInput: $("kwInput"), kwChips: $("kwChips"),
      btnNotify: $("btnNotify"), notifyState: $("notifyState"),
      reminderPushToggle: $("reminderPushToggle"), reminderPushState: $("reminderPushState"),
      reminderPreset: $("reminderPreset"), nextReminder: $("nextReminder"),
      reminderCustomWrap: $("reminderCustomWrap"), reminderCustomOffsets: $("reminderCustomOffsets"),
      btnRefresh: $("btnRefresh"), refreshState: $("refreshState"),
      accountState: $("accountState"), accountEmail: $("accountEmail"), accountLogin: $("accountLogin"), accountSwitch: $("accountSwitch"),
      accountLogout: $("accountLogout"),
      viewCalendar: $("viewCalendar"), tabCalendar: $("tabCalendar"), quickCalendar: $("quickCalendar"),
      calendarTitle: $("calendarTitle"), calendarGrid: $("calendarGrid"), agenda: $("agenda"), agendaTitle: $("agendaTitle"),
      prevMonth: $("prevMonth"), nextMonth: $("nextMonth"), todayCalendar: $("todayCalendar"),
      addEvent: $("addEvent"), eventFormWrap: $("eventFormWrap"), eventForm: $("eventForm"), cancelEvent: $("cancelEvent"),
      eventTitle: $("eventTitle"), eventDate: $("eventDate"), eventNotes: $("eventNotes"),
      eventFormTitle: $("eventFormTitle"),
      importantList: $("importantList"),
      welcomeTitle: $("welcomeTitle"), assistantForm: $("assistantForm"), assistantQuestion: $("assistantQuestion"),
      assistantAsk: $("assistantAsk"), assistantScope: $("assistantScope"), assistantStatus: $("assistantStatus"), assistantAnswer: $("assistantAnswer"),
      profileBox: $("profileBox"), profileHint: $("profileHint"), profileForm: $("profileForm"),
      profileNickname: $("profileNickname"),
      profileSchool: $("profileSchool"), profileGrade: $("profileGrade"), profileClass: $("profileClass"),
      profileInterests: $("profileInterests"), profileCategories: $("profileCategories"), profileKeywords: $("profileKeywords"),
      profileSave: $("profileSave"), profileStatus: $("profileStatus"), personalizedToggle: $("personalizedToggle"),
      tasksBox: $("tasksBox"), taskForm: $("taskForm"), taskTitle: $("taskTitle"), taskDue: $("taskDue"),
      taskPriority: $("taskPriority"), taskNotes: $("taskNotes"), taskSave: $("taskSave"), taskCancel: $("taskCancel"),
      taskStatus: $("taskStatus"), taskOpenList: $("taskOpenList"), taskDoneList: $("taskDoneList"),
      taskComposerToggle: $("taskComposerToggle"), taskOpenCount: $("taskOpenCount"), taskDoneCount: $("taskDoneCount"),
      todayCoverage: $("todayCoverage"), todayBriefSummary: $("todayBriefSummary"), todayFocus: $("todayFocus"),
      todayEvents: $("todayEvents"), todayDeadlines: $("todayDeadlines"),
      todayTasks: $("todayTasks"), todayRelevant: $("todayRelevant"), todayEmpty: $("todayEmpty"),
      detailDialog: $("detailDialog"), detailTitle: $("detailTitle"), detailMeta: $("detailMeta"),
      detailBody: $("detailBody"), detailClose: $("detailClose"),
      nicknameDialog: $("nicknameDialog"), nicknameForm: $("nicknameForm"), nicknameInput: $("nicknameInput"),
      nicknameSchool: $("nicknameSchool"), nicknameLater: $("nicknameLater"), nicknameStatus: $("nicknameStatus"),
      navMenu: $("navMenu"), navMenuToggle: $("navMenuToggle"), navCurrentLabel: $("navCurrentLabel"),
    };

    function loadUserEvents() {
      try { var rows = JSON.parse(localStorage.getItem(LS_EVENTS) || "[]"); return CalendarState ? CalendarState.normalize(rows) : (Array.isArray(rows) ? rows : []); }
      catch (e) { return []; }
    }
    function loadReads() {
      try { var rows = JSON.parse(localStorage.getItem(LS_READS) || "{}"); return rows && typeof rows === "object" && !Array.isArray(rows) ? rows : {}; }
      catch (e) { return {}; }
    }
    function loadSchool() {
      var value = String(localStorage.getItem(LS_SCHOOL) || "all");
      return value === "all" || /^[a-z0-9-]{1,32}$/.test(value) ? value : "all";
    }
    function saveReads() { localStorage.setItem(LS_READS, JSON.stringify(state.reads)); }
    function saveUserEvents() {
      state.userEvents = CalendarState ? CalendarState.normalize(state.userEvents) : state.userEvents;
      localStorage.setItem(LS_EVENTS, JSON.stringify(state.userEvents));
    }
    function populateProfileSchools() {
      if (!el.profileSchool || !window.CyNewsSchoolRegistry) return;
      var current = el.profileSchool.value;
      var options = window.CyNewsSchoolRegistry.schools().map(function (school) {
        return '<option value="' + esc(school.id) + '">' + esc(school.short) + '</option>';
      }).join("");
      el.profileSchool.innerHTML = '<option value="">請選擇學校</option>' + options;
      el.profileSchool.value = current;
      if (el.nicknameSchool) {
        var onboardingCurrent = el.nicknameSchool.value;
        el.nicknameSchool.innerHTML = '<option value="">請選擇學校</option>' + options;
        el.nicknameSchool.value = onboardingCurrent;
      }
    }
    function preferredSchoolId() {
      var id = String(state.profile && state.profile.school_id || "");
      return window.CyNewsSchoolRegistry && window.CyNewsSchoolRegistry.find(id) ? id : "";
    }
    function applyPreferredSchool(id, reload) {
      id = String(id || "");
      if (!window.CyNewsSchoolRegistry || !window.CyNewsSchoolRegistry.find(id)) return false;
      var changed = state.school !== id;
      state.school = id;
      localStorage.setItem(LS_SCHOOL, id);
      if (el.assistantScope) el.assistantScope.options[0].textContent = "我的學校（" + window.CyNewsSchoolRegistry.find(id).short + "）";
      if (changed) {
        state.archive = "none";
        state.archivePromise = null;
        resetPaging();
        if (reload && state.data) fetchData(true);
      }
      return changed;
    }
    function renderGreeting() {
      if (!el.welcomeTitle) return;
      el.welcomeTitle.textContent = state.nickname ? "Hi, " + state.nickname + "。今天想先看什麼？" : "今天的校務資訊，從這裡開始。";
    }
    function renderProfile() {
      if (!el.profileForm || !window.CyNewsProfile) return;
      var profile = window.CyNewsProfile.toInputs(state.profile || {});
      if (el.profileNickname) el.profileNickname.value = state.nickname || "";
      el.profileSchool.value = profile.school_id || "";
      el.profileGrade.value = profile.grade_level || "";
      el.profileClass.value = profile.class_name || "";
      el.profileInterests.value = profile.interests_text || "";
      el.profileCategories.value = profile.tracked_categories_text || "";
      el.profileKeywords.value = profile.tracked_keywords_text || "";
    }
    function profileFromForm() {
      return window.CyNewsProfile.normalize({
        school_id: el.profileSchool.value,
        grade_level: el.profileGrade.value,
        class_name: el.profileClass.value,
        interests: el.profileInterests.value,
        tracked_categories: el.profileCategories.value,
        tracked_keywords: el.profileKeywords.value,
      });
    }
    function hasProfileContext(profile) {
      profile = profile || {};
      return !!(profile.school_id || profile.grade_level || (profile.interests || []).length ||
        (profile.tracked_categories || []).length || (profile.tracked_keywords || []).length);
    }
    function preferencePayload(overrides) {
      overrides = overrides || {};
      return {
        schema_version: 1,
        preferences: {
          profile: window.CyNewsProfile.normalize(Object.prototype.hasOwnProperty.call(overrides, "profile") ? overrides.profile : state.profile),
          notification_preferences: { personalized: Object.prototype.hasOwnProperty.call(overrides, "personalized") ? !!overrides.personalized : !!state.personalizedNotifications },
          reminder: { preset: overrides.reminderPreset || state.reminderPreset || "single",
            custom_offsets: Object.prototype.hasOwnProperty.call(overrides, "reminderCustomOffsets") ? overrides.reminderCustomOffsets : (state.reminderCustomOffsets || "1") },
          assistant_feedback: window.CyNewsAssistantFeedback ? window.CyNewsAssistantFeedback.normalize(state.assistantFeedback) : {},
        },
        updated_at: new Date().toISOString(),
      };
    }
    function recordAssistantFeedback(announcementId, action) {
      if (!window.CyNewsAssistantFeedback || !announcementId) return false;
      var previous = state.assistantFeedback;
      state.assistantFeedback = window.CyNewsAssistantFeedback.record(state.assistantFeedback, "announcement:" + announcementId, action);
      var result = queueAccountMutation("preferences.upsert", preferencePayload());
      if (!result) { state.assistantFeedback = previous; return false; }
      renderToday();
      return true;
    }
    function personalizedBaselineKey(accountId) {
      return "cyNews.personalizedThrough.v1:" + String(accountId || "anonymous");
    }
    function establishPersonalizedBaseline(accountId) {
      var key = personalizedBaselineKey(accountId);
      var existing = localStorage.getItem(key);
      if (!existing || isNaN(Date.parse(existing))) {
        existing = new Date().toISOString();
        localStorage.setItem(key, existing);
      }
      notificationState.personalizedThrough = existing;
      NotificationState.save(notificationState);
    }
    function renderPersonalizedSetting() {
      if (el.personalizedToggle) el.personalizedToggle.checked = !!state.personalizedNotifications;
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
      var auth = accountAuth || window.CyNewsAccountAuth.createController();
      accountAuth = auth;
      if (!auth.isConfigured()) {
        var accountBox = document.getElementById("accountBox");
        if (accountBox) accountBox.hidden = true;
        return;
      }
      var lifecycle = new window.CyNewsAccountSync.AccountLifecycle({
        subscriptions: notificationState.subscriptions,
        reads: Object.keys(state.reads).map(function (id) { return { announcement_id: id, read_at: state.reads[id] }; }),
        preferences: { schema_version: 1, preferences: { profile: window.CyNewsProfile.empty() } },
        tasks: state.tasks,
        reminderRules: state.reminderRules,
      }, localStorage);
      var syncGeneration = 0;
      var requestedUid = null;
      var readyUid = null;
      var accountPhase = "ANONYMOUS_READY";
      var pushManager = window.CyNewsPushSubscription ? window.CyNewsPushSubscription.createManager({ auth: auth }) : null;
      var reminderAdapter = window.CyNewsReminderRules ? window.CyNewsReminderRules.createAdapter({ auth: auth }) : null;
      function status(text) { el.accountState.textContent = text; }
      function setAccountUser(user) {
        state.accountUser = user || null;
        state.nickname = window.CyNewsAccountAuth ? window.CyNewsAccountAuth.displayName(user) : "";
        var email = window.CyNewsAccountAuth ? window.CyNewsAccountAuth.displayEmail(user) : "";
        if (el.accountEmail) {
          el.accountEmail.textContent = email ? "登入信箱：" + email : "";
          el.accountEmail.hidden = !email;
        }
        renderGreeting(); renderProfile();
      }
      function maybePromptNickname(user) {
        if (!user || !el.nicknameDialog || !el.nicknameInput) return;
        var metadata = user.user_metadata || {};
        var missingNickname = !window.CyNewsAccountAuth.normalizeNickname(metadata.nickname);
        var missingSchool = !preferredSchoolId();
        if (!missingNickname && !missingSchool) return;
        if (localStorage.getItem("cyNews.onboardingLater.v2:" + user.id) === "true") return;
        el.nicknameInput.value = state.nickname || "";
        if (el.nicknameSchool) el.nicknameSchool.value = preferredSchoolId();
        if (typeof el.nicknameDialog.showModal === "function" && !el.nicknameDialog.open) el.nicknameDialog.showModal();
      }
      function renderReminderPush() {
        if (!el.reminderPushToggle || !el.reminderPushState) return;
        if (!pushManager || !pushManager.supported()) {
          el.reminderPushToggle.hidden = true;
          el.reminderPushState.textContent = "尚未設定此環境的背景推播";
          return;
        }
        el.reminderPushToggle.hidden = false;
        el.reminderPushToggle.disabled = accountPhase !== "ACCOUNT_READY";
        if (accountPhase !== "ACCOUNT_READY") {
          el.reminderPushToggle.textContent = "在此裝置開啟";
          el.reminderPushState.textContent = "請先登入並完成同步";
          return;
        }
        pushManager.current().then(function (result) {
          state.reminderDeviceActive = !!result.active;
          el.reminderPushToggle.textContent = result.active ? "在此裝置關閉" : "在此裝置開啟";
          el.reminderPushState.textContent = result.active ? "背景推播已開啟" : "背景推播未開啟";
          el.reminderPushToggle.dataset.active = result.active ? "true" : "false";
          renderKwChips();
        }).catch(function () { state.reminderDeviceActive = false; el.reminderPushState.textContent = "無法讀取此裝置推播狀態"; renderKwChips(); });
      }
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
      function publishState(merged, accountId) {
        state.activeAccountId = accountId || "anonymous";
        notificationState.subscriptions = projectSubscriptions(merged.subscriptions);
        state.reads = {};
        (merged.reads || []).forEach(function (row) { if (row && row.announcement_id && row.read_at) state.reads[row.announcement_id] = row.read_at; });
        saveReads();
        NotificationState.save(notificationState);
        state.profile = window.CyNewsProfile.normalize(merged.preferences && merged.preferences.preferences && merged.preferences.preferences.profile);
        var schoolChanged = applyPreferredSchool(state.profile.school_id, false);
        state.assistantFeedback = window.CyNewsAssistantFeedback ? window.CyNewsAssistantFeedback.normalize(
          merged.preferences && merged.preferences.preferences && merged.preferences.preferences.assistant_feedback) : {};
        state.tasks = window.CyNewsTaskState ? window.CyNewsTaskState.visible(merged.tasks || []) : [];
        var notificationPreferences = merged.preferences && merged.preferences.preferences && merged.preferences.preferences.notification_preferences;
        state.personalizedNotifications = !!(notificationPreferences && notificationPreferences.personalized);
        var reminderPreferences = merged.preferences && merged.preferences.preferences && merged.preferences.preferences.reminder;
        state.reminderPreset = reminderPreferences && ["single", "standard", "dense", "custom"].indexOf(reminderPreferences.preset) !== -1 ? reminderPreferences.preset : "single";
        state.reminderCustomOffsets = reminderPreferences && typeof reminderPreferences.custom_offsets === "string" ? reminderPreferences.custom_offsets : "1";
        state.reminderRules = [];
        if (el.reminderPreset) el.reminderPreset.value = state.reminderPreset;
        if (el.reminderCustomOffsets) el.reminderCustomOffsets.value = state.reminderCustomOffsets;
        if (el.reminderCustomWrap) el.reminderCustomWrap.hidden = state.reminderPreset !== "custom";
        establishPersonalizedBaseline(accountId || "anonymous");
        renderProfile();
        renderPersonalizedSetting();
        renderLatest(); renderSub(); renderTasks(); renderToday(); renderBadge();
        renderReminderPush();
        if (schoolChanged && state.data) fetchData(true);
        if (accountId && accountId !== "anonymous" && reminderAdapter) {
          var reminderGeneration = syncGeneration;
          reminderAdapter.listRules().then(function (rows) {
            if (reminderGeneration !== syncGeneration || readyUid !== accountId) return;
            state.reminderRules = rows;
            renderToday(); renderKwChips();
          }).catch(function () {
            if (reminderGeneration !== syncGeneration) return;
            state.reminderRules = [];
            if (el.reminderPushState) el.reminderPushState.textContent = "提醒規則暫時無法讀取";
          });
        }
        return merged;
      }
      function clearAccountOwnedView() {
        notificationState.subscriptions = [];
        state.reads = {};
        saveReads();
        NotificationState.save(notificationState);
        state.profile = window.CyNewsProfile.empty();
        state.assistantFeedback = window.CyNewsAssistantFeedback ? window.CyNewsAssistantFeedback.normalize({}) : {};
        state.tasks = [];
        state.personalizedNotifications = false;
        state.reminderPreset = "single";
        state.reminderCustomOffsets = "1";
        state.reminderRules = [];
        state.reminderDeviceActive = false;
        state.school = "all";
        state.archive = "none";
        state.archivePromise = null;
        if (el.reminderPreset) el.reminderPreset.value = "single";
        state.activeAccountId = "anonymous";
        establishPersonalizedBaseline("anonymous");
        renderProfile();
        renderPersonalizedSetting();
        renderLatest(); renderSub(); renderTasks(); renderToday(); renderBadge();
        renderReminderPush();
      }
      function restoreAnonymous() {
        syncGeneration += 1;
        var anonymousState = lifecycle.logout();
        requestedUid = null;
        readyUid = null;
        accountPhase = "ANONYMOUS_READY";
        state.school = "all";
        localStorage.setItem(LS_SCHOOL, "all");
        state.archive = "none";
        state.archivePromise = null;
        publishState(anonymousState, "anonymous");
        if (state.data) fetchData(true);
      }
      function sync(uid, authRetry) {
        authRetry = authRetry || 0;
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
          publishState(merged, uid);
          status("已同步");
          el.accountLogin.hidden = true;
          if (el.accountSwitch) el.accountSwitch.hidden = false;
          el.accountLogout.hidden = false;
          maybePromptNickname(state.accountUser);
          renderReminderPush();
        }).catch(function () {
          if (generation !== syncGeneration || requestedUid !== uid) return;
          /* An OAuth callback can expose a server-verified user a fraction before
             the data client begins attaching its bearer credential. Retry once in
             place; never publish another account or make this an endless loop. */
          if (!merged && authRetry === 0) {
            status("同步中");
            setTimeout(function () {
              if (generation === syncGeneration && requestedUid === uid) sync(uid, 1);
            }, 300);
            return;
          }
          if (merged) {
            readyUid = uid;
            accountPhase = "ACCOUNT_READY";
            publishState(merged, uid);
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
        if (type === "preferences.upsert" && payload && payload.preferences && payload.preferences.profile && lifecycle.active_account_id === window.CyNewsAccountSync.ANONYMOUS_ACCOUNT) return null;
        if (lifecycle.active_account_id === window.CyNewsAccountSync.ANONYMOUS_ACCOUNT) {
          if (accountPhase === "ANONYMOUS_READY") return lifecycle.applyMutation(type, payload);
          return null;
        }
        if (accountPhase !== "ACCOUNT_READY" || !readyUid || lifecycle.active_account_id !== readyUid) return null;
        var next = lifecycle.applyMutation(type, payload);
        new window.CyNewsAccountSync.Outbox(localStorage, readyUid).enqueue({ type: type, payload: payload });
        status("等待同步");
        return next;
      };
      createTaskReminder = function (task) {
        if (accountPhase !== "ACCOUNT_READY" || !reminderAdapter) return Promise.reject(new Error("account not ready"));
        return reminderAdapter.upsertTask(task, state.reminderPreset, state.reminderCustomOffsets);
      };
      function handleVerifiedSession() {
        return auth.getVerifiedSession().then(function (session) {
          var uid = session && session.user && session.user.id;
          if (typeof uid === "string" && uid) {
            setAccountUser(session.user);
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
            setAccountUser(null);
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
        var detach = pushManager ? pushManager.disable() : Promise.resolve();
        detach.then(function () { return auth.signInWithGoogle({ forceAccountChooser: true }); }).then(function (result) {
          if (result && result.error) throw result.error;
        }).catch(function () { status("切換前無法安全停用此裝置推播，請稍後再試"); handleVerifiedSession().catch(function () {}); });
      });
      el.accountLogout.addEventListener("click", function () {
        syncGeneration += 1;
        requestedUid = null;
        readyUid = null;
        accountPhase = "AUTHENTICATING";
        clearAccountOwnedView();
        status("同步中");
        var detach = pushManager ? pushManager.disable() : Promise.resolve();
        detach.then(function () { return auth.signOut(); }).then(function () {
          restoreAnonymous();
          setAccountUser(null);
          status("未登入"); el.accountLogin.hidden = false;
          if (el.accountSwitch) el.accountSwitch.hidden = true;
          el.accountLogout.hidden = true;
        }).catch(function () { status("登出前無法安全停用此裝置推播，請稍後再試"); });
      });
      /* Subscribe before the first session read. On an OAuth callback the client
         begins exchanging the URL grant as it is constructed; registering after
         the first read can miss that one SIGNED_IN event and leave the page at
         "已登入・同步待完成" until a manual reload. */
      auth.onAuthStateChange(function () { handleVerifiedSession().catch(function () {}); }).catch(function () {});
      auth.getClient().then(function () { return handleVerifiedSession(); })
        .catch(function () { status("未登入"); });

      if (el.reminderPushToggle) el.reminderPushToggle.addEventListener("click", function () {
        if (!pushManager || accountPhase !== "ACCOUNT_READY") return;
        el.reminderPushToggle.disabled = true;
        el.reminderPushState.textContent = "更新此裝置中";
        var action = el.reminderPushToggle.dataset.active === "true" ? pushManager.disable() : pushManager.enable();
        action.then(renderReminderPush).catch(function (error) {
          el.reminderPushToggle.disabled = false;
          el.reminderPushState.textContent = /denied/.test(String(error && error.message)) ? "通知權限已被封鎖" : "推播設定失敗，請稍後再試";
        });
      });
      renderReminderPush();
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

    function fetchManifest() {
      return fetch("data/schools/manifest.json?_=" + Date.now(), { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    }

    function currentDataRequest() {
      if (state.school === "all") return Promise.resolve({ url: "data/announcements.json", manifest: null });
      return fetchManifest().then(function (manifest) {
        var school = (manifest.schools || []).find(function (row) { return row.id === state.school; });
        if (!school || !school.current) throw new Error("unknown school shard");
        return { url: school.current, manifest: manifest };
      }).catch(function () {
        return { url: "data/announcements.json", manifest: null };
      });
    }

    function normalizeCurrentData(data, manifest) {
      if (!manifest || !data.school) return data;
      data.schools = manifest.schools || [];
      data.categories = manifest.categories || [];
      data.category_slugs = manifest.category_slugs || {};
      return data;
    }

    function fetchData(skipNotifications) {
      return currentDataRequest().then(function (request) {
        return fetch(request.url + "?_=" + Date.now(), { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.json().then(function (data) {
            return { data: normalizeCurrentData(data, request.manifest), freshNetwork: isFreshNetworkResponse(r) };
          });
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
          if (result.freshNetwork && !skipNotifications) processFreshRecentNotifications(recentItems);
          return { ok: true, freshNetwork: result.freshNetwork, generatedAt: data.generated_at || "" };
        })
        .catch(function () {
          if (!state.data) {
            el.list.innerHTML = '<p class="empty">目前離線且尚無快取資料,連上網路後再試一次。</p>';
          }
          return { ok: false, freshNetwork: false, generatedAt: state.data && state.data.generated_at || "" };
        });
    }

    var STAGING_REFRESH_ORIGIN = "https://cy-school-news-staging.vercel.app";
    function stagingRefreshEndpoint() {
      if (!window.location || window.location.origin !== STAGING_REFRESH_ORIGIN) return null;
      var config = window.CYNEWS_ACCOUNT_CONFIG || {};
      if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
      try {
        var base = new URL(config.supabaseUrl);
        if (base.protocol !== "https:" || base.username || base.password || !/\.supabase\.co$/i.test(base.hostname)) return null;
        return {
          url: base.origin + "/functions/v1/request-staging-refresh",
          anonKey: String(config.supabaseAnonKey),
        };
      } catch (_) {
        return null;
      }
    }

    function requestStagingRefresh(endpoint) {
      if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
        return Promise.resolve({ status: "unavailable" });
      }
      if (!accountAuth && window.CyNewsAccountAuth) accountAuth = window.CyNewsAccountAuth.createController();
      if (!accountAuth || !accountAuth.isConfigured() || typeof accountAuth.getVerifiedSession !== "function") {
        return Promise.resolve({ status: "unavailable" });
      }
      return accountAuth.getVerifiedSession().then(function (session) {
        if (!session || !session.access_token || !session.user || !session.user.id) return { status: "unauthenticated" };
        return fetch(endpoint.url, {
          method: "POST",
          cache: "no-store",
          headers: {
            "content-type": "application/json",
            apikey: endpoint.anonKey,
            authorization: "Bearer " + session.access_token,
            "x-idempotency-key": window.crypto.randomUUID(),
          },
          body: "{}",
        }).then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (body) {
            if (response.status === 429 || body.status === "rate_limited") {
              return { status: "rate_limited", retryAfterSeconds: Number(body.retryAfterSeconds) || 0 };
            }
            if (!response.ok || ["accepted", "already_requested"].indexOf(body.status) === -1) {
              return { status: "unavailable" };
            }
            return { status: body.status };
          });
        });
      }).catch(function () { return { status: "unavailable" }; });
    }

    function generationAdvanced(before, after) {
      var afterTime = Date.parse(after || "");
      if (!Number.isFinite(afterTime)) return false;
      if (!before) return true;
      var beforeTime = Date.parse(before);
      return Number.isFinite(beforeTime) ? afterTime > beforeTime : after !== before;
    }

    function pollPublishedGeneration(before) {
      var delays = window.__CYNEWS_TEST__ ? [0, 0, 0] : [5000, 10000, 15000, 20000, 30000, 30000];
      function poll(index) {
        if (index >= delays.length) return Promise.resolve({ status: "pending" });
        return new Promise(function (resolve) { setTimeout(resolve, delays[index]); }).then(fetchData).then(function (result) {
          if (result && result.ok && result.freshNetwork && generationAdvanced(before, result.generatedAt)) {
            return { status: "updated" };
          }
          return poll(index + 1);
        });
      }
      return poll(0);
    }

    /* 歷史封存資料:開站不載,搜尋或篩選時才背景載入一次 */
    function ensureArchive() {
      if (!state.data || state.archive === "loaded") return Promise.resolve(state.data);
      if (state.archive === "loading" && state.archivePromise) return state.archivePromise;
      state.archive = "loading";
      renderLatest();
      var archiveUrl = state.school === "all" ? "data/archive.json" : "data/schools/" + encodeURIComponent(state.school) + "/archive.json";
      state.archivePromise = …6194 tokens truncated…>還沒有待辦。</p>';
      el.todayRelevant.innerHTML = projection.relevantAnnouncements.length ? projection.relevantAnnouncements.map(function (item) { return '<div class="today-item"><div class="today-item-main"><div class="today-item-title">' + esc(displayTitle(item)) + '</div><div class="today-item-meta">' + esc(item.school_name || "公告") + '</div></div></div>'; }).join("") : '<p class="empty">設定我的資料後，這裡會顯示相關公告。</p>';
      var hasUseful = projection.todayEvents.length || upcoming.length || projection.openTasks.length || projection.relevantAnnouncements.length;
      el.todayEmpty.hidden = !!hasUseful;
    }
    function renderKwChips() {
      syncSubscriptions();
      var next = null;
      (state.reminderRules || []).forEach(function (rule) {
        var row = window.CyNewsReminderRules && window.CyNewsReminderRules.nextReminder(rule, new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }));
        if (row && (!next || row.date < next.date)) next = row;
      });
      var reminderStatus = window.CyNewsReminderRules ? window.CyNewsReminderRules.subscriptionStatus({
        notificationEnabled: typeof Notification !== "undefined" && Notification.permission === "granted",
        reminderEnabled: state.reminderDeviceActive,
        preset: state.reminderPreset,
        next: next ? new Date(next.date + "T00:00:00+08:00") : null,
      }) : null;
      el.kwChips.innerHTML = state.subscriptions.map(function (sub) {
        return '<span class="kw-chip">' + esc(sub.keyword) +
          (reminderStatus ? '<small> · ' + esc(reminderStatus.reminder) + ' · ' + esc(reminderStatus.preset) +
            (reminderStatus.next ? ' · 下次 ' + esc(reminderStatus.next.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })) : '') + '</small>' : '') +
          '<button type="button" data-id="' + esc(sub.id) + '" aria-label="移除 ' + esc(sub.keyword) + '">×</button></span>';
      }).join("");
    }
    function assistantDetail(item) {
      if (!item || !window.CyNewsDetailUI || !window.CyNewsDetailUI.validDetailRef(item.detail_ref)) return Promise.resolve(null);
      var key = String(item.id || "");
      if (state.detailCache[key]) return Promise.resolve(state.detailCache[key]);
      return fetch(item.detail_ref, { cache: "no-store" }).then(function (response) {
        if (!response.ok) return null;
        return response.json();
      }).then(function (record) {
        if (!record || String(record.announcement_id) !== key || record.provenance !== "official_article") return null;
        state.detailCache[key] = record;
        return record;
      }).catch(function () { return null; });
    }
    function fetchJsonItems(url) {
      return fetch(url + "?_=" + Date.now(), { cache: "no-store" }).then(function (response) {
        if (response.status === 404) return { items: [] };
        if (!response.ok) throw new Error("corpus HTTP " + response.status);
        return response.json();
      }).then(function (data) { return Array.isArray(data && data.items) ? data.items : []; });
    }
    function fetchAssistantCorpus(scopeId) {
      if (scopeId === state.school) return ensureArchive().then(function () { return state.data && state.data.items || []; });
      var current = scopeId === "all" ? "data/announcements.json" : "data/schools/" + encodeURIComponent(scopeId) + "/current.json";
      var archive = scopeId === "all" ? "data/archive.json" : "data/schools/" + encodeURIComponent(scopeId) + "/archive.json";
      return Promise.all([fetchJsonItems(current), fetchJsonItems(archive)]).then(function (parts) {
        var seen = {};
        return parts[0].concat(parts[1]).filter(function (item) {
          if (!item || !item.id || seen[item.id]) return false;
          seen[item.id] = true;
          return true;
        });
      });
    }
    function assistantScopeFor(question) {
      var mentioned = window.CyNewsSchoolRegistry && window.CyNewsSchoolRegistry.mentionedSchool(question);
      if (mentioned) return { id: mentioned.id, label: mentioned.short + "（依問題指定）" };
      if (el.assistantScope && el.assistantScope.value === "all") return { id: "all", label: "所有學校" };
      var preferred = preferredSchoolId() || (state.school !== "all" ? state.school : "all");
      var school = window.CyNewsSchoolRegistry && window.CyNewsSchoolRegistry.find(preferred);
      return { id: preferred, label: school ? school.short : "所有學校" };
    }
    function renderAssistantAnswer(result) {
      if (!el.assistantAnswer) return;
      state.assistantAnswer = result;
      if (!result || result.status !== "answered") {
        el.assistantAnswer.innerHTML = '<div class="assistant-empty"><h3>目前無法可靠回答</h3><p>' + esc(result && result.summary || "請換一種問法，或查看官方公告。") + '</p><small>可能原因：官方尚未公告、PDF 無文字層，或問題不在本站資料範圍。</small></div>';
        return;
      }
      var evidence = result.evidence.map(function (row, index) {
        return '<li><span class="assistant-evidence-rank">' + (index + 1) + '</span><div><strong class="assistant-evidence-title">' + esc(row.title || "官方公告") + '</strong><p>' + esc(row.text) + '</p><button type="button" class="btn-ghost" data-detail-id="' + esc(row.announcement_id) + '">查看這則官方依據</button></div></li>';
      }).join("");
      var sources = result.sources.slice(0, 5).map(function (item) {
        return '<button type="button" class="assistant-source" data-detail-id="' + esc(item.id) + '"><strong>' + esc(displayTitle(item)) + '</strong><small>' + esc((item.school_name || "官方公告") + " · " + displayDate(item)) + '</small></button>';
      }).join("");
      var answerLines = (result.answer_lines || []).map(function (line) { return '<li>' + esc(line) + '</li>'; }).join("");
      var directAnswer = answerLines ? '<h4>直接回答</h4><ul class="assistant-answer-lines">' + answerLines + '</ul>' : '';
      var limitation = result.limitation ? '<p class="assistant-limitation"><strong>資料限制：</strong>' + esc(result.limitation) + '</p>' : '';
      el.assistantAnswer.innerHTML = '<section class="assistant-result"><h3>整理結果</h3><p>' + esc(result.summary) + '</p>' + directAnswer + limitation + '<h4>我怎麼判斷</h4><ol class="assistant-evidence">' + evidence + '</ol><h4>參考公告</h4><div class="assistant-sources">' + sources + '</div><p class="assistant-disclaimer">採用類生成式問答流程整理，但每個結論都必須能回到官方原文；規定與日期仍以官方公告為準。</p></section>';
    }
    function askAssistant(question) {
      if (!window.CyNewsAssistantQA || !state.data) return Promise.resolve(null);
      question = String(question || "").trim().slice(0, 160);
      if (!question) return Promise.resolve(null);
      var scope = assistantScopeFor(question);
      if (el.assistantAsk) el.assistantAsk.disabled = true;
      if (el.assistantStatus) el.assistantStatus.textContent = "正在搜尋「" + scope.label + "」公告與官方附件文字…";
      return fetchAssistantCorpus(scope.id).then(function (items) {
        state.assistantItems = {};
        items.forEach(function (item) { state.assistantItems[String(item.id)] = item; });
        var candidates = window.CyNewsAssistantQA.rank(question, items, {}).slice(0, 8);
        return Promise.all(candidates.map(function (row) { return assistantDetail(row.item); })).then(function (records) {
          var details = {};
          records.forEach(function (record) { if (record && record.announcement_id) details[record.announcement_id] = record; });
          var result = window.CyNewsAssistantQA.answer(question, items, details);
          renderAssistantAnswer(result);
          if (el.assistantStatus) el.assistantStatus.textContent = result.status === "answered" ? "已從「" + scope.label + "」官方資料整理，請對照下方依據" : "「" + scope.label + "」沒有足夠官方證據，未產生猜測答案";
          return result;
        });
      }).catch(function () {
        var result = { status: "insufficient", summary: "目前無法讀取資料，請稍後再試。", evidence: [], sources: [] };
        renderAssistantAnswer(result);
        if (el.assistantStatus) el.assistantStatus.textContent = "資料讀取失敗";
        return result;
      }).finally(function () { if (el.assistantAsk) el.assistantAsk.disabled = false; });
    }
    function renderControls() {
      var schools = [{ id: "all", short: "所有學校" }].concat(state.data.schools || []);
      el.schoolFilter.innerHTML = schools.map(function (s) {
        return '<option value="' + esc(s.id) + '">' + esc(s.short) + "</option>";
      }).join("");
      el.schoolFilter.value = schools.some(function (s) { return s.id === state.school; }) ? state.school : "all";

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
      renderTasks();
      renderToday();
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
      var keywordCandidates = NotificationState.findCandidates(recentItems, notificationState, itemText);
      var personalizedCandidates = [];
      if (state.personalizedNotifications && hasProfileContext(state.profile) &&
          window.CyNewsRelevance && window.CyNewsSchoolRegistry &&
          NotificationState.findPersonalizedCandidates) {
        personalizedCandidates = NotificationState.findPersonalizedCandidates(
          recentItems, notificationState, state.profile,
          function (item, profile) {
            return window.CyNewsRelevance.calculate(item, profile, window.CyNewsSchoolRegistry);
          }
        );
      }
      var byId = {};
      keywordCandidates.forEach(function (item) { byId[item.id] = { item: item, keyword: true }; });
      personalizedCandidates.forEach(function (entry) {
        if (!byId[entry.item.id]) byId[entry.item.id] = { item: entry.item };
        byId[entry.item.id].personalized = true;
        byId[entry.item.id].relevance = entry.relevance;
      });
      var combined = Object.keys(byId).map(function (id) { return byId[id]; });
      var candidates = combined.map(function (entry) { return entry.item; });
      if (!candidates.length) return;
      try {
        var personalCount = combined.filter(function (entry) { return entry.personalized; }).length;
        var body = personalCount
          ? (personalCount === 1 ? "與你相關的新公告：" + candidates.find(function (item) { return byId[item.id].personalized; }).title :
            "有 " + personalCount + " 則與你相關的新公告")
          : "有 " + candidates.length + " 則符合訂閱關鍵字的新公告";
        new window.Notification("嘉校快訊", {
          body: body,
          icon: "icons/icon-192.png",
        });
        /* 只有 Notification 建立成功後才寫入 IDs 與 first_seen 水位。 */
        var keywordOnly = combined.filter(function (entry) { return entry.keyword; }).map(function (entry) { return entry.item; });
        var personalOnly = combined.filter(function (entry) { return entry.personalized; }).map(function (entry) {
          return { item: entry.item, relevance: entry.relevance };
        });
        if (keywordOnly.length) NotificationState.markNotified(notificationState, keywordOnly);
        if (personalOnly.length && NotificationState.markPersonalizedNotified) {
          NotificationState.markPersonalizedNotified(notificationState, personalOnly);
        }
      } catch (e) { /* 通知建立失敗時不可寫入 notifiedIds */ }
    }

    /* ── 事件 ── */
    el.q.addEventListener("input", function () {
      state.q = el.q.value.trim();
      if (state.q) ensureArchive();
      resetPaging(); renderLatest();
    });
    el.schoolFilter.addEventListener("change", function () {
      var selected = String(el.schoolFilter.value || "all");
      if (selected !== "all" && (!window.CyNewsSchoolRegistry || !window.CyNewsSchoolRegistry.find(selected))) {
        selected = "all";
      }
      state.school = selected;
      localStorage.setItem(LS_SCHOOL, state.school);
      state.archive = "none";
      state.archivePromise = null;
      resetPaging();
      fetchData(true).then(function () {
        if (state.q || state.cat !== "all") ensureArchive();
        if (state.tab === "today" || state.tab === "calendar") { loadOfficialEvents(); loadCalendarStatus(); }
      });
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
    function applyTask(type, payload) {
      var result = queueAccountMutation(type, payload);
      if (!result) { if (el.taskStatus) el.taskStatus.textContent = "請先完成登入同步"; return null; }
      state.tasks = window.CyNewsTaskState ? window.CyNewsTaskState.visible(result.tasks || []) : [];
      renderTasks(); renderToday();
      return result;
    }
    function editTask(id) {
      var task = (state.tasks || []).find(function (row) { return row.id === String(id); });
      if (!task || !el.taskForm) return;
      el.taskForm.dataset.editingId = task.id; el.taskTitle.value = task.title; el.taskDue.value = task.due_date || "";
      el.taskPriority.value = task.priority == null ? "" : String(task.priority); el.taskNotes.value = task.notes || "";
      setTaskComposer(true); el.taskSave.textContent = "儲存待辦"; el.taskTitle.focus();
    }
    function setTaskComposer(open) {
      if (!el.taskForm) return;
      el.taskForm.hidden = !open;
      if (el.taskComposerToggle) {
        el.taskComposerToggle.setAttribute("aria-expanded", open ? "true" : "false");
        el.taskComposerToggle.textContent = open ? "收起" : "新增待辦";
      }
      if (open) el.taskTitle.focus();
    }
    function resetTaskForm() {
      if (!el.taskForm) return;
      el.taskForm.reset(); el.taskForm.dataset.editingId = ""; el.taskSave.textContent = "新增待辦"; setTaskComposer(false);
    }
    function addAnnouncementTask(id) {
      var item = state.data && state.data.items.find(function (row) { return String(row.id) === String(id); });
      if (!item || !window.CyNewsTaskState) return;
      var task = window.CyNewsTaskState.fromAnnouncement(item);
      if (!task) return;
      var ok = typeof window.confirm === "function" ? window.confirm("要把「" + item.title + "」加入待辦嗎？") : true;
      if (!ok) return;
      if (applyTask("task.create", task)) {
        recordAssistantFeedback(item.id, "add_task");
        if (el.taskStatus) el.taskStatus.textContent = task.due_date ? "已加入待辦，已帶入驗證截止日" : "已加入待辦";
        switchTab("sub");
      }
    }
    el.list.addEventListener("click", function (e) {
      var detailButton = e.target.closest("button[data-detail-id]");
      if (detailButton) { openDetail(detailButton.dataset.detailId); return; }
      var addTaskButton = e.target.closest("button[data-add-task]");
      if (addTaskButton) { addAnnouncementTask(addTaskButton.dataset.addTask); return; }
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
      var detailButton = e.target.closest("button[data-detail-id]");
      if (detailButton) { openDetail(detailButton.dataset.detailId); return; }
      var readButton = e.target.closest("button[data-read-id]");
      if (readButton) markRead(readButton.dataset.readId);
    });
    if (el.detailClose) el.detailClose.addEventListener("click", closeDetailDialog);
    if (el.detailDialog) el.detailDialog.addEventListener("click", function (e) {
      if (e.target === el.detailDialog) closeDetailDialog();
    });
    if (el.assistantForm) el.assistantForm.addEventListener("submit", function (e) {
      e.preventDefault(); askAssistant(el.assistantQuestion.value);
    });
    if (el.viewAssistant) el.viewAssistant.addEventListener("click", function (e) {
      var example = e.target.closest("button[data-assistant-example]");
      if (example) { el.assistantQuestion.value = example.dataset.assistantExample; askAssistant(el.assistantQuestion.value); return; }
      var source = e.target.closest("button[data-detail-id]");
      if (source) openDetail(source.dataset.detailId);
    });
    function taskButtonHandler(e) {
      var button = e.target.closest("button"); if (!button) return;
      var id = button.dataset.taskComplete || button.dataset.taskReopen || button.dataset.taskEdit || button.dataset.taskDelete || button.dataset.taskReminder;
      if (!id) return;
      if (button.dataset.taskComplete) {
        var completing = (state.tasks || []).find(function (row) { return row.id === String(id); });
        if (applyTask("task.complete", { id: id }) && completing && completing.source_announcement_id) recordAssistantFeedback(completing.source_announcement_id, "complete");
      }
      else if (button.dataset.taskReopen) applyTask("task.reopen", { id: id });
      else if (button.dataset.taskEdit) editTask(id);
      else if (button.dataset.taskDelete) applyTask("task.delete", { id: id });
      else if (button.dataset.taskReminder) {
        var task = (state.tasks || []).find(function (row) { return row.id === String(id); });
        if (!task) return;
        if (el.taskStatus) el.taskStatus.textContent = "建立提醒中";
        createTaskReminder(task).then(function (result) {
          var next = result.next ? result.next.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "沒有尚未到達的提醒時間";
          if (el.taskStatus) el.taskStatus.textContent = "提醒已設定 · 下一次 " + next;
          if (el.nextReminder) el.nextReminder.textContent = "下一次提醒：" + next;
        }).catch(function (error) {
          if (el.taskStatus) el.taskStatus.textContent = /custom offsets/.test(String(error && error.message)) ? "請輸入 1–8 個有效提前天數" : "提醒設定失敗，請確認日期與登入狀態";
        });
      }
    }
    if (el.taskOpenList) el.taskOpenList.addEventListener("click", taskButtonHandler);
    if (el.taskDoneList) el.taskDoneList.addEventListener("click", taskButtonHandler);
    if (el.viewToday) el.viewToday.addEventListener("click", function (e) {
      var detailButton = e.target.closest("button[data-detail-id]");
      if (detailButton) { recordAssistantFeedback(detailButton.dataset.detailId, "view"); openDetail(detailButton.dataset.detailId); return; }
      var addTaskButton = e.target.closest("button[data-add-task]");
      if (addTaskButton) { addAnnouncementTask(addTaskButton.dataset.addTask); return; }
      var dismissButton = e.target.closest("button[data-focus-dismiss]");
      if (dismissButton) { recordAssistantFeedback(dismissButton.dataset.focusDismiss, "dismiss"); return; }
      taskButtonHandler(e);
    });
    if (el.taskForm) el.taskForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var id = el.taskForm.dataset.editingId || (window.CyNewsTaskState ? window.CyNewsTaskState.idFor("task:" + Date.now().toString(36) + ":" + Math.random()) : "task:" + Date.now().toString(36));
      var payload = { id: id, title: el.taskTitle.value.trim(), due_date: el.taskDue.value || null,
        priority: el.taskPriority.value === "" ? null : Number(el.taskPriority.value), notes: el.taskNotes.value.trim() };
      if (!payload.title) return;
      if (applyTask(el.taskForm.dataset.editingId ? "task.update" : "task.create", payload)) {
        if (el.taskStatus) el.taskStatus.textContent = "已儲存";
        resetTaskForm();
      }
    });
    if (el.taskCancel) el.taskCancel.addEventListener("click", resetTaskForm);
    if (el.taskComposerToggle) el.taskComposerToggle.addEventListener("click", function () { setTaskComposer(el.taskForm.hidden); });
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
    function setRefreshState(kind, text) {
      el.btnRefresh.disabled = kind === "loading";
      el.btnRefresh.setAttribute("aria-busy", kind === "loading" ? "true" : "false");
      el.btnRefresh.classList.toggle("is-refreshing", kind === "loading");
      if (el.refreshState) {
        el.refreshState.textContent = text || "";
        el.refreshState.dataset.state = kind || "idle";
      }
    }
    el.btnRefresh.addEventListener("click", function () {
      if (el.btnRefresh.disabled) return;
      var before = state.data && state.data.generated_at;
      var endpoint = stagingRefreshEndpoint();
      if (endpoint) {
        setRefreshState("loading", "正在要求雲端立即更新…");
        requestStagingRefresh(endpoint).then(function (request) {
          if (request.status === "unauthenticated") {
            setRefreshState("error", "請先登入後再要求立即更新；未送出更新");
            return;
          }
          if (request.status === "rate_limited") {
            var wait = request.retryAfterSeconds > 0 ? "，請在 " + request.retryAfterSeconds + " 秒後再試" : "，請稍後再試";
            setRefreshState("current", "更新請求太頻繁" + wait);
            return;
          }
          if (["accepted", "already_requested"].indexOf(request.status) === -1) {
            setRefreshState("error", "立即更新服務目前不可用；未送出更新");
            return;
          }
          setRefreshState("loading", request.status === "accepted"
            ? "已送出立即更新，等待雲端發布…"
            : "更新已在排程中，等待雲端發布…");
          return pollPublishedGeneration(before).then(function (published) {
            if (published.status === "updated") setRefreshState("updated", "已載入最新雲端資料");
            else setRefreshState("current", "更新已排程；雲端尚未發布完成");
          });
        });
        return;
      }
      setRefreshState("loading", "正在取得雲端已發布資料…");
      fetchData().then(function (result) {
        if (!result || !result.ok) {
          setRefreshState("error", "無法取得雲端資料，已保留目前畫面");
        } else if (!result.freshNetwork) {
          setRefreshState("cached", "目前顯示離線快取，未取得雲端新資料");
        } else if (before && result.generatedAt === before) {
          setRefreshState("current", "同步完成；雲端尚未發布新版本");
        } else {
          setRefreshState("updated", "已載入最新雲端資料");
        }
      });
    });

    function setNavMenu(open) {
      if (!el.navMenu || !el.navMenuToggle) return;
      el.navMenu.hidden = !open;
      el.navMenuToggle.setAttribute("aria-expanded", open ? "true" : "false");
      el.navMenuToggle.classList.toggle("is-open", open);
    }
    function switchTab(tab) {
      state.tab = tab;
      setNavMenu(false);
      if (el.navCurrentLabel) el.navCurrentLabel.textContent = "選單";
      var home = tab === "home";
      var latest = tab === "latest";
      var today = tab === "today";
      var assistant = tab === "assistant";
      if (el.viewHome) el.viewHome.hidden = !home;
      if (el.viewToday) el.viewToday.hidden = !today;
      el.viewLatest.hidden = !latest;
      if (el.viewAssistant) el.viewAssistant.hidden = !assistant;
      if (el.viewCalendar) el.viewCalendar.hidden = tab !== "calendar";
      el.viewSub.hidden = tab !== "sub";
      if (el.tabHome) el.tabHome.classList.toggle("is-active", home);
      el.tabLatest.classList.toggle("is-active", latest);
      if (el.tabToday) el.tabToday.classList.toggle("is-active", today);
      if (el.tabAssistant) el.tabAssistant.classList.toggle("is-active", assistant);
      if (el.tabCalendar) el.tabCalendar.classList.toggle("is-active", tab === "calendar");
      el.tabSub.classList.toggle("is-active", tab === "sub");
      if (el.tabHome) el.tabHome.setAttribute("aria-current", home ? "page" : "false");
      el.tabLatest.setAttribute("aria-current", latest ? "page" : "false");
      if (el.tabToday) el.tabToday.setAttribute("aria-current", today ? "page" : "false");
      if (el.tabAssistant) el.tabAssistant.setAttribute("aria-current", assistant ? "page" : "false");
      if (el.tabCalendar) el.tabCalendar.setAttribute("aria-current", tab === "calendar" ? "page" : "false");
      el.tabSub.setAttribute("aria-current", tab === "sub" ? "page" : "false");
      if (today) { loadOfficialEvents(); loadCalendarStatus(); renderToday(); }
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
    if (el.tabHome) el.tabHome.addEventListener("click", function () { switchTab("home"); });
    el.tabLatest.addEventListener("click", function () { switchTab("latest"); });
    if (el.tabToday) el.tabToday.addEventListener("click", function () { switchTab("today"); });
    if (el.tabAssistant) el.tabAssistant.addEventListener("click", function () { switchTab("assistant"); });
    el.tabSub.addEventListener("click", function () { switchTab("sub"); });
    if (el.tabCalendar) {
      el.tabCalendar.addEventListener("click", function () { switchTab("calendar"); });
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
    if (el.viewHome) el.viewHome.addEventListener("click", function (event) {
      var target = event.target.closest("button[data-home-tab]");
      if (target) switchTab(target.dataset.homeTab);
    });
    if (el.viewToday) el.viewToday.addEventListener("click", function (event) {
      var target = event.target.closest("button[data-today-action]");
      if (!target) return;
      switchTab("sub");
      if (target.dataset.todayAction === "task") setTaskComposer(true);
      else if (target.dataset.todayAction === "profile" && el.profileBox) el.profileBox.open = true;
      else if (target.dataset.todayAction === "keyword" && el.kwInput) el.kwInput.focus();
    });
    if (el.navMenuToggle) el.navMenuToggle.addEventListener("click", function () {
      setNavMenu(el.navMenuToggle.getAttribute("aria-expanded") !== "true");
    });
    if (document.addEventListener) {
      document.addEventListener("click", function (event) {
        if (!el.navMenu || el.navMenu.hidden || !event.target || !event.target.closest || event.target.closest(".function-dock")) return;
        setNavMenu(false);
      });
      document.addEventListener("keydown", function (event) { if (event.key === "Escape") setNavMenu(false); });
    }

    populateProfileSchools();
    renderProfile();
    if (el.profileForm) el.profileForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!window.CyNewsProfile) return;
      var profile = profileFromForm();
      if (!profile.school_id) {
        el.profileStatus.textContent = "請先選擇你關心的學校";
        return;
      }
      var result = queueAccountMutation("preferences.upsert", preferencePayload({ profile: profile }));
      if (!result) {
        el.profileStatus.textContent = "請先登入並完成同步";
        return;
      }
      state.profile = profile;
      applyPreferredSchool(profile.school_id, true);
      establishPersonalizedBaseline(state.activeAccountId);
      var requestedNickname = window.CyNewsAccountAuth.normalizeNickname(el.profileNickname && el.profileNickname.value);
      if (!requestedNickname || !accountAuth || typeof accountAuth.updateNickname !== "function") {
        el.profileStatus.textContent = requestedNickname ? "暱稱服務暫時不可用" : "請填寫暱稱";
        return;
      }
      el.profileStatus.textContent = "儲存中";
      accountAuth.updateNickname(requestedNickname).then(function (user) {
        state.accountUser = user || state.accountUser;
        state.nickname = window.CyNewsAccountAuth.displayName(user || { user_metadata: { nickname: requestedNickname } });
        renderGreeting(); renderProfile();
        el.profileStatus.textContent = "已儲存";
      }).catch(function () { el.profileStatus.textContent = "校務設定已儲存，但暱稱同步失敗"; });
      renderProfile();
      renderLatest();
    });
    if (el.nicknameForm) el.nicknameForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var nickname = window.CyNewsAccountAuth && window.CyNewsAccountAuth.normalizeNickname(el.nicknameInput.value);
      var schoolId = String(el.nicknameSchool && el.nicknameSchool.value || "");
      if (!nickname || !accountAuth || !state.accountUser) { el.nicknameStatus.textContent = "請輸入暱稱"; return; }
      if (!window.CyNewsSchoolRegistry || !window.CyNewsSchoolRegistry.find(schoolId)) { el.nicknameStatus.textContent = "請選擇你關心的學校"; return; }
      var profile = window.CyNewsProfile.normalize(Object.assign({}, state.profile || {}, { school_id: schoolId }));
      if (!queueAccountMutation("preferences.upsert", preferencePayload({ profile: profile }))) { el.nicknameStatus.textContent = "請先完成登入同步"; return; }
      state.profile = profile;
      applyPreferredSchool(schoolId, true);
      el.nicknameStatus.textContent = "儲存中";
      accountAuth.updateNickname(nickname).then(function (user) {
        state.accountUser = user || state.accountUser;
        state.nickname = window.CyNewsAccountAuth.displayName(user || { user_metadata: { nickname: nickname } });
        localStorage.removeItem("cyNews.onboardingLater.v2:" + state.accountUser.id);
        renderGreeting(); renderProfile();
        el.nicknameStatus.textContent = "已儲存";
        if (el.nicknameDialog.open) el.nicknameDialog.close();
      }).catch(function () { el.nicknameStatus.textContent = "暱稱儲存失敗，請稍後再試"; });
    });
    if (el.nicknameLater) el.nicknameLater.addEventListener("click", function () {
      if (state.accountUser && state.accountUser.id) localStorage.setItem("cyNews.onboardingLater.v2:" + state.accountUser.id, "true");
      if (el.nicknameDialog && el.nicknameDialog.open) el.nicknameDialog.close();
    });
    if (el.personalizedToggle) el.personalizedToggle.addEventListener("change", function () {
      var enabled = !!el.personalizedToggle.checked;
      if (enabled && !hasProfileContext(state.profile)) {
        el.personalizedToggle.checked = false;
        el.profileStatus.textContent = "請先設定學校、年級或關注內容";
        return;
      }
      var result = queueAccountMutation("preferences.upsert", preferencePayload({ personalized: enabled }));
      if (!result) {
        el.personalizedToggle.checked = !enabled;
        el.profileStatus.textContent = "請先登入並完成同步";
        return;
      }
      state.personalizedNotifications = enabled;
      establishPersonalizedBaseline(state.activeAccountId);
      el.profileStatus.textContent = enabled ? "個人化通知已開啟" : "個人化通知已關閉";
    });
    function saveReminderPreference() {
      var preset = el.reminderPreset.value;
      if (["single", "standard", "dense", "custom"].indexOf(preset) === -1) preset = "single";
      var previous = state.reminderPreset;
      var previousCustom = state.reminderCustomOffsets;
      state.reminderPreset = preset;
      state.reminderCustomOffsets = el.reminderCustomOffsets ? el.reminderCustomOffsets.value.trim() : "1";
      if (el.reminderCustomWrap) el.reminderCustomWrap.hidden = preset !== "custom";
      if (preset === "custom" && window.CyNewsReminderRules) {
        try { window.CyNewsReminderRules.offsetsFor(preset, state.reminderCustomOffsets); }
        catch (_) {
          state.reminderPreset = previous; state.reminderCustomOffsets = previousCustom;
          el.reminderPreset.value = previous;
          if (el.reminderCustomOffsets) el.reminderCustomOffsets.value = previousCustom;
          if (el.reminderPushState) el.reminderPushState.textContent = "請輸入 1–8 個有效提前天數";
          return;
        }
      }
      var result = queueAccountMutation("preferences.upsert", preferencePayload({ reminderPreset: preset, reminderCustomOffsets: state.reminderCustomOffsets }));
      if (!result) {
        state.reminderPreset = previous;
        state.reminderCustomOffsets = previousCustom;
        el.reminderPreset.value = previous;
        if (el.reminderPushState) el.reminderPushState.textContent = "請先登入並完成同步";
      } else if (el.reminderPushState) {
        el.reminderPushState.textContent = "預設頻率已儲存";
      }
    }
    if (el.reminderPreset) el.reminderPreset.addEventListener("change", saveReminderPreference);
    if (el.reminderCustomOffsets) el.reminderCustomOffsets.addEventListener("change", saveReminderPreference);

    /* ── PWA ── */
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js?v=41").catch(function () {});
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

