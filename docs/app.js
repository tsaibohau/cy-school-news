/* 嘉校快訊 前端邏輯(無框架) */
(function () {
  "use strict";

  var LS_KW = "cyNews.keywords";
  var LS_SEEN = "cyNews.lastSeen";
  var PAGE_SIZE = 200;  // 最新清單一次渲染的則數,避免一口氣塞入上千張卡片

  var state = {
    data: null,
    school: "all",
    cat: "all",
    q: "",
    tab: "latest",
    shown: PAGE_SIZE,
    archive: "none",  /* none | loading | loaded:歷史封存資料的載入狀態 */
    keywords: loadJSON(LS_KW, []),
    lastSeen: localStorage.getItem(LS_SEEN) || "",
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    list: $("list"), subList: $("subList"), countLine: $("countLine"),
    updatedAt: $("updatedAt"), q: $("q"),
    schoolSeg: $("schoolSeg"), catChips: $("catChips"),
    viewLatest: $("viewLatest"), viewSub: $("viewSub"),
    tabLatest: $("tabLatest"), tabSub: $("tabSub"), subBadge: $("subBadge"),
    kwForm: $("kwForm"), kwInput: $("kwInput"), kwChips: $("kwChips"),
    btnNotify: $("btnNotify"), notifyState: $("notifyState"),
    btnRefresh: $("btnRefresh"),
  };

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  function saveKeywords() { localStorage.setItem(LS_KW, JSON.stringify(state.keywords)); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fetchData() {
    return fetch("data/announcements.json?_=" + Date.now(), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        if (state.archive === "loaded") {
          /* 已載入過封存資料:重新抓的檔案只有近一年,把封存部分接回去 */
          var ids = {};
          data.items.forEach(function (it) { ids[it.id] = true; });
          state.data.items.forEach(function (it) {
            if (!ids[it.id]) data.items.push(it);
          });
        }
        state.data = data;
        renderAll();
      })
      .catch(function () {
        if (!state.data) {
          el.list.innerHTML = '<p class="empty">目前離線且尚無快取資料,連上網路後再試一次。</p>';
        }
      });
  }

  /* 歷史封存資料:開站不載,搜尋或篩選時才背景載入一次 */
  function ensureArchive() {
    if (!state.data || state.archive !== "none") return;
    state.archive = "loading";
    renderLatest();
    fetch("data/archive.json?_=" + Date.now(), { cache: "no-store" })
      .then(function (r) {
        if (r.status === 404) return { items: [] }; /* 尚未產生封存檔,視為空 */
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (arc) {
        var ids = {};
        state.data.items.forEach(function (it) { ids[it.id] = true; });
        (arc.items || []).forEach(function (it) {
          if (!ids[it.id]) state.data.items.push(it);
        });
        state.archive = "loaded";
        renderAll();
      })
      .catch(function () { state.archive = "none"; renderLatest(); }); /* 離線等下次再試 */
  }

  /* ── 篩選與比對 ── */
  function itemText(it) {
    /* 含自動分類名稱:訂「段考」也能命中整個「段考考試」分類 */
    return (it.title + " " + (it.snippet || "") + " " +
      (it.category || "") + " " + (it.source_category || "")).toLowerCase();
  }
  function matchQuery(it, q) {
    if (!q) return true;
    var text = itemText(it);
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (tok) {
      return text.indexOf(tok) !== -1;
    });
  }
  function matchKeywords(it) {
    if (!state.keywords.length) return false;
    var text = itemText(it);
    return state.keywords.some(function (kw) {
      return text.indexOf(kw.toLowerCase()) !== -1;
    });
  }
  function isNew(it) {
    return !!it.first_seen && (!state.lastSeen || it.first_seen > state.lastSeen);
  }
  function latestItems() {
    if (!state.data) return [];
    return state.data.items.filter(function (it) {
      if (state.school !== "all" && it.school !== state.school) return false;
      if (state.cat !== "all" && it.category !== state.cat) return false;
      return matchQuery(it, state.q);
    });
  }
  function subItems() {
    if (!state.data) return [];
    return state.data.items.filter(matchKeywords);
  }
  function newSubCount() {
    return subItems().filter(isNew).length;
  }

  /* ── 畫面渲染 ── */
  function displayDate(it) {
    /* 沒有公告日期時,退而顯示首次抓到的日期 */
    return it.date || (it.first_seen || "").slice(0, 10) || "—";
  }
  function cardHTML(it) {
    var schoolClass = it.school === "cysh" ? "tag-cysh" : "tag-cygsh";
    var catClass = it.category === "榮譽榜" ? " cat-honor" : "";
    return '<article class="card' + catClass + '">' +
      (isNew(it) ? '<span class="new-dot" title="新公告"></span>' : "") +
      '<div class="card-meta">' +
        '<span>' + esc(displayDate(it)) + '</span>' +
        '<span class="tag ' + schoolClass + '">' + esc(it.school_name) + '</span>' +
        '<span class="tag tag-cat">' + esc(it.category) + '</span>' +
      '</div>' +
      '<h3 class="card-title"><a href="' + esc(it.url) + '" target="_blank" rel="noopener">' +
        esc(it.title) + '</a></h3>' +
      (it.snippet ? '<p class="card-snippet">' + esc(it.snippet) + '</p>' : "") +
      '</article>';
  }
  function renderList(container, items, emptyMsg) {
    container.innerHTML = items.length
      ? items.map(cardHTML).join("")
      : '<p class="empty">' + emptyMsg + '</p>';
  }
  function renderLatest() {
    var items = latestItems();
    var shown = Math.min(state.shown, items.length);
    var rest = items.length - shown;
    el.countLine.textContent = (rest > 0
      ? "共 " + items.length + " 則公告(已顯示 " + shown + " 則)"
      : "共 " + items.length + " 則公告")
      + (state.archive === "loading" ? " · 搜尋歷史資料中…" : "");
    renderList(el.list, items.slice(0, shown),
      "找不到符合條件的公告,換個關鍵字或篩選試試。");
    if (rest > 0) {
      el.list.insertAdjacentHTML("beforeend",
        '<div class="more-wrap"><button type="button" id="btnMore" class="btn-ghost">' +
        "載入更多(還有 " + rest + " 則)</button></div>");
    }
  }
  function resetPaging() { state.shown = PAGE_SIZE; }
  function renderSub() {
    var msg = state.keywords.length
      ? "目前沒有符合訂閱關鍵字的公告。"
      : "先在上方新增關鍵字,開始追蹤你在意的消息。";
    renderList(el.subList, subItems(), msg);
    renderKwChips();
  }
  function renderKwChips() {
    el.kwChips.innerHTML = state.keywords.map(function (kw, i) {
      return '<span class="kw-chip">' + esc(kw) +
        '<button type="button" data-i="' + i + '" aria-label="移除 ' + esc(kw) + '">×</button></span>';
    }).join("");
  }
  function renderControls() {
    var schools = [{ id: "all", short: "全部" }].concat(state.data.schools);
    el.schoolSeg.innerHTML = schools.map(function (s) {
      return '<button data-school="' + s.id + '"' +
        (state.school === s.id ? ' class="is-active"' : "") + ">" + esc(s.short) + "</button>";
    }).join("");

    var used = {};
    state.data.items.forEach(function (it) { used[it.category] = true; });
    var cats = ["all"].concat(state.data.categories.filter(function (c) { return used[c]; }));
    el.catChips.innerHTML = cats.map(function (c) {
      var label = c === "all" ? "全部分類" : c;
      return '<button class="chip' + (state.cat === c ? " is-active" : "") +
        '" data-cat="' + esc(c) + '">' + esc(label) + "</button>";
    }).join("");
  }
  function renderBadge() {
    var n = newSubCount();
    el.subBadge.hidden = n === 0;
    el.subBadge.textContent = n > 99 ? "99+" : String(n);
  }
  function renderUpdatedAt() {
    if (!state.data || !state.data.generated_at) return;
    var t = state.data.generated_at.replace("T", " ").slice(5, 16);
    el.updatedAt.textContent = "更新於 " + t;
  }
  function renderAll() {
    if (!state.data) return;
    renderControls();
    renderLatest();
    renderSub();
    renderBadge();
    renderUpdatedAt();
    maybeNotify();
  }

  /* ── 通知 ── */
  function refreshNotifyState() {
    if (!("Notification" in window)) {
      el.btnNotify.hidden = true;
      el.notifyState.textContent = "此瀏覽器不支援通知";
      return;
    }
    if (Notification.permission === "granted") {
      el.btnNotify.hidden = true;
      el.notifyState.textContent = "通知已開啟:開啟本站時若有訂閱新訊會提醒你";
    } else if (Notification.permission === "denied") {
      el.btnNotify.hidden = true;
      el.notifyState.textContent = "通知已被封鎖,可到瀏覽器設定重新允許";
    } else {
      el.btnNotify.hidden = false;
      el.notifyState.textContent = "";
    }
  }
  function maybeNotify() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    var n = newSubCount();
    if (n > 0) {
      try {
        new Notification("嘉校快訊", {
          body: "有 " + n + " 則符合訂閱關鍵字的新公告",
          icon: "icons/icon-192.png",
        });
      } catch (e) { /* 部分行動瀏覽器需經 Service Worker,略過 */ }
    }
  }

  /* ── 事件 ── */
  el.q.addEventListener("input", function () {
    state.q = el.q.value.trim();
    if (state.q) ensureArchive();
    resetPaging(); renderLatest();
  });
  el.schoolSeg.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-school]");
    if (!b) return;
    state.school = b.dataset.school;
    resetPaging(); renderControls(); renderLatest();
  });
  el.catChips.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cat]");
    if (!b) return;
    state.cat = b.dataset.cat;
    if (state.cat !== "all") ensureArchive(); /* 分類瀏覽超出近一年範圍時需要完整資料 */
    resetPaging(); renderControls(); renderLatest();
  });
  el.list.addEventListener("click", function (e) {
    if (!e.target.closest("#btnMore")) return;
    state.shown += PAGE_SIZE;
    renderLatest();
    // 重新渲染後按鈕是新的節點,把焦點移回去,鍵盤操作才不會跳掉
    var next = document.getElementById("btnMore");
    if (next) next.focus();
  });
  el.kwForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var kw = el.kwInput.value.trim();
    if (!kw || state.keywords.indexOf(kw) !== -1) { el.kwInput.value = ""; return; }
    state.keywords.push(kw);
    saveKeywords();
    el.kwInput.value = "";
    renderSub(); renderBadge();
  });
  el.kwChips.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-i]");
    if (!b) return;
    state.keywords.splice(Number(b.dataset.i), 1);
    saveKeywords();
    renderSub(); renderBadge();
  });
  el.btnNotify.addEventListener("click", function () {
    Notification.requestPermission().then(function () {
      refreshNotifyState();
      maybeNotify();
    });
  });
  el.btnRefresh.addEventListener("click", function () {
    var before = state.data && state.data.generated_at;
    fetchData().then(function () {
      if (state.data && before && state.data.generated_at === before) {
        /* 資料沒變:誠實告知不是壞掉,是還沒到下一輪更新 */
        el.updatedAt.textContent =
          "已是最新(每小時自動更新,上次 " + before.slice(11, 16) + ")";
        setTimeout(renderUpdatedAt, 3000);
      }
    });
  });

  function switchTab(tab) {
    state.tab = tab;
    var latest = tab === "latest";
    el.viewLatest.hidden = !latest;
    el.viewSub.hidden = latest;
    el.tabLatest.classList.toggle("is-active", latest);
    el.tabSub.classList.toggle("is-active", !latest);
    el.tabLatest.setAttribute("aria-current", latest ? "page" : "false");
    el.tabSub.setAttribute("aria-current", latest ? "false" : "page");
    if (!latest) {
      renderSub();
      // 看過訂閱頁後,把「新」的基準點推進到現在
      state.lastSeen = new Date().toISOString();
      localStorage.setItem(LS_SEEN, state.lastSeen);
      setTimeout(renderBadge, 400);
    }
    window.scrollTo(0, 0);
  }
  el.tabLatest.addEventListener("click", function () { switchTab("latest"); });
  el.tabSub.addEventListener("click", function () { switchTab("sub"); });

  /* ── PWA ── */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  refreshNotifyState();
  fetchData();
})();
