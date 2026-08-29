/* 嘉校快訊 Service Worker:離線快取殼層,資料採網路優先 */
/* ⚠ 殼層是快取優先:只要改了 app.js / style.css / index.html,就必須把
   下面的版本號 +1,否則已安裝 PWA 的使用者會一直用舊版檔案。 */
var CACHE = "cy-news-v44";
var SHELL = ["./", "./index.html", "./style.css?v=41", "./app.js?v=44", "./notification-state.js", "./calendar-state.js?v=41", "./account-config.js?v=41", "./supabase-sync.js?v=41", "./account-auth.js?v=41", "./push-subscription.js?v=41", "./reminder-rules.js?v=41", "./task-state.js?v=41", "./account-sync.js?v=41", "./school-registry.js?v=41", "./profile.js?v=41", "./relevance.js?v=41", "./assistant-feedback.js?v=41", "./today.js?v=41", "./search-taxonomy.js?v=44", "./search-query.js?v=44", "./assistant-qa.js?v=44", "./detail-ui.js?v=41", "./manifest.webmanifest", "./data/calendar-events.json",
             "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener("push", function (e) {
  var payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch (_) { payload = {}; }
  var title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "嘉校快訊";
  var body = typeof payload.body === "string" && payload.body.trim() ? payload.body.trim() : "你有一則新的提醒";
  var target = safeNotificationTarget(payload.url);
  e.waitUntil(self.registration.showNotification(title, { body: body.slice(0, 160), data: { url: target }, tag: typeof payload.tag === "string" ? payload.tag.slice(0, 120) : "cynews-reminder" }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var target = safeNotificationTarget(e.notification.data && e.notification.data.url);
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    var existing = list[0];
    if (existing && "navigate" in existing) {
      return existing.navigate(target)
        .then(function (navigated) { return (navigated || existing).focus(); })
        .catch(function () { return self.clients.openWindow(target); });
    }
    return self.clients.openWindow(target);
  }));
});

function safeNotificationTarget(value) {
  var scope = new URL(self.registration.scope);
  try {
    var target = new URL(typeof value === "string" ? value : "", scope);
    var inScope = target.origin === scope.origin && target.pathname.indexOf(scope.pathname) === 0;
    var hasToken = target.searchParams.has("access_token") || target.searchParams.has("refresh_token") || target.searchParams.has("code");
    return inScope && !target.username && !target.password && !hasToken ? target.href : scope.href;
  } catch (_) { return scope.href; }
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  /* Never cache auth callback URLs or token-bearing query strings. */
  if (url.pathname.indexOf("/auth/") !== -1 || url.searchParams.has("code") ||
      url.searchParams.has("access_token") || url.searchParams.has("refresh_token")) return;

  if (url.pathname.indexOf("/data/") !== -1) {
    // 資料(announcements / archive):網路優先,離線時退回快取。
    // 以 pathname 當快取鍵,避免 ?_=時間戳 的破快取參數讓快取無限增生。
    var key = url.pathname;
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(key, copy); });
        return markDataSource(res, "network");
      }).catch(function () {
        return caches.match(key).then(function (hit) {
          return hit ? markDataSource(hit, "cache") : hit;
        });
      })
    );
    return;
  }
  // 殼層:快取優先
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      });
    })
  );
});

function markDataSource(response, source) {
  var headers = new Headers(response.headers);
  headers.set("X-CyNews-Data-Source", source);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

