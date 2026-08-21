/* Supabase Sync V2 adapter. The Supabase client is injected; no secrets live here. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsSupabaseSync = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var TABLES = { subscriptions: "user_subscriptions", reads: "user_reads", preferences: "user_preferences" };
  var CONFLICT_TARGETS = {};
  CONFLICT_TARGETS[TABLES.subscriptions] = "user_id,normalized_keyword";
  CONFLICT_TARGETS[TABLES.reads] = "user_id,announcement_id";
  CONFLICT_TARGETS[TABLES.preferences] = "user_id";
  function requireUid(session) {
    var uid = session && session.user && session.user.id;
    if (typeof uid !== "string" || !uid.trim()) throw new Error("verified session user id required");
    return uid;
  }
  function sessionUid(client) {
    return client.auth.getSession().then(function (result) {
      if (result.error) throw result.error;
      return requireUid(result.data && result.data.session);
    });
  }
  function rows(result) {
    if (result && result.error) throw result.error;
    return (result && result.data) || [];
  }
  function withOwner(row, uid) {
    var copy = Object.assign({}, row);
    delete copy.user_id;
    copy.user_id = uid;
    return copy;
  }
  function dbRow(table, row) {
    row = row || {};
    if (table === TABLES.subscriptions) return {
      keyword: row.keyword,
      normalized_keyword: row.normalized_keyword || String(row.keyword || "").trim().toLocaleLowerCase("zh-TW"),
      created_at: row.created_at || row.createdAt,
      updated_at: row.updated_at || row.updatedAt || row.created_at || row.createdAt,
      deleted_at: row.deleted_at || null,
    };
    if (table === TABLES.reads) return { announcement_id: row.announcement_id, read_at: row.read_at };
    return { schema_version: row.schema_version || 1, preferences: row.preferences || {}, updated_at: row.updated_at };
  }
  function query(client, table, uid) {
    return client.from(table).select("*").eq("user_id", uid).then(rows);
  }
  function createAdapter(client, options) {
    options = options || {};
    if (!client || !client.auth || typeof client.from !== "function") throw new Error("Supabase client required");
    return {
      fetchRemoteState: function () {
        return sessionUid(client).then(function (uid) {
          return Promise.all([query(client, TABLES.subscriptions, uid), query(client, TABLES.reads, uid), query(client, TABLES.preferences, uid)])
            .then(function (data) { return { user_id: uid, subscriptions: data[0], reads: data[1], preferences: data[2][0] || null }; });
        });
      },
      pushRows: function (table, values) {
        return sessionUid(client).then(function (uid) {
          var payload = (Array.isArray(values) ? values : []).map(function (row) { return withOwner(dbRow(table, row), uid); });
          if (!payload.length) return [];
          return client.from(table).upsert(payload, { onConflict: CONFLICT_TARGETS[table] }).then(rows);
        });
      },
      pushState: function (state) {
        return sessionUid(client).then(function (uid) {
          var subscriptions = (state.subscriptions || []).map(function (row) { return withOwner(row, uid); });
          var reads = (state.reads || []).map(function (row) { return withOwner(row, uid); });
          var preferences = state.preferences ? [withOwner(state.preferences, uid)] : [];
          return Promise.all([
            this.pushRows(TABLES.subscriptions, subscriptions),
            this.pushRows(TABLES.reads, reads),
            this.pushRows(TABLES.preferences, preferences),
          ]);
        }.bind(this));
      },
      sendMutation: function (mutation) {
        return sessionUid(client).then(function (uid) {
          if (!mutation || mutation.account_id !== uid) throw new Error("mutation/session identity changed");
          var table = mutation.type === "subscription.upsert" || mutation.type === "subscription.delete" ? TABLES.subscriptions :
            mutation.type === "read.upsert" ? TABLES.reads : TABLES.preferences;
          return client.from(table).upsert([withOwner(dbRow(table, mutation.payload || {}), uid)], { onConflict: CONFLICT_TARGETS[table] }).then(rows);
        });
      },
      drain: function (outbox, send) {
        return sessionUid(client).then(function (uid) {
          if (outbox.account_id !== uid) throw new Error("outbox/session identity changed");
          var items = outbox.pending();
          return items.reduce(function (chain, item) {
            return chain.then(function (result) {
              if (result.error) return result;
              return sessionUid(client).then(function (currentUid) {
                if (currentUid !== uid || outbox.account_id !== currentUid) throw new Error("outbox/session identity changed");
                return Promise.resolve(send(item, currentUid)).then(function () {
                  result.done.push(item.id); return result;
                });
              }).catch(function (error) { result.error = error; return result; });
            });
          }, Promise.resolve({ done: [], error: null })).then(function (result) {
            if (result.done.length) outbox.ack(result.done);
            if (result.error) throw result.error;
            return result.done;
          });
        });
      },
    };
  }
  return { TABLES: TABLES, CONFLICT_TARGETS: CONFLICT_TARGETS, requireUid: requireUid, sessionUid: sessionUid, createAdapter: createAdapter };
});
