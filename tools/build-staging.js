"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "docs");
const output = path.join(root, "dist-staging");
const staging = path.join(root, "tools", "staging");

if (path.dirname(output) !== root || path.basename(output) !== "dist-staging") {
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
  .replace('</head>', '<link rel="stylesheet" href="staging.css?v=1">\n</head>')
  .replace('<body>', '<body>\n<div class="cynews-staging-banner" role="status">STAGING／測試環境・非正式站</div>')
  .replace('</body>', '<script src="acceptance-user-tasks.js?v=3" defer></script>\n</body>');
fs.writeFileSync(indexPath, html);
fs.writeFileSync(path.join(output, "robots.txt"), "User-agent: *\nDisallow: /\n");

const swPath = path.join(output, "sw.js");
let sw = fs.readFileSync(swPath, "utf8")
  .replace('var CACHE = "cy-news-v25";', 'var CACHE = "cy-news-staging-v27";')
  .replace('"./manifest.webmanifest"', '"./manifest-staging.webmanifest", "./staging.css?v=1", "./acceptance-user-tasks.js?v=3", "./acceptance-companion.html"');
if (!sw.includes("cy-news-staging-v27") || !sw.includes("acceptance-user-tasks.js?v=3")) throw new Error("staging Service Worker isolation failed");
fs.writeFileSync(swPath, sw);

const config = fs.readFileSync(path.join(output, "account-config.js"), "utf8");
if (!config.includes("https://cy-school-news-staging.vercel.app/")) throw new Error("staging URL is absent from account allow-list");
if (!html.includes("acceptance-user-tasks.js") || !html.includes("STAGING／測試環境")) throw new Error("staging markers were not injected");
console.log("Staging artifact built with noindex, isolated manifest and acceptance harness");
