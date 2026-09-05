/* Supabase Sync V2 adapter. The Supabase client is injected; no secrets live here. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsSupabaseSync = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var TABLES = { subscriptions: "user_subscriptions", reads: "user_reads", preferences: "user_preferences", tasks: "user_tasks" };
  var CONFLICT_TARGETS = {};
  CONFLICT_TARGETS[TABLES.subscriptions] = "user_id,normalized_keyword";
  CONFLICT_TARGETS[TABLES.reads] = "user_id,announcement_id";
  CONFLICT_TARGETS[TABLES.preferences] = "user_id";
  CONFLICT_TARGETS[TABLES.tasks] = "id";
  var TABLES_ORDER = [TABLES.subscriptions, TABLES.reads, TABLES.preferences, TABLES.tasks];
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
  function assertCurrent(options, uid) {
    if (options && typeof options.isCurrent === "function" && !options.isCurrent(uid)) {
      throw new Error("account sync superseded");
    }
  }
  function withOwner(row, uid) {
    var copy = Object.assign({}, row);
    delete copy.user_id;
    copy.user_id = uid;
    return copy;
  }
  function stableTaskId(value) {
    var input = String(value == null ? "task" : value), hash = 2166136261, hex = "";
    for (var i = 0; i < input.length; i++) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    for (var j = 0; j < 8; j++) { hash ^= hash << 13; hash ^= hash >>> 17; hash ^= hash << 5; hex += (hash >>> 0).toString(16).padStart(8, "0"); }
    hex = (hex + "00000000000000000000000000000000").slice(0, 32);
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-4" + hex.slice(13, 16) + "-8" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
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
    if (table === TABLES.tasks) return {
      id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(row.id || "")) ? row.id : stableTaskId(row.id), title: row.title, status: row.status || "open", due_date: row.due_date || null,
      priority: row.priority == null ? null : row.priority, notes: row.notes || "",
      source_announcement_id: row.source_announcement_id || null, source_event_id: row.source_event_id || null,
      created_at: row.created_at || row.createdAt, updated_at: row.updated_at || row.updatedAt || row.created_at || row.createdAt,
      completed_at: row.completed_at || row.completedAt || null, deleted_at: row.deleted_at || row.deletedAt || null,
    };
    return {
      schema_version: row.schema_version || 1,
      preferences: row.preferences || {},
      /* Lifecycle states are normalized before push. Keep this final guard so a
         legacy/null state can never violate the NOT NULL database constraint. */
      updated_at: row.updated_at || row.updatedAt || new Date().toISOString(),
    };
  }
  function query(client, table, uid, options) {
    assertCurrent(options, uid);
    return client.from(table).select("*").eq("user_id", uid).then(function (result) {
      assertCurrent(options, uid);
      return rows(result);
    });
  }
  function createAdapter(client, options) {
    options = options || {};
    var timetableOnly = options.serviceLevel === "timetable_only";
    if (!client || !client.auth || typeof client.from !== "function") throw new Error("Supabase client required");
    return {
      fetchRemoteState: function () {
        return sessionUid(client).then(function (uid) {
          assertCurrent(options, uid);
          if (timetableOnly) {
            return query(client, TABLES.preferences, uid, options)
              .then(function (data) { return { user_id: uid, subscriptions: [], reads: [], preferences: data[0] || null, tasks: [] }; });
          }
          return Promise.all([query(client, TABLES.subscriptions, uid, options), query(client, TABLES.reads, uid, options), query(client, TABLES.preferences, uid, options), query(client, TABLES.tasks, uid, options)])
            .then(function (data) { return { user_id: uid, subscriptions: data[0], reads: data[1], preferences: data[2][0] || null, tasks: data[3] }; });
        });
      },
      pushRows: function (table, values) {
        if (timetableOnly && table !== TABLES.preferences) return Promise.resolve([]);
        return sessionUid(client).then(function (uid) {
          var payload = (Array.isArray(values) ? values : []).map(function (row) { return withOwner(dbRow(table, row), uid); });
          if (!payload.length) return [];
          assertCurrent(options, uid);
          return client.from(table).upsert(payload, { onConflict: CONFLICT_TARGETS[table] }).then(function (result) {
            assertCurrent(options, uid);
            return rows(result);
          });
        });
      },
      pushState: function (state) {
        return sessionUid(client).then(function (uid) {
          assertCurrent(options, uid);
          var subscriptions = (state.subscriptions || []).map(function (row) { return withOwner(row, uid); });
          var reads = (state.reads || []).map(function (row) { return withOwner(row, uid); });
          var preferences = state.preferences ? [withOwner(state.preferences, uid)] : [];
          if (timetableOnly) return this.pushRows(TABLES.preferences, preferences);
          return Promise.all([
            this.pushRows(TABLES.subscriptions, subscriptions),
            this.pushRows(TABLES.reads, reads),
            this.pushRows(TABLES.preferences, preferences),
            this.pushRows(TABLES.tasks, state.tasks || []),
          ]);
        }.bind(this));
      },
      deleteOwnData: function () {
        return sessionUid(client).then(function (uid) {
          assertCurrent(options, uid);
          var tables = timetableOnly ? [TABLES.preferences] : TABLES_ORDER;
          return tables.reduce(function (chain, table) {
            return chain.then(function (deleted) {
              assertCurrent(options, uid);
              return client.from(table).delete().eq("user_id", uid).then(function (result) {
                assertCurrent(options, uid);
                rows(result);
                deleted.push(table);
                return deleted;
              });
            });
          }, Promise.resolve([]));
        });
      },
      sendMutation: function (mutation) {
        return sessionUid(client).then(function (uid) {
          if (!mutation || mutation.account_id !== uid) throw new Error("mutation/session identity changed");
          var table = mutation.type === "subscription.upsert" || mutation.type === "subscription.delete" ? TABLES.subscriptions :
            mutation.type === "read.upsert" ? TABLES.reads :
            mutation.type.indexOf("task.") === 0 ? TABLES.tasks :
            mutation.type === "preferences.upsert" ? TABLES.preferences : null;
          if (!table) throw new Error("unsupported account mutation");
          if (timetableOnly && table !== TABLES.preferences) throw new Error("feature unavailable for timetable-only account");
          assertCurrent(options, uid);
          return client.from(table).upsert([withOwner(dbRow(table, mutation.payload || {}), uid)], { onConflict: CONFLICT_TARGETS[table] }).then(function (result) {
            assertCurrent(options, uid);
            return rows(result);
          });
        });
      },
      drain: function (outbox, send) {
        return sessionUid(client).then(function (uid) {
          if (outbox.account_id !== uid) throw new Error("outbox/session identity changed");
          assertCurrent(options, uid);
          var items = outbox.pending();
          return items.reduce(function (chain, item) {
            return chain.then(function (result) {
              if (result.error) return result;
              return sessionUid(client).then(function (currentUid) {
                if (currentUid !== uid || outbox.account_id !== currentUid) throw new Error("outbox/session identity changed");
                assertCurrent(options, currentUid);
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
  return { TABLES: TABLES, TABLES_ORDER: TABLES_ORDER, CONFLICT_TARGETS: CONFLICT_TARGETS, requireUid: requireUid, sessionUid: sessionUid, createAdapter: createAdapter };
});
