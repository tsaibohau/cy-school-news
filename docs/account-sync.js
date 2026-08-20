/* Optional Account & Sync V1 core. No Supabase client or secrets are bundled. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsAccountSync = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var VERSION = 1;
  var OUTBOX_KEY = "cyNews.accountSync.v1";

  function normalizeKeyword(value) {
    return String(value == null ? "" : value).trim().toLocaleLowerCase("zh-TW");
  }

  function timestamp(value) {
    var n = Date.parse(value || "");
    return isNaN(n) ? 0 : n;
  }

  function mergeSubscriptions(local, remote) {
    var byKeyword = {};
    (Array.isArray(local) ? local : []).concat(Array.isArray(remote) ? remote : [])
      .forEach(function (sub) {
        var normalized = sub.normalized_keyword || normalizeKeyword(sub.keyword);
        if (!normalized) return;
        var candidate = Object.assign({}, sub, { normalized_keyword: normalized });
        var old = byKeyword[normalized];
        if (!old || timestamp(candidate.updated_at) >= timestamp(old.updated_at)) {
          byKeyword[normalized] = candidate;
        }
      });
    return Object.keys(byKeyword).sort().map(function (key) { return byKeyword[key]; });
  }

  function mergeReads(local, remote) {
    var result = {};
    (Array.isArray(local) ? local : []).concat(Array.isArray(remote) ? remote : [])
      .forEach(function (row) {
        if (!row || !row.announcement_id) return;
        var old = result[row.announcement_id];
        if (!old || timestamp(row.read_at) >= timestamp(old.read_at)) {
          result[row.announcement_id] = Object.assign({}, row);
        }
      });
    return Object.keys(result).sort().map(function (key) { return result[key]; });
  }

  function mergePreferences(local, remote) {
    if (!local) return remote || { schema_version: VERSION, preferences: {} };
    if (!remote) return local;
    return timestamp(remote.updated_at) >= timestamp(local.updated_at) ? remote : local;
  }

  function mergeAccountState(local, remote) {
    local = local || {};
    remote = remote || {};
    return {
      subscriptions: mergeSubscriptions(local.subscriptions, remote.subscriptions),
      reads: mergeReads(local.reads, remote.reads),
      preferences: mergePreferences(local.preferences, remote.preferences),
    };
  }

  function Outbox(storage) {
    this.storage = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    this.key = OUTBOX_KEY;
  }
  Outbox.prototype.load = function () {
    if (!this.storage) return { version: VERSION, account_id: "", pending: [], last_sync_at: "" };
    try {
      var value = JSON.parse(this.storage.getItem(this.key) || "{}");
      return { version: VERSION, account_id: value.account_id || "",
        pending: Array.isArray(value.pending) ? value.pending : [],
        last_sync_at: value.last_sync_at || "" };
    } catch (_) {
      return { version: VERSION, account_id: "", pending: [], last_sync_at: "" };
    }
  };
  Outbox.prototype.save = function (value) {
    if (this.storage) this.storage.setItem(this.key, JSON.stringify(value));
  };
  Outbox.prototype.enqueue = function (mutation) {
    var state = this.load();
    var item = Object.assign({ id: "m-" + Date.now() + "-" + Math.random().toString(16).slice(2),
      created_at: new Date().toISOString() }, mutation);
    if (!state.pending.some(function (x) { return x.id === item.id; })) state.pending.push(item);
    this.save(state);
    return item;
  };
  Outbox.prototype.ack = function (ids, syncedAt) {
    var state = this.load();
    var done = {};
    (Array.isArray(ids) ? ids : []).forEach(function (id) { done[id] = true; });
    state.pending = state.pending.filter(function (x) { return !done[x.id]; });
    state.last_sync_at = syncedAt || new Date().toISOString();
    this.save(state);
    return state;
  };

  return {
    VERSION: VERSION,
    OUTBOX_KEY: OUTBOX_KEY,
    normalizeKeyword: normalizeKeyword,
    mergeSubscriptions: mergeSubscriptions,
    mergeReads: mergeReads,
    mergePreferences: mergePreferences,
    mergeAccountState: mergeAccountState,
    Outbox: Outbox,
  };
});
