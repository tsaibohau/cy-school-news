"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "docs");
const template = path.join(root, "tools", "public-core");
const configuredOutput = process.env.CYNEWS_PUBLIC_CORE_OUTPUT || "dist-public-core";
const output = path.isAbsolute(configuredOutput) ? path.resolve(configuredOutput) : path.join(root, configuredOutput);
const outputName = path.basename(output);
const isRootOutput = path.dirname(output) === root && /^dist-public-core(?:-[A-Za-z0-9._-]+)?$/.test(outputName);
const isTempOutput = path.dirname(output) === path.resolve(os.tmpdir()) && /^cy-school-news-public-core-[A-Za-z0-9._-]+$/.test(outputName);
if (!isRootOutput && !isTempOutput) throw new Error("refusing to clean an unexpected public-core output path");

const allowedHosts = new Set(["www.cysh.cy.edu.tw", "www.cygsh.cy.edu.tw", "rpage.fjsh.cy.edu.tw"]);
const allowedSchools = new Set(["cysh", "cygsh", "fjsh"]);
const allowedFields = ["id", "school", "school_name", "title", "url", "date", "source_category", "category", "summary"];

function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
function officialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && allowedHosts.has(url.hostname.toLowerCase());
  } catch (_) { return false; }
}
function minimizeSummary(value) {
  return clean(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[聯絡方式請見原文]")
    .replace(/(?:\+?886[-\s]?)?(?:0\d{1,2}[-\s]?)?\d{3,4}[-\s]?\d{4}/g, "[聯絡方式請見原文]")
    .slice(0, 220);
}
function project(item) {
  if (!item || !allowedSchools.has(item.school) || !officialUrl(item.url)) return null;
  const projected = {
    id: clean(item.id).slice(0, 96),
    school: item.school,
    school_name: clean(item.school_name).slice(0, 32),
    title: clean(item.title).slice(0, 220),
    url: item.url,
    date: /^\d{4}-\d{2}-\d{2}$/.test(clean(item.date)) ? clean(item.date) : "",
    source_category: clean(item.source_category).slice(0, 80),
    category: clean(item.category || "一般").slice(0, 40),
    summary: minimizeSummary(item.summary),
  };
  if (!projected.id || !projected.title) return null;
  if (Object.keys(projected).some((field) => !allowedFields.includes(field))) throw new Error("unexpected public field");
  return projected;
}

const current = JSON.parse(fs.readFileSync(path.join(source, "data", "announcements.json"), "utf8"));
const archive = JSON.parse(fs.readFileSync(path.join(source, "data", "archive.json"), "utf8"));
const seen = new Set();
const items = [];
for (const raw of [...(current.items || []), ...(archive.items || [])]) {
  const item = project(raw);
  if (!item || seen.has(item.id)) continue;
  seen.add(item.id);
  items.push(item);
}
items.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant-TW"));

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, "data"), { recursive: true });
fs.cpSync(path.join(source, "icons"), path.join(output, "icons"), { recursive: true });
for (const file of ["style.css", "search-taxonomy.js", "search-query.js"]) {
  fs.copyFileSync(path.join(source, file), path.join(output, file));
}
for (const file of ["index.html", "legal.html", "public-core-app.js"]) {
  fs.copyFileSync(path.join(template, file), path.join(output, file));
}

const manifest = {
  name: "嘉校快訊｜三校公開公告",
  short_name: "嘉校快訊",
  description: "嘉義高中、嘉義女中與輔仁高中公開公告索引（非官方）",
  lang: "zh-Hant-TW",
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#F4F6F9",
  theme_color: "#16233B",
  icons: [
    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};
const publicData = {
  schema_version: 1,
  release_profile: "public_core",
  generated_at: current.generated_at || archive.generated_at || "",
  categories,
  schools: [
    { id: "cysh", name: "嘉中" },
    { id: "cygsh", name: "嘉女" },
    { id: "fjsh", name: "輔仁" },
  ],
  items,
};
fs.writeFileSync(path.join(output, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync(path.join(output, "data", "public-announcements.json"), JSON.stringify(publicData) + "\n");
fs.writeFileSync(path.join(output, "robots.txt"), "User-agent: *\nDisallow: /\n");
fs.writeFileSync(path.join(output, "release-profile.json"), JSON.stringify({
  profile: "public_core",
  candidate: true,
  enabled_features: ["public_announcement_index", "search", "school_filter", "category_filter", "official_links"],
  disabled_features: ["accounts", "personalization", "password_auth", "reminders", "local_full_text", "attachments"],
}, null, 2) + "\n");

console.log(`Public-core candidate built with ${items.length} minimized announcement records`);
