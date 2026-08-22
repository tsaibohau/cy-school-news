/* 嘉校快訊 Local PWA Notification V3 狀態與去重邏輯 */
(function (root) {
  "use strict";

  var STORAGE_KEY = "cyNews.notificationState";
  var LEGACY_KEYWORDS = "cyNews.keywords";
  var MAX_NOTIFIED_IDS = 500;
  var VERSION = 3;

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

  function makeId(idFactory) {
    if (idFactory) return String(idFactory());
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID();
    }
    return "sub-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 10);
  }

  function parseTimestamp(value) {
    if (typeof value !== "string" || !value.trim()) return NaN;
    var parsed = Date.parse(value);
    return isNaN(parsed) ? NaN : parsed;
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

  function normalizeState(value, fallbackWatermark) {
    var candidateWatermark = value && typeof value.notifiedThrough === "string"
      ? value.notifiedThrough : "";
    /* A corrupt localStorage value must fail closed, not disable the watermark. */
    var watermark = !isNaN(parseTimestamp(candidateWatermark))
      ? candidateWatermark : (fallbackWatermark || "");
    return {
      version: VERSION,
      subscriptions: normalizeSubscriptions(value && value.subscriptions),
      notifiedIds: normalizeNotifiedIds(value && value.notifiedIds),
      notifiedThrough: watermark,
      personalizedThrough: value && typeof value.personalizedThrough === "string" &&
        !isNaN(parseTimestamp(value.personalizedThrough)) ? value.personalizedThrough : "",
    };
  }

  function writeMigratedState(storage, subscriptions, notifiedIds, migrationAt) {
    var migrated = {
      version: VERSION,
      subscriptions: normalizeSubscriptions(subscriptions),
      notifiedIds: normalizeNotifiedIds(notifiedIds),
      notifiedThrough: migrationAt,
      personalizedThrough: "",
    };
    writeJSON(storage, STORAGE_KEY, migrated);
    return migrated;
  }

  function load(options) {
    options = options || {};
    var storage = getStorage(options.storage);
    var migrationAt = nowISO(options.now);
    var current = readJSON(storage, STORAGE_KEY, null);

    /* V3 is authoritative, including an empty subscriptions array. */
    if (current && current.version === VERSION) {
      var existing = normalizeState(current, migrationAt);
      if (JSON.stringify(existing) !== JSON.stringify(current)) {
        writeJSON(storage, STORAGE_KEY, existing);
      }
      return existing;
    }

    /* V2 is migrated in place: IDs survive, and the watermark starts now. */
    if (current && current.version === 2) {
      return writeMigratedState(storage, current.subscriptions, current.notifiedIds, migrationAt);
    }

    /* Any prior notification-state record is authoritative; never resurrect
       deleted subscriptions from the legacy keyword key. */
    if (current && typeof current.version === "number" && current.version > 2) {
      return writeMigratedState(storage, current.subscriptions, current.notifiedIds, migrationAt);
    }

    var legacy = readJSON(storage, LEGACY_KEYWORDS, []);
    var usedIds = {};
    var subscriptions = [];
    (Array.isArray(legacy) ? legacy : []).forEach(function (keyword) {
      if (typeof keyword !== "string" || !keyword.trim()) return;
      var id = makeId(options.idFactory);
      while (usedIds[id]) id = makeId(options.idFactory);
      usedIds[id] = true;
      subscriptions.push({ id: id, keyword: keyword.trim(), createdAt: migrationAt });
    });
    /* Legacy keys are intentionally left untouched. */
    return writeMigratedState(storage, subscriptions, [], migrationAt);
  }

  function save(state, storage) {
    var normalized = normalizeState(state);
    writeJSON(storage, STORAGE_KEY, normalized);
    state.version = normalized.version;
    state.subscriptions = normalized.subscriptions;
    state.notifiedIds = normalized.notifiedIds;
    state.notifiedThrough = normalized.notifiedThrough;
    state.personalizedThrough = normalized.personalizedThrough;
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
      id: makeId(options.idFactory),
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

  function defaultText(item) {
    return String(item.title || "") + " " + String(item.snippet || "") + " " +
      String(item.category || "") + " " + String(item.source_category || "");
  }

  function findCandidates(items, state, textFn) {
    var alreadyNotified = {};
    state.notifiedIds.forEach(function (id) { alreadyNotified[id] = true; });
    var notifiedThrough = parseTimestamp(state.notifiedThrough);
    var seen = {};
    var result = [];
    var textGetter = textFn || defaultText;
    (Array.isArray(items) ? items : []).forEach(function (item) {
      if (!item || typeof item.id !== "string" || !item.id ||
          seen[item.id] || alreadyNotified[item.id]) return;
      var itemTime = parseTimestamp(item.first_seen);
      if (isNaN(itemTime)) return;
      var text = String(textGetter(item)).toLowerCase();
      var matches = state.subscriptions.some(function (sub) {
        var createdTime = parseTimestamp(sub.createdAt);
        if (isNaN(createdTime)) return false;
        var boundary = isNaN(notifiedThrough)
          ? createdTime : Math.max(createdTime, notifiedThrough);
        return itemTime > boundary &&
          text.indexOf(sub.keyword.toLowerCase()) !== -1;
      });
      if (matches) {
        seen[item.id] = true;
        result.push(item);
      }
    });
    return result;
  }

  function findPersonalizedCandidates(items, state, profile, evaluator) {
    var alreadyNotified = {};
    state.notifiedIds.forEach(function (id) { alreadyNotified[id] = true; });
    var baseline = parseTimestamp(state.personalizedThrough);
    var seen = {};
    var result = [];
    (Array.isArray(items) ? items : []).forEach(function (item) {
      if (!item || typeof item.id !== "string" || !item.id || seen[item.id] || alreadyNotified[item.id]) return;
      var itemTime = parseTimestamp(item.first_seen);
      if (isNaN(itemTime) || !profile || typeof evaluator !== "function") return;
      if (!isNaN(baseline) && itemTime <= baseline) return;
      var relevance = evaluator(item, profile);
      if (!relevance || relevance.tier !== "strong" || !relevance.reasons || !relevance.reasons.length) return;
      seen[item.id] = true;
      result.push({ item: item, relevance: relevance });
    });
    return result;
  }

  function markNotified(state, candidates, storage) {
    var existing = normalizeNotifiedIds(state.notifiedIds);
    var seen = {};
    existing.forEach(function (id) { seen[id] = true; });
    var watermarkTime = parseTimestamp(state.notifiedThrough);
    var watermark = state.notifiedThrough || "";
    (Array.isArray(candidates) ? candidates : []).forEach(function (candidate) {
      var id = typeof candidate === "string" ? candidate : candidate && candidate.id;
      if (typeof id === "string" && id && !seen[id]) {
        seen[id] = true;
        existing.push(id);
      }
      if (candidate && typeof candidate === "object") {
        var candidateTime = parseTimestamp(candidate.first_seen);
        if (!isNaN(candidateTime) && (isNaN(watermarkTime) || candidateTime > watermarkTime)) {
          watermarkTime = candidateTime;
          watermark = candidate.first_seen;
        }
      }
    });
    state.notifiedIds = existing.slice(-MAX_NOTIFIED_IDS);
    if (watermark) state.notifiedThrough = watermark;
    save(state, storage);
    return state.notifiedIds;
  }

  function markPersonalizedNotified(state, candidates, storage) {
    var existing = normalizeNotifiedIds(state.notifiedIds);
    var seen = {};
    existing.forEach(function (id) { seen[id] = true; });
    var watermarkTime = parseTimestamp(state.personalizedThrough);
    var watermark = state.personalizedThrough || "";
    (Array.isArray(candidates) ? candidates : []).forEach(function (candidate) {
      var item = candidate && candidate.item ? candidate.item : candidate;
      var id = item && item.id;
      if (typeof id === "string" && id && !seen[id]) {
        seen[id] = true;
        existing.push(id);
      }
      var candidateTime = parseTimestamp(item && item.first_seen);
      if (!isNaN(candidateTime) && (isNaN(watermarkTime) || candidateTime > watermarkTime)) {
        watermarkTime = candidateTime;
        watermark = item.first_seen;
      }
    });
    state.notifiedIds = existing.slice(-MAX_NOTIFIED_IDS);
    if (watermark) state.personalizedThrough = watermark;
    save(state, storage);
    return state.notifiedIds;
  }

  root.CyNewsNotificationState = {
    VERSION: VERSION,
    STORAGE_KEY: STORAGE_KEY,
    MAX_NOTIFIED_IDS: MAX_NOTIFIED_IDS,
    parseTimestamp: parseTimestamp,
    load: load,
    save: save,
    addSubscription: addSubscription,
    removeSubscription: removeSubscription,
    findCandidates: findCandidates,
    findPersonalizedCandidates: findPersonalizedCandidates,
    markNotified: markNotified,
    markPersonalizedNotified: markPersonalizedNotified,
    normalizeState: normalizeState,
  };
})(typeof window !== "undefined" ? window : this);
