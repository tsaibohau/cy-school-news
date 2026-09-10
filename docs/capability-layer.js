/* Fine-grained capability bridge. Loaded before account-auth.js and wraps it without exposing privileged keys. */
(function () {
  "use strict";
  var KEYS = ["member_content", "assistant", "timetable", "calendar", "notifications"];
  var LABELS = { member_content: "會員摘要", assistant: "問校務", timetable: "課表", calendar: "行事曆", notifications: "訂閱通知" };
  var current = {}, adminRows = {}, installed = false;
  function normalize(rows) { var out = {}; KEYS.forEach(function (key) { out[key] = false; }); (Array.isArray(rows) ? rows : []).forEach(function (row) { if (row && KEYS.indexOf(row.capability) !== -1) out[row.capability] = row.enabled === true; }); return out; }
  function allowed(key) { return current[key] === true; }
  function setHidden(node, hidden) { if (node && node.hidden !== hidden) node.hidden = hidden; }
  function applyNavigation() {
    var approved = !!window.__CYNEWS_CAP_APPROVED;
    var map = { tabAssistant: "assistant", tabTimetable: "timetable", tabCalendar: "calendar", tabSub: "notifications" };
    Object.keys(map).forEach(function (id) { if (approved) setHidden(document.getElementById(id), !allowed(map[id])); });
    var personal = allowed("assistant") || allowed("timetable") || allowed("calendar") || allowed("notifications");
    ["tabHome", "tabToday"].forEach(function (id) { if (approved) setHidden(document.getElementById(id), !personal); });
  }
  function renderAdminCapabilities() {
    var root = document.getElementById("adminAccounts"); if (!root) return;
    root.querySelectorAll(".admin-account").forEach(function (card) {
      if (card.querySelector(".capability-editor")) return;
      var userNode = card.querySelector("[data-admin-user]"), role = card.querySelector(".admin-role-badge");
      var userId = userNode && userNode.getAttribute("data-admin-user");
      if (!userId || !adminRows[userId] || (role && role.getAttribute("data-role") !== "member")) return;
      var box = document.createElement("fieldset"); box.className = "capability-editor";
      box.innerHTML = "<legend>功能權限</legend>" + KEYS.map(function (key) { return '<label><input type="checkbox" data-capability="' + key + '"' + (adminRows[userId][key] ? " checked" : "") + '> ' + LABELS[key] + "</label>"; }).join("") + '<span class="capability-save-state" aria-live="polite"></span>';
      box.addEventListener("change", function (event) {
        if (!event.target.matches("input[data-capability]")) return;
        var next = {}; KEYS.forEach(function (key) { var input = box.querySelector('input[data-capability="' + key + '"]'); next[key] = !!(input && input.checked); });
        var state = box.querySelector(".capability-save-state"); box.disabled = true; state.textContent = "儲存中";
        window.__CYNEWS_SET_CAPABILITIES(userId, next).then(function () { adminRows[userId] = next; state.textContent = "已儲存"; }).catch(function () { state.textContent = "儲存失敗"; }).finally(function () { box.disabled = false; });
      });
      var actions = card.querySelector(".admin-account-actions") || card; actions.insertBefore(box, actions.firstChild);
      var legacy = card.querySelector(".admin-service-label"); if (legacy) legacy.hidden = true;
    });
  }
  function observe() {
    if (installed || !document.documentElement) return; installed = true;
    new MutationObserver(function () { applyNavigation(); renderAdminCapabilities(); }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    applyNavigation(); renderAdminCapabilities();
  }
  var assigned;
  Object.defineProperty(window, "CyNewsAccountAuth", { configurable: true, get: function () { return assigned; }, set: function (api) {
    assigned = api; if (!api || typeof api.createController !== "function" || api.__capabilityWrapped) return;
    var originalCreate = api.createController;
    api.createController = function (options) {
      var controller = originalCreate(options), originalAccess = controller.getAccountAccess, originalAdmin = controller.getAdminAccounts;
      controller.getAccountAccess = function () { return originalAccess.call(controller).then(function (access) { return controller.getClient().then(function (c) { return c.rpc("current_account_capabilities"); }).then(function (result) { if (result.error) throw result.error; current = normalize(result.data); access.capabilities = current; window.__CYNEWS_CAP_APPROVED = access.status === "approved"; setTimeout(applyNavigation, 0); return access; }); }); };
      controller.getAdminAccounts = function (filters) { return originalAdmin.call(controller, filters).then(function (rows) { var ids = rows.map(function (row) { return row.user_id; }).filter(Boolean); if (!ids.length) return rows; return controller.getClient().then(function (c) { return c.rpc("admin_account_capabilities", { target_user_ids: ids }); }).then(function (result) { if (result.error) throw result.error; adminRows = {}; rows.forEach(function (row) { adminRows[row.user_id] = normalize([]); }); (result.data || []).forEach(function (row) { if (adminRows[row.user_id] && KEYS.indexOf(row.capability) !== -1) adminRows[row.user_id][row.capability] = row.enabled === true; }); setTimeout(renderAdminCapabilities, 0); return rows; }); }); };
      controller.setAccountCapabilities = function (userId, capabilities) { return controller.getClient().then(function (c) { return c.rpc("admin_set_account_capabilities", { target_user_id: userId, next_capabilities: capabilities }); }).then(function (result) { if (result.error) throw result.error; }); };
      window.__CYNEWS_SET_CAPABILITIES = controller.setAccountCapabilities; return controller;
    };
    api.__capabilityWrapped = true; setTimeout(observe, 0);
  }});
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observe); else observe();
})();
