/* 嘉校快訊 Local PWA Notification V2 狀態與去重邏輯 */
(function (root) {
  "use strict";

  var STORAGE_KEY = "cyNews.notificationState";
  var LEGACY_KEYWORDS = "cyNews.keywords";
  var MAX_NOTIFIED_IDS = 500;
  var VERSION = 2;

  function getStorage(storage) {
    return storage || root.localStorage;
  }

  function readJSON(storage, key, fallback) {
    try {
      var raw = getStorage(storage).getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(storage, key, value) {
    getStorage(storage).setItem(key, JSON.stringify(value));
  }

  function nowISO(now) {
    return (now || new Date()).toISOString();
  }

  function makeId(now, idFactory) {
    if (idFactory) return String(idFactory());
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID();
    }
    return "sub-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 10);
  }

  function validSubscription(value) {
    return value && typeof value.id === "string" && value.id &&
      typeof value.keyword === "string" && value.keyword.trim() &&
      typeof value.createdAt === "string" && value.createdAt;
  }

  function normalizeSubscriptions(values) {
    var seen = {};
    return (Array.isArray(values) ? values : []).filter(validSubscription)
      .map(function (sub) {
        return {
          id: sub.id,
          keyword: sub.keyword.trim(),
          createdAt: sub.createdAt,
        };
      }).filter(function (sub) {
        if (seen[sub.id]) return false;
        seen[sub.id] = true;
        return true;
      });
  }

  function normalizeNotifiedIds(values) {
    var seen = {};
    var result = [];
    (Array.isArray(values) ? values : []).forEach(function (id) {
      if (typeof id !== "string" || !id || seen[id]) return;
      seen[id] = true;
      result.push(id);
    });
    return result.slice(-MAX_NOTIFIED_IDS);
  }

  function normalizeState(value) {
    return {
      version: VERSION,
      subscriptions: normalizeSubscriptions(value && value.subscriptions),
      notifiedIds: normalizeNotifiedIds(value && value.notifiedIds),
    };
  }

  function load(options) {
    options = options || {};
    var storage = getStorage(options.storage);
    var current;
    try { current = JSON.parse(storage.getItem(STORAGE_KEY)); } catch (e) { current = null; }

    if (current && current.version === VERSION && Array.isArray(current.subscriptions) &&
        Array.isArray(current.notifiedIds)) {
      var existing = normalizeState(current);
      if (JSON.stringify(existing) !== JSON.stringify(current)) {
        writeJSON(storage, STORAGE_KEY, existing);
      }
      return existing;
    }

    var legacy = readJSON(storage, LEGACY_KEYWORDS, []);
    var createdAt = nowISO(options.now);
    var usedIds = {};
    var subscriptions = [];
    (Array.isArray(legacy) ? legacy : []).forEach(function (keyword, index) {
      if (typeof keyword !== "string" || !keyword.trim()) return;
      var id = makeId(options.now, options.idFactory);
      while (usedIds[id]) id = makeId(options.now, options.idFactory);
      usedIds[id] = true;
      subscriptions.push({ id: id, keyword: keyword.trim(), createdAt: createdAt });
    });
    var migrated = { version: VERSION, subscriptions: subscriptions, notifiedIds: [] };
    writeJSON(storage, STORAGE_KEY, migrated);
    return migrated;
  }

  function save(state, storage) {
    var normalized = normalizeState(state);
    writeJSON(storage, STORAGE_KEY, normalized);
    state.version = normalized.version;
    state.subscriptions = normalized.subscriptions;
    state.notifiedIds = normalized.notifiedIds;
    return state;
  }

  function addSubscription(state, keyword, options) {
    options = options || {};
    var value = String(keyword == null ? "" : keyword).trim();
    if (!value) return null;
    var duplicate = state.subscriptions.some(function (sub) {
      return sub.keyword === value;
    });
    if (duplicate) return null;
    var sub = {
      id: makeId(options.now, options.idFactory),
      keyword: value,
      createdAt: nowISO(options.now),
    };
    state.subscriptions.push(sub);
    return sub;
  }

  function removeSubscription(state, id) {
    var before = state.subscriptions.length;
    state.subscriptions = state.subscriptions.filter(function (sub) { return sub.id !== id; });
    return state.subscriptions.length !== before;
  }

  function compareTime(value, baseline) {
    var valueTime = Date.parse(value);
    var baselineTime = Date.parse(baseline);
    if (!isNaN(valueTime) && !isNaN(baselineTime)) return valueTime > baselineTime;
    return String(value || "") > String(baseline || "");
  }

  function defaultText(item) {
    return String(item.title || "") + " " + String(item.snippet || "") + " " +
      String(item.category || "") + " " + String(item.source_category || "");
  }

  function findCandidates(items, state, textFn) {
    var alreadyNotified = {};
    state.notifiedIds.forEach(function (id) { alreadyNotified[id] = true; });
    var seen = {};
    var result = [];
    var textGetter = textFn || defaultText;
    (Array.isArray(items) ? items : []).forEach(function (item) {
      if (!item || typeof item.id !== "string" || !item.id || seen[item.id] || alreadyNotified[item.id]) return;
      var text = textGetter(item).toLowerCase();
      var matches = state.subscriptions.some(function (sub) {
        return compareTime(item.first_seen, sub.createdAt) &&
          text.indexOf(sub.keyword.toLowerCase()) !== -1;
      });
      if (matches) {
        seen[item.id] = true;
        result.push(item);
      }
    });
    return result;
  }

  function markNotified(state, ids, storage) {
    var existing = normalizeNotifiedIds(state.notifiedIds);
    var seen = {};
    existing.forEach(function (id) { seen[id] = true; });
    (Array.isArray(ids) ? ids : []).forEach(function (id) {
      if (typeof id !== "string" || !id || seen[id]) return;
      seen[id] = true;
      existing.push(id);
    });
    state.notifiedIds = existing.slice(-MAX_NOTIFIED_IDS);
    save(state, storage);
    return state.notifiedIds;
  }

  root.CyNewsNotificationState = {
    STORAGE_KEY: STORAGE_KEY,
    MAX_NOTIFIED_IDS: MAX_NOTIFIED_IDS,
    load: load,
    save: save,
    addSubscription: addSubscription,
    removeSubscription: removeSubscription,
    findCandidates: findCandidates,
    markNotified: markNotified,
    normalizeState: normalizeState,
  };
})(typeof window !== "undefined" ? window : this);
