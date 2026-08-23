/* Staging-only REAL user_tasks acceptance. Tokens and UIDs stay in closures. */
(function () {
  "use strict";
  var STORAGE = "cynews.rlsAcceptance.v1";
  var params = new URLSearchParams(location.search);
  if (params.get("acceptance") !== "user-tasks" && !sessionStorage.getItem(STORAGE)) return;
  var config = window.CYNEWS_ACCOUNT_CONFIG || {};
  var expected = String(config.stagingRedirectUrl || "").replace(/\/$/, "");
  if (!expected || location.origin !== expected) return;

  var CHANNEL = "cynews-rls-acceptance-v1";
  var PREFIX = "CYNEWS_RLS_ACCEPT_";
  var role = params.get("acceptance-role") === "companion" ? "companion" : "main";
  var channel = new BroadcastChannel(CHANNEL);
  var captured = null;

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function fail(message) { throw new Error(message); }
  function good(status) { return status >= 200 && status < 300; }
  function randomId() {
    if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, function () { return Math.floor(Math.random() * 16).toString(16); });
  }
  function safeState() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE) || "null") || {}; } catch (_) { return {}; }
  }
  function saveState(value) {
    /* Only disposable run/task/mutation IDs and phase are durable. Never tokens or UIDs. */
    sessionStorage.setItem(STORAGE, JSON.stringify({ phase: value.phase, run: value.run, taskA: value.taskA, mutationA: value.mutationA }));
  }
  function headers(token, prefer) {
    return { apikey: config.supabaseAnonKey, Authorization: "Bearer " + token,
      "Content-Type": "application/json", Prefer: prefer || "return=representation" };
  }
  async function raw(token, method, query, body, prefer) {
    var response = await fetch(config.supabaseUrl.replace(/\/$/, "") + "/rest/v1/user_tasks" + (query || ""), {
      method: method, headers: headers(token, prefer), body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store",
    });
    var data = null;
    try { data = await response.json(); } catch (_) {}
    return { status: response.status, data: data };
  }
  async function verified() {
    var auth = window.CyNewsAccountAuth.createController();
    var session = await auth.getVerifiedSession();
    if (!session || !session.user || typeof session.user.id !== "string" || !session.access_token) fail("verified session unavailable");
    return { uid: session.user.id, token: session.access_token, session: session };
  }
  async function ready() {
    for (var i = 0; i < 120; i += 1) {
      if ((document.getElementById("accountState") || {}).textContent === "已同步") return true;
      await sleep(250);
    }
    fail("ACCOUNT_READY timeout");
  }
  async function ownCrud(ctx, taskId, title) {
    var now = new Date().toISOString();
    var row = { id: taskId, user_id: ctx.uid, title: title, status: "open", due_date: "2099-01-01", priority: 3,
      notes: "disposable staging RLS fixture", created_at: now, updated_at: now, completed_at: null, deleted_at: null };
    var upsert = await raw(ctx.token, "POST", "?on_conflict=id", row, "resolution=merge-duplicates,return=representation");
    if (!good(upsert.status)) fail("own task create failed");
    var query = "?id=eq." + encodeURIComponent(taskId) + "&select=id,status,deleted_at";
    var read = await raw(ctx.token, "GET", query);
    if (!good(read.status) || !Array.isArray(read.data) || read.data.length !== 1) fail("own task read/upsert invariant failed");
    var update = await raw(ctx.token, "PATCH", "?id=eq." + encodeURIComponent(taskId), { title: title + "_UPDATED", updated_at: new Date().toISOString() });
    if (!good(update.status)) fail("own task update failed");
    var complete = await raw(ctx.token, "PATCH", "?id=eq." + encodeURIComponent(taskId), { status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (!good(complete.status)) fail("own task complete failed");
    var reopen = await raw(ctx.token, "PATCH", "?id=eq." + encodeURIComponent(taskId), { status: "open", completed_at: null, updated_at: new Date().toISOString() });
    if (!good(reopen.status)) fail("own task reopen failed");
    var tombstone = await raw(ctx.token, "PATCH", "?id=eq." + encodeURIComponent(taskId), { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (!good(tombstone.status)) fail("own task tombstone failed");
    var restore = await raw(ctx.token, "PATCH", "?id=eq." + encodeURIComponent(taskId), { deleted_at: null, updated_at: new Date().toISOString() });
    if (!good(restore.status)) fail("own task restore for isolation test failed");
  }
  async function crossChecks(ctx, foreignUid, foreignTaskId) {
    var target = "?id=eq." + encodeURIComponent(foreignTaskId);
    var read = await raw(ctx.token, "GET", target + "&select=id");
    if (!good(read.status) || !Array.isArray(read.data) || read.data.length !== 0) fail("cross-user read isolation failed");
    for (var i = 0; i < 2; i += 1) {
      var method = i ? "DELETE" : "PATCH";
      var result = await raw(ctx.token, method, target, method === "PATCH" ? { title: PREFIX + "FORBIDDEN", updated_at: new Date().toISOString() } : undefined);
      if (good(result.status) && Array.isArray(result.data) && result.data.length) fail("cross-user mutation affected a row");
    }
    var spoofedAt = new Date().toISOString();
    var spoof = await raw(ctx.token, "POST", "", { id: randomId(), user_id: foreignUid, title: PREFIX + "SPOOF", status: "open",
      notes: "disposable schema-valid RLS spoof fixture", created_at: spoofedAt, updated_at: spoofedAt });
    if (spoof.status !== 403 || !spoof.data || spoof.data.code !== "42501") fail("raw ownership spoof was not rejected by RLS");
  }
  async function adapterSpoof(ctx, foreignUid) {
    var emitted = null;
    var fake = {
      auth: { getSession: function () { return Promise.resolve({ data: { session: ctx.session }, error: null }); } },
      from: function () { return { upsert: function (payload) { emitted = payload[0]; return Promise.resolve({ data: payload, error: null }); } }; },
    };
    var adapter = window.CyNewsSupabaseSync.createAdapter(fake);
    await adapter.sendMutation({ account_id: ctx.uid, type: "task.upsert", payload: { id: randomId(), user_id: foreignUid, title: PREFIX + "ADAPTER", updated_at: new Date().toISOString() } });
    if (!emitted || emitted.user_id !== ctx.uid || emitted.user_id === foreignUid) fail("adapter ownership guard failed");
  }
  async function cleanup(ctx, taskId) {
    if (!taskId) return;
    var result = await raw(ctx.token, "DELETE", "?id=eq." + encodeURIComponent(taskId));
    if (!good(result.status)) fail("fixture cleanup failed");
  }
  function addOutboxFixture(uid, taskId) {
    var outbox = new window.CyNewsAccountSync.Outbox(localStorage, uid);
    return outbox.enqueue({ id: "accept-" + randomId(), type: "task.upsert", payload: {
      id: taskId, title: PREFIX + "OUTBOX", status: "open", updated_at: new Date().toISOString()
    }}).id;
  }
  function verifyOutboxIsolation(uidA, uidB, mutationId) {
    var inA = new window.CyNewsAccountSync.Outbox(localStorage, uidA).pending().some(function (item) { return item.id === mutationId; });
    var inB = new window.CyNewsAccountSync.Outbox(localStorage, uidB).pending().some(function (item) { return item.id === mutationId; });
    if (!inA || inB) fail("account outbox isolation failed");
  }
  function ackOutbox(uid, mutationId) { new window.CyNewsAccountSync.Outbox(localStorage, uid).ack([mutationId], undefined, uid); }

  async function companion() {
    captured = await verified();
    channel.postMessage({ type: "A_READY" });
    channel.onmessage = async function (event) {
      var message = event.data || {};
      try {
        if (message.type === "GET_A_CONTEXT") channel.postMessage({ type: "A_CONTEXT", uid: captured.uid });
        if (message.type === "RUN_A_CROSS") {
          await crossChecks(captured, message.uidB, message.taskB);
          await adapterSpoof(captured, message.uidB);
          channel.postMessage({ type: "A_CROSS_PASS" });
        }
        if (message.type === "CLEANUP_A") {
          await cleanup(captured, message.taskA);
          captured = null;
          channel.postMessage({ type: "A_CLEAN_PASS" });
          channel.close(); window.close();
        }
      } catch (_) { channel.postMessage({ type: "A_FAIL" }); }
    };
    document.body.textContent = "USER_A 驗收 companion 已就緒；請勿關閉此分頁。";
  }

  function panel() {
    var box = document.createElement("section");
    box.className = "cynews-acceptance-panel";
    box.setAttribute("aria-live", "polite");
    box.innerHTML = '<strong>REAL user_tasks A/B 驗收</strong><div id="acceptanceActions"></div><pre id="acceptanceStatus">等待開始</pre>';
    document.body.appendChild(box);
    return { actions: box.querySelector("#acceptanceActions"), status: box.querySelector("#acceptanceStatus") };
  }
  function button(area, label, action) {
    var value = document.createElement("button"); value.type = "button"; value.textContent = label;
    value.addEventListener("click", function () { value.disabled = true; action().catch(function () { area.status.textContent = "BLOCKED：驗收步驟失敗"; value.disabled = false; }); });
    area.actions.appendChild(value); return value;
  }
  function waitMessage(type, timeout) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { channel.removeEventListener("message", receive); reject(new Error(type + " timeout")); }, timeout || 10000);
      function receive(event) { if ((event.data || {}).type !== type) return; clearTimeout(timer); channel.removeEventListener("message", receive); resolve(event.data); }
      channel.addEventListener("message", receive);
    });
  }
  async function main() {
    var area = panel(), stored = safeState();
    if (stored.phase === "awaiting_b") {
      button(area, "驗證 USER_B 並完成 A/B RLS", async function () {
        await ready();
        var b = await verified();
        channel.postMessage({ type: "GET_A_CONTEXT" });
        var aContext = await waitMessage("A_CONTEXT");
        if (!aContext.uid || aContext.uid === b.uid) fail("USER_A and USER_B are not distinct");
        var taskB = randomId();
        await ownCrud(b, taskB, PREFIX + stored.run + "_B");
        await crossChecks(b, aContext.uid, stored.taskA);
        await adapterSpoof(b, aContext.uid);
        verifyOutboxIsolation(aContext.uid, b.uid, stored.mutationA);
        channel.postMessage({ type: "RUN_A_CROSS", uidB: b.uid, taskB: taskB });
        await waitMessage("A_CROSS_PASS");
        await cleanup(b, taskB);
        ackOutbox(aContext.uid, stored.mutationA);
        channel.postMessage({ type: "CLEANUP_A", taskA: stored.taskA });
        await waitMessage("A_CLEAN_PASS");
        sessionStorage.removeItem(STORAGE);
        area.status.textContent = "PASS：USER_A／USER_B own-row、雙向隔離、spoof、outbox 與 cleanup 均通過";
        document.documentElement.dataset.rlsAcceptance = "pass";
      });
      area.status.textContent = "USER_B callback 已返回；等待完成驗收";
      return;
    }
    button(area, "開始 USER_A 真實登入", async function () {
      var login = document.getElementById("accountLogin");
      if (!login) fail("real login action unavailable");
      saveState({ phase: "awaiting_a" });
      login.click();
    });
    button(area, "驗證 USER_A 並前往第二次 chooser", async function () {
      await ready();
      var a = await verified();
      var run = Date.now().toString(36), taskA = randomId();
      await ownCrud(a, taskA, PREFIX + run + "_A");
      var mutationA = addOutboxFixture(a.uid, taskA);
      saveState({ phase: "awaiting_b", run: run, taskA: taskA, mutationA: mutationA });
      var companionUrl = new URL(location.href);
      companionUrl.searchParams.set("acceptance-role", "companion");
      var companionWindow = window.open(companionUrl.href, "cynews-user-a-companion");
      if (!companionWindow) fail("companion tab was blocked");
      await waitMessage("A_READY");
      area.status.textContent = "USER_A PASS；正在開啟真實切換帳號流程";
      var accountSwitch = document.getElementById("accountSwitch");
      if (!accountSwitch || accountSwitch.hidden) fail("real account switch unavailable");
      accountSwitch.click();
    });
  }

  if (role === "companion") companion().catch(function () { channel.postMessage({ type: "A_FAIL" }); });
  else main().catch(function () { document.documentElement.dataset.rlsAcceptance = "blocked"; });
})();
