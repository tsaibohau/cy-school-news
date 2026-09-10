/* Fine-grained capability compatibility layer. Loaded before account-auth.js. */
(function (root) {
  "use strict";

  var KEYS = ["member_content", "assistant", "timetable", "calendar", "notifications"];
  var LABELS = { member_content: "會員摘要", assistant: "問校務", timetable: "課表", calendar: "行事曆", notifications: "訂閱通知" };
  var current = emptyMap();
  var adminRows = {};
  var approved = false;
  var observerStarted = false;

  function emptyMap() {
    return { member_content: false, assistant: false, timetable: false, calendar: false, notifications: false };
  }
  function normalize(rows) {
    var out = emptyMap();
    if (rows && !Array.isArray(rows) && typeof rows === "object") {
      KEYS.forEach(function (key) { out[key] = rows[key] === true; });
      return out;
    }
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (row && KEYS.indexOf(row.capability) !== -1) out[row.capability] = row.enabled === true;
    });
    return out;
  }
  function snapshot() { return normalize(current); }
  function has(key) { return approved && current[key] === true; }
  function any(keys) { return approved && keys.some(function (key) { return current[key] === true; }); }
  function anyPersonal() { return any(["assistant", "timetable", "calendar", "notifications"]); }
  function setHidden(node, hidden) {
    if (node && node.hidden !== !!hidden) node.hidden = !!hidden;
  }
  function closest(node, selector) { return node && typeof node.closest === "function" ? node.closest(selector) : null; }
  function statusMessage(text) {
    var node = document.getElementById("publicAccessStatus");
    if (node) node.textContent = text;
  }

  function applyVisibility() {
    if (typeof document === "undefined") return;
    var map = {
      tabAssistant: has("assistant"),
      tabTimetable: has("timetable"),
      tabCalendar: has("calendar"),
      tabSub: anyPersonal(),
      tabHome: anyPersonal(),
      tabToday: anyPersonal(),
    };
    Object.keys(map).forEach(function (id) { setHidden(document.getElementById(id), !map[id]); });

    document.querySelectorAll("[data-home-tab]").forEach(function (button) {
      var tab = button.getAttribute("data-home-tab");
      var allowed = tab === "latest" || tab === "today" && anyPersonal() || tab === "assistant" && has("assistant") || tab === "calendar" && has("calendar") || tab === "sub" && anyPersonal();
      setHidden(button, !allowed);
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

    if (approved && !has("member_content")) {
      document.querySelectorAll("button[data-detail-id], button[data-read-id], .read-state, .mark-read").forEach(function (node) { setHidden(node, true); });
    }
    if (approved && !has("calendar")) {
      document.querySelectorAll("button[data-add-task]").forEach(function (node) { setHidden(node, true); });
    }
  }

  function capabilitySummary(map) {
    var enabled = KEYS.filter(function (key) { return map[key]; }).map(function (key) { return LABELS[key]; });
    return enabled.length ? enabled.join("、") : "未開放功能";
  }

  function renderAdminCapabilities() {
    if (typeof document === "undefined") return;
    var rootNode = document.getElementById("adminAccounts");
    if (!rootNode) return;
    rootNode.querySelectorAll(".admin-account").forEach(function (card) {
      var role = card.querySelector(".admin-role-badge");
      if (role && role.getAttribute("data-role") !== "member") return;
      var action = card.querySelector("button[data-admin-user]");
      var userId = action && action.getAttribute("data-admin-user");
      var map = userId && adminRows[userId];
      if (!userId || !map) return;

      var legacy = card.querySelector(".admin-service-label");
      if (legacy) legacy.hidden = true;
      var meta = card.querySelectorAll(".admin-account-meta span");
      if (meta.length > 1) {
        var summary = "功能權限：" + capabilitySummary(map);
        if (meta[1].textContent !== summary) meta[1].textContent = summary;
      }
      card.querySelectorAll("button[data-admin-access='approved']").forEach(function (button) {
        if (button.textContent.indexOf("儲存服務") !== -1) button.hidden = true;
      });

      if (card.querySelector(".capability-editor")) return;
      var box = document.createElement("fieldset");
      box.className = "capability-editor";
      box.setAttribute("data-capability-user", userId);
      box.innerHTML = '<legend>功能權限</legend><div class="capability-grid">' + KEYS.map(function (key) {
        return '<label class="capability-option"><input type="checkbox" data-capability="' + key + '"' + (map[key] ? " checked" : "") + '> <span>' + LABELS[key] + '</span></label>';
      }).join("") + '</div><button type="button" class="btn-primary capability-save">儲存權限</button><span class="capability-save-state" aria-live="polite"></span>';
      box.querySelector(".capability-save").addEventListener("click", function () {
        var next = emptyMap();
        KEYS.forEach(function (key) {
          var input = box.querySelector('input[data-capability="' + key + '"]');
          next[key] = !!(input && input.checked);
        });
        var state = box.querySelector(".capability-save-state");
        box.disabled = true;
        state.textContent = "儲存中";
        if (typeof root.__CYNEWS_SET_CAPABILITIES !== "function") {
          state.textContent = "儲存失敗";
          box.disabled = false;
          return;
        }
        root.__CYNEWS_SET_CAPABILITIES(userId, next).then(function () {
          adminRows[userId] = normalize(next);
          state.textContent = "已儲存";
          var metaRows = card.querySelectorAll(".admin-account-meta span");
          if (metaRows.length > 1) metaRows[1].textContent = "功能權限：" + capabilitySummary(adminRows[userId]);
        }).catch(function () {
          state.textContent = "儲存失敗";
        }).finally(function () { box.disabled = false; });
      });
      var actions = card.querySelector(".admin-account-actions") || card;
      actions.insertBefore(box, actions.firstChild);
    });
  }

  function requiredForTarget(target) {
    if (!target || typeof target.closest !== "function") return null;
    if (target.closest("#tabAssistant,[data-home-tab='assistant']")) return "assistant";
    if (target.closest("#tabTimetable")) return "timetable";
    if (target.closest("#tabCalendar,[data-home-tab='calendar']")) return "calendar";
    if (target.closest("#tabSub,[data-home-tab='sub']")) return "personal";
    if (target.closest("#tabHome,#tabToday,[data-home-tab='today']")) return "personal";
    if (target.closest("[data-today-action='task'],button[data-add-task]")) return "calendar";
    if (target.closest("[data-today-action='keyword']")) return "notifications";
    if (target.closest("button[data-detail-id],button[data-read-id],.mark-read")) return "member_content";
    return null;
  }
  function allowedRequirement(requirement) {
    if (!approved) return true;
    if (requirement === "personal") return anyPersonal();
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
      renderAdminCapabilities();
    }).observe(document.documentElement, { childList: true, subtree: true });
    applyVisibility();
    renderAdminCapabilities();
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
            access.capabilities = snapshot();
            setTimeout(applyVisibility, 0);
            return access;
          });
        });
      };
      controller.getAdminAccounts = function (filters) {
        return originalAdmin.call(controller, filters).then(function (rows) {
          var ids = rows.map(function (row) { return row.user_id; }).filter(Boolean);
          adminRows = {};
          if (!ids.length) return rows;
          return controller.getClient().then(function (client) {
            return client.rpc("admin_account_capabilities", { target_user_ids: ids });
          }).then(function (result) {
            if (result.error) throw result.error;
            rows.forEach(function (row) { adminRows[row.user_id] = emptyMap(); });
            (result.data || []).forEach(function (row) {
              if (adminRows[row.user_id] && KEYS.indexOf(row.capability) !== -1) adminRows[row.user_id][row.capability] = row.enabled === true;
            });
            setTimeout(renderAdminCapabilities, 0);
            return rows;
          });
        });
      };
      controller.setAccountCapabilities = function (userId, capabilities) {
        return controller.getClient().then(function (client) {
          return client.rpc("admin_set_account_capabilities", { target_user_id: userId, next_capabilities: normalize(capabilities) });
        }).then(function (result) { if (result.error) throw result.error; });
      };
      root.__CYNEWS_SET_CAPABILITIES = controller.setAccountCapabilities;
      return controller;
    };
    api.__capabilityWrapped = true;
  }

  root.CyNewsCapabilities = {
    KEYS: KEYS.slice(),
    LABELS: Object.assign({}, LABELS),
    current: snapshot,
    has: has,
    anyPersonal: anyPersonal,
    applyVisibility: applyVisibility,
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
