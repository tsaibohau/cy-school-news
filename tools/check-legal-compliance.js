"use strict";
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "scraper/config.json"), "utf8"));
const status = JSON.parse(fs.readFileSync(path.join(root, "docs/legal-compliance.json"), "utf8"));
const indexHtml = fs.readFileSync(path.join(root, "docs/index.html"), "utf8");
const notice = fs.readFileSync(path.join(root, "docs/legal.html"), "utf8");
const sourceAudit = fs.readFileSync(path.join(root, "docs/source-rights-audit.md"), "utf8");
const retention = fs.readFileSync(path.join(root, "docs/privacy-retention-policy.md"), "utf8");
const rlsEvidence = fs.readFileSync(path.join(root, "docs/rls-verification-2026-08-30.md"), "utf8");
const qa = fs.readFileSync(path.join(root, "docs/assistant-qa.js"), "utf8");
const scraper = fs.readFileSync(path.join(root, "scraper/scrape.py"), "utf8");

function argument(name) {
  const exact = process.argv.find(value => value.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const position = process.argv.indexOf(`--${name}`);
  return position >= 0 ? process.argv[position + 1] : "";
}

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
if (!/legal\.html/.test(indexHtml)) throw new Error("legal notice is not linked from the application");
if (!/個人資料保護法/.test(notice) || !/著作權法/.test(notice)) throw new Error("legal notice is incomplete");
if (!/robots\.txt/.test(sourceAudit) || !/All Rights Reserved|版權所有/.test(sourceAudit)) throw new Error("source rights audit is incomplete");
if (!/30 天/.test(retention) || !/365 天/.test(retention) || !/尚未.{0,8}部署/.test(retention)) throw new Error("retention policy must separate targets from deployed controls");
if (!/A 可見 B 的測試列 \| 0/.test(rlsEvidence) || !/測試殘留 \| 0/.test(rlsEvidence)) throw new Error("deployed RLS evidence is incomplete");
if (!status.technical_controls.deployed_database_two_identity_rls_pass || status.technical_controls.rls_test_residue_count !== 0) throw new Error("RLS evidence status mismatch");
if (!/request_delay_sec/.test(scraper) || !/time\.sleep\(delay\)/.test(scraper)) throw new Error("bounded crawler delay missing");

const vocabulary = new Set(status.status_vocabulary || []);
const requirements = status.requirements || {};
const profiles = status.release_profiles || {};
for (const [id, requirement] of Object.entries(requirements)) {
  if (!vocabulary.has(requirement.state)) throw new Error(`unknown requirement state: ${id}`);
  if (!Array.isArray(requirement.applies_to) || !requirement.applies_to.length) throw new Error(`requirement has no scope: ${id}`);
  if (requirement.control) {
    if (!(requirement.control in status.technical_controls)) throw new Error(`requirement references unknown control: ${id}`);
    const passed = status.technical_controls[requirement.control] === true;
    if (passed && requirement.state === "block") throw new Error(`passed control cannot remain blocked: ${id}`);
    if (!passed && requirement.state === "pass") throw new Error(`unverified control cannot pass: ${id}`);
  }
}
for (const [profileId, profile] of Object.entries(profiles)) {
  if (!Array.isArray(profile.requirements)) throw new Error(`profile has no requirements: ${profileId}`);
  for (const requirementId of profile.requirements) {
    const requirement = requirements[requirementId];
    if (!requirement) throw new Error(`profile references unknown requirement: ${profileId}/${requirementId}`);
    if (!requirement.applies_to.includes(profileId)) throw new Error(`requirement scope mismatch: ${profileId}/${requirementId}`);
  }
}

const production = process.argv.includes("--production") || process.env.CYNEWS_RELEASE_TARGET === "production";
const requestedProfile = argument("profile");
if (requestedProfile && !profiles[requestedProfile]) throw new Error(`unknown release profile: ${requestedProfile}`);
const selected = requestedProfile ? [requestedProfile] : Object.keys(profiles).filter(id => profiles[id].enabled);
const selectedRequirements = [...new Set(selected.flatMap(id => profiles[id].requirements))].map(id => [id, requirements[id]]);
const blockers = selectedRequirements.filter(([, requirement]) => requirement.state === "block");
const reviews = selectedRequirements.filter(([, requirement]) => requirement.state === "review");
const warnings = selectedRequirements.filter(([, requirement]) => requirement.state === "warning");

if (!production) {
  console.log(`Compliance schema and preview controls passed; profiles=${selected.join(",")}`);
  console.log(`Production snapshot: ${blockers.length} blocker(s), ${reviews.length} manual review item(s), ${warnings.length} warning(s).`);
  process.exit(0);
}
if (blockers.length) {
  console.error(`PRODUCTION_BLOCKED: profiles=${selected.join(",")} have ${blockers.length} applicable hard blocker(s)`);
  for (const [id, requirement] of blockers) console.error(`BLOCK ${id}: ${requirement.message}`);
  process.exit(2);
}
if (reviews.length && !process.argv.includes("--acknowledge-review")) {
  console.error(`PRODUCTION_REVIEW_REQUIRED: profiles=${selected.join(",")} have ${reviews.length} manual review item(s)`);
  for (const [id, requirement] of reviews) console.error(`REVIEW ${id}: ${requirement.message}`);
  process.exit(3);
}
if (reviews.length) console.warn(`Manual review risk acknowledged for ${reviews.length} item(s); this is not a legal opinion.`);
console.log(`Scoped production technical gate passed for profiles=${selected.join(",")}`);
