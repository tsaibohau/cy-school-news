(function () {
  "use strict";

  var PAGE_SIZE = 40;
  var state = { items: [], query: "", school: "all", category: "all", visible: PAGE_SIZE };
  var schools = [
    { id: "cysh", name: "嘉中" },
    { id: "cygsh", name: "嘉女" },
    { id: "fjsh", name: "輔仁" },
  ];
  var el = {};

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function validOfficialUrl(value) {
    try {
      var url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && [
        "www.cysh.cy.edu.tw", "www.cygsh.cy.edu.tw", "rpage.fjsh.cy.edu.tw"
      ].indexOf(url.hostname.toLowerCase()) !== -1;
    } catch (_) { return false; }
  }
  function formatDate(value) {
    var match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? Number(match[1]) + "/" + Number(match[2]) + "/" + Number(match[3]) : "日期未提供";
  }
  function candidateItems() {
    var rows = state.items.filter(function (item) {
      return (state.school === "all" || item.school === state.school) &&
        (state.category === "all" || item.category === state.category);
    });
    if (!state.query) return rows;
    if (window.CyNewsSearchQuery && typeof window.CyNewsSearchQuery.select === "function") {
      return window.CyNewsSearchQuery.select(rows, state.query).map(function (row) { return row.item; });
    }
    var terms = state.query.toLocaleLowerCase("zh-TW").split(/\s+/).filter(Boolean);
    return rows.filter(function (item) {
      var text = [item.title, item.summary, item.category, item.source_category].join(" ").toLocaleLowerCase("zh-TW");
      return terms.every(function (term) { return text.indexOf(term) !== -1; });
    });
  }
  function card(item) {
    if (!validOfficialUrl(item.url)) return "";
    var school = schools.find(function (row) { return row.id === item.school; });
    var summary = clean(item.summary);
    return '<article class="card">' +
      '<div class="card-meta"><span class="tag tag-' + escapeHtml(item.school) + '">' + escapeHtml(school ? school.name : item.school_name) + '</span>' +
      '<span class="tag tag-cat">' + escapeHtml(item.category || "一般") + '</span><time datetime="' + escapeHtml(item.date || "") + '">' + escapeHtml(formatDate(item.date)) + '</time></div>' +
      '<h3 class="card-title"><a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">' + escapeHtml(item.title || "未命名公告") + '</a></h3>' +
      (summary ? '<p class="card-snippet">' + escapeHtml(summary) + '</p>' : "") +
      '<div class="card-actions"><a class="btn-ghost" href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">查看官方原文</a></div>' +
      '</article>';
  }
  function render() {
    var rows = candidateItems();
    var shown = rows.slice(0, state.visible);
    el.list.innerHTML = shown.map(card).join("") || '<p class="empty">找不到符合條件的公告，請換個關鍵字或清除篩選。</p>';
    el.countLine.textContent = "找到 " + rows.length + " 則公告" + (rows.length > shown.length ? "，目前顯示 " + shown.length + " 則" : "");
    el.loadMore.hidden = rows.length <= shown.length;
  }
  function renderSchools() {
    schools.forEach(function (school) {
      var option = document.createElement("option");
      option.value = school.id;
      option.textContent = school.name;
      el.schoolFilter.appendChild(option);
    });
  }
  function renderCategories(categories) {
    var values = ["all"].concat((categories || []).filter(Boolean));
    el.catChips.innerHTML = values.map(function (category) {
      var label = category === "all" ? "全部" : category;
      return '<button type="button" class="chip' + (category === state.category ? " active" : "") + '" data-category="' + escapeHtml(category) + '">' + escapeHtml(label) + '</button>';
    }).join("");
  }
  function setLoaded() {
    if (el.loading) el.loading.hidden = true;
    document.body.classList.add("app-ready");
  }
  function loadData(cacheMode) {
    el.refreshState.textContent = "更新中…";
    return fetch("data/public-announcements.json?_=" + Date.now(), { cache: cacheMode || "no-store" })
      .then(function (response) { if (!response.ok) throw new Error(String(response.status)); return response.json(); })
      .then(function (data) {
        state.items = Array.isArray(data.items) ? data.items.filter(function (item) { return validOfficialUrl(item.url); }) : [];
        renderCategories(data.categories || []);
        render();
        var stamp = Date.parse(data.generated_at || "");
        el.updatedAt.textContent = Number.isFinite(stamp) ? "・更新 " + new Date(stamp).toLocaleString("zh-TW", { hour12: false }) : "";
        el.refreshState.textContent = "已更新";
      }).catch(function () {
        el.list.innerHTML = '<p class="empty">目前無法載入公告，請稍後再試。</p>';
        el.countLine.textContent = "";
        el.refreshState.textContent = "載入失敗";
      }).finally(setLoaded);
  }
  function start() {
    el = { loading: byId("appLoading"), q: byId("q"), schoolFilter: byId("schoolFilter"), catChips: byId("catChips"),
      list: byId("list"), countLine: byId("countLine"), loadMore: byId("loadMore"), refresh: byId("btnRefresh"),
      refreshState: byId("refreshState"), updatedAt: byId("updatedAt") };
    renderSchools();
    el.q.addEventListener("input", function () { state.query = clean(el.q.value); state.visible = PAGE_SIZE; render(); });
    el.schoolFilter.addEventListener("change", function () { state.school = el.schoolFilter.value; state.visible = PAGE_SIZE; render(); });
    el.catChips.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-category]");
      if (!button) return;
      state.category = button.dataset.category;
      state.visible = PAGE_SIZE;
      Array.prototype.forEach.call(el.catChips.querySelectorAll("button"), function (row) { row.classList.toggle("active", row === button); });
      render();
    });
    el.loadMore.addEventListener("click", function () { state.visible += PAGE_SIZE; render(); });
    el.refresh.addEventListener("click", function () { loadData("reload"); });
    loadData();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
