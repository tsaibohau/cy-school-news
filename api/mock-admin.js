"use strict";
const Core = require("../tools/staging/mock-admin-core.js");
function createHandler(options = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Vary", "Authorization");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const config = options.settings || Core.settings(), now = options.now ? options.now() : Date.now();
    if (!Core.enabled(config)) return res.status(404).json({ error: "preview_only" });
    if (now >= config.expiresAt) return res.status(401).json({ error: "mock_account_expired" });
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    let body = req.body;
    try { if (typeof body === "string") body = JSON.parse(body); } catch (_) { return res.status(400).json({ error: "invalid_request" }); }
    body = body && typeof body === "object" ? body : {};
    const action = req.query && req.query.action;
    if (action === "login") {
      if (typeof body.username !== "string" || typeof body.password !== "string" || body.username.length > 100 || body.password.length > 200 ||
          !Core.equal(body.username, config.username) || !Core.equal(body.password, config.password)) return res.status(401).json({ error: "invalid_mock_credentials" });
      return res.status(200).json({ token: Core.issue(config, now), expires_at: new Date(config.expiresAt).toISOString(), mode: "simulated" });
    }
    const authorization = String(req.headers.authorization || "");
    const session = Core.verify(authorization.startsWith("Bearer ") ? authorization.slice(7) : "", config, now);
    if (!session) return res.status(401).json({ error: "mock_sign_in_required" });
    if (action === "session") return res.status(200).json({ user: { id: session.uid }, role: "owner", expires_at: new Date(config.expiresAt).toISOString(), mode: "simulated" });
    const records = Core.fixtures();
    if (action === "catalog") return res.status(200).json({ items: records.map(r => ({ id: r.id, title: r.metadata.title })), mode: "simulated" });
    if (action === "export") {
      const ids = body.ids, map = new Map(records.map(r => [r.id, r]));
      if (!Array.isArray(ids) || !ids.length || ids.length > 8 || new Set(ids).size !== ids.length || ids.some(id => !map.has(id))) return res.status(400).json({ error: "invalid_mock_ids" });
      return res.status(200).json({ records: ids.map(id => map.get(id)), data_source: "simulated" });
    }
    return res.status(400).json({ error: "unknown_mock_action" });
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
