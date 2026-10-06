"use strict";
const crypto = require("node:crypto");
const BRANCH = "codex/admin-full-announcement-csv-20261006";
function settings(env = process.env) {
  return { environment: env.VERCEL_ENV, branch: env.VERCEL_GIT_COMMIT_REF,
    deployment: env.VERCEL_URL, username: env.CYNEWS_MOCK_ADMIN_USER,
    password: env.CYNEWS_MOCK_ADMIN_PASSWORD, secret: env.CYNEWS_MOCK_ADMIN_SECRET,
    expiresAt: Date.parse(env.CYNEWS_MOCK_ADMIN_EXPIRES_AT || "") };
}
function enabled(config) {
  return config.environment === "preview" && config.branch === BRANCH && !!config.deployment &&
    typeof config.username === "string" && !!config.username && typeof config.password === "string" &&
    config.password.length >= 12 && typeof config.secret === "string" && config.secret.length >= 32 && Number.isFinite(config.expiresAt);
}
function equal(a, b) {
  return crypto.timingSafeEqual(crypto.createHash("sha256").update(String(a || "")).digest(),
    crypto.createHash("sha256").update(String(b || "")).digest());
}
function sign(payload, config) {
  return crypto.createHmac("sha256", config.secret).update(payload + ":" + config.deployment).digest("base64url");
}
function issue(config, now) {
  const data = Buffer.from(JSON.stringify({ uid: "synthetic-owner", role: "owner", branch: BRANCH,
    exp: Math.min(now + 2 * 3600000, config.expiresAt), nonce: crypto.randomBytes(16).toString("hex") })).toString("base64url");
  return "mock." + data + "." + sign(data, config);
}
function verify(token, config, now) {
  if (typeof token !== "string" || token.length > 2048 || !token.startsWith("mock.")) return null;
  const pieces = token.split(".");
  if (pieces.length !== 3 || !equal(pieces[2], sign(pieces[1], config))) return null;
  try {
    const data = JSON.parse(Buffer.from(pieces[1], "base64url").toString("utf8"));
    return data.uid === "synthetic-owner" && data.role === "owner" && data.branch === BRANCH &&
      typeof data.exp === "number" && data.exp > now && data.exp <= config.expiresAt ? data : null;
  } catch (_) { return null; }
}
function fixtures() {
  return Array.from({ length: 12 }, (_, index) => {
    const school = index < 6 ? "cysh" : "cygsh", id = school + "-sim-" + String(index + 1).padStart(3, "0");
    const titles = ["報名通知", "繳交表單", "含逗號與引號", "缺少正文", "未讀附件", "已讀附件"];
    const metadata = { school, title: "【模擬】" + titles[index % 6], date: "2026-10-06", url: "https://example.invalid/mock/" + id };
    const detail = index % 6 === 3 ? null : { announcement_id: id, title: metadata.title, source_url: metadata.url,
      provenance: "synthetic_fixture", parse_status: "parsed", published_at: index % 6 === 1 ? "" : "2026-10-06",
      blocks: [{ type: "paragraph", text: "【合成測試資料，不是校方公告】\n" +
        (index % 6 === 2 ? '第一行有逗號,和"雙引號"。\n第二行保留換行。' : "請在測試頁面體驗選擇公告與下載 CSV。這段文字完全虛構。") }],
      attachments: index % 6 === 4 ? [{ filename: "模擬未讀.pdf", parse_status: "unsupported", parse_reason: "synthetic_unread_example" }] :
        index % 6 === 5 ? [{ filename: "模擬已讀.pdf", parse_status: "parsed", embedded_text: "【合成附件文字】\n這不是真實附件。" }] : [],
    };
    return { id, metadata, detail, updated_at: "", source_hash: "synthetic-" + (index + 1), data_source: "simulated" };
  });
}
module.exports = { BRANCH, settings, enabled, equal, issue, verify, fixtures };
