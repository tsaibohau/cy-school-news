/* 其他學校的資料不放在公開網站，而是存在私有 Supabase Storage bucket「restricted-data」
   （物件名稱 = 倉庫內原檔路徑 + ".gz"，例如 docs/data/announcements.json.gz）。
   只有聯席管理員以上讀得到（storage RLS）；其他人一律靜默退回公開資料。
   這個模組永遠不丟例外、不擋第一次畫面：先用公開資料畫，blob 到了再合併重畫。 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CyNewsRestricted = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  var BUCKET = "restricted-data";
  var PREFIX = "docs/";
  /* 與 docs/restricted-files.json 的規則一致：每個檔案要串接哪些清單。
     lists：物件內的陣列欄位；root：整份就是陣列；idKey：串接時用來去重的欄位；count：合併後重算的欄位。 */
  var ITEMS = { lists: ["items", "schools"], idKey: "id" };
  var RULES = {
    "data/announcements.json": ITEMS,
    "data/announcements-latest.json": ITEMS,
    "data/archive.json": { lists: ["items"], idKey: "id" },
    "data/calendar-events.json": { root: true },
    "data/official-calendar-events.json": { root: true },
    "data/calendar-source-status.json": { root: true },
    "data/class-timetables.json": { lists: ["timetables"] },
    "data/series.json": { lists: ["series"], idKey: "id", count: "series" },
    "data/removed-announcements.json": { lists: ["removed"] },
    "data/reminder-targets.json": { lists: ["targets"] },
  };
  var SCHOOL_INFO = /^data\/school-info\/[A-Za-z0-9._-]+\.json$/;
  var SHARD = /^data\/schools\/([a-z0-9-]+)\/(current|archive|latest)\.json$/;

  var clientProvider = null;
  var gunzipImpl = null;
  var registryOverride = null;
  var cache = Object.create(null); /* 物件名稱 -> Promise<json|null>，每次載入頁面一份 */
  var resolved = Object.create(null); /* 物件名稱 -> 已解開的 json，同步合併用 */

  function registry() { return registryOverride || (root && root.CyNewsSchoolRegistry) || null; }
  function enabled() {
    try {
      var r = registry();
      return !!(r && typeof r.adminViewer === "function" && r.adminViewer() && clientProvider);
    } catch (_) { return false; }
  }
  function useClient(provider) { clientProvider = typeof provider === "function" ? provider : null; }
  function configure(options) {
    options = options || {};
    if ("client" in options) useClient(options.client);
    if ("gunzip" in options) gunzipImpl = options.gunzip;
    if ("registry" in options) registryOverride = options.registry;
    if (options.reset) { cache = Object.create(null); resolved = Object.create(null); }
  }

  function normalizeUrl(url) {
    return String(url || "").split("?")[0].split("#")[0].replace(/^\.\//, "").replace(/^\//, "");
  }
  function ruleFor(url) {
    url = normalizeUrl(url);
    if (RULES[url]) return RULES[url];
    if (SCHOOL_INFO.test(url)) return { lists: ["items"], idKey: "id" };
    return null;
  }
  function objectName(url) { return PREFIX + normalizeUrl(url) + ".gz"; }
  /* data/schools/<id>/(current|archive|latest).json 不存放，改由合併後的總檔依學校篩出 */
  function shardOf(url) {
    var m = SHARD.exec(normalizeUrl(url));
    if (!m) return null;
    var wide = m[2] === "archive" ? "data/archive.json" : m[2] === "latest" ? "data/announcements-latest.json" : "data/announcements.json";
    return { school: m[1], kind: m[2], url: wide };
  }

  function concatUnique(a, b, idKey) {
    a = Array.isArray(a) ? a : [];
    b = Array.isArray(b) ? b : [];
    if (!b.length) return a;
    var seen = null;
    if (idKey) {
      seen = Object.create(null);
      a.forEach(function (row) { if (row && row[idKey] != null) seen[String(row[idKey])] = true; });
    }
    var out = a.slice();
    b.forEach(function (row) {
      if (seen && row && row[idKey] != null) {
        if (seen[String(row[idKey])]) return;
        seen[String(row[idKey])] = true;
      }
      out.push(row);
    });
    return out;
  }
  /* 純函式：公開 JSON + 私有 blob → 新物件（不改動輸入）。公開檔不存在（null）時以 blob 為準。 */
  function mergeInto(publicJson, blobJson, rule) {
    if (blobJson == null || typeof blobJson !== "object") return publicJson;
    rule = rule || {};
    if (rule.root) {
      if (!Array.isArray(blobJson)) return publicJson;
      return concatUnique(Array.isArray(publicJson) ? publicJson : [], blobJson, rule.idKey);
    }
    if (Array.isArray(blobJson)) return publicJson;
    var base = publicJson && typeof publicJson === "object" && !Array.isArray(publicJson) ? publicJson : {};
    var out = Object.assign({}, base);
    var touched = false;
    (rule.lists || []).forEach(function (key) {
      if (!Array.isArray(blobJson[key]) || !blobJson[key].length) return;
      out[key] = concatUnique(base[key], blobJson[key], rule.idKey);
      touched = true;
    });
    if (!touched) return publicJson;
    if (rule.count && Array.isArray(out[rule.count])) out.count = out[rule.count].length;
    return out;
  }

  function hasGzipMagic(bytes) { return bytes && bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b; }
  function gunzip(bytes) {
    if (gunzipImpl) return Promise.resolve(gunzipImpl(bytes));
    if (typeof DecompressionStream !== "function") return Promise.reject(new Error("no DecompressionStream"));
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }
  function toBytes(data) {
    if (data && typeof data.arrayBuffer === "function") return data.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    if (data instanceof Uint8Array) return Promise.resolve(data);
    if (data instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(data));
    return Promise.reject(new Error("unexpected blob"));
  }
  function decodeBlob(data) {
    return toBytes(data).then(function (bytes) {
      /* 瀏覽器可能已依 Content-Encoding 解開；沒有 gzip 開頭就當純 JSON */
      return (hasGzipMagic(bytes) ? gunzip(bytes) : Promise.resolve(bytes)).then(function (raw) {
        return JSON.parse(new TextDecoder("utf-8").decode(raw));
      });
    });
  }

  /* 下載並解開一個物件；失敗一律回 null（同一頁不重試）。非管理員永遠不碰 storage。 */
  function fetchBlob(name, options) {
    if (!enabled()) return Promise.resolve(null);
    name = String(name || "");
    if (!name || name.indexOf("..") !== -1) return Promise.resolve(null);
    if (cache[name] && !(options && options.force)) return cache[name];
    var promise = Promise.resolve().then(clientProvider).then(function (client) {
      if (!client || !client.storage) return null;
      var auth = client.auth && typeof client.auth.getSession === "function" ? client.auth.getSession() : { data: { session: {} } };
      return Promise.resolve(auth).then(function (res) {
        if (!(res && res.data && res.data.session)) return null; /* 沒登入就不必試 */
        return client.storage.from(BUCKET).download(name);
      }).then(function (res) {
        if (!res || res.error || !res.data) return null;
        return decodeBlob(res.data);
      });
    }).then(function (json) {
      if (json != null) resolved[name] = json;
      return json == null ? null : json;
    }).catch(function () { return null; });
    cache[name] = promise;
    return promise;
  }

  function mergedFromBlob(url, publicJson, blob) {
    var rule = ruleFor(url);
    return rule && blob ? mergeInto(publicJson, blob, rule) : publicJson;
  }
  /* 公開 JSON 合併私有 blob；非管理員、沒有規則、任何失敗都回傳原本的 publicJson。 */
  function loadMerged(url, publicJson, options) {
    try {
      if (!enabled() || !ruleFor(url)) return Promise.resolve(publicJson);
      return fetchBlob(objectName(url), options).then(function (blob) {
        try { return mergedFromBlob(url, publicJson, blob); } catch (_) { return publicJson; }
      }, function () { return publicJson; });
    } catch (_) { return Promise.resolve(publicJson); }
  }
  /* 同步版：只用已經解開過的 blob（重新整理時避免畫面閃一下） */
  function mergeCached(url, publicJson) {
    try {
      if (!enabled() || !ruleFor(url)) return publicJson;
      return mergedFromBlob(url, publicJson, resolved[objectName(url)] || null);
    } catch (_) { return publicJson; }
  }
  /* 單一學校的 shard 檔（current／archive／latest）：由合併總檔篩出，回傳 {school, items}；不可用時回 null */
  function loadShard(url, publicJson, options) {
    var shard = shardOf(url);
    if (!shard || !enabled()) return Promise.resolve(null);
    return loadMerged(shard.url, publicJson || { items: [] }, options).then(function (data) {
      var items = data && Array.isArray(data.items) ? data.items.filter(function (it) { return it && String(it.school || "") === shard.school; }) : [];
      return { school: shard.school, items: items };
    }).catch(function () { return null; });
  }

  return {
    BUCKET: BUCKET, RULES: RULES,
    enabled: enabled, useClient: useClient, configure: configure,
    ruleFor: ruleFor, objectName: objectName, shardOf: shardOf,
    mergeInto: mergeInto, decodeBlob: decodeBlob,
    fetchBlob: fetchBlob, loadMerged: loadMerged, mergeCached: mergeCached, loadShard: loadShard,
  };
});
