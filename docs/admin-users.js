/* 管理員帳號面板：僅在伺服器確認管理員身分後顯示。 */
(function () {
  "use strict";
  function getConfig() { return window.CYNEWS_ACCOUNT_CONFIG || {}; }
  function call(action, payload) {
    var auth = window.CyNewsAccountAuth && window.CyNewsAccountAuth.createController();
    if (!auth || !auth.isConfigured()) return Promise.reject(new Error("not_configured"));
    return auth.getVerifiedSession().then(function (session) {
      if (!session) throw new Error("not_signed_in");
      return fetch(String(getConfig().supabaseUrl).replace(/\/$/, "") + "/functions/v1/admin-users", {
        method: "POST",
        headers: {
          "apikey": getConfig().supabaseAnonKey,
          "authorization": "Bearer " + session.access_token,
          "content-type": "application/json"
        },
        body: JSON.stringify(Object.assign({ action: action }, payload || {}))
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (!response.ok) throw new Error(body.error || "request_failed");
          return body;
        });
      });
    });
  }
  function makePanel() {
    var account = document.getElementById("accountBox");
    if (!account || document.getElementById("adminUsersPanel")) return null;
    var panel = document.createElement("section");
    panel.id = "adminUsersPanel";
    panel.className = "my-card";
    panel.hidden = true;
    panel.innerHTML =
      '<div class="my-card-heading"><div><span class="my-card-icon" aria-hidden="true">管</span><div><h3>管理帳號</h3><p>只有管理員能邀請可登入的人員</p></div></div></div>' +
      '<form id="adminInviteForm" class="kw-form" novalidate>' +
      '<input id="adminInviteEmail" type="email" maxlength="254" autocomplete="email" placeholder="使用者 Email">' +
      '<input id="adminInviteUsername" maxlength="32" autocapitalize="none" placeholder="嘉校快訊帳號">' +
      '<button class="btn-primary" type="submit">發送邀請</button></form>' +
      '<p id="adminUsersStatus" class="hint" role="status" aria-live="polite"></p>' +
      '<div id="adminUsersList" class="today-list"></div>';
    account.parentNode.insertBefore(panel, account.nextSibling);
    return panel;
  }
  function showUsers(panel) {
    var status = document.getElementById("adminUsersStatus");
    var list = document.getElementById("adminUsersList");
    call("list").then(function (body) {
      var users = Array.isArray(body.users) ? body.users : [];
      list.textContent = "";
      users.forEach(function (user) {
        var row = document.createElement("p");
        row.className = "hint";
        row.textContent = user.email + (user.last_sign_in_at ? "・曾登入" : "・尚未登入");
        list.appendChild(row);
      });
      status.textContent = users.length ? "目前 " + users.length + " 個帳號" : "尚無帳號";
    }).catch(function () { status.textContent = "目前無法讀取帳號資料。"; });
  }
  function init() {
    var panel = makePanel();
    if (!panel) return;
    call("status").then(function (body) {
      if (!body.admin) return;
      panel.hidden = false;
      showUsers(panel);
      panel.querySelector("#adminInviteForm").addEventListener("submit", function (event) {
        event.preventDefault();
        var status = document.getElementById("adminUsersStatus");
        status.textContent = "發送邀請中";
        call("invite", {
          email: document.getElementById("adminInviteEmail").value,
          username: document.getElementById("adminInviteUsername").value
        }).then(function () {
          event.target.reset();
          status.textContent = "邀請已寄出。";
          showUsers(panel);
        }).catch(function (error) {
          status.textContent = error && error.message === "invalid_input"
            ? "請輸入正確的 Email 與帳號名稱。" : "邀請未送出。";
        });
      });
    }).catch(function () {
      /* 未登入、一般使用者與尚未設定首位管理員均不顯示此面板。 */
    });
  }
  window.addEventListener("load", init);
})();
