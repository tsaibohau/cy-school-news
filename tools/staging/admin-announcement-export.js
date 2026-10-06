/* Preview-only addon. Source text stays in memory until the owner downloads it. */
(function () {
  "use strict";
  if (!window.CyNewsAnnouncementCSV || !window.CyNewsAccountAuth) return;
  var heading = document.querySelector("#viewAdmin .admin-cleanup .section-heading");
  if (!heading) return;
  var controller = window.CyNewsAccountAuth.createController();
  var button = document.createElement("button");
  button.id = "adminAnnouncementExportToggle"; button.type = "button"; button.className = "btn-ghost";
  button.textContent = "下載完整公告 CSV"; button.hidden = true;
  button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-controls", "adminAnnouncementExportPanel");
  heading.querySelector(".cleanup-toolbar").appendChild(button);
  var panel = document.createElement("section");
  panel.id = "adminAnnouncementExportPanel"; panel.className = "admin-archive-panel announcement-export"; panel.hidden = true;
  panel.setAttribute("aria-labelledby", "announcementExportTitle");
  panel.innerHTML = '<h4 id="announcementExportTitle">下載完整公告內文</h4>' +
    '<p class="hint">資料來源：測試 Supabase。僅主要管理員可下載；缺少正文或未讀附件會明確標記。範圍包含本站現行與歷史索引，已歸檔或無權限讀取的內文可能缺漏。</p>' +
    '<fieldset id="announcementExportControls"><legend>選擇公告</legend><div class="announcement-export-filters">' +
    '<label>學校<select id="announcementExportSchool"><option value="all">兩校</option><option value="cysh">嘉義高中</option><option value="cygsh">嘉義女中</option></select></label>' +
    '<label>搜尋標題或 ID<input id="announcementExportSearch" type="search" placeholder="留空顯示全部"></label>' +
    '<label>匯出範圍<select id="announcementExportScope"><option value="filtered">符合目前篩選的公告</option><option value="selected">已勾選公告</option><option value="all">全部兩校公告</option></select></label></div>' +
    '<p id="announcementExportCount" class="hint"></p><div class="cleanup-toolbar"><button id="announcementExportSelect" type="button" class="btn-ghost">勾選符合篩選的公告</button><button id="announcementExportClear" type="button" class="btn-ghost">清除勾選</button></div>' +
    '<div id="announcementExportList" class="announcement-export-list"></div><div class="admin-pagination"><button id="announcementExportPrevious" type="button" class="btn-ghost">上一頁</button><span id="announcementExportPage"></span><button id="announcementExportNext" type="button" class="btn-ghost">下一頁</button></div></fieldset>' +
    '<div class="cleanup-toolbar"><button id="announcementExportStart" type="button" class="btn-primary" disabled>產生 CSV</button><button id="announcementExportCancel" type="button" class="btn-ghost" hidden>取消</button><a id="announcementExportDownload" class="btn-primary" hidden>下載 CSV</a></div>' +
    '<progress id="announcementExportProgress" value="0" max="1" hidden></progress><p id="announcementExportStatus" class="hint" role="status" aria-live="polite">尚未載入公告。</p>';
  heading.insertAdjacentElement("afterend", panel);
  function node(suffix) { return document.getElementById("announcementExport" + suffix); }
  var catalog = [], selected = new Set(), page = 0, loading = null, currentUid = "", run = 0, authCheck = 0;
  var abort = null, downloadUrl = "", busy = false;
  function clearDownload() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = ""; node("Download").hidden = true; node("Download").removeAttribute("href");
  }
  function cancel() { run++; if (abort) abort.abort(); abort = null; clearDownload(); }
  function filterRows() {
    var school = node("School").value, search = node("Search").value.trim().toLocaleLowerCase();
    return catalog.filter(function (row) { return (school === "all" || row.id.indexOf(school + "-") === 0) && (!search || (row.title + " " + row.id).toLocaleLowerCase().indexOf(search) !== -1); });
  }
  function render() {
    var rows = filterRows(), pages = Math.max(1, Math.ceil(rows.length / 40)); page = Math.min(page, pages - 1);
    node("List").replaceChildren();
    rows.slice(page * 40, (page + 1) * 40).forEach(function (row) {
      var label = document.createElement("label"), checkbox = document.createElement("input"), text = document.createElement("span");
      checkbox.type = "checkbox"; checkbox.checked = selected.has(row.id); checkbox.setAttribute("aria-label", "勾選 " + row.title);
      checkbox.addEventListener("change", function () { if (checkbox.checked) selected.add(row.id); else selected.delete(row.id); clearDownload(); render(); });
      text.textContent = row.title + "（" + row.id + "）"; label.append(checkbox, text); node("List").appendChild(label);
    });
    node("Count").textContent = "全部 " + catalog.length + " 筆｜符合篩選 " + rows.length + " 筆｜已勾選 " + selected.size + " 筆";
    node("Page").textContent = (page + 1) + " / " + pages;
    node("Previous").disabled = page === 0; node("Next").disabled = page + 1 >= pages;
    node("Start").disabled = busy || !catalog.length || !currentUid;
  }
  async function loadCatalog() {
    if (loading) return loading;
    node("Status").textContent = "正在載入兩校公告索引…";
    loading = Promise.all(["announcements", "archive"].map(async function (name) {
      var response = await fetch("data/" + name + ".json", { cache: "no-store" });
      if (!response.ok) throw new Error("公告索引載入失敗。");
      var data = await response.json(); if (!Array.isArray(data.items)) throw new Error("公告索引格式不符。");
      return data.items;
    })).then(function (sources) {
      var map = new Map(); sources[1].concat(sources[0]).forEach(function (row) {
        if (/^(cysh|cygsh)-[A-Za-z0-9._-]+$/.test(row.id || "")) map.set(row.id, { id: row.id, title: String(row.title || "") });
      });
      catalog = Array.from(map.values()).sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
      render(); node("Status").textContent = "選好範圍後按「產生 CSV」。資料準備完成後，可直接點擊下載。";
    }).catch(function (error) { loading = null; node("Status").textContent = error.message; });
    return loading;
  }
  async function refreshOwner() {
    var check = ++authCheck;
    try {
      var session = await controller.getVerifiedSession();
      var access = session ? await controller.getAccountAccess() : null;
      if (check !== authCheck) return;
      var uid = session && access && access.status === "approved" && access.admin_role === "owner" ? session.user.id : "";
      if (uid !== currentUid) { cancel(); selected.clear(); }
      currentUid = uid; button.hidden = !uid;
      if (!uid) { panel.hidden = true; button.setAttribute("aria-expanded", "false"); }
      render();
    } catch (_) {
      if (check !== authCheck) return;
      currentUid = ""; button.hidden = true; panel.hidden = true; cancel();
    }
  }
  button.addEventListener("click", function () {
    panel.hidden = !panel.hidden; button.setAttribute("aria-expanded", String(!panel.hidden)); if (!panel.hidden) loadCatalog();
  });
  ["School", "Search", "Scope"].forEach(function (name) { node(name).addEventListener(name === "Search" ? "input" : "change", function () { clearDownload(); page = 0; render(); }); });
  node("Select").addEventListener("click", function () { filterRows().forEach(function (row) { selected.add(row.id); }); node("Scope").value = "selected"; clearDownload(); render(); });
  node("Clear").addEventListener("click", function () { selected.clear(); clearDownload(); render(); });
  node("Previous").addEventListener("click", function () { page--; render(); });
  node("Next").addEventListener("click", function () { page++; render(); });
  node("Cancel").addEventListener("click", function () { cancel(); node("Status").textContent = "已取消，沒有產生部分下載檔。"; });
  node("Start").addEventListener("click", async function () {
    if (busy) return;
    var scope = node("Scope").value;
    var ids = (scope === "all" ? catalog : scope === "selected" ? catalog.filter(function (row) { return selected.has(row.id); }) : filterRows()).map(function (row) { return row.id; });
    if (!ids.length) { node("Status").textContent = "請先選擇至少一則公告。"; return; }
    cancel(); busy = true; var activeRun = run, uid = currentUid, records = [], exportedAt = new Date().toISOString(); abort = new AbortController();
    node("Controls").disabled = true; node("Start").disabled = true; node("Cancel").hidden = false; node("Progress").hidden = false;
    node("Progress").max = ids.length; node("Progress").value = 0;
    var messages = { owner_required: "目前帳號不是主要管理員。", sign_in_required: "登入已失效，請重新登入。", source_read_failed: "內文讀取失敗，沒有產生部分下載檔。", export_unavailable: "匯出服務目前無法讀取資料。", unknown_announcement_id: "公告索引與部署版本不一致，請重新整理。", source_identity_mismatch: "資料 ID 不一致，下載已停止。", batch_too_large: "單則公告過大，無法完整匯出。" };
    async function readBatch(batch) {
      if (activeRun !== run || currentUid !== uid) throw new Error("已取消或帳號已變更。");
      var session = await controller.getVerifiedSession();
      if (!session || session.user.id !== uid) throw new Error("登入已失效或帳號已變更。");
      var response = await fetch("/api/admin-announcement-export", {
        method: "POST", headers: { Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: batch }), cache: "no-store", signal: abort.signal,
      });
      if (response.status === 413 && batch.length > 1) {
        var split = Math.ceil(batch.length / 2);
        return (await readBatch(batch.slice(0, split))).concat(await readBatch(batch.slice(split)));
      }
      var result;
      try { result = await response.json(); } catch (_) { throw new Error("匯出服務回應無法讀取，請確認 Preview 存取權限。"); }
      if (!response.ok) throw new Error(messages[result.error] || "匯出失敗，沒有產生部分下載檔。");
      return window.CyNewsAnnouncementCSV.verifyBatch(batch, result.records);
    }
    try {
      for (var offset = 0; offset < ids.length; offset += 8) {
        records = records.concat(await readBatch(ids.slice(offset, offset + 8)));
        if (activeRun !== run || currentUid !== uid) throw new Error("已取消或帳號已變更。");
        node("Progress").value = records.length; node("Status").textContent = "已讀取 " + records.length + " / " + ids.length + " 筆…";
      }
      window.CyNewsAnnouncementCSV.verifyBatch(ids, records);
      var missing = records.filter(function (record) { return !window.CyNewsAnnouncementCSV.textOf(record.detail).trim(); }).length;
      var unread = records.filter(function (record) { return window.CyNewsAnnouncementCSV.project(record, exportedAt).attachment_status === "has_unread"; }).length;
      downloadUrl = URL.createObjectURL(new Blob([window.CyNewsAnnouncementCSV.csv(records, exportedAt)], { type: "text/csv;charset=utf-8" }));
      node("Download").href = downloadUrl; node("Download").download = "嘉義校訊_完整公告_" + exportedAt.replace(/[:.]/g, "-") + ".csv";
      node("Download").textContent = "下載 CSV（" + records.length + " 筆）"; node("Download").hidden = false;
      node("Status").textContent = "已準備 " + records.length + " 筆；缺少或空白正文 " + missing + " 筆；含未讀附件 " + unread + " 筆。請點「下載 CSV」，手機可儲存到「檔案」。";
    } catch (error) {
      clearDownload(); if (activeRun === run) node("Status").textContent = error.message;
    } finally {
      records = []; busy = false; node("Controls").disabled = false; node("Cancel").hidden = true; node("Progress").hidden = true; abort = null; render();
    }
  });
  controller.onAuthStateChange(function () { refreshOwner(); }).catch(function () { button.hidden = true; });
  refreshOwner();
  window.addEventListener("pagehide", cancel);
})();
