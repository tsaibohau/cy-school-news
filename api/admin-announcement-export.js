"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
function config() {
  const source = fs.readFileSync(path.join(root, "tools/staging/account-config.js"), "utf8");
  const url = source.match(/supabaseUrl:\s*"([^"]+)"/);
  const key = source.match(/supabaseAnonKey:\s*"([^"]+)"/);
  if (!url || !key || new URL(url[1]).hostname !== "ebezqanvmgsgtatsbssn.supabase.co") throw new Error("configuration_unavailable");
  return { url: url[1], key: key[1] };
}
function metadata() {
  const result = new Map();
  for (const file of ["archive.json", "announcements.json"]) {
    const data = JSON.parse(fs.readFileSync(path.join(root, "docs/data", file), "utf8"));
    for (const row of data.items || []) {
      if (/^(cysh|cygsh)-[A-Za-z0-9._-]+$/.test(String(row.id || ""))) {
        result.set(row.id, { school: row.school, title: row.title, url: row.url, date: row.date });
      }
    }
  }
  return result;
}
function failure(status, code) { return Object.assign(new Error(code), { status }); }
function createHandler(options = {}) {
  const fetcher = options.fetch || global.fetch;
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Vary", "Authorization");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (process.env.VERCEL_ENV === "production") return res.status(404).json({ error: "preview_only" });
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method_not_allowed" }); }
    const bearer = String(req.headers.authorization || "");
    // A synthetic session must never be forwarded to any real database.
    if (bearer.startsWith("Bearer mock.")) return res.status(403).json({ error: "mock_token_not_allowed" });
    if (!/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(bearer)) return res.status(401).json({ error: "sign_in_required" });
    try {
      const settings = options.config || config();
      async function rpc(name, args) {
        const response = await fetcher(settings.url + "/rest/v1/rpc/" + name, {
          method: "POST", headers: { apikey: settings.key, Authorization: bearer, "Content-Type": "application/json" },
          body: JSON.stringify(args), signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw failure(response.status === 401 ? 401 : response.status === 403 ? 403 : 502, "source_read_failed");
        return response.json();
      }
      // Live database authorization on every batch; never trust JWT user_metadata,
      // browser-provided role flags, or the visibility of the button.
      const accessRows = await rpc("current_account_access", {});
      const access = Array.isArray(accessRows) ? accessRows[0] : null;
      if (!access || access.status !== "approved" || access.admin_role !== "owner") throw failure(403, "owner_required");
      let input = req.body;
      if (typeof input === "string") input = JSON.parse(input);
      const ids = input && input.ids;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 8 || new Set(ids).size !== ids.length ||
          ids.some(id => typeof id !== "string" || !/^(cysh|cygsh)-[A-Za-z0-9._-]{1,150}$/.test(id))) throw failure(400, "invalid_ids");
      const catalog = options.metadata || metadata();
      if (ids.some(id => !catalog.has(id))) throw failure(400, "unknown_announcement_id");
      const rows = new Array(ids.length);
      // Existing bounded RPC only. No service key, table grants, migrations or writes.
      let next = 0;
      async function worker() {
        while (next < ids.length) {
          const index = next++, id = ids[index];
          const result = await rpc("member_announcement_detail", { target_announcement_id: id });
          if (!Array.isArray(result) || result.length > 1 || (result[0] && result[0].announcement_id !== id)) throw failure(502, "source_identity_mismatch");
          const row = result[0];
          rows[index] = { id, metadata: catalog.get(id), detail: row ? row.detail : null,
            source_hash: row ? row.source_hash : "", updated_at: row ? row.updated_at : "" };
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
      const payload = { records: rows, data_source: "preview_supabase" };
      // Prevent Vercel's response-size ceiling from silently dropping content.
      if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 3500000) throw failure(413, "batch_too_large");
      return res.status(200).json(payload);
    } catch (error) {
      return res.status(error.status || (error instanceof SyntaxError ? 400 : 502)).json({ error: error.status ? error.message : "export_unavailable" });
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
