/* 嘉校快訊 Service Worker:離線快取殼層,資料採網路優先 */
/* ⚠ 殼層是快取優先:只要改了 app.js / style.css / index.html,就必須把
   下面的版本號 +1,否則已安裝 PWA 的使用者會一直用舊版檔案。 */
var CACHE = "cy-news-v8";
var SHELL = ["./", "./index.html", "./style.css", "./app.js", "./notification-state.js", "./supabase-sync.js", "./account-auth.js", "./manifest.webmanifest",
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
