/* Optional Account & Sync V1 core. No Supabase client or secrets are bundled. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsAccountSync = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var VERSION = 1;
  var OUTBOX_PREFIX = "cyNews.accountSync.v1:";
  var LEGACY_OUTBOX_KEY = "cyNews.accountSync.v1";
  var STATE_PREFIX = "cyNews.accountState.v1:";
  var META_KEY = "cyNews.accountState.v1:meta";
  var ANONYMOUS_ACCOUNT = "anonymous";

  function normalizeKeyword(value) {
    return String(value == null ? "" : value).trim().toLocaleLowerCase("zh-TW");
  }
  function accountId(value) {
    var id = String(value == null ? "" : value).trim();
    return id || ANONYMOUS_ACCOUNT;
  }
  function timestamp(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    var n = Date.parse(value);
    return isNaN(n) ? null : n;
  }
  function stableJson(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
    return "{" + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ":" + stableJson(value[key]);
    }).join(",") + "}";
  }
  function isDeleted(row) { return !!(row && row.deleted_at); }
  function compareCandidates(a, b, timeField) {
    timeField = timeField || "updated_at";
    var at = timestamp(a && a[timeField]), bt = timestamp(b && b[timeField]);
    if (at !== null || bt !== null) {
      if (at === null) return -1;
      if (bt === null) return 1;
      if (at !== bt) return at > bt ? 1 : -1;
    }
    if (isDeleted(a) !== isDeleted(b)) return isDeleted(a) ? 1 : -1;
    var aj = stableJson(a || {}), bj = stableJson(b || {});
    return aj === bj ? 0 : (aj > bj ? 1 : -1);
  }
  function chooseCandidate(old, candidate, timeField) {
    return !old || compareCandidates(candidate, old, timeField) > 0 ? candidate : old;
  }
  function mergeSubscriptions(local, remote) {
    var byKeyword = {};
    (Array.isArray(local) ? local : []).concat(Array.isArray(remote) ? remote : [])
      .forEach(function (sub) {
        var normalized = sub && (sub.normalized_keyword || normalizeKeyword(sub.keyword));
        if (!normalized) return;
        var candidate = Object.assign({}, sub, { normalized_keyword: normalized });
        byKeyword[normalized] = chooseCandidate(byKeyword[normalized], candidate, "updated_at");
      });
    return Object.keys(byKeyword).sort().map(function (key) { return byKeyword[key]; });
  }
  function mergeReads(local, remote) {
    var result = {};
    (Array.isArray(local) ? local : []).concat(Array.isArray(remote) ? remote : [])
      .forEach(function (row) {
        if (!row || !row.announcement_id) return;
        result[row.announcement_id] = chooseCandidate(result[row.announcement_id], row, "read_at");
      });
    return Object.keys(result).sort().map(function (key) { return result[key]; });
  }
  function normalizePreferences(value, fallbackNow) {
    var source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    var result = Object.assign({}, source);
    result.schema_version = source.schema_version || VERSION;
    result.preferences = source.preferences && typeof source.preferences === "object" && !Array.isArray(source.preferences) ?
      source.preferences : {};
    if (timestamp(result.updated_at) === null) {
      result.updated_at = timestamp(fallbackNow) !== null ? fallbackNow : new Date().toISOString();
    }
    return result;
  }
  function mergePreferences(local, remote) {
    var candidate;
    if (!local) candidate = remote;
    else if (!remote) candidate = local;
    else candidate = chooseCandidate(local, remote, "updated_at");
    if (timestamp(candidate && candidate.updated_at) === null) {
      var shape = candidate && typeof candidate === "object" ? Object.assign({}, candidate) : {};
      shape.schema_version = shape.schema_version || VERSION;
      shape.preferences = shape.preferences && typeof shape.preferences === "object" && !Array.isArray(shape.preferences) ?
        shape.preferences : {};
      return shape;
    }
    return normalizePreferences(candidate);
  }
  function emptyState() {
    return { subscriptions: [], reads: [], preferences: { schema_version: VERSION, preferences: {} } };
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function validState(value) {
    return !!value && typeof value === "object" && !Array.isArray(value) &&
      Array.isArray(value.subscriptions) && Array.isArray(value.reads) &&
      !!value.preferences && typeof value.preferences === "object";
  }
  function safeState(value) { return validState(value) ? clone(value) : emptyState(); }
  function mergeAccountState(local, remote) {
    local = local || {};
    remote = remote || {};
    return {
      subscriptions: mergeSubscriptions(local.subscriptions, remote.subscriptions),
      reads: mergeReads(local.reads, remote.reads),
      preferences: mergePreferences(local.preferences, remote.preferences),
    };
  }
  function safeGet(storage, key) {
    try { return storage && storage.getItem(key); } catch (_) { return null; }
  }
  function safeSet(storage, key, value) {
    try { if (storage) storage.setItem(key, value); return true; } catch (_) { return false; }
  }
  function safeRemove(storage, key) {
    try { if (storage) storage.removeItem(key); } catch (_) { /* best effort */ }
  }
  function parseObject(raw) {
    if (!raw) return null;
    try {
      var value = JSON.parse(raw);
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch (_) { return null; }
  }

  function Outbox(storage, activeAccountId) {
    this.storage = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    this.account_id = accountId(activeAccountId);
    this.key = OUTBOX_PREFIX + this.account_id;
  }
  Outbox.prototype.migrateLegacy = function () {
    if (!this.storage || safeGet(this.storage, this.key) != null) return false;
    var raw = safeGet(this.storage, LEGACY_OUTBOX_KEY);
    var value = parseObject(raw);
    if (!value || !Array.isArray(value.pending)) return false;
    // Empty/unknown legacy ownership is deliberately not adopted. The old
    // account_id field must explicitly prove anonymous or this UUID owns it.
    var owner = typeof value.account_id === "string" ? value.account_id.trim() : "";
    if (!owner || accountId(owner) !== this.account_id) return false;
    var pending = value.pending.map(function (item) {
      if (!item || typeof item !== "object") return null;
      if (item.account_id && accountId(item.account_id) !== owner) return null;
      return Object.assign({}, item, { account_id: owner });
    });
    if (pending.some(function (item) { return !item; })) return false;
    var migrated = { version: VERSION, account_id: owner, pending: pending,
      last_sync_at: value.last_sync_at || "" };
    if (!safeSet(this.storage, this.key, JSON.stringify(migrated))) return false;
    var verified = parseObject(safeGet(this.storage, this.key));
    if (!verified || verified.account_id !== owner || !Array.isArray(verified.pending) ||
        verified.pending.length !== pending.length) {
      return false;
    }
    safeRemove(this.storage, LEGACY_OUTBOX_KEY);
    return true;
  };
  Outbox.prototype.load = function () {
    this.migrateLegacy();
    var blank = { version: VERSION, account_id: this.account_id, pending: [], last_sync_at: "" };
    var value = parseObject(safeGet(this.storage, this.key));
    if (!value || value.account_id !== this.account_id) return blank;
    return { version: VERSION, account_id: this.account_id,
      pending: Array.isArray(value.pending) ? value.pending.filter(function (x) {
        return x && x.account_id === value.account_id;
      }) : [], last_sync_at: value.last_sync_at || "" };
  };
  Outbox.prototype.save = function (value) {
    safeSet(this.storage, this.key, JSON.stringify(value));
  };
  Outbox.prototype.enqueue = function (mutation) {
    mutation = mutation || {};
    var requested = mutation.account_id == null ? this.account_id : accountId(mutation.account_id);
    if (requested !== this.account_id) throw new Error("outbox account mismatch");
    var state = this.load();
    var item = Object.assign({ id: "m-" + Date.now() + "-" + Math.random().toString(16).slice(2),
      created_at: new Date().toISOString(), account_id: this.account_id }, mutation);
    item.account_id = this.account_id;
    if (!state.pending.some(function (x) { return x.id === item.id; })) state.pending.push(item);
    this.save(state);
    return item;
  };
  Outbox.prototype.pending = function () { return this.load().pending.slice(); };
  Outbox.prototype.ack = function (ids, syncedAt, owner) {
    if (owner != null && accountId(owner) !== this.account_id) throw new Error("outbox account mismatch");
    var state = this.load(), done = {};
    (Array.isArray(ids) ? ids : []).forEach(function (id) { done[id] = true; });
    state.pending = state.pending.filter(function (x) { return !done[x.id] && x.account_id === state.account_id; });
    state.last_sync_at = syncedAt || new Date().toISOString();
    this.save(state);
    return state;
  };

  function AccountLifecycle(initialAnonymous, storageOrOptions, activeAccountId) {
    var options = storageOrOptions && typeof storageOrOptions.getItem !== "function" ? storageOrOptions : {};
    this.storage = options.storage || (storageOrOptions && typeof storageOrOptions.getItem === "function" ? storageOrOptions :
      (typeof localStorage !== "undefined" ? localStorage : null));
    this.initial_anonymous = safeState(initialAnonymous || emptyState());
    this.meta = this.readMeta();
    this.anonymous = this.loadState(ANONYMOUS_ACCOUNT, this.initial_anonymous);
    this.accounts = {};
    this.active_account_id = ANONYMOUS_ACCOUNT;
    this.active_state = clone(this.anonymous);
    var restored = options.activeAccountId || activeAccountId;
    if (restored && accountId(restored) !== ANONYMOUS_ACCOUNT) {
      this.active_account_id = accountId(restored);
      this.active_state = this.loadState(this.active_account_id, emptyState());
    }
    this.persistState(ANONYMOUS_ACCOUNT, this.anonymous);
  }
  AccountLifecycle.prototype.stateKey = function (id) { return STATE_PREFIX + accountId(id); };
  AccountLifecycle.prototype.readMeta = function () {
    var value = parseObject(safeGet(this.storage, META_KEY));
    if (!value || value.version !== VERSION) return { version: VERSION, adopted: {}, anonymous_adopted: false };
    value.adopted = value.adopted && typeof value.adopted === "object" ? value.adopted : {};
    value.anonymous_adopted = !!value.anonymous_adopted;
    /* V1.2 recorded adoption per account. Preserve the first durable owner
       during migration, but never let that old per-account map authorize a
       second anonymous adoption. */
    if (!value.anonymous_adopted) {
      var owners = Object.keys(value.adopted).filter(function (id) { return value.adopted[id]; }).sort();
      if (owners.length) {
        value.anonymous_adopted = true;
        value.adopted_account_id = owners[0];
      }
    }
    return value;
  };
  AccountLifecycle.prototype.saveMeta = function () { safeSet(this.storage, META_KEY, JSON.stringify(this.meta)); };
  AccountLifecycle.prototype.loadState = function (id, fallback) {
    var raw = safeGet(this.storage, this.stateKey(id));
    if (raw == null) return safeState(fallback || emptyState());
    var value = parseObject(raw);
    return safeState(value);
  };
  AccountLifecycle.prototype.persistState = function (id, state) {
    safeSet(this.storage, this.stateKey(id), JSON.stringify(safeState(state)));
  };
  AccountLifecycle.prototype.state = function () { return clone(this.active_state); };
  AccountLifecycle.prototype.applyMutation = function (type, payload) {
    var anonymous = this.active_account_id === ANONYMOUS_ACCOUNT;
    payload = payload && typeof payload === "object" ? payload : {};
    var next = clone(this.active_state);
    var now = new Date().toISOString();
    if (type === "subscription.upsert" || type === "subscription.delete") {
      var keyword = String(payload.keyword || "").trim();
      var normalized = payload.normalized_keyword || normalizeKeyword(keyword);
      if (!normalized) throw new Error("subscription keyword required");
      var row = Object.assign({}, payload, {
        keyword: keyword,
        normalized_keyword: normalized,
        updated_at: payload.updated_at || payload.updatedAt || now,
        deleted_at: type === "subscription.delete" ? (payload.deleted_at || now) : null,
      });
      next.subscriptions = mergeSubscriptions(next.subscriptions, [row]);
    } else if (type === "read.upsert") {
      next.reads = mergeReads(next.reads, [payload]);
    } else if (type === "preferences.upsert") {
      next.preferences = mergePreferences(next.preferences, payload);
    } else {
      throw new Error("unsupported account mutation");
    }
    this.active_state = safeState(next);
    this.persistState(this.active_account_id, this.active_state);
    if (anonymous) this.anonymous = clone(this.active_state);
    else this.accounts[this.active_account_id] = clone(this.active_state);
    return this.state();
  };
  AccountLifecycle.prototype.reloadFromStorage = function (id) {
    if (id != null) this.active_account_id = accountId(id);
    this.active_state = this.loadState(this.active_account_id,
      this.active_account_id === ANONYMOUS_ACCOUNT ? this.anonymous : emptyState());
    if (this.active_account_id === ANONYMOUS_ACCOUNT) this.anonymous = clone(this.active_state);
    else this.accounts[this.active_account_id] = clone(this.active_state);
    return this.state();
  };
  AccountLifecycle.prototype.login = function (id, remote) {
    id = accountId(id);
    if (this.active_account_id !== ANONYMOUS_ACCOUNT) {
      this.persistState(this.active_account_id, this.active_state);
      this.accounts[this.active_account_id] = clone(this.active_state);
    } else {
      this.anonymous = clone(this.active_state);
      this.persistState(ANONYMOUS_ACCOUNT, this.anonymous);
    }
    var existing = safeGet(this.storage, this.stateKey(id)) != null ?
      this.loadState(id, emptyState()) : (this.accounts[id] || emptyState());
    if (!this.meta.anonymous_adopted) {
      existing = mergeAccountState(existing, this.anonymous);
      this.meta.adopted[id] = true;
      this.meta.anonymous_adopted = true;
      this.meta.adopted_account_id = id;
      this.saveMeta();
    }
    this.active_state = mergeAccountState(existing, remote || {});
    /* Only an adopted/merged state is ready to sync. This prevents an empty
       local default from outranking a valid remote preference timestamp. */
    this.active_state.preferences = normalizePreferences(this.active_state.preferences);
    this.persistState(id, this.active_state);
    this.accounts[id] = clone(this.active_state);
    this.active_account_id = id;
    return this.state();
  };
  AccountLifecycle.prototype.logout = function () {
    if (this.active_account_id !== ANONYMOUS_ACCOUNT) {
      this.persistState(this.active_account_id, this.active_state);
      this.accounts[this.active_account_id] = clone(this.active_state);
      this.active_account_id = ANONYMOUS_ACCOUNT;
      this.active_state = this.loadState(ANONYMOUS_ACCOUNT, this.anonymous);
      this.anonymous = clone(this.active_state);
    }
    return this.state();
  };
  AccountLifecycle.prototype.updateAnonymous = function (state) {
    if (this.active_account_id !== ANONYMOUS_ACCOUNT) throw new Error("anonymous state inactive");
    this.anonymous = safeState(state || emptyState());
    this.active_state = clone(this.anonymous);
    this.persistState(ANONYMOUS_ACCOUNT, this.anonymous);
    return this.state();
  };

  return {
    VERSION: VERSION,
    OUTBOX_KEY: OUTBOX_PREFIX,
    STATE_KEY_PREFIX: STATE_PREFIX,
    META_KEY: META_KEY,
    ANONYMOUS_ACCOUNT: ANONYMOUS_ACCOUNT,
    normalizeKeyword: normalizeKeyword,
    accountId: accountId,
    timestamp: timestamp,
    mergeSubscriptions: mergeSubscriptions,
    mergeReads: mergeReads,
    mergePreferences: mergePreferences,
    mergeAccountState: mergeAccountState,
    Outbox: Outbox,
    AccountLifecycle: AccountLifecycle,
  };
});
