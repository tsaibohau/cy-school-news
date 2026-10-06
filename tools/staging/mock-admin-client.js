/* Dedicated simulation page: no real Auth client, config, sync or Supabase calls. */
(function () {
  "use strict";
  window.CYNEWS_MOCK_ADMIN_MODE = true;
  var STORAGE = "cynews-mock-session:" + location.host, listeners = [], expiry = "";
  var errors = { preview_only: "這個部署未啟用模擬模式。", mock_account_expired: "臨時帳密已過期，請取得新一組。", invalid_mock_credentials: "模擬帳號或密碼錯誤。", mock_sign_in_required: "模擬登入已失效，請重新登入。" };
  async function request(action, body, token) {
    var response = await fetch("/api/mock-admin?action=" + action, { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: token ? "Bearer " + token : "" }, body: JSON.stringify(body || {}) });
    var data;
    try { data = await response.json(); } catch (_) { throw new Error("無法讀取模擬服務，請確認 Preview 存取權限。"); }
    if (!response.ok) throw new Error(errors[data.error] || "模擬服務暫時無法使用。");
    return data;
  }
  function notify() { listeners.forEach(function (fn) { setTimeout(fn, 0); }); }
  function logout() {
    sessionStorage.removeItem(STORAGE); document.getElementById("mockLogin").hidden = false;
    document.getElementById("viewAdmin").hidden = true; document.getElementById("mockPassword").value = "";
    accounts = initialAccounts(); renderAccounts(); notify();
  }
  function initialAccounts() { return [{ name: "【模擬】待審學生", status: "pending", role: "member" }, { name: "【模擬】已核准學生", status: "approved", role: "member" }]; }
  var accounts = initialAccounts();
  function renderAccounts() {
    var container = document.getElementById("mockAccounts"); container.replaceChildren();
    accounts.forEach(function (account) {
      var card = document.createElement("article"), title = document.createElement("p"), actions = document.createElement("div"); actions.className = "cleanup-toolbar";
      title.textContent = account.name + "｜" + ({ pending: "待審", approved: "已核准", removed: "已移除" }[account.status]) + "｜" + ({ member: "會員", co_admin: "共同管理員" }[account.role]);
      [["核准", function () { account.status = "approved"; }], ["移除", function () { account.status = "removed"; }], ["切換管理角色", function () { account.role = account.role === "member" ? "co_admin" : "member"; }]].forEach(function (action) {
        var button = document.createElement("button"); button.type = "button"; button.className = "btn-ghost"; button.textContent = action[0];
        button.addEventListener("click", function () { action[1](); renderAccounts(); }); actions.appendChild(button);
      }); card.append(title, actions); container.appendChild(card);
    });
  }
  window.CyNewsMockAdmin = {
    request: request,
    createController: function () {
      return {
        getVerifiedSession: async function () {
          var token = sessionStorage.getItem(STORAGE); if (!token) return null;
          try {
            var data = await request("session", {}, token); expiry = data.expires_at;
            document.getElementById("mockLogin").hidden = true; document.getElementById("viewAdmin").hidden = false;
            document.getElementById("mockExpiry").textContent = "模擬帳密有效至 " + new Date(expiry).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) + "（臺灣時間）";
            return { user: data.user, access_token: token };
          } catch (error) { logout(); document.getElementById("mockLoginStatus").textContent = error.message; return null; }
        },
        getAccountAccess: async function () { return { status: "approved", admin_role: "owner", is_admin: true, mode: "simulated" }; },
        onAuthStateChange: async function (callback) { listeners.push(callback); return {}; },
      };
    },
  };
  document.getElementById("mockLoginForm").addEventListener("submit", async function (event) {
    event.preventDefault(); var button = document.getElementById("mockSignIn"), status = document.getElementById("mockLoginStatus");
    button.disabled = true; status.textContent = "正在登入模擬模式…";
    try {
      var data = await request("login", { username: document.getElementById("mockUsername").value.trim(), password: document.getElementById("mockPassword").value });
      sessionStorage.setItem(STORAGE, data.token); document.getElementById("mockPassword").value = ""; status.textContent = "";
      renderAccounts(); notify();
    } catch (error) { status.textContent = error.message; } finally { button.disabled = false; }
  });
  document.getElementById("mockSignOut").addEventListener("click", logout);
  renderAccounts();
})();
