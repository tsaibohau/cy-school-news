/* Full app simulation: signed Preview login, real branch metadata, local mutations. */
(function () {
  "use strict";
  var original = window.CyNewsAccountAuth, createOriginal = original.createController;
  var key = "cynews-full-preview-session:" + location.host, listeners = [], session = null, catalog = null;
  var tables = {}, deleted = new Set(), decisions = [], archived = [];
  var caps = { member_content: true, assistant: true, timetable: true, calendar: true, notifications: true };
  var publicCaps = { member_content: false, assistant: false, timetable: false, calendar: false };
  var accountCaps = {}, accounts = [{ user_id: "mock-member", email: "模擬學生@example.invalid", status: "pending", admin_role: null, service_level: "full", requested_at: "", total_count: 1 }];
  window.CYNEWS_MOCK_ADMIN_MODE = true; window.CYNEWS_MOCK_SYSTEM_MODE = true;
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  async function request(action, body, token) {
    var response = await fetch("/api/mock-admin?action=" + action, { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: token ? "Bearer " + token : "" }, body: JSON.stringify(body || {}) });
    var data = await response.json();
    if (!response.ok) throw new Error(data.error === "mock_account_expired" ? "模擬帳密已到期" : "模擬登入失效或操作無法使用");
    return data;
  }
  function notify(event) { listeners.forEach(function (fn) { setTimeout(function () { fn(event, session); }, 0); }); }
  async function verified() {
    var token = sessionStorage.getItem(key); if (!token) { session = null; return null; }
    try {
      var data = await request("session", {}, token);
      session = { access_token: token, user: { id: data.user.id, email: "hau-preview@example.invalid", user_metadata: { nickname: "預覽管理員（模擬）" } } };
      return session;
    } catch (error) { sessionStorage.removeItem(key); session = null; notify("SIGNED_OUT"); return null; }
  }
  async function requireSession() { var value = await verified(); if (!value) throw new Error("請登入模擬管理員"); return value; }
  async function corpus() {
    var value = await requireSession();
    if (!catalog) catalog = (await request("system-catalog", {}, value.access_token)).items;
    return copy(catalog);
  }
  function signOut() { sessionStorage.removeItem(key); session = null; tables = {}; deleted.clear(); decisions = []; archived = []; notify("SIGNED_OUT"); return Promise.resolve({}); }
  async function signIn(identifier, password) {
    var data = await request("login", { username: String(identifier).trim(), password: password });
    sessionStorage.setItem(key, data.token); await requireSession(); notify("SIGNED_IN"); return { session: session, user: session.user };
  }
  function localQuery(table) {
    // Only these local simulation tables exist. No fallback to a remote client.
    if (!/^user_(subscriptions|reads|preferences|tasks|calendar_events|reminder_rules)$/.test(table)) throw new Error("非模擬資料表");
    var filters = [], mode = "select", payload = [], conflict = "id";
    var query = { select: function () { return query; }, eq: function (field, value) { filters.push([field, value]); return query; },
      order: function () { return query; }, limit: function () { return query; },
      upsert: function (rows, options) { mode = "upsert"; payload = Array.isArray(rows) ? rows : [rows]; conflict = options && options.onConflict || "id"; return query; },
      delete: function () { mode = "delete"; return query; },
      then: function (resolve, reject) { return requireSession().then(function (value) {
        var rows = tables[table] || [], matches = function (row) { return filters.every(function (f) { return row[f[0]] === f[1]; }); };
        if (mode === "delete") tables[table] = rows.filter(function (row) { return !matches(row); });
        if (mode === "upsert") {
          payload.forEach(function (row) {
            if (row.user_id !== value.user.id) throw new Error("模擬帳號不符");
            var fields = conflict.split(","), index = rows.findIndex(function (old) { return fields.every(function (field) { return old[field] === row[field]; }); });
            if (index < 0) rows.push(copy(row)); else rows[index] = copy(row);
          }); tables[table] = rows;
        }
        return { data: copy(mode === "upsert" ? payload : rows.filter(matches)), error: null };
      }).then(resolve, reject); } };
    return query;
  }
  async function rpc(name, args) {
    args = args || {};
    if (name === "current_public_capabilities") return { data: copy(publicCaps) };
    await requireSession();
    var data = [];
    if (name === "current_account_access") data = [{ status: "approved", is_admin: true, admin_role: "owner", service_level: "full", mode: "simulated" }];
    else if (name === "current_account_capabilities") data = copy(caps);
    else if (name === "owner_set_public_capabilities") publicCaps = copy(args.next_capabilities);
    else if (name === "admin_account_capabilities") data = accounts.flatMap(function (row) { return Object.keys(caps).map(function (k) { return { user_id: row.user_id, capability: k, enabled: (accountCaps[row.user_id] || caps)[k] }; }); });
    else if (name === "admin_set_account_capabilities") accountCaps[args.target_user_id] = copy(args.next_capabilities);
    else if (name === "owner_auth_cutover_readiness") data = [{ remaining: 0, email_password_count: 0, email_only_count: 0, google_only_count: 0 }];
    else if (name === "admin_list_account_access") data = accounts.filter(function (row) {
      return (!args.search_text || row.email.includes(args.search_text)) && (args.status_filter === "all" || row.status === args.status_filter) &&
        (args.role_filter === "all" || (row.admin_role || "member") === args.role_filter) && (args.service_filter === "all" || row.service_level === args.service_filter);
    }).map(function (row) { return { ...row, total_count: accounts.length }; });
    else if (name === "admin_update_account" || name === "owner_set_admin_role") {
      var target = accounts.find(function (row) { return row.user_id === args.target_user_id; });
      if (!target) throw new Error("只能修改合成帳號");
      if (name === "admin_update_account") { target.status = args.next_status; target.service_level = args.next_service_level; } else target.admin_role = args.next_role === "none" ? null : args.next_role;
    }
    else if (name === "member_announcement_index") data = (await corpus()).slice(args.page_offset || 0, (args.page_offset || 0) + (args.page_size || 500)).map(function (row) { return { announcement_id: row.id, school: row.school }; });
    else if (name === "member_announcement_detail") data = []; // No body snapshot exists; never fabricate text.
    else if (name === "announcement_deleted_ids") data = [...deleted].map(function (id) { return { announcement_id: id }; });
    else if (name === "admin_list_announcement_cleanup_decisions") data = copy(decisions);
    else if (name === "admin_review_announcement_cleanup") {
      var id = args.target_announcement_id;
      if (!(await corpus()).some(function (row) { return row.id === id; })) throw new Error("未知公告");
      decisions = decisions.filter(function (row) { return row.announcement_id !== id; });
      decisions.push({ announcement_id: id, action: args.target_action });
      if (args.target_action === "archive") { deleted.add(id); archived.push({ announcement_id: id, ...copy(args.target_original_metadata) }); }
    }
    else if (name === "admin_list_archived_announcements") data = copy(archived);
    else if (name === "admin_restore_archived_announcement") { deleted.delete(args.target_announcement_id); data = (await corpus()).find(function (row) { return row.id === args.target_announcement_id; }) || null; archived = archived.filter(function (row) { return row.announcement_id !== args.target_announcement_id; }); }
    else if (name === "admin_cancel_announcement_keep") decisions = decisions.filter(function (row) { return row.announcement_id !== args.target_announcement_id; });
    else if (name === "admin_list_announcement_classifications") throw new Error("分支沒有真實分類資料快照");
    else if (name === "delete_own_user_calendar_events") tables.user_calendar_events = [];
    else if (name === "apply_user_calendar_event_mutation") {
      var events = tables.user_calendar_events || [], old = events.find(function (row) { return row.id === args.p_id; });
      var event = { ...args.p_payload, id: args.p_id, user_id: session.user.id, version: (old && old.version || 0) + 1, deleted_at: args.p_operation === "delete" ? new Date().toISOString() : null };
      tables.user_calendar_events = events.filter(function (row) { return row.id !== args.p_id; }).concat(event); data = [event];
    }
    else throw new Error("這個操作未提供模擬版本");
    return { data: data, error: null };
  }
  var client = { from: localQuery, rpc: rpc, auth: {
    getSession: async function () { return { data: { session: await verified() } }; },
    getUser: async function () { var value = await verified(); return { data: { user: value && value.user } }; },
    onAuthStateChange: function (callback) { listeners.push(callback); return { data: { subscription: { unsubscribe: function () { listeners = listeners.filter(function (fn) { return fn !== callback; }); } } } }; },
    signOut: signOut,
    updateUser: async function (options) { if (!options.data || options.password) throw new Error("模擬帳密由 Preview 設定管理"); var value = await requireSession(); value.user.user_metadata = options.data; return { data: { user: value.user } }; },
  } };
  var api = Object.assign({}, original, { __capabilityWrapped: false, createController: function () {
    var controller = createOriginal({ client: client });
    controller.isConfigured = function () { return true; };
    controller.signInWithIdentifier = signIn; controller.signInWithUsername = signIn; controller.signInWithPassword = signIn;
    return controller;
  } });
  window.CyNewsAccountAuth = api;
  window.CyNewsMockAdmin = { request: request, createController: function () { return window.CyNewsAccountAuth.createController(); } };
})();
