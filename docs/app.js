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

  function finishInitialLoading() {
    var loading = document.getElementById("appLoading");
    if (loading) loading.hidden = true;
  }

  function startApp() {
    var NotificationState = window.CyNewsNotificationState;
    if (!NotificationState) { finishInitialLoading(); return; }

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
    var searchTimer = null;

    var state = {
      data: null,
      school: loadSchool(),
      cat: "all",
      q: "",
      tab: "latest",
      calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      calendarSelected: new Date().toISOString().slice(0, 10),
      eventEditingId: null,
      officialEvents: [],
      calendarStatus: "partial",
      timetables: [],
      userEvents: loadUserEvents(),
      reads: loadReads(),
      shown: PAGE_SIZE,
      archive: "none",  /* none | loading | loaded:歷史封存資料的載入狀態 */
      archivePromise: null,
      subscriptions: notificationState.subscriptions,
      tasks: [],
      profile: window.CyNewsProfile ? window.CyNewsProfile.empty() : {},
      accountUser: null,
      accountAccess: null,
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
      appLoading: $("appLoading"), list: $("list"), subList: $("subList"), countLine: $("countLine"),
      updatedAt: $("updatedAt"), q: $("q"),
      schoolFilter: $("schoolFilter"), catChips: $("catChips"),
      viewHome: $("viewHome"), viewToday: $("viewToday"), viewLatest: $("viewLatest"), viewAssistant: $("viewAssistant"), viewSub: $("viewSub"), viewAdmin: $("viewAdmin"),
      tabHome: $("tabHome"), tabToday: $("tabToday"), tabLatest: $("tabLatest"), tabAssistant: $("tabAssistant"), tabSub: $("tabSub"), tabAdmin: $("tabAdmin"), subBadge: $("subBadge"),
      kwForm: $("kwForm"), kwInput: $("kwInput"), kwChips: $("kwChips"),
      btnNotify: $("btnNotify"), notifyState: $("notifyState"),
      reminderPushToggle: $("reminderPushToggle"), reminderPushState: $("reminderPushState"),
      reminderPreset: $("reminderPreset"), nextReminder: $("nextReminder"),
      reminderCustomWrap: $("reminderCustomWrap"), reminderCustomOffsets: $("reminderCustomOffsets"),
      btnRefresh: $("btnRefresh"), refreshState: $("refreshState"),
      accountState: $("accountState"), accountEmail: $("accountEmail"), accountLogin: $("accountLogin"), accountSwitch: $("accountSwitch"),
      accountLogout: $("accountLogout"), functionDock: $("functionDock"), publicAccountEntry: $("publicAccountEntry"), publicAccountLogin: $("publicAccountLogin"), publicAccountSignUp: $("publicAccountSignUp"), publicAccountLogout: $("publicAccountLogout"), publicAccessStatus: $("publicAccessStatus"),
      adminRefresh: $("adminRefresh"), adminStatus: $("adminStatus"), adminAccounts: $("adminAccounts"),
      passwordAuthDialog: $("passwordAuthDialog"), passwordAuthForm: $("passwordAuthForm"), passwordAuthTitle: $("passwordAuthTitle"), passwordAuthHint: $("passwordAuthHint"), passwordAuthUsername: $("passwordAuthUsername"), passwordAuthEmailField: $("passwordAuthEmailField"), passwordAuthEmail: $("passwordAuthEmail"), passwordAuthPassword: $("passwordAuthPassword"), passwordSignIn: $("passwordSignIn"), passwordSignUp: $("passwordSignUp"), passwordResetRequest: $("passwordResetRequest"), passwordAuthBack: $("passwordAuthBack"), passwordAuthCancel: $("passwordAuthCancel"), passwordGoogleLogin: $("passwordGoogleLogin"), passwordAuthStatus: $("passwordAuthStatus"),
      passwordRecoveryDialog: $("passwordRecoveryDialog"), passwordRecoveryForm: $("passwordRecoveryForm"), passwordRecoveryPassword: $("passwordRecoveryPassword"), passwordRecoveryConfirm: $("passwordRecoveryConfirm"), passwordRecoveryCancel: $("passwordRecoveryCancel"), passwordRecoveryStatus: $("passwordRecoveryStatus"),
      accountDeleteCloud: $("accountDeleteCloud"),
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
      todayTimetable: $("todayTimetable"),
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
        if (el.functionDock) el.functionDock.hidden = true;
        if (el.publicAccountEntry) el.publicAccountEntry.hidden = false;
        switchTab("latest");
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
      function showAnonymousShell() {
        if (el.functionDock) el.functionDock.hidden = true;
        setNavMenu(false);
        if (el.publicAccountEntry) el.publicAccountEntry.hidden = false;
        if (el.publicAccountLogin) el.publicAccountLogin.hidden = false;
        if (el.publicAccountSignUp) el.publicAccountSignUp.hidden = false;
        if (el.publicAccountLogout) el.publicAccountLogout.hidden = true;
        if (el.tabAdmin) el.tabAdmin.hidden = true;
        if (state.tab !== "latest") switchTab("latest");
      }
      function showPendingAccountShell(message) {
        showAnonymousShell();
        if (el.publicAccountLogin) el.publicAccountLogin.hidden = true;
        if (el.publicAccountSignUp) el.publicAccountSignUp.hidden = true;
        if (el.publicAccountLogout) el.publicAccountLogout.hidden = false;
        if (el.publicAccessStatus) el.publicAccessStatus.textContent = message;
      }
      function showAccountShell() {
        if (el.functionDock) el.functionDock.hidden = false;
        if (el.publicAccountEntry) el.publicAccountEntry.hidden = true;
        if (el.publicAccessStatus) el.publicAccessStatus.textContent = "";
      }
      function setAccountUser(user) {
        state.accountUser = user || null;
        if (!user) state.accountAccess = null;
        state.nickname = window.CyNewsAccountAuth ? window.CyNewsAccountAuth.displayName(user) : "";
        var email = window.CyNewsAccountAuth ? window.CyNewsAccountAuth.displayEmail(user) : "";
        if (el.accountEmail) {
          el.accountEmail.textContent = email ? "登入信箱：" + email : "";
          el.accountEmail.hidden = !email;
        }
        renderGreeting(); renderProfile();
      }
      function renderAdminAccounts(rows) {
        if (!el.adminAccounts) return;
        el.adminAccounts.innerHTML = rows.length ? rows.map(function (row) {
          var action = row.status === "pending" ? '<button class="btn-primary" type="button" data-admin-review="approved" data-admin-user="' + esc(row.user_id) + '">核准</button><button class="btn-ghost danger-button" type="button" data-admin-review="rejected" data-admin-user="' + esc(row.user_id) + '">拒絕</button>' : '<button class="btn-ghost danger-button" type="button" data-admin-review="rejected" data-admin-user="' + esc(row.user_id) + '">移除使用權</button>';
          return '<article class="admin-account"><div><strong>' + esc(row.email) + '</strong><small>' + esc(row.status === "pending" ? "等待核准" : row.status === "approved" ? "已核准" : "已移除使用權") + '</small></div><div class="admin-account-actions">' + action + '</div></article>';
        }).join("") : '<p class="empty">目前沒有已註冊帳號。</p>';
      }
      function loadAdminAccounts() {
        if (!accountAuth || !state.accountUser || !state.accountAccess || !state.accountAccess.is_admin || !el.adminAccounts) return;
        el.adminStatus.textContent = "讀取帳號申請中";
        accountAuth.getAdminAccounts().then(function (rows) { el.adminStatus.textContent = ""; renderAdminAccounts(rows); }).catch(function () { el.adminStatus.textContent = "目前無法讀取帳號申請，請重新整理後再試。"; });
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
        showAnonymousShell();
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
          if (el.accountDeleteCloud) { el.accountDeleteCloud.hidden = false; el.accountDeleteCloud.disabled = false; }
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
            if (el.accountDeleteCloud) { el.accountDeleteCloud.hidden = false; el.accountDeleteCloud.disabled = false; }
          } else {
            status("已登入・同步待完成");
            if (el.accountDeleteCloud) el.accountDeleteCloud.hidden = true;
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
            var pendingUsername = window.CyNewsAccountAuth.normalizeUsername(session.user && session.user.user_metadata && session.user.user_metadata.pending_username);
            if (pendingUsername) {
              return auth.claimUsername(pendingUsername).then(function () { return handleVerifiedSession(); }).catch(function () {
                status("帳號名稱無法啟用；請聯絡管理者協助。");
                return auth.getClient().then(function (client) { return client.auth["signOut"](); }).then(function () { restoreAnonymous(); setAccountUser(null); });
              });
            }
            setAccountUser(session.user);
            return auth.getAccountAccess().then(function (access) {
              state.accountAccess = access;
              if (access.status !== "approved") {
                if (el.tabAdmin) el.tabAdmin.hidden = true;
                showPendingAccountShell(access.status === "rejected" ? "此帳號目前未獲使用核准；如有疑問請聯絡管理員。" : "帳號已登入，等待管理員核准後才能使用個人功能。");
                status(access.status === "rejected" ? "未獲核准" : "等待核准");
                return;
              }
              showAccountShell();
              if (el.tabAdmin) el.tabAdmin.hidden = !access.is_admin;
              loadAdminAccounts();
              if (uid === requestedUid) return;
            /* A verified session is authenticated before remote sync completes.
               Keep account controls truthful while the single transition runs. */
              status("已登入・同步中");
              el.accountLogin.hidden = true;
              if (el.accountSwitch) el.accountSwitch.hidden = false;
              el.accountLogout.hidden = false;
              if (el.accountDeleteCloud) el.accountDeleteCloud.hidden = true;
              sync(uid);
            }).catch(function () {
              state.accountAccess = null;
              if (el.tabAdmin) el.tabAdmin.hidden = true;
              showPendingAccountShell("帳號權限暫時無法確認，請稍後再試。");
              status("權限待確認");
            });
          } else if (requestedUid !== null || readyUid !== null || accountPhase !== "ANONYMOUS_READY") {
            restoreAnonymous();
            setAccountUser(null);
            if (el.accountDeleteCloud) el.accountDeleteCloud.hidden = true;
            status("未登入"); el.accountLogin.hidden = false;
            if (el.accountSwitch) el.accountSwitch.hidden = true;
            el.accountLogout.hidden = true;
          }
          if (!(typeof uid === "string" && uid)) showAnonymousShell();
        });
      }
      function setPasswordAuthMode(mode) {
        mode = mode === "signup" || mode === "reset" ? mode : "signin";
        var signup = mode === "signup";
        var reset = mode === "reset";
        var usernameField = el.passwordAuthUsername.parentNode;
        var passwordField = el.passwordAuthPassword.parentNode;
        el.passwordAuthDialog.dataset.mode = mode;
        el.passwordAuthTitle.textContent = signup ? "註冊嘉校快訊" : reset ? "重設密碼" : "登入嘉校快訊";
        el.passwordAuthHint.textContent = signup ? "只需要帳號、救援 Email 與密碼。完成驗證後，等待管理員核准即可使用個人功能。" : reset ? "輸入註冊時的救援 Email，我們會寄送重設連結。" : "請輸入 Email 或帳號名稱與密碼。";
        usernameField.hidden = reset;
        el.passwordAuthUsername.disabled = reset;
        el.passwordAuthEmailField.hidden = !signup && !reset;
        el.passwordAuthEmail.disabled = !signup && !reset;
        passwordField.hidden = reset;
        el.passwordAuthPassword.disabled = reset;
        el.passwordAuthPassword.autocomplete = signup ? "new-password" : "current-password";
        el.passwordSignIn.hidden = signup || reset;
        el.passwordSignUp.hidden = false;
        el.passwordSignUp.textContent = signup ? "建立帳號" : reset ? "寄送重設信" : "註冊";
        el.passwordResetRequest.hidden = signup || reset;
        el.passwordAuthBack.hidden = !reset;
      }
      function showPasswordAuth(mode) {
        if (!el.passwordAuthDialog || typeof el.passwordAuthDialog.showModal !== "function") { status("帳密登入介面暫時不可用"); return; }
        setPasswordAuthMode(mode);
        el.passwordAuthStatus.textContent = "";
        el.passwordAuthPassword.value = "";
        if (!el.passwordAuthDialog.open) el.passwordAuthDialog.showModal();
        (mode === "reset" ? el.passwordAuthEmail : el.passwordAuthUsername).focus();
      }
      function showPasswordRecovery() {
        if (!el.passwordRecoveryDialog || typeof el.passwordRecoveryDialog.showModal !== "function") return;
        el.passwordRecoveryPassword.value = "";
        el.passwordRecoveryConfirm.value = "";
        el.passwordRecoveryStatus.textContent = "";
        if (!el.passwordRecoveryDialog.open) el.passwordRecoveryDialog.showModal();
        el.passwordRecoveryPassword.focus();
      }
      function requestPasswordReset() {
        el.passwordAuthStatus.textContent = "寄送中";
        auth.resetPasswordForEmail(el.passwordAuthEmail.value).then(function () {
          el.passwordAuthPassword.value = "";
          el.passwordAuthStatus.textContent = "若此 Email 已註冊，重設信已寄出。";
        }).catch(function () {
          el.passwordAuthPassword.value = "";
          el.passwordAuthStatus.textContent = "無法寄出重設信；請確認 Email 後再試。";
        });
      }
      function beginPasswordSession(work, successMessage) {
        syncGeneration += 1;
        requestedUid = null;
        readyUid = null;
        accountPhase = "AUTHENTICATING";
        clearAccountOwnedView();
        el.passwordAuthStatus.textContent = "處理中";
        return work().then(function () {
          el.passwordAuthPassword.value = "";
          if (el.passwordAuthDialog.open) el.passwordAuthDialog.close();
          status(successMessage || "登入中");
          return handleVerifiedSession();
        }).catch(function () {
          el.passwordAuthPassword.value = "";
          el.passwordAuthStatus.textContent = "帳號或密碼錯誤；請再試一次。";
          status("未登入");
        });
      }
      if (el.passwordAuthForm) el.passwordAuthForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var mode = el.passwordAuthDialog.dataset.mode || "signin";
        if (mode === "signup") { el.passwordSignUp.click(); return; }
        if (mode === "reset") { requestPasswordReset(); return; }
        beginPasswordSession(function () { return auth.signInWithIdentifier(el.passwordAuthUsername.value, el.passwordAuthPassword.value); });
      });
      if (el.passwordSignUp) el.passwordSignUp.addEventListener("click", function () {
        var mode = el.passwordAuthDialog.dataset.mode || "signin";
        if (mode === "signin") { setPasswordAuthMode("signup"); return; }
        if (mode === "reset") { requestPasswordReset(); return; }
        var username = el.passwordAuthUsername.value;
        var email = el.passwordAuthEmail.value;
        var password = el.passwordAuthPassword.value;
        el.passwordAuthStatus.textContent = "建立帳號中";
        auth.signUpWithPassword(email, password, "", username).then(function (result) {
          el.passwordAuthPassword.value = "";
          if (result.session) return auth.claimUsername(username).then(function () { if (el.passwordAuthDialog.open) el.passwordAuthDialog.close(); return handleVerifiedSession(); });
          el.passwordAuthStatus.textContent = "請到救援 Email 完成驗證，再用帳號與密碼登入。";
        }).catch(function () { el.passwordAuthPassword.value = ""; el.passwordAuthStatus.textContent = "無法建立帳號；請確認資料或換一個帳號名稱。"; });
      });
      if (el.passwordResetRequest) el.passwordResetRequest.addEventListener("click", function () { setPasswordAuthMode("reset"); el.passwordAuthStatus.textContent = ""; });
      if (el.passwordAuthBack) el.passwordAuthBack.addEventListener("click", function () { setPasswordAuthMode("signin"); el.passwordAuthStatus.textContent = ""; el.passwordAuthUsername.focus(); });
      if (el.passwordAuthCancel) el.passwordAuthCancel.addEventListener("click", function () { el.passwordAuthPassword.value = ""; el.passwordAuthDialog.close(); });
      if (el.adminRefresh) el.adminRefresh.addEventListener("click", loadAdminAccounts);
      if (el.adminAccounts) el.adminAccounts.addEventListener("click", function (event) {
        var button = event.target.closest("button[data-admin-review]");
        if (!button || !accountAuth) return;
        var action = button.dataset.adminReview;
        if (action === "rejected" && !window.confirm("確定要移除此帳號的網站使用權嗎？資料會保留在稽核紀錄中。")) return;
        el.adminStatus.textContent = "處理中";
        accountAuth.reviewAccount(button.dataset.adminUser, action).then(function () { el.adminStatus.textContent = action === "approved" ? "已核准帳號。" : "已移除帳號使用權。"; loadAdminAccounts(); }).catch(function () { el.adminStatus.textContent = "無法更新帳號狀態，請重新整理後再試。"; });
      });
      if (el.passwordRecoveryForm) el.passwordRecoveryForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var password = el.passwordRecoveryPassword.value;
        if (password !== el.passwordRecoveryConfirm.value) { el.passwordRecoveryStatus.textContent = "兩次密碼不一致。"; return; }
        el.passwordRecoveryStatus.textContent = "更新中";
        auth.updatePassword(password).then(function () {
          el.passwordRecoveryPassword.value = "";
          el.passwordRecoveryConfirm.value = "";
          el.passwordRecoveryStatus.textContent = "密碼已更新。";
          if (el.passwordRecoveryDialog.open) el.passwordRecoveryDialog.close();
          return handleVerifiedSession();
        }).catch(function () {
          el.passwordRecoveryPassword.value = "";
          el.passwordRecoveryConfirm.value = "";
          el.passwordRecoveryStatus.textContent = "無法更新密碼；請重新開啟重設連結。";
        });
      });
      if (el.passwordRecoveryCancel) el.passwordRecoveryCancel.addEventListener("click", function () { el.passwordRecoveryPassword.value = ""; el.passwordRecoveryConfirm.value = ""; el.passwordRecoveryDialog.close(); });
      if (el.passwordGoogleLogin) el.passwordGoogleLogin.addEventListener("click", function () { el.passwordAuthDialog.close(); el.accountLogin.dataset.googleLogin = "1"; el.accountLogin.click(); });
      if (el.publicAccountLogin) el.publicAccountLogin.addEventListener("click", function () { showPasswordAuth("signin"); });
      if (el.publicAccountSignUp) el.publicAccountSignUp.addEventListener("click", function () { showPasswordAuth("signup"); });
      if (el.publicAccountLogout) el.publicAccountLogout.addEventListener("click", function () {
        var detach = pushManager ? pushManager.disable() : Promise.resolve();
        detach.then(function () { return auth.signOut(); }).then(function () { restoreAnonymous(); setAccountUser(null); status("未登入"); }).catch(function () { if (el.publicAccessStatus) el.publicAccessStatus.textContent = "登出失敗，請稍後再試。"; });
      });
      el.accountLogin.addEventListener("click", function () {
        if (el.accountLogin.dataset.googleLogin !== "1") { showPasswordAuth("signin"); return; }
        delete el.accountLogin.dataset.googleLogin;
        if (el.accountDeleteCloud) el.accountDeleteCloud.hidden = true;
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
        if (el.accountDeleteCloud) el.accountDeleteCloud.hidden = true;
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
        if (el.accountDeleteCloud) el.accountDeleteCloud.hidden = true;
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
      if (el.accountDeleteCloud) el.accountDeleteCloud.addEventListener("click", function () {
        if (accountPhase !== "ACCOUNT_READY" || !readyUid) return;
        if (!window.confirm("確定刪除這個登入帳號在本站同步的偏好、追蹤、閱讀紀錄與待辦？此操作無法復原，但不會刪除 Google 帳號。")) return;
        var deletionUid = readyUid;
        var generation = ++syncGeneration;
        var dataDeleted = false;
        requestedUid = deletionUid;
        readyUid = null;
        accountPhase = "AUTHENTICATING";
        el.accountDeleteCloud.disabled = true;
        status("正在刪除已同步資料");
        var detach = pushManager ? pushManager.disable() : Promise.resolve();
        detach.then(function () { return auth.getClient(); }).then(function (client) {
          return window.CyNewsSupabaseSync.createAdapter(client, { isCurrent: function (currentUid) {
            return generation === syncGeneration && currentUid === deletionUid;
          }}).deleteOwnData();
        }).then(function () {
          dataDeleted = true;
          lifecycle.clearAccountData(deletionUid);
          clearAccountOwnedView();
          return auth.signOut();
        }).then(function () {
          restoreAnonymous();
          setAccountUser(null);
          status("已刪除同步資料並登出");
          el.accountLogin.hidden = false;
          if (el.accountSwitch) el.accountSwitch.hidden = true;
          el.accountLogout.hidden = true;
          el.accountDeleteCloud.hidden = true;
        }).catch(function () {
          if (generation !== syncGeneration) return;
          if (dataDeleted) {
            accountPhase = "AUTHENTICATING";
            status("同步資料已刪除，但登出未完成；請再按登出");
            el.accountDeleteCloud.hidden = true;
            el.accountLogout.hidden = false;
            return;
          }
          readyUid = deletionUid;
          accountPhase = "ACCOUNT_READY";
          status("刪除未完成，請稍後重試");
          el.accountDeleteCloud.disabled = false;
          el.accountDeleteCloud.hidden = false;
        });
      });
      /* Subscribe before the first session read. On an OAuth callback the client
         begins exchanging the URL grant as it is constructed; registering after
         the first read can miss that one SIGNED_IN event and leave the page at
         "已登入・同步待完成" until a manual reload. */
      showAnonymousShell();
      auth.onAuthStateChange(function (event) { if (event === "PASSWORD_RECOVERY") { showPasswordRecovery(); return; } handleVerifiedSession().catch(function () {}); }).catch(function () {});
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
      state.archivePromise = fetch(archiveUrl + "?_=" + Date.now(), { cache: "no-store" })
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
          return state.data;
        })
        .catch(function () { state.archive = "none"; renderLatest(); return state.data; }); /* 離線等下次再試 */
      return state.archivePromise;
    }

    /* ── 篩選與比對 ── */
    function itemText(it) {
      /* 含自動分類名稱:訂「段考」也能命中整個「段考考試」分類 */
      return (it.title + " " + (it.summary || "") + " " + (it.snippet || "") + " " +
        (it.category || "") + " " + (it.source_category || "")).toLowerCase();
    }
    function queryScore(it, q) {
      if (!q) return true;
      var text = itemText(it);
      if (window.CyNewsSearchQuery) return window.CyNewsSearchQuery.announcementScore(it, q);
      return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (tok) { return text.indexOf(tok) !== -1; }) ? 1 : 0;
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
      var candidates = state.data.items.filter(function (it) {
        if (state.school !== "all" && it.school !== state.school) return false;
        if (state.cat !== "all" && it.category !== state.cat) return false;
        return true;
      });
      if (state.q && window.CyNewsSearchQuery && typeof window.CyNewsSearchQuery.select === "function") {
        return window.CyNewsSearchQuery.select(candidates, state.q).map(function (row) { return row.item; });
      }
      var rows = candidates.map(function (it) {
        var score = queryScore(it, state.q);
        return score ? { item: it, score: score } : false;
      }).filter(Boolean);
      if (state.q) rows.sort(function (a, b) {
        return b.score - a.score || String(b.item.date || b.item.first_seen || "").localeCompare(String(a.item.date || a.item.first_seen || ""));
      });
      /* Keep low-confidence body-only matches as a fallback, but do not let them
         drown out strong title/category matches for a specific school task. */
      if (state.q && window.CyNewsSearchQuery && typeof window.CyNewsSearchQuery.cutoff === "function") {
        var floor = window.CyNewsSearchQuery.cutoff(rows.map(function (row) { return row.score; }));
        rows = rows.filter(function (row) { return row.score >= floor; });
      }
      return rows.map(function (row) { return row.item; });
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
    function displaySnippet(it) {
      return String(it && (it.summary || it.snippet) || "").replace(/\s+/g, " ").trim()
        .replace(/^作者\s*[：:]\s*.*?\s+發[佈布]日期\s*[：:]\s*\d{4}-\d{2}-\d{2}(?:\s+最後更新日期\s*[：:]\s*\d{4}-\d{2}-\d{2})?\s*/, "");
    }
    function displayTitle(it) {
      var title = String(it && it.title || "").replace(/\s+/g, " ").trim();
      var generic = title === "國立嘉義高中" || title === "國立嘉義女子高級中學";
      var valid = !generic && title.length >= 4 && /[0-9A-Za-z\u3400-\u9fff]/.test(title);
      if (valid) return title;
      /* Legacy RulingDigital records may contain the ::: access-key label.
         Use readable article text while the Actions-owned snapshot self-heals. */
      var snippet = displaySnippet(it);
      return snippet ? snippet.slice(0, 140) : "公告標題暫時無法解析";
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
        state.officialEvents = Array.isArray(rows) ? rows.filter(function (ev) {
          return ev && (ev.start_date || ev.date) && ev.title && ev.provenance &&
            (state.school === "all" || String(ev.school_id || "") === state.school);
        }) : [];
        if (state.tab === "calendar") renderCalendar();
      }).catch(function () {});
    }
    function loadCalendarStatus() {
      fetch("data/calendar-source-status.json?_=" + Date.now(), { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }).then(function (status) {
        var rows = Array.isArray(status) ? status : (Array.isArray(status && status.schools) ? status.schools : []);
        if (state.school !== "all") rows = rows.filter(function (row) { return String(row.school_id || row.id || "") === state.school; });
        state.calendarStatus = rows.length && rows.every(function (row) { return row.status === "official_complete"; }) ? "complete" : "partial";
        renderToday();
      }).catch(function () { state.calendarStatus = "partial"; renderToday(); });
    }
    function loadTimetables() {
      return fetch("data/class-timetables.json?_=" + Date.now(), { cache: "no-store" }).then(function (response) {
        return response.ok ? response.json() : { timetables: [] };
      }).then(function (data) {
        state.timetables = Array.isArray(data && data.timetables) ? data.timetables : [];
        renderToday();
      }).catch(function () {
        state.timetables = [];
        renderToday();
      });
    }
    function officialTimetableUrl(value) {
      try {
        var url = new URL(String(value || ""), window.location.href);
        return url.protocol === "https:" && url.hostname === "www.cysh.cy.edu.tw" ? url.href : "";
      } catch (_) { return ""; }
    }
    function timetableForProfile() {
      var profile = state.profile || {};
      var className = String(profile.class_name || "").trim();
      if (profile.school_id !== "cysh" || !/^\d{3}$/.test(className)) return null;
      var candidates = (state.timetables || []).filter(function (row) {
        return row && row.school_id === "cysh" && Array.isArray(row.classes);
      }).sort(function (left, right) {
        var leftTerm = Number(left.academic_year || 0) * 2 + Number(left.semester || 0);
        var rightTerm = Number(right.academic_year || 0) * 2 + Number(right.semester || 0);
        if (leftTerm !== rightTerm) return rightTerm - leftTerm;
        return (right.version === "formal" ? 1 : 0) - (left.version === "formal" ? 1 : 0);
      });
      for (var index = 0; index < candidates.length; index += 1) {
        var classRow = candidates[index].classes.find(function (row) { return String(row && row.class_name || "") === className; });
        if (classRow && Array.isArray(classRow.slots)) return { timetable: candidates[index], classRow: classRow };
      }
      return null;
    }
    function taipeiWeekday() {
      return new Intl.DateTimeFormat("zh-TW", { weekday: "long", timeZone: "Asia/Taipei" }).format(new Date()).replace("週", "星期");
    }
    function timetableHTML() {
      var profile = state.profile || {};
      var className = String(profile.class_name || "").trim();
      if (!profile.school_id) return '<p class="empty">先登入並在「我的」選擇學校與班級，才能顯示課表。</p>';
      if (profile.school_id !== "cysh") return '<p class="empty">目前只讀取嘉義高中已公開的班級課表。</p>';
      if (!/^\d{3}$/.test(className)) return '<p class="empty">請先到「我的」填入三位數班級，例如 109。</p>';
      var found = timetableForProfile();
      if (!found) return '<p class="empty">校方目前沒有這個班級可讀取的公開課表。</p>';
      var row = found.timetable;
      var version = row.version === "formal" ? "正式版" : "試行版";
      var weekday = taipeiWeekday();
      var todaySlots = found.classRow.slots.filter(function (slot) { return slot.weekday === weekday; });
      var sourceUrl = officialTimetableUrl(row.source_url);
      var source = sourceUrl ? '<a href="' + esc(sourceUrl) + '" target="_blank" rel="noopener noreferrer">查看校方課表公告 ↗</a>' : '校方公告來源';
      var todayRows = todaySlots.length ? todaySlots.map(function (slot) {
        return '<div class="timetable-row"><span class="timetable-period">第 ' + esc(slot.period) + ' 節<small>' + esc(slot.start) + '–' + esc(slot.end) + '</small></span><strong>' + esc(slot.subject || "—") + '</strong></div>';
      }).join("") : '<p class="empty">今天沒有排定上課時段。</p>';
      var weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五"];
      var grid = [1, 2, 3, 4, 5, 6, 7, 8].map(function (period) {
        var cells = weekdays.map(function (day) {
          var slot = found.classRow.slots.find(function (item) { return item.weekday === day && Number(item.period) === period; });
          return '<div class="timetable-grid-cell">' + esc(slot && slot.subject || "—") + '</div>';
        }).join("");
        var first = found.classRow.slots.find(function (item) { return Number(item.period) === period; });
        return '<div class="timetable-grid-row"><div class="timetable-grid-period">' + period + '<small>' + esc(first && first.start || "") + '</small></div>' + cells + '</div>';
      }).join("");
      return '<div class="timetable-note"><strong>' + esc(found.classRow.class_name) + ' 班 · ' + esc(row.academic_year) + ' 學年度第 ' + esc(row.semester) + ' 學期 · ' + version + '</strong><span>' + source + '</span></div>' +
        '<div class="timetable-today">' + todayRows + '</div>' +
        '<details class="timetable-week"><summary>查看整週課表</summary><div class="timetable-grid-wrap"><div class="timetable-grid timetable-grid-head"><div>節次</div>' + weekdays.map(function (day) { return '<div>' + esc(day.replace("星期", "週")) + '</div>'; }).join("") + '</div><div class="timetable-grid">' + grid + '</div></div></details>';
    }
    function cardHTML(it) {
      var schoolClass = it.school === "cysh" ? "tag-cysh" : (it.school === "fjsh" ? "tag-fjsh" : "tag-cygsh");
      var catClass = it.category === "榮譽榜" ? " cat-honor" : "";
      var relevance = window.CyNewsRelevance && window.CyNewsProfile && window.CyNewsSchoolRegistry
        ? window.CyNewsRelevance.calculate(it, state.profile, window.CyNewsSchoolRegistry) : null;
      var relevanceLabel = relevance && relevance.reasons.length ? window.CyNewsRelevance.label(relevance) : "";
      return '<article class="card' + catClass + '">' +
        (isUnread(it) ? '<span class="new-dot" title="未讀公告"></span>' : "") +
        '<div class="card-meta">' +
        '<span>' + esc(displayDate(it)) + '</span>' +
        '<span class="tag ' + schoolClass + '">' + esc(it.school_name) + '</span>' +
        '<span class="tag tag-cat">' + esc(it.category) + '</span>' +
        (relevanceLabel ? '<span class="relevance-note">與你相關 · ' + esc(relevanceLabel) + '</span>' : '') +
        '<span class="read-state ' + (isUnread(it) ? 'is-unread' : '') + '">' + (isUnread(it) ? '未讀' : '已讀') + '</span>' +
        (isUnread(it) ? '<button type="button" class="mark-read" data-read-id="' + esc(it.id) + '">標記已讀</button>' : '') +
        '</div>' +
        '<h3 class="card-title"><a href="' + esc(it.url) + '" target="_blank" rel="noopener">' +
        esc(displayTitle(it)) + '</a></h3>' +
        (displaySnippet(it) ? '<p class="card-snippet">' + esc(displaySnippet(it)) + '</p>' : "") +
        '<div class="card-actions"><button type="button" class="btn-ghost" data-detail-id="' + esc(it.id) + '">查看完整內容</button><button type="button" class="btn-ghost" data-add-task="' + esc(it.id) + '">加入待辦</button></div>' +
        '</article>';
    }

    function detailItem(id) {
      var current = state.data && state.data.items.find(function (row) { return String(row.id) === String(id); });
      return current || state.assistantItems[String(id)] || null;
    }
    function showDetailDialog() {
      if (!el.detailDialog) return;
      if (typeof el.detailDialog.showModal === "function") {
        if (!el.detailDialog.open) el.detailDialog.showModal();
      } else el.detailDialog.setAttribute("open", "");
    }
    function closeDetailDialog() {
      if (!el.detailDialog) return;
      state.detailRequestGeneration += 1;
      if (typeof el.detailDialog.close === "function") el.detailDialog.close();
      else el.detailDialog.removeAttribute("open");
    }
    function detailFallback(item, message) {
      var renderer = window.CyNewsDetailUI;
      var source = renderer && renderer.safeUrl(item && item.url);
      el.detailBody.innerHTML = '<p class="detail-state">' + esc(message) + '</p>' +
        (displaySnippet(item) ? '<p class="detail-paragraph">' + esc(displaySnippet(item)) + '</p>' : '') +
        (source ? '<a class="detail-source" href="' + esc(source) + '" target="_blank" rel="noopener noreferrer">查看官方原始公告 ↗</a>' : '');
    }
    function openDetail(id) {
      var item = detailItem(id);
      if (!item || !el.detailDialog || !window.CyNewsDetailUI) return;
      el.detailTitle.textContent = displayTitle(item);
      el.detailMeta.textContent = (item.school_name || "官方公告") + " · " + displayDate(item);
      el.detailBody.innerHTML = '<p class="detail-state">正在載入官方完整內容…</p>';
      showDetailDialog();
      var generation = ++state.detailRequestGeneration;
      if (!window.CyNewsDetailUI.validDetailRef(item.detail_ref)) {
        detailFallback(item, window.CyNewsDetailUI.statusMessage(item.detail_status));
        return;
      }
      var cacheKey = item.detail_ref + "@" + String(item.detail_revision || "");
      if (state.detailCache[cacheKey]) {
        el.detailBody.innerHTML = window.CyNewsDetailUI.render(state.detailCache[cacheKey]);
        return;
      }
      fetch(item.detail_ref + "?_=" + encodeURIComponent(item.detail_revision || Date.now()), { cache: "no-store" })
        .then(function (response) { if (!response.ok) throw new Error("detail HTTP " + response.status); return response.json(); })
        .then(function (record) {
          if (generation !== state.detailRequestGeneration) return;
          if (!record || String(record.announcement_id) !== String(item.id) || record.provenance !== "official_article" ||
              (item.detail_revision && String(record.source_hash) !== String(item.detail_revision))) throw new Error("detail identity mismatch");
          state.detailCache[cacheKey] = record;
          el.detailBody.innerHTML = window.CyNewsDetailUI.render(record);
        })
        .catch(function () { if (generation === state.detailRequestGeneration) detailFallback(item, "完整內文載入失敗，請改看官方來源。"); });
    }
    function renderImportant() {
      if (!el.importantList) return;
      var items = state.data ? state.data.items.filter(isExplicitlyImportant).slice(0, 3) : [];
      el.importantList.innerHTML = items.length ? items.map(function (it) {
        return '<article class="important-card"><span class="important-mark" aria-hidden="true">!</span><div><strong><a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(displayTitle(it)) + '</a></strong><p>' + esc(it.school_name) + ' · ' + esc(displayDate(it)) + '</p></div></article>';
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
    function taskDateLabel(due) {
      if (!due) return "未設定截止日期";
      var today = window.CyNewsToday ? window.CyNewsToday.build({ today: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }) }).today : new Date().toISOString().slice(0, 10);
      return (window.CyNewsToday ? window.CyNewsToday.dueLabel(today, due) : due) + " · " + due;
    }
    function taskHTML(task, completed) {
      var dueTarget = task.due_date ? new Date(task.due_date + "T00:00:00+08:00") : null;
      var canRemind = !completed && dueTarget && !isNaN(dueTarget.getTime()) && dueTarget > new Date();
      var reminderMeta = !task.due_date ? '<div class="task-item-meta">沒有可驗證的提醒日期</div>' :
        (canRemind ? '' : '<div class="task-item-meta">提醒日期已過</div>');
      var primary = completed ? '<button type="button" class="btn-ghost" data-task-reopen="' + esc(task.id) + '">復原</button>' : '<button type="button" class="task-complete-button" data-task-complete="' + esc(task.id) + '"><span aria-hidden="true">✓</span>完成</button>';
      var more = '<details class="task-more"><summary aria-label="更多待辦操作">•••</summary><div>' +
        (canRemind ? '<button type="button" class="btn-ghost" data-task-reminder="' + esc(task.id) + '">設定提醒</button>' : '') +
        (!completed ? '<button type="button" class="btn-ghost" data-task-edit="' + esc(task.id) + '">編輯</button>' : '') +
        '<button type="button" class="btn-ghost danger-button" data-task-delete="' + esc(task.id) + '">刪除</button></div></details>';
      return '<article class="task-item' + (completed ? ' is-completed' : '') + '">' +
        '<div class="task-item-main"><div class="task-item-title">' + esc(task.title) + '</div>' +
        '<div class="task-item-meta">' + esc(taskDateLabel(task.due_date)) + (task.priority != null ? ' · 優先 ' + esc(task.priority) : '') + '</div>' +
        (task.notes ? '<div class="task-item-meta">' + esc(task.notes) + '</div>' : '') + reminderMeta + '</div>' +
        '<div class="task-item-actions">' + primary + more + '</div></article>';
    }
    function renderTasks() {
      if (!el.taskOpenList || !window.CyNewsTaskState) return;
      var all = window.CyNewsTaskState.visible(state.tasks || []);
      var open = window.CyNewsTaskState.sortOpen(all), done = all.filter(function (task) { return task.status === "completed"; }).sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; });
      if (el.taskOpenCount) el.taskOpenCount.textContent = open.length ? open.length + " 件" : "";
      if (el.taskDoneCount) el.taskDoneCount.textContent = done.length ? "（" + done.length + "）" : "";
      el.taskOpenList.innerHTML = open.length ? open.map(function (task) { return taskHTML(task, false); }).join("") : '<p class="empty">還沒有待辦。先新增一件小事。</p>';
      el.taskDoneList.innerHTML = done.length ? done.map(function (task) { return taskHTML(task, true); }).join("") : '<p class="empty">完成的待辦會放在這裡。</p>';
    }
    function renderToday() {
      if (!el.viewToday || !window.CyNewsToday) return;
      var projection = window.CyNewsToday.build({
        officialEvents: state.officialEvents,
        announcementItems: state.data ? state.data.items : [],
        tasks: state.tasks,
        reminderRules: state.reminderRules,
        profile: state.profile,
        relevance: function (item, profile) { return window.CyNewsRelevance && window.CyNewsSchoolRegistry ? window.CyNewsRelevance.calculate(item, profile, window.CyNewsSchoolRegistry) : null; },
        feedbackScore: function (key) {
          if (!window.CyNewsAssistantFeedback) return { score: 0, label: "" };
          var signal = window.CyNewsAssistantFeedback.signal(state.assistantFeedback, key);
          var labels = { view: "你曾查看依據", add_task: "你曾加入待辦", complete: "你曾完成相關待辦" };
          return { score: signal.score, label: labels[signal.last_action] || "" };
        },
      });
      if (el.todayCoverage) {
        el.todayCoverage.hidden = state.calendarStatus === "complete";
        el.todayCoverage.textContent = state.calendarStatus === "complete" ? "" : "官方學期行事曆尚未完整公布，先顯示目前已確認的資料。";
      }
      function eventRow(row) { return '<div class="today-item"><div class="today-item-main"><div class="today-item-title">' + esc(row.title) + '</div><div class="today-item-meta">' + esc(row.provenance === "user_event" ? "自己的事件" : (row.event_type || row.kind || "正式行程")) + '</div></div></div>'; }
      function deadlineRow(row) { return '<div class="today-item"><div class="today-item-main"><div class="today-item-title">' + esc(row.title) + '</div><div class="today-item-meta">' + esc(projection.dueLabel(row.date)) + ' · ' + esc(row.date) + '</div></div></div>'; }
      if (el.todayBriefSummary) el.todayBriefSummary.textContent = projection.briefLabel;
      if (el.todayFocus) el.todayFocus.innerHTML = projection.focusItems.length ? projection.focusItems.map(function (row, index) {
        var sourceId = row.source && row.source.id;
        var actions = row.kind === "task" ? '<button type="button" class="btn-ghost" data-task-complete="' + esc(row.id) + '">完成</button>' :
          (sourceId ? '<button type="button" class="btn-ghost" data-detail-id="' + esc(sourceId) + '">查看依據</button><button type="button" class="btn-ghost" data-add-task="' + esc(sourceId) + '">加入待辦</button><button type="button" class="btn-ghost" data-focus-dismiss="' + esc(sourceId) + '">略過</button>' : '');
        return '<article class="today-focus-item"><span class="today-focus-rank" aria-hidden="true">' + (index + 1) + '</span><div class="today-item-main"><div class="today-item-title">' + esc(row.title) + '</div><div class="today-item-meta">' + esc(row.reason) + (row.date ? ' · ' + esc(row.date) : '') + '</div></div><div class="today-focus-actions">' + actions + '</div></article>';
      }).join("") : '<p class="empty">目前沒有足夠證據排出優先事項。</p>';
      if (el.todayTimetable) el.todayTimetable.innerHTML = timetableHTML();
      el.todayEvents.innerHTML = projection.todayEvents.length ? projection.todayEvents.map(eventRow).join("") : '<p class="empty">今天沒有已知正式行程。</p>';
      var upcoming = projection.upcoming.concat(projection.deadlines).concat(projection.upcomingReminders);
      el.todayDeadlines.innerHTML = upcoming.length ? upcoming.map(deadlineRow).join("") : '<p class="empty">接下來 7 天沒有已知截止事項。</p>';
      el.todayTasks.innerHTML = projection.openTasks.length ? projection.openTasks.slice(0, 8).map(function (task) { return '<div class="today-item"><div class="today-item-main"><div class="today-item-title">' + esc(task.title) + '</div><div class="today-item-meta">' + esc(taskDateLabel(task.due_date)) + '</div></div></div>'; }).join("") : '<p class="empty">還沒有待辦。</p>';
      el.todayRelevant.innerHTML = projection.relevantAnnouncements.length ? projection.relevantAnnouncements.map(function (item) { return '<div class="today-item"><div class="today-item-main"><div class="today-item-title">' + esc(displayTitle(item)) + '</div><div class="today-item-meta">' + esc(item.school_name || "公告") + '</div></div></div>'; }).join("") : '<p class="empty">設定我的資料後，這裡會顯示相關公告。</p>';
      var hasUseful = projection.todayEvents.length || upcoming.length || projection.openTasks.length || projection.relevantAnnouncements.length || !!timetableForProfile();
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
        el.assistantAnswer.innerHTML = '<div class="assistant-empty"><h3>目前還無法回答這個問題</h3><p>' + esc(result && result.summary || "請換一種問法，或查看官方公告。") + '</p><small>可能是校方尚未公告、附件沒有可讀文字，或問題不在本站資料範圍。</small></div>';
        return;
      }
      var evidence = result.evidence.map(function (row, index) {
        return '<li><span class="assistant-evidence-rank">' + (index + 1) + '</span><div><strong class="assistant-evidence-title">' + esc(row.title || "官方公告") + '</strong><p>' + esc(row.text) + '</p><button type="button" class="btn-ghost" data-detail-id="' + esc(row.announcement_id) + '">查看這則官方依據</button></div></li>';
      }).join("");
      var sources = result.sources.slice(0, 5).map(function (item) {
        var validityLabel = window.CyNewsAnnouncementValidity && item.validity ? window.CyNewsAnnouncementValidity.label(item.validity) : "";
        var sourceMeta = (item.school_name || "官方公告") + " · " + displayDate(item) + (validityLabel ? " · " + validityLabel : "");
        return '<button type="button" class="assistant-source" data-detail-id="' + esc(item.id) + '"><strong>' + esc(displayTitle(item)) + '</strong><small>' + esc(sourceMeta) + '</small></button>';
      }).join("");
      var answerLines = (result.answer_lines || []).map(function (line) { return '<li>' + esc(line) + '</li>'; }).join("");
      var directAnswer = answerLines ? '<ul class="assistant-answer-lines">' + answerLines + '</ul>' : '';
      var sourcePanel = sources ? '<details class="assistant-details" open><summary>官方來源（' + result.sources.length + '）</summary><div class="assistant-sources">' + sources + '</div></details>' : '';
      var evidencePanel = evidence ? '<details class="assistant-details"><summary>為什麼這樣回答</summary><ol class="assistant-evidence">' + evidence + '</ol></details>' : '';
      var limitation = result.limitation ? '<details class="assistant-details"><summary>資料說明</summary><p class="assistant-limitation">' + esc(result.limitation) + '</p></details>' : '';
      var title = result.query ? '關於「' + esc(result.query) + '」' : '回答';
      el.assistantAnswer.innerHTML = '<section class="assistant-result"><h3>' + title + '</h3><p class="assistant-lead">' + esc(result.summary) + '</p>' + directAnswer + sourcePanel + evidencePanel + limitation + '</section>';
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
          if (el.assistantStatus) el.assistantStatus.textContent = result.status === "answered" ? "已從「" + scope.label + "」官方資料整理，請對照下方依據" : "「" + scope.label + "」尚缺可用的官方資料，請查看相關公告";
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
      if (searchTimer) clearTimeout(searchTimer);
      if (!state.q) { resetPaging(); renderLatest(); return; }
      searchTimer = setTimeout(function () {
        resetPaging();
        if (state.archive === "none") ensureArchive();
        else renderLatest();
      }, 200);
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
    function hasSignedInAccount() {
      return !!(state.accountUser && typeof state.accountUser.id === "string" && state.accountUser.id && state.accountAccess && state.accountAccess.status === "approved");
    }
    function isAdminAccount() {
      return hasSignedInAccount() && !!state.accountAccess.is_admin;
    }
    function switchTab(tab) {
      if (tab !== "latest" && !hasSignedInAccount()) {
        tab = "latest";
        if (el.publicAccessStatus) el.publicAccessStatus.textContent = "此功能需要登入後才能使用。";
      }
      if (tab === "admin" && !isAdminAccount()) tab = "latest";
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
      if (el.viewAdmin) el.viewAdmin.hidden = tab !== "admin";
      if (el.tabHome) el.tabHome.classList.toggle("is-active", home);
      el.tabLatest.classList.toggle("is-active", latest);
      if (el.tabToday) el.tabToday.classList.toggle("is-active", today);
      if (el.tabAssistant) el.tabAssistant.classList.toggle("is-active", assistant);
      if (el.tabCalendar) el.tabCalendar.classList.toggle("is-active", tab === "calendar");
      el.tabSub.classList.toggle("is-active", tab === "sub");
      if (el.tabAdmin) el.tabAdmin.classList.toggle("is-active", tab === "admin");
      if (el.tabHome) el.tabHome.setAttribute("aria-current", home ? "page" : "false");
      el.tabLatest.setAttribute("aria-current", latest ? "page" : "false");
      if (el.tabToday) el.tabToday.setAttribute("aria-current", today ? "page" : "false");
      if (el.tabAssistant) el.tabAssistant.setAttribute("aria-current", assistant ? "page" : "false");
      if (el.tabCalendar) el.tabCalendar.setAttribute("aria-current", tab === "calendar" ? "page" : "false");
      el.tabSub.setAttribute("aria-current", tab === "sub" ? "page" : "false");
      if (el.tabAdmin) el.tabAdmin.setAttribute("aria-current", tab === "admin" ? "page" : "false");
      if (today) { loadOfficialEvents(); loadCalendarStatus(); loadTimetables(); renderToday(); }
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
    if (el.tabAdmin) el.tabAdmin.addEventListener("click", function () { switchTab("admin"); });
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
        navigator.serviceWorker.register("sw.js?v=66").catch(function () {});
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
    fetchData().then(finishInitialLoading);
  }

  loadNotificationStateScript(startApp);
})();

