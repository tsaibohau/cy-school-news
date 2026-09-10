/* Fine-grained capability bridge. Loaded before account-auth.js. */
(function () {
  "use strict";
  var KEYS = ["member_content", "assistant", "timetable", "calendar", "notifications"];
  var LABELS = { member_content: "會員摘要", assistant: "問校務", timetable: "課表", calendar: "行事曆", notifications: "訂閱通知" };
  var current = {};
  var adminRows = {};
  var installed = false;

  function normalize(rows) {
    var out = {};
    KEYS.forEach(function (key) { out[key] = false; });
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (row && KEYS.indexOf(row.capability) !== -1) out[row.capability] = row.enabled === true;
    });
    return out;
  }
  function allowed(key) { return current[key] === true; }
  function applyNavigation() {
    var approved = !!window.__CYNEWS_CAP_APPROVED;
    var map = { tabAssistant: "assistant", tabTimetable: "timetable", tabCalendar: "calendar", tabSub: "notifications" };
    Object.keys(map).forEach(function (id) {
      var node = document.getElementById(id);
      if (node && approved) node.hidden = !allowed(map[id]);
    });
  }
  function renderAdminCapabilities() {
    var root = document.getElementById("adminAccounts");
    if (!root) return;
    root.querySelectorAll(".admin-account").forEach(function (card) {
      var role = card.querySelector(".admin-role-badge");
      if (role && role.getAttribute("data-role") !== "member") return;
      var action = card.querySelector("button[data-admin-user]");
      var userId = action && action.getAttribute("data-admin-user");
      if (!userId || !adminRows[userId]) return;
      var existing = card.querySelector(".capability-editor");
      if (existing) existing.remove();
      var box = document.createElement("fieldset");
      box.className = "capability-editor";
      box.setAttribute("data-capability-user", userId);
      box.innerHTML = '<legend>功能權限</legend><div class="capability-grid">' + KEYS.map(function (key) {
        return '<label class="capability-option"><input type="checkbox" data-capability="' + key + '"' + (adminRows[userId][key] ? " checked" : "") + '> <span>' + LABELS[key] + '</span></label>';
      }).join("") + '</div><button type="button" class="btn-primary capability-save">儲存權限</button><span class="capability-save-state" aria-live="polite"></span>';
      var save = box.querySelector(".capability-save");
      save.addEventListener("click", function () {
        var next = {};
        KEYS.forEach(function (key) {
          var input = box.querySelector('input[data-capability="' + key + '"]');
          next[key] = !!(input && input.checked);
        });
        var state = box.querySelector(".capability-save-state");
        box.disabled = true;
        state.textContent = "儲存中";
        window.__CYNEWS_SET_CAPABILITIES(userId, next).then(function () {
          adminRows[userId] = next;
          state.textContent = "已儲存";
        }).catch(function () {
          state.textContent = "儲存失敗";
        }).finally(function () { box.disabled = false; });
      });
      var actions = card.querySelector(".admin-account-actions") || card;
      actions.insertBefore(box, actions.firstChild);
      var legacy = card.querySelector(".admin-service-label");
      if (legacy) legacy.hidden = true;
      card.querySelectorAll("button[data-admin-access='approved']").forEach(function (button) {
        if (button.textContent.indexOf("儲存服務") !== -1) button.hidden = true;
      });
    });
  }
  function observe() {
    if (installed || !document.documentElement) return;
    installed = true;
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      setTimeout(function () { queued = false; applyNavigation(); renderAdminCapabilities(); }, 0);
    }).observe(document.documentElement, { childList: true, subtree: true });
    applyNavigation();
    renderAdminCapabilities();
  }

  var assigned;
  Object.defineProperty(window, "CyNewsAccountAuth", {
    configurable: true,
    get: function () { return assigned; },
    set: function (api) {
      assigned = api;
      if (!api || typeof api.createController !== "function" || api.__capabilityWrapped) return;
      var originalCreate = api.createController;
      api.createController = function (options) {
        var controller = originalCreate(options);
        var originalAccess = controller.getAccountAccess;
        var originalAdmin = controller.getAdminAccounts;
        controller.getAccountAccess = function () {
          return originalAccess.call(controller).then(function (access) {
            return controller.getClient().then(function (c) { return c.rpc("current_account_capabilities"); }).then(function (result) {
              if (result.error) throw result.error;
              current = normalize(result.data);
              access.capabilities = current;
              window.__CYNEWS_CAP_APPROVED = access.status === "approved";
              setTimeout(applyNavigation, 0);
              return access;
            });
          });
        };
        controller.getAdminAccounts = function (filters) {
          return originalAdmin.call(controller, filters).then(function (rows) {
            var ids = rows.map(function (row) { return row.user_id; }).filter(Boolean);
            if (!ids.length) { adminRows = {}; return rows; }
            return controller.getClient().then(function (c) { return c.rpc("admin_account_capabilities", { target_user_ids: ids }); }).then(function (result) {
              if (result.error) throw result.error;
              adminRows = {};
              rows.forEach(function (row) { adminRows[row.user_id] = normalize([]); });
              (result.data || []).forEach(function (row) {
                if (adminRows[row.user_id] && KEYS.indexOf(row.capability) !== -1) adminRows[row.user_id][row.capability] = row.enabled === true;
              });
              setTimeout(renderAdminCapabilities, 0);
              return rows;
            });
          });
        };
        controller.setAccountCapabilities = function (userId, capabilities) {
          return controller.getClient().then(function (c) {
            return c.rpc("admin_set_account_capabilities", { target_user_id: userId, next_capabilities: capabilities });
          }).then(function (result) { if (result.error) throw result.error; });
        };
        window.__CYNEWS_SET_CAPABILITIES = controller.setAccountCapabilities;
        return controller;
      };
      api.__capabilityWrapped = true;
      setTimeout(observe, 0);
    }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observe); else observe();
})();
