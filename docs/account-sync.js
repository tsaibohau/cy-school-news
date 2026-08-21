/* Optional Account & Sync V1 core. No Supabase client or secrets are bundled. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsAccountSync = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var VERSION = 1;
  var OUTBOX_PREFIX = "cyNews.accountSync.v1:";
  var ANONYMOUS_ACCOUNT = "anonymous";
  function normalizeKeyword(value) { return String(value == null ? "" : value).trim().toLocaleLowerCase("zh-TW"); }
  function accountId(value) { var id = String(value == null ? "" : value).trim(); return id || ANONYMOUS_ACCOUNT; }
  function timestamp(value) { if (typeof value !== "string" || !value.trim()) return null; var n = Date.parse(value); return isNaN(n) ? null : n; }
  function stableJson(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
    return "{" + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ":" + stableJson(value[key]); }).join(",") + "}";
  }
  function isDeleted(row) { return !!(row && row.deleted_at); }
  function compareCandidates(a, b, timeField) {
    timeField = timeField || "updated_at";
    var at = timestamp(a && a[timeField]), bt = timestamp(b && b[timeField]);
    if (at !== null || bt !== null) { if (at === null) return -1; if (bt === null) return 1; if (at !== bt) return at > bt ? 1 : -1; }
    if (isDeleted(a) !== isDeleted(b)) return isDeleted(a) ? 1 : -1;
    var aj = stableJson(a || {}), bj = stableJson(b || {}); return aj === bj ? 0 : (aj > bj ? 1 : -1);
  }
  function chooseCandidate(old, candidate, timeField) { return !old || compareCandidates(candidate, old, timeField) > 0 ? candidate : old; }
  function mergeSubscriptions(local, remote) {
    var byKeyword = {};
    (Array.isArray(local) ? local : []).concat(Array.isArray(remote) ? remote : []).forEach(function (sub) {
      var normalized = sub && (sub.normalized_keyword || normalizeKeyword(sub.keyword)); if (!normalized) return;
      var candidate = Object.assign({}, sub, { normalized_keyword: normalized }); byKeyword[normalized] = chooseCandidate(byKeyword[normalized], candidate, "updated_at");
    });
    return Object.keys(byKeyword).sort().map(function (key) { return byKeyword[key]; });
  }
  function mergeReads(local, remote) {
    var result = {};
    (Array.isArray(local) ? local : []).concat(Array.isArray(remote) ? remote : []).forEach(function (row) {
      if (!row || !row.announcement_id) return; result[row.announcement_id] = chooseCandidate(result[row.announcement_id], row, "read_at");
    });
    return Object.keys(result).sort().map(function (key) { return result[key]; });
  }
  function mergePreferences(local, remote) {
    if (!local) return remote || { schema_version: VERSION, preferences: {} }; if (!remote) return local;
    return chooseCandidate(local, remote, "updated_at") === remote ? remote : local;
  }
  function emptyState() { return { subscriptions: [], reads: [], preferences: { schema_version: VERSION, preferences: {} } }; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function mergeAccountState(local, remote) { local = local || {}; remote = remote || {}; return { subscriptions: mergeSubscriptions(local.subscriptions, remote.subscriptions), reads: mergeReads(local.reads, remote.reads), preferences: mergePreferences(local.preferences, remote.preferences) }; }
  function Outbox(storage, activeAccountId) { this.storage = storage || (typeof localStorage !== "undefined" ? localStorage : null); this.account_id = accountId(activeAccountId); this.key = OUTBOX_PREFIX + this.account_id; }
  Outbox.prototype.load = function () {
    var blank = { version: VERSION, account_id: this.account_id, pending: [], last_sync_at: "" }; if (!this.storage) return blank;
    try {
      var raw = this.storage.getItem(this.key), legacy = false;
      if (!raw) { raw = this.storage.getItem("cyNews.accountSync.v1"); legacy = !!raw; }
      var value = JSON.parse(raw || "{}"), owner = value.account_id || (this.account_id === ANONYMOUS_ACCOUNT ? ANONYMOUS_ACCOUNT : "");
      if (owner !== this.account_id) return blank;
      var pending = Array.isArray(value.pending) ? value.pending.map(function (x) {
        if (!x) return null;
        if (!x.account_id && legacy) return Object.assign({}, x, { account_id: owner });
        return x;
      }).filter(function (x) { return x && x.account_id === owner; }) : [];
      return { version: VERSION, account_id: this.account_id, pending: pending, last_sync_at: value.last_sync_at || "" };
    } catch (_) { return blank; }
  };
  Outbox.prototype.save = function (value) { if (this.storage) this.storage.setItem(this.key, JSON.stringify(value)); };
  Outbox.prototype.enqueue = function (mutation) {
    mutation = mutation || {}; var requested = mutation.account_id == null ? this.account_id : accountId(mutation.account_id); if (requested !== this.account_id) throw new Error("outbox account mismatch");
    var state = this.load(), item = Object.assign({ id: "m-" + Date.now() + "-" + Math.random().toString(16).slice(2), created_at: new Date().toISOString(), account_id: this.account_id }, mutation);
    item.account_id = this.account_id; if (!state.pending.some(function (x) { return x.id === item.id; })) state.pending.push(item); this.save(state); return item;
  };
  Outbox.prototype.pending = function () { return this.load().pending.slice(); };
  Outbox.prototype.ack = function (ids, syncedAt, owner) {
    if (owner != null && accountId(owner) !== this.account_id) throw new Error("outbox account mismatch");
    var state = this.load(), done = {}; (Array.isArray(ids) ? ids : []).forEach(function (id) { done[id] = true; });
    state.pending = state.pending.filter(function (x) { return !done[x.id] && x.account_id === state.account_id; }); state.last_sync_at = syncedAt || new Date().toISOString(); this.save(state); return state;
  };
  function AccountLifecycle(initialAnonymous) { this.anonymous = clone(initialAnonymous || emptyState()); this.accounts = {}; this.active_account_id = ANONYMOUS_ACCOUNT; this.active_state = clone(this.anonymous); }
  AccountLifecycle.prototype.state = function () { return clone(this.active_state); };
  AccountLifecycle.prototype.login = function (id, remote) {
    id = accountId(id); if (this.active_account_id !== ANONYMOUS_ACCOUNT) this.accounts[this.active_account_id] = clone(this.active_state);
    var existing = this.accounts[id] || emptyState();
    this.active_state = mergeAccountState(mergeAccountState(existing, this.anonymous), remote || {});
    this.accounts[id] = clone(this.active_state); this.active_account_id = id; return this.state();
  };
  AccountLifecycle.prototype.logout = function () { if (this.active_account_id !== ANONYMOUS_ACCOUNT) { this.accounts[this.active_account_id] = clone(this.active_state); this.active_account_id = ANONYMOUS_ACCOUNT; this.active_state = clone(this.anonymous); } return this.state(); };
  AccountLifecycle.prototype.updateAnonymous = function (state) { if (this.active_account_id !== ANONYMOUS_ACCOUNT) throw new Error("anonymous state inactive"); this.anonymous = clone(state || emptyState()); this.active_state = clone(this.anonymous); return this.state(); };
  return { VERSION: VERSION, OUTBOX_KEY: OUTBOX_PREFIX, ANONYMOUS_ACCOUNT: ANONYMOUS_ACCOUNT, normalizeKeyword: normalizeKeyword, accountId: accountId, timestamp: timestamp, mergeSubscriptions: mergeSubscriptions, mergeReads: mergeReads, mergePreferences: mergePreferences, mergeAccountState: mergeAccountState, Outbox: Outbox, AccountLifecycle: AccountLifecycle };
});
