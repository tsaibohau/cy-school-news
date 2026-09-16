(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CyNewsCalendarState = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var CACHE_PREFIX = "cyNews.calendarEvents.v2:";
  var LEGACY_KEY = "cyNews.calendarEvents.v1";
  var LEGACY_CLAIM_KEY = "cyNews.calendarEvents.v2:legacy-claim";
  var LEGACY_RECEIPT_PREFIX = "cyNews.calendarEvents.v2:legacy-receipt:";

  function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
  function validUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")); }
  function safeGet(storage, key) { try { return storage && storage.getItem(key); } catch (_) { return null; } }
  function safeSet(storage, key, value) { try { if (!storage) return false; storage.setItem(key, value); return true; } catch (_) { return false; } }
  function safeRemove(storage, key) { try { if (storage) storage.removeItem(key); } catch (_) { /* retain best effort state */ } }
  function parse(raw, fallback) { try { return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } }
  function stableJson(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
    return "{" + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ":" + stableJson(value[key]); }).join(",") + "}";
  }
  function stableHex(value) {
    var input = String(value == null ? "" : value), state = [2166136261, 2246822519, 3266489917, 668265263];
    for (var i = 0; i < input.length; i++) {
      for (var j = 0; j < state.length; j++) {
        state[j] ^= input.charCodeAt(i) + j * 131;
        state[j] = Math.imul(state[j], 16777619 + j * 2) >>> 0;
      }
    }
    return state.map(function (part) { return part.toString(16).padStart(8, "0"); }).join("");
  }
  function stableUuid(value) {
    var hex = stableHex(value);
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-4" + hex.slice(13, 16) + "-8" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
  }
  function randomUuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return stableUuid(Date.now() + ":" + Math.random() + ":" + Math.random());
  }
  function legacyId(row, index) { return "user:legacy:" + index + ":" + String(row.date || row.event_date || "") + ":" + String(row.title || ""); }
  function normalizeRow(row, index) {
    if (!row) return null;
    var title = String(row.title || "").trim(), date = String(row.event_date || row.date || ""), notes = String(row.notes || "").trim();
    if (!title || title.length > 80 || !validDate(date) || notes.length > 240) return null;
    var version = Number(row.version);
    version = Number.isSafeInteger(version) && version > 0 ? version : 1;
    var created = String(row.created_at || row.createdAt || row.updated_at || row.updatedAt || "");
    var updated = String(row.updated_at || row.updatedAt || created || "");
    return {
      id: String(row.id || legacyId(row, index)), title: title, date: date, notes: notes,
      created_at: created, updated_at: updated, deleted_at: row.deleted_at || row.deletedAt || null,
      version: version, last_mutation_id: validUuid(row.last_mutation_id) ? String(row.last_mutation_id) : null,
      legacy_import_key: row.legacy_import_key ? String(row.legacy_import_key) : null,
    };
  }
  function normalize(rows) { return (Array.isArray(rows) ? rows : []).map(normalizeRow).filter(Boolean); }
  function compare(a, b) {
    if (a.version !== b.version) return a.version > b.version ? 1 : -1;
    if (!!a.deleted_at !== !!b.deleted_at) return a.deleted_at ? 1 : -1;
    var at = Date.parse(a.updated_at), bt = Date.parse(b.updated_at);
    if (!isNaN(at) || !isNaN(bt)) {
      if (isNaN(at)) return -1;
      if (isNaN(bt)) return 1;
      if (at !== bt) return at > bt ? 1 : -1;
    }
    var aj = stableJson(a), bj = stableJson(b);
    return aj === bj ? 0 : (aj > bj ? 1 : -1);
  }
  function merge(local, remote) {
    var byId = {};
    normalize(local).concat(normalize(remote)).forEach(function (row) {
      if (!byId[row.id] || compare(row, byId[row.id]) > 0) byId[row.id] = row;
    });
    return Object.keys(byId).sort().map(function (id) { return byId[id]; });
  }
  function visible(rows) { return normalize(rows).filter(function (row) { return !row.deleted_at; }); }
  function upsert(rows, event) {
    var normalized = normalize(rows), candidate = normalizeRow(event, normalized.length);
    if (!candidate) return normalized;
    var found = false;
    var next = normalized.map(function (row) { if (row.id !== candidate.id) return row; found = true; return candidate; });
    return next.concat(found ? [] : [candidate]);
  }
  function remove(rows, id) { return normalize(rows).filter(function (row) { return row.id !== String(id); }); }
  function applyMutation(rows, type, payload, now) {
    payload = payload || {};
    now = now || new Date().toISOString();
    var current = normalize(rows).find(function (row) { return row.id === String(payload.id || ""); });
    if (type === "calendar.create") {
      if (current) return normalize(rows);
      return upsert(rows, { id: payload.id, title: payload.title, date: payload.event_date || payload.date, notes: payload.notes,
        created_at: payload.created_at || now, updated_at: payload.updated_at || now, version: 1,
        last_mutation_id: payload.mutation_id, legacy_import_key: payload.legacy_import_key || null });
    }
    if (!current || current.deleted_at) return normalize(rows);
    var next = Object.assign({}, current, { updated_at: now, version: current.version + 1,
      last_mutation_id: payload.mutation_id || current.last_mutation_id });
    if (type === "calendar.update") {
      next.title = payload.title; next.date = payload.event_date || payload.date; next.notes = payload.notes || "";
    } else if (type === "calendar.delete") next.deleted_at = now;
    else throw new Error("unsupported calendar mutation");
    return upsert(rows, next);
  }
  function reconcile(rows, serverRow) {
    var canonical = normalizeRow(serverRow, 0);
    if (!canonical) return normalize(rows);
    return normalize(rows).filter(function (row) { return row.id !== canonical.id; }).concat([canonical]);
  }
  function cacheKey(accountId) { return CACHE_PREFIX + String(accountId || "anonymous"); }
  function loadCache(storage, accountId) { return normalize(parse(safeGet(storage, cacheKey(accountId)), [])); }
  function saveCache(storage, accountId, rows) { return safeSet(storage, cacheKey(accountId), JSON.stringify(normalize(rows))); }
  function clearCache(storage, accountId) { safeRemove(storage, cacheKey(accountId)); }
  function legacyRows(storage) { return normalize(parse(safeGet(storage, LEGACY_KEY), [])); }
  function readClaim(storage) {
    var claim = parse(safeGet(storage, LEGACY_CLAIM_KEY), null);
    return claim && claim.version === 2 && claim.account_id && Array.isArray(claim.entries) ? claim : null;
  }
  function claimForAccount(storage, accountId) {
    var claim = readClaim(storage);
    return claim && claim.account_id === String(accountId || "") ? claim : null;
  }
  function createLegacyClaim(storage, accountId) {
    accountId = String(accountId || "").trim();
    if (!accountId || accountId === "anonymous") throw new Error("authenticated account required");
    var existing = readClaim(storage);
    if (existing) {
      if (existing.account_id !== accountId) throw new Error("legacy payload claimed by another account");
      return existing;
    }
    var rows = legacyRows(storage);
    if (!rows.length) throw new Error("legacy payload unavailable");
    var payloadHash = stableHex(stableJson(rows.map(function (row) { return { id: row.id, title: row.title, date: row.date, notes: row.notes }; })));
    var claim = { version: 2, account_id: accountId, payload_hash: payloadHash, claimed_at: new Date().toISOString(),
      entries: rows.map(function (row, index) {
        var importKey = "v1:" + stableHex(payloadHash + ":" + index + ":" + stableJson(row));
        return { legacy_import_key: importKey, event_id: stableUuid(accountId + ":" + importKey),
          mutation_id: stableUuid(accountId + ":mutation:" + importKey), title: row.title,
          event_date: row.date, notes: row.notes, confirmed: false };
      }) };
    if (!safeSet(storage, LEGACY_CLAIM_KEY, JSON.stringify(claim))) throw new Error("legacy claim could not be persisted");
    var verified = readClaim(storage);
    if (!verified || verified.account_id !== accountId || verified.payload_hash !== payloadHash) throw new Error("legacy claim verification failed");
    return verified;
  }
  function confirmLegacy(storage, accountId, legacyImportKey) {
    var claim = claimForAccount(storage, accountId);
    if (!claim) return { complete: false, claim: null };
    claim.entries = claim.entries.map(function (entry) {
      return entry.legacy_import_key === legacyImportKey ? Object.assign({}, entry, { confirmed: true }) : entry;
    });
    var complete = claim.entries.length > 0 && claim.entries.every(function (entry) { return entry.confirmed; });
    if (!complete) {
      if (!safeSet(storage, LEGACY_CLAIM_KEY, JSON.stringify(claim))) throw new Error("legacy confirmation could not be persisted");
      return { complete: false, claim: claim };
    }
    var receipt = { version: 2, account_id: claim.account_id, payload_hash: claim.payload_hash, completed_at: new Date().toISOString() };
    if (!safeSet(storage, LEGACY_RECEIPT_PREFIX + claim.account_id, JSON.stringify(receipt))) throw new Error("legacy receipt could not be persisted");
    safeRemove(storage, LEGACY_KEY);
    safeRemove(storage, LEGACY_CLAIM_KEY);
    return { complete: true, receipt: receipt };
  }

  return { CACHE_PREFIX: CACHE_PREFIX, LEGACY_KEY: LEGACY_KEY, LEGACY_CLAIM_KEY: LEGACY_CLAIM_KEY,
    LEGACY_RECEIPT_PREFIX: LEGACY_RECEIPT_PREFIX, normalize: normalize, merge: merge, visible: visible,
    upsert: upsert, remove: remove, applyMutation: applyMutation, reconcile: reconcile,
    cacheKey: cacheKey, loadCache: loadCache, saveCache: saveCache, clearCache: clearCache,
    legacyRows: legacyRows, readClaim: readClaim, claimForAccount: claimForAccount,
    createLegacyClaim: createLegacyClaim, confirmLegacy: confirmLegacy, stableUuid: stableUuid, randomUuid: randomUuid };
});
