"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "docs");
const configuredOutput = process.env.CYNEWS_STAGING_OUTPUT || "dist-staging";
const outputName = path.isAbsolute(configuredOutput) ? path.basename(configuredOutput) : configuredOutput;
const output = path.isAbsolute(configuredOutput) ? path.resolve(configuredOutput) : path.join(root, configuredOutput);
const staging = path.join(root, "tools", "staging");
const shellInputs = [
  "index.html", "legal.html", "legal-compliance.json", "style.css", "app.js", "detail-ui.js", "sw.js", "account-config.js",
  "supabase-sync.js", "account-auth.js", "task-state.js", "account-sync.js",
  "push-subscription.js",
  "reminder-rules.js",
  "school-registry.js", "profile.js", "relevance.js", "assistant-feedback.js", "today.js", "search-taxonomy.js", "search-query.js", "announcement-validity-reviewed.js", "announcement-validity.js", "assistant-qa.js", "calendar-state.js",
  path.join("..", "tools", "staging", "acceptance-user-tasks.js"),
  path.join("..", "tools", "staging", "acceptance-companion.html"),
  path.join("..", "tools", "staging", "staging.css"),
];
const shellRevision = "staging-" + crypto.createHash("sha256")
  .update(shellInputs.map((file) => fs.readFileSync(path.join(source, file))).join("\n"))
  .digest("hex").slice(0, 12);
const sourceVersions = ["?v=41", "?v=42", "?v=43", "?v=44", "?v=45", "?v=46", "?v=47", "?v=48", "?v=49", "?v=50", "?v=51", "?v=52", "?v=53", "?v=54", "?v=55", "?v=56", "?v=57", "?v=58", "?v=59", "?v=60", "?v=61", "?v=62", "?v=63", "?v=64", "?v=65"];
const stagedVersion = "?v=" + shellRevision;

const isRootOutput = path.dirname(output) === root && /^dist-staging(?:-[A-Za-z0-9._-]+)?$/.test(outputName);
const isTempOutput = path.dirname(output) === path.resolve(os.tmpdir()) && /^cy-school-news-staging-[A-Za-z0-9._-]+$/.test(outputName);
if (!isRootOutput && !isTempOutput) {
  throw new Error("refusing to clean an unexpected staging output path");
}
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
fs.copyFileSync(path.join(staging, "manifest.webmanifest"), path.join(output, "manifest-staging.webmanifest"));
fs.copyFileSync(path.join(staging, "staging.css"), path.join(output, "staging.css"));
fs.copyFileSync(path.join(staging, "acceptance-user-tasks.js"), path.join(output, "acceptance-user-tasks.js"));
fs.copyFileSync(path.join(staging, "acceptance-companion.html"), path.join(output, "acceptance-companion.html"));

const indexPath = path.join(output, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
if (!html.includes("<head>") || !html.includes("<body>")) throw new Error("unexpected index.html shape");
html = html
  .replace("<head>", '<head>\n<meta name="robots" content="noindex,nofollow,noarchive">')
  .replace("<title>", "<title>STAGING｜")
  .replace('href="manifest.webmanifest"', 'href="manifest-staging.webmanifest"')
  .replace('</head>', '<link rel="stylesheet" href="staging.css?v=' + shellRevision + '">\n</head>')
  .replace('<body>', '<body>\n<div class="cynews-staging-banner" role="status">STAGING／測試環境・非正式站</div>')
  .replace('</body>', '<script src="acceptance-user-tasks.js?v=' + shellRevision + '" defer></script>\n</body>');
sourceVersions.forEach((sourceVersion) => { html = html.replaceAll(sourceVersion, stagedVersion); });
fs.writeFileSync(indexPath, html);
fs.writeFileSync(path.join(output, "robots.txt"), "User-agent: *\nDisallow: /\n");

const companionPath = path.join(output, "acceptance-companion.html");
let companion = fs.readFileSync(companionPath, "utf8")
  .replace("acceptance-user-tasks.js?v=4", "acceptance-user-tasks.js?v=" + shellRevision);
sourceVersions.forEach((sourceVersion) => { companion = companion.replaceAll(sourceVersion, stagedVersion); });
fs.writeFileSync(companionPath, companion);

const swPath = path.join(output, "sw.js");
let sw = fs.readFileSync(swPath, "utf8")
  .replace(/var CACHE = "cy-news-v[^\"]+";/, 'var CACHE = "cy-news-' + shellRevision + '";')
  .replace('"./manifest.webmanifest"', '"./manifest-staging.webmanifest", "./staging.css?v=' + shellRevision + '", "./acceptance-user-tasks.js?v=' + shellRevision + '", "./acceptance-companion.html?v=' + shellRevision + '"')
  .replace('  // 殼層:快取優先', '  /* A new staging deployment must never combine an old HTML shell with new JavaScript. */\n  if (req.mode === "navigate") {\n    e.respondWith(fetch(req).catch(function () { return caches.match("./index.html"); }));\n    return;\n  }\n  // 殼層:快取優先');
sourceVersions.forEach((sourceVersion) => { sw = sw.replaceAll(sourceVersion, stagedVersion); });
if (!sw.includes('var CACHE = "cy-news-' + shellRevision + '"') || !sw.includes("acceptance-user-tasks.js?v=" + shellRevision) || !sw.includes("req.mode === \"navigate\"")) throw new Error("staging Service Worker isolation failed");
fs.writeFileSync(swPath, sw);

const config = fs.readFileSync(path.join(output, "account-config.js"), "utf8");
if (!config.includes("https://cy-school-news-staging.vercel.app/")) throw new Error("staging URL is absent from account allow-list");
if (!html.includes("acceptance-user-tasks.js") || !html.includes("STAGING／測試環境") || sourceVersions.some((sourceVersion) => html.includes(sourceVersion))) throw new Error("staging markers or coherent shell revision were not injected");
console.log("Staging artifact built with noindex, coherent " + shellRevision + " shell and acceptance harness");

