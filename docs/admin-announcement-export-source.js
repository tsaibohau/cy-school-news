/* Read-only export through the site's existing authenticated RPC controller. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CyNewsAnnouncementExportSource = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function validId(id) { return typeof id === "string" && /^(cysh|cygsh)-[A-Za-z0-9._-]{1,150}$/.test(id); }
  async function requireOwner(controller, expectedUid) {
    var session = await controller.getVerifiedSession();
    if (!session || !session.user || !session.user.id || !session.access_token || /^mock\./.test(session.access_token)) throw new Error("請使用正式帳號登入。");
    if (expectedUid && session.user.id !== expectedUid) throw new Error("帳號已變更，下載已停止。");
    var access = await controller.getAccountAccess();
    if (!access || access.status !== "approved" || access.admin_role !== "owner") throw new Error("僅主要管理員可下載完整公告 CSV。");
    return session;
  }
  async function loadCatalog(controller, fetcher, expectedUid) {
    var session = await requireOwner(controller, expectedUid);
    var sources = await Promise.all(["archive", "announcements"].map(async function (name) {
      var response = await fetcher("data/" + name + ".json", { cache: "no-store" });
      if (!response.ok) throw new Error("公告索引載入失敗，請稍後再試。");
      var data = await response.json();
      if (!Array.isArray(data.items)) throw new Error("公告索引格式不符。");
      return data.items;
    }).concat([controller.getMemberAnnouncementIndex()]));
    var index = sources[2];
    // Existing controller stops at 10,000; never present that cap as a complete export.
    if (!Array.isArray(index) || index.length >= 10000) throw new Error("內文索引超過可確認的範圍，無法保證全部公告，下載已停止。");
    await requireOwner(controller, session.user.id);
    var map = new Map();
    index.forEach(function (row) {
      if (validId(row.announcement_id)) map.set(row.announcement_id, { id: row.announcement_id, title: row.announcement_id,
        metadata: { school: row.announcement_id.split("-")[0] } });
    });
    sources[0].concat(sources[1]).forEach(function (row) {
      if (validId(row.id)) map.set(row.id, { id: row.id, title: String(row.title || row.id),
        metadata: { school: row.school || row.id.split("-")[0], title: row.title, url: row.url, date: row.date } });
    });
    return Array.from(map.values()).sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  }
  async function readBatch(controller, ids, catalog, options) {
    options = options || {};
    if (!Array.isArray(ids) || !ids.length || ids.length > 8 || new Set(ids).size !== ids.length || ids.some(function (id) { return !validId(id); })) throw new Error("公告 ID 或批次範圍不符。");
    var metadata = new Map(catalog.map(function (row) { return [row.id, row.metadata]; }));
    if (ids.some(function (id) { return !metadata.has(id); })) throw new Error("公告不在目前索引內，下載已停止。");
    function check() {
      if ((options.signal && options.signal.aborted) || (options.isCurrent && !options.isCurrent())) throw new Error("已取消或帳號已變更。");
    }
    check();
    var session = await requireOwner(controller, options.uid), records = new Array(ids.length), next = 0, failed = false;
    async function worker() {
      try {
        while (!failed && next < ids.length) {
          check();
          var position = next++, id = ids[position];
          var row = await controller.getMemberAnnouncementDetail(id);
          check();
          if (row && (row.announcement_id !== id || (row.detail && typeof row.detail === "object" &&
              ((row.detail.announcement_id && row.detail.announcement_id !== id) ||
               (row.source_hash && row.detail.source_hash && row.source_hash !== row.detail.source_hash))))) throw new Error("內文 ID 或版本不一致，下載已停止。");
          records[position] = { id: id, metadata: metadata.get(id), detail: row ? row.detail : null,
            source_hash: row ? row.source_hash : "", updated_at: row ? row.updated_at : "", data_source: "authenticated_supabase" };
        }
      } catch (error) { failed = true; throw error; }
    }
    // Bounded reads only; an RPC failure rejects the whole file, never a partial CSV.
    var results = await Promise.allSettled(Array.from({ length: Math.min(4, ids.length) }, worker));
    var failure = results.find(function (result) { return result.status === "rejected"; });
    if (failure) throw failure.reason;
    check(); await requireOwner(controller, session.user.id); check();
    return records;
  }
  return { requireOwner: requireOwner, loadCatalog: loadCatalog, readBatch: readBatch };
});
