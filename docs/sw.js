/* 嘉校快訊 Service Worker:離線快取殼層,資料採網路優先 */
/* ⚠ 殼層是快取優先:只要改了 app.js / style.css / index.html,就必須把
   下面的版本號 +1,否則已安裝 PWA 的使用者會一直用舊版檔案。 */
var CACHE = "cy-news-v3";
var SHELL = ["./", "./index.html", "./style.css", "./app.js", "./manifest.webmanifest",
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

  if (url.pathname.indexOf("/data/announcements.json") !== -1) {
    // 資料:網路優先,離線時退回快取
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("data/announcements.json", copy); });
        return res;
      }).catch(function () {
        return caches.match("data/announcements.json");
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
