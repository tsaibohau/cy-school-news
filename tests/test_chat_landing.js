"use strict";
/* 2026-10-31: members with 問校務 land on a chat-style 問校務; everyone else on 公告總庫. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = f => fs.readFileSync(path.join(__dirname, "..", "docs", f), "utf8");
const app = read("app.js"), index = read("index.html"), css = read("style.css");

assert.match(app, /tab: "latest",/, "visitors start on the announcement list");
assert.match(app, /var canAsk = full && window\.CyNewsCapabilities && window\.CyNewsCapabilities\.has\("assistant"\);/);
assert.match(app, /if \(canAsk && !state\.userPickedTab && \(state\.tab === "latest" \|\| state\.tab === "home"\)\) switchTab\("assistant"\);/);
assert.doesNotMatch(app, /switchTab\("home"\);\s*\n\s*}\s*\n\s*function adminFilters/, "no automatic jump to 首頁 any more");
assert.match(index, /<button id="tabLatest" class="tab is-active" aria-current="page">/, "公告 is highlighted until access is known");
assert.ok(index.indexOf('id="tabAssistant"') < index.indexOf('id="tabHome"'), "問校務 is the first tab");

assert.match(index, /id="assistantWelcome" class="chat-welcome"/);
assert.match(index, /id="assistantThread" class="chat-thread"/);
assert.match(index, /<textarea id="assistantQuestion"/);
assert.match(app, /function startAssistantTurn\(question, context\)/);
assert.match(app, /e\.key === "Enter" && !e\.shiftKey && !e\.isComposing/, "Enter sends; IME composition and Shift+Enter do not");
assert.match(css, /\.chat-composer \{\s*position: sticky;/);
assert.match(css, /\.chat-view\.has-turns \.chat-welcome \{ display: none; \}/);
/* Sources for every answer live in one shared panel under the conversation. */
assert.match(index, /<details id="assistantEvidence" class="chat-evidence" hidden>/);
assert.ok(index.indexOf('id="assistantThread"') < index.indexOf('id="assistantEvidence"') && index.indexOf('id="assistantEvidence"') < index.indexOf('id="assistantForm"'));
assert.doesNotMatch(app, /'<details class="assistant-details"[^']*'\s*\+\s*'<summary>為什麼這樣回答/, "no evidence panel inside each answer");
assert.match(app, /function showAssistantEvidence\(index, open\)/);
assert.match(app, /data-assistant-cite="/);
assert.match(app, /resolveFollowUp\(question, previous && \{ query: previous\.query, answered: answeredBefore \}\)/, "follow-up questions read the previous answered turn");
/* Mascot 小訊: the 訊 seal with eyes, arms and legs, walking above the composer. */
const Mascot = require("../docs/mascot.js");
const svg = Mascot.svg();
/* Pixel art: crisp square pixels, the 訊 glyph in cream, eyes, arms and legs in every pose. */
assert.match(svg, /shape-rendering="crispEdges"/);
const grid = Mascot.frame({}).map(r => r.join(""));
assert.ok(grid.join("").includes("C"), "the 訊 glyph is drawn"); assert.ok(grid.join("").includes("E") && grid.join("").includes("K"), "eyes");
for (const name of ["idle", "blink", "look", "wave", "dance", "yawn", "sleep", "think", "happy", "sad", "startle", "love", "walk"]) assert.ok(Mascot.animations[name].length >= 3, name + " has frames");
assert.ok(Mascot.animations.walk.some(p => p.legs === "walkA") && Mascot.animations.walk.some(p => p.legs === "walkB"), "walking alternates feet");
assert.doesNotMatch(read("mascot.js"), /scaleX\(-1\)|is-facing-left/, "the sprite is never mirrored, so 訊 stays readable");
assert.ok(Mascot.lines.thinking.length && Mascot.lines.happy.length && Mascot.lines.sad.length);
assert.match(index, /id="mascotStage" class="mascot-stage"/);
assert.match(index, /<script src="mascot\.js\?v=2"><\/script>\s*<script src="assistant-qa\.js/);
assert.match(read("mascot.js"), /prefers-reduced-motion: reduce/, "the mascot stops moving for reduced motion");
assert.doesNotMatch(css, /transition: transform 1\.4s/, "no smooth sliding: the mascot walks step by step");
assert.match(app, /mascotMood\("thinking"\)/);
const manifest = JSON.parse(read("manifest.webmanifest"));
assert.ok(manifest.icons.some(i => i.purpose === "maskable"), "home-screen icon has a maskable version");
assert.match(index, /rel="apple-touch-icon" href="icons\/apple-touch-icon\.png\?v=3"/);
console.log("Chat landing and layout contract passed");
