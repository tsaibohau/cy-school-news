/* Fine-grained capability compatibility layer. Loaded before account-auth.js. */
(function (root) {
  "use strict";

  var KEYS = ["member_content", "assistant", "timetable", "calendar", "notifications"];
  var PUBLIC_KEYS = ["member_content", "assistant", "timetable", "calendar"];
  var LABELS = { member_content: "會員摘要", assistant: "問校務", timetable: "課表", calendar: "行事曆", notifications: "訂閱通知" };
  var current = emptyMap();
  var publicCurrent = emptyMap();
  var memberPolicy = null;
  /* Features the user's school cannot offer (no class timetable for that school, …) are hidden
     whatever the policy says. Set by the app from its data: { timetable: false }. */
  var schoolSupport = {};
  var approved = false;
  var authenticated = false;
  var owner = false;
  var observerStarted = false;

  function emptyMap() {
    return { member_content: false, assistant: false, timetable: false, calendar: false, notifications: false };
  }
  function normalizeFor(rows, allowedKeys) {
    var out = emptyMap();
    if (rows && !Array.isArray(rows) && typeof rows === "object") {
      allowedKeys.forEach(function (key) { out[key] = rows[key] === true; });
      return out;
    }
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (row && allowedKeys.indexOf(row.capability) !== -1) out[row.capability] = row.enabled === true;
    });
    return out;
  }
  function normalize(rows) { return normalizeFor(rows, KEYS); }
  function normalizePublic(rows) { return normalizeFor(rows, PUBLIC_KEYS); }
  function snapshot() { return normalize(current); }
  function has(key) {
    if (schoolSupport[key] === false) return false;
    return (approved ? current[key] : !authenticated && publicCurrent[key]) === true;
  }
  function any(keys) { return keys.some(function (key) { return has(key); }); }
  function anyPersonal() { return any(["assistant", "timetable", "calendar", "notifications"]); }
  function setHidden(node, hidden) {
    if (node && node.hidden !== !!hidden) node.hidden = !!hidden;
  }
  function closest(node, selector) { return node && typeof node.closest === "function" ? node.closest(selector) : null; }
  function statusMessage(text) {
    var node = document.getElementById("publicAccessStatus");
    if (node) node.textContent = text;
  }
  function setButtonAvailability(button, allowed, reason) {
    if (!button) return;
    button.disabled = !allowed;
    button.setAttribute("aria-disabled", allowed ? "false" : "true");
    button.classList.toggle("is-capability-disabled", !allowed);
    var detail = button.querySelector("small");
    if (detail) {
      if (!detail.hasAttribute("data-available-copy")) detail.setAttribute("data-available-copy", detail.textContent);
      var copy = allowed ? detail.getAttribute("data-available-copy") : reason;
      if (detail.textContent !== copy) detail.textContent = copy;
    }
  }

  function applyVisibility() {
    if (typeof document === "undefined") return;
    var publicEntry = !authenticated && any(["assistant", "timetable", "calendar"]);
    var map = {
      tabAssistant: has("assistant"),
      tabTimetable: has("timetable"),
      tabCalendar: has("calendar"),
      tabSub: anyPersonal(),
      tabHome: true,
      tabToday: anyPersonal(),
      functionDock: approved || publicEntry,
    };
    Object.keys(map).forEach(function (id) { setHidden(document.getElementById(id), !map[id]); });
    setHidden(document.getElementById("addEvent"), !(authenticated && approved && current.calendar));

    document.querySelectorAll("[data-home-tab]").forEach(function (button) {
      var tab = button.getAttribute("data-home-tab");
      var allowed = tab === "latest" || tab === "sub" || tab === "today" && anyPersonal() || tab === "assistant" && has("assistant") || tab === "calendar" && has("calendar") || tab === "timetable" && has("timetable");
      var reason = authenticated ? "此功能目前未開放" : "此功能目前未對訪客開放";
      // 課表入口只在有課表權限時出現；其他入口以停用狀態說明原因。
      setHidden(button, tab === "timetable" && !allowed);
      setButtonAvailability(button, allowed, reason);
    });
    document.querySelectorAll("[data-today-action='task']").forEach(function (node) { setHidden(node, !has("calendar")); });
    document.querySelectorAll("[data-today-action='keyword']").forEach(function (node) { setHidden(node, !has("notifications")); });

    var kwForm = document.getElementById("kwForm");
    setHidden(closest(kwForm, "section"), !has("notifications"));
    var reminder = document.getElementById("reminderPushToggle");
    setHidden(closest(reminder, "details"), !has("notifications"));
    setHidden(document.getElementById("tasksBox"), !has("calendar"));
    document.querySelectorAll(".matched-card").forEach(function (node) { setHidden(node, !has("notifications")); });
    var personalized = document.getElementById("personalizedToggle");
    setHidden(closest(personalized, "label"), !has("notifications"));
    var profileExtra = document.querySelector("#profileForm fieldset.full-service-only");
    setHidden(profileExtra, !(has("assistant") || has("notifications")));

    document.querySelectorAll("button[data-detail-id], button[data-read-id], .read-state, .mark-read").forEach(function (node) {
      /* 問校務列出的公告和依據人人都看得到（訪客點了會看到標題並連到校網原文）。 */
      if (closest(node, "#viewAssistant")) return;
      setHidden(node, !has("member_content"));
    });
    document.querySelectorAll("button[data-add-task]").forEach(function (node) { setHidden(node, !has("calendar")); });
    /* Lets the app react (for example, open 問校務 once it becomes available). */
    if (typeof CustomEvent === "function" && document.dispatchEvent) document.dispatchEvent(new CustomEvent("cy-capabilities-applied"));
  }

  /* 一般使用者功能: one policy for every regular member, set by a primary administrator.
     Administrators always keep every feature. Co-admins see the policy read-only. */
  function renderMemberPolicy() {
    if (typeof document === "undefined") return;
    var existing = document.getElementById("memberCapabilityEditor");
    var admin = document.getElementById("viewAdmin");
    if (!memberPolicy || !admin) { if (existing && !memberPolicy) existing.remove(); return; }
    if (existing) return;
    var box = document.createElement("fieldset");
    box.id = "memberCapabilityEditor";
    box.className = "capability-editor";
    box.innerHTML = '<legend>一般使用者功能</legend><p class="hint">所有已核准的一般使用者都使用同一組功能；管理員永遠擁有全部功能。使用者設定的學校不支援的功能（例如該校沒有班級課表）會自動隱藏。' +
      (owner ? '' : '只有主要管理員可以修改。') + '</p><div class="capability-grid">' + KEYS.map(function (key) {
      return '<label class="capability-option"><input type="checkbox" data-member-capability="' + key + '"' + (memberPolicy[key] ? " checked" : "") + (owner ? "" : " disabled") + '> <span>' + LABELS[key] + '</span></label>';
    }).join("") + '</div>' + (owner ? '<button type="button" class="btn-primary">儲存一般使用者功能</button>' : '') + '<span class="capability-save-state" aria-live="polite"></span>';
    var save = box.querySelector("button");
    if (save) save.addEventListener("click", function () {
      var next = emptyMap(), state = box.querySelector(".capability-save-state");
      KEYS.forEach(function (key) { next[key] = box.querySelector('[data-member-capability="' + key + '"]').checked; });
      box.disabled = true; state.textContent = "儲存中";
      root.__CYNEWS_SET_MEMBER_CAPABILITIES(next).then(function () {
        memberPolicy = normalize(next); state.textContent = "已儲存，所有一般使用者下次開啟網站時生效";
      }).catch(function () { state.textContent = "儲存失敗：僅主要管理員可修改"; }).finally(function () { box.disabled = false; });
    });
    var heading = admin.querySelector(".admin-subheading");
    admin.insertBefore(box, heading ? heading.nextSibling : admin.firstChild);
  }

  function renderPublicCapabilities() {
    if (typeof document === "undefined") return;
    var existing = document.getElementById("publicCapabilityEditor");
    if (!owner) {
      if (existing) existing.remove();
      return;
    }
    var admin = document.getElementById("viewAdmin");
    if (!admin || existing) return;
    var box = document.createElement("fieldset");
    box.id = "publicCapabilityEditor";
    box.className = "capability-editor";
    box.innerHTML = '<legend>PUBLIC／未登入權限</legend><p class="hint">這些開關影響所有未登入訪客，並由資料庫 RPC 同步強制執行。個人化通知必須登入，不屬於 PUBLIC 權限。</p><div class="capability-grid">' + PUBLIC_KEYS.map(function (key) {
      return '<label class="capability-option"><input type="checkbox" data-public-capability="' + key + '"' + (publicCurrent[key] ? " checked" : "") + '> <span>' + LABELS[key] + '</span></label>';
    }).join("") + '</div><button type="button" class="btn-primary">儲存 PUBLIC 權限</button><span class="capability-save-state" aria-live="polite"></span>';
    box.querySelector("button").addEventListener("click", function () {
      var next = emptyMap(), state = box.querySelector(".capability-save-state");
      PUBLIC_KEYS.forEach(function (key) { next[key] = box.querySelector('[data-public-capability="' + key + '"]').checked; });
      box.disabled = true; state.textContent = "儲存中";
      root.__CYNEWS_SET_PUBLIC_CAPABILITIES(next).then(function () {
        publicCurrent = normalizePublic(next); state.textContent = "已儲存"; applyVisibility();
      }).catch(function () { state.textContent = "儲存失敗：僅主要管理員可修改"; }).finally(function () { box.disabled = false; });
    });
    var heading = admin.querySelector(".admin-subheading");
    admin.insertBefore(box, heading ? heading.nextSibling : admin.firstChild);
  }

  function requiredForTarget(target) {
    if (!target || typeof target.closest !== "function") return null;
    if (target.closest("#tabAssistant,[data-home-tab='assistant']")) return "assistant";
    if (target.closest("#tabTimetable")) return "timetable";
    if (target.closest("#tabCalendar,[data-home-tab='calendar']")) return "calendar";
    if (target.closest("#addEvent,#eventForm,[data-edit-event],[data-delete-event]")) return "member_calendar";
    if (target.closest("#tabSub,[data-home-tab='sub'],#tabHome")) return null;
    if (target.closest("#tabToday,[data-home-tab='today']")) return "personal";
    if (target.closest("[data-today-action='task'],button[data-add-task]")) return "calendar";
    if (target.closest("[data-today-action='keyword']")) return "notifications";
    if (target.closest("button[data-detail-id],button[data-read-id],.mark-read")) return "member_content";
    return null;
  }
  function allowedRequirement(requirement) {
    if (requirement === "personal") return anyPersonal();
    if (requirement === "member_calendar") return authenticated && approved && current.calendar;
    return !requirement || has(requirement);
  }

  function startDomGuards() {
    if (observerStarted || typeof document === "undefined") return;
    observerStarted = true;
    document.addEventListener("click", function (event) {
      var requirement = requiredForTarget(event.target);
      if (!allowedRequirement(requirement)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        statusMessage("此帳號尚未開放這項功能。");
      }
    }, true);
    new MutationObserver(function () {
      applyVisibility();
      renderMemberPolicy();
      renderPublicCapabilities();
    }).observe(document.documentElement, { childList: true, subtree: true });
    applyVisibility();
    renderMemberPolicy();
  }

  function wrapAuth(api) {
    if (!api || typeof api.createController !== "function" || api.__capabilityWrapped) return;
    var originalCreate = api.createController;
    api.createController = function (options) {
      var controller = originalCreate(options);
      var originalAccess = controller.getAccountAccess;
      var originalAdmin = controller.getAdminAccounts;
      controller.getAccountAccess = function () {
        return originalAccess.call(controller).then(function (access) {
          return controller.getClient().then(function (client) { return client.rpc("current_account_capabilities"); }).then(function (result) {
            if (result.error) throw result.error;
            current = normalize(result.data);
            approved = access.status === "approved";
            authenticated = true;
            owner = access.admin_role === "owner";
            access.capabilities = snapshot();
            setTimeout(applyVisibility, 0);
            return access;
          });
        });
      };
      controller.getPublicCapabilities = function () {
        return controller.getClient().then(function (client) { return client.rpc("current_public_capabilities"); }).then(function (result) {
          if (result.error) throw result.error;
          publicCurrent = normalizePublic(result.data); setTimeout(function () { applyVisibility(); renderPublicCapabilities(); }, 0);
          return normalizePublic(publicCurrent);
        });
      };
      controller.setPublicCapabilities = function (capabilities) {
        return controller.getClient().then(function (client) { return client.rpc("owner_set_public_capabilities", { next_capabilities: normalizePublic(capabilities) }); }).then(function (result) { if (result.error) throw result.error; });
      };
      controller.getAuthCutoverReadiness = function () {
        return controller.getClient().then(function (client) { return client.rpc("owner_auth_cutover_readiness"); }).then(function (result) { if (result.error) throw result.error; return result.data && result.data[0]; });
      };
      controller.getMemberCapabilities = function () {
        return controller.getClient().then(function (client) { return client.rpc("current_member_capabilities"); }).then(function (result) {
          if (result.error) throw result.error;
          memberPolicy = normalize(result.data);
          var stale = typeof document !== "undefined" && document.getElementById("memberCapabilityEditor");
          if (stale) stale.remove();
          setTimeout(renderMemberPolicy, 0);
          return normalize(memberPolicy);
        });
      };
      controller.setMemberCapabilities = function (capabilities) {
        return controller.getClient().then(function (client) { return client.rpc("owner_set_member_capabilities", { next_capabilities: normalize(capabilities) }); }).then(function (result) { if (result.error) throw result.error; });
      };
      controller.getAdminAccounts = function (filters) {
        return originalAdmin.call(controller, filters).then(function (rows) {
          /* The policy editor sits above the account list; a database without the policy yet is skipped. */
          controller.getMemberCapabilities().catch(function () {});
          return rows;
        });
      };
      root.__CYNEWS_SET_MEMBER_CAPABILITIES = controller.setMemberCapabilities;
      root.__CYNEWS_SET_PUBLIC_CAPABILITIES = controller.setPublicCapabilities;
      return controller;
    };
    api.__capabilityWrapped = true;
  }

  root.CyNewsCapabilities = {
    KEYS: KEYS.slice(),
    PUBLIC_KEYS: PUBLIC_KEYS.slice(),
    LABELS: Object.assign({}, LABELS),
    current: snapshot,
    has: has,
    anyPersonal: anyPersonal,
    applyVisibility: applyVisibility,
    /* { timetable: false } hides features the user's school does not have. */
    setSchoolSupport: function (map) {
      var next = {};
      Object.keys(map || {}).forEach(function (key) { if (KEYS.indexOf(key) !== -1 && map[key] === false) next[key] = false; });
      if (JSON.stringify(next) === JSON.stringify(schoolSupport)) return;
      schoolSupport = next;
      applyVisibility();
    },
    setAuthenticated: function (value) { authenticated = value === true; if (!authenticated) { approved = false; owner = false; current = emptyMap(); memberPolicy = null; } applyVisibility(); },
  };

  var assignedAuth = root.CyNewsAccountAuth;
  try {
    Object.defineProperty(root, "CyNewsAccountAuth", {
      configurable: true,
      get: function () { return assignedAuth; },
      set: function (api) { assignedAuth = api; wrapAuth(api); },
    });
  } catch (_) {}
  if (assignedAuth) wrapAuth(assignedAuth);
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startDomGuards);
    else startDomGuards();
  }
})(typeof window !== "undefined" ? window : this);
