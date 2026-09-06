"use strict";
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "scraper/config.json"), "utf8"));
const status = JSON.parse(fs.readFileSync(path.join(root, "docs/legal-compliance.json"), "utf8"));
const index = fs.readFileSync(path.join(root, "docs/index.html"), "utf8");
const notice = fs.readFileSync(path.join(root, "docs/legal.html"), "utf8");
const sourceAudit = fs.readFileSync(path.join(root, "docs/source-rights-audit.md"), "utf8");
const retention = fs.readFileSync(path.join(root, "docs/privacy-retention-policy.md"), "utf8");
const rlsEvidence = fs.readFileSync(path.join(root, "docs/rls-verification-2026-08-30.md"), "utf8");
const qa = fs.readFileSync(path.join(root, "docs/assistant-qa.js"), "utf8");
const scraper = fs.readFileSync(path.join(root, "scraper/scrape.py"), "utf8");

const allowed = new Set(config.schools.map(school => new URL(school.base).hostname));
const urls = [];
for (const school of config.schools) {
  urls.push(school.base, ...(school.scan_pages || []));
  for (const entry of school.list_pages || []) urls.push(typeof entry === "string" ? entry : entry.url);
}
for (const raw of urls) {
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !allowed.has(parsed.hostname)) {
    throw new Error(`non-public or non-allowlisted scraper URL: ${raw}`);
  }
}
if (!/personalDataAnswer/.test(qa) || !/privacy_limited/.test(qa)) throw new Error("assistant personal-data guard missing");
if (!/legal\.html/.test(index)) throw new Error("legal notice is not linked from the application");
if (!/個人資料保護法/.test(notice) || !/著作權法/.test(notice)) throw new Error("legal notice is incomplete");
if (!/robots\.txt/.test(sourceAudit) || !/All Rights Reserved|版權所有/.test(sourceAudit)) throw new Error("source rights audit is incomplete");
if (!/30 天/.test(retention) || !/365 天/.test(retention) || !/尚未.{0,8}部署/.test(retention)) throw new Error("retention policy must separate targets from deployed controls");
if (!/A 可見 B 的測試列 \| 0/.test(rlsEvidence) || !/測試殘留 \| 0/.test(rlsEvidence)) throw new Error("deployed RLS evidence is incomplete");
if (!status.technical_controls.deployed_database_two_identity_rls_pass || status.technical_controls.rls_test_residue_count !== 0) throw new Error("RLS evidence status mismatch");
for (const key of ["deployed_http_two_session_rls_pass", "leaked_password_protection_enabled"]) {
  if (status.technical_controls[key] !== false) throw new Error(`unverified deployed control must remain false: ${key}`);
}
for (const key of ["deployed_account_least_privilege_migrations", "deployed_reminder_schema"]) {
  if (status.technical_controls[key] !== true) throw new Error(`deployed control must be recorded: ${key}`);
}
if (status.production_blockers.some(item => /least-privilege migrations and reminder schema/.test(item))) throw new Error("deployed schema must not remain a blocker");
if (!status.production_blockers.some(item => /leaked-password protection/.test(item))) throw new Error("missing leaked-password protection blocker");
if (!status.production_blockers.some(item => /Automatic 30-day tombstone cleanup/.test(item))) throw new Error("missing retention enforcement blocker");
if (!/request_delay_sec/.test(scraper) || !/time\.sleep\(delay\)/.test(scraper)) throw new Error("bounded crawler delay missing");

const production = process.argv.includes("--production") || process.env.CYNEWS_RELEASE_TARGET === "production";
if (production && (!status.production_ready || status.production_blockers.length)) {
  console.error("PRODUCTION_BLOCKED: legal/privacy evidence is incomplete");
  process.exit(2);
}
console.log(`Legal technical gate passed for ${production ? "production" : "preview"}; status=${status.status}`);
if (!status.production_ready) console.log(`Production remains blocked by ${status.production_blockers.length} unresolved review item(s).`);
