"use strict";
/* 2026-10-31: members with 問校務 land on a chat-style 問校務; everyone else on 公告總庫. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = f => fs.readFileSync(path.join(__dirname, "..", "docs", f), "utf8");
const app = read("app.js"), index = read("index.html"), css = read("style.css");

assert.match(app, /tab: "latest",/, "visitors start on the announcement list");
/* 2026-10-31: everyone with 問校務 (members and guests) lands on it; a hint points to the sidebar. */
assert.match(app, /function landOnAssistant\(\) \{\s*if \(state\.userPickedTab \|\| \(state\.tab !== "latest" && state\.tab !== "home"\)\) return;\s*if \(!window\.CyNewsCapabilities \|\| !window\.CyNewsCapabilities\.has\("assistant"\)\) return;/);
assert.match(app, /document\.addEventListener\("cy-capabilities-applied", function \(\) \{ try \{ landOnAssistant\(\); \} catch \(_\) \{\} \}\)/, "guests land on 問校務 once public features load");
assert.match(read("capability-layer.js"), /dispatchEvent\(new CustomEvent\("cy-capabilities-applied"\)\)/);
assert.match(read("capability-layer.js"), /if \(closest\(node, "#viewAssistant"\)\) return;/, "問校務 lists stay visible to guests");
assert.match(index, /id="sidebarHint" class="sidebar-hint" role="note" hidden>[\s\S]*data-hint-open[\s\S]*data-hint-close/);
assert.match(app, /sideMenuToggle\.addEventListener\("click", function \(\) \{ dismissSidebarHint\(\);/, "opening the sidebar retires the hint");
assert.match(app, /function renderAssistantScope\(\)/);
assert.match(app, /'<optgroup label="' \+ esc\(county\) \+ '">'/, "every school can be picked as the 問校務 scope");
assert.match(app, /\(mine \? '<option value="preferred">我的學校（'/, "我的學校 only appears when a school is set");
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
assert.match(index, /<script src="mascot\.js\?v=5"><\/script>\s*<script src="assistant-qa\.js/);
assert.match(read("mascot.js"), /prefers-reduced-motion: reduce/, "the mascot stops moving for reduced motion");
assert.doesNotMatch(css, /transition: transform 1\.4s/, "no smooth sliding: the mascot walks step by step");
assert.match(app, /mascotMood\("thinking"\)/);
const manifest = JSON.parse(read("manifest.webmanifest"));
assert.ok(manifest.icons.some(i => i.purpose === "maskable"), "home-screen icon has a maskable version");
assert.match(index, /rel="apple-touch-icon" href="icons\/apple-touch-icon\.png\?v=3"/);
/* Square body: the red seal is as wide as it is tall. */
{
  const rows = Mascot.frame({}).map(r => r.join(""));
  const bodyRows = rows.filter(r => /[RL]/.test(r));
  const widths = bodyRows.map(r => r.lastIndexOf("D") - r.indexOf("D") + 1).filter(w => w > 0);
  const body = rows.map((r, y) => /[RL]/.test(r) ? y : -1).filter(y => y >= 0);
  assert.equal(body[body.length - 1] - body[0] + 3, 18, "body is 18 pixels tall");
  assert.ok(rows.some(r => /^\.{4}D[RLCEKP]{16}D\.{4}$/.test(r)), "body is 18 pixels wide");
}
/* Cameos: dash in from a side or pop out of the top-left corner, carrying books or a deadline sign. */
for (const name of ["booksWalk", "booksShow", "signWalk", "signShow", "run", "hello"]) assert.ok(Mascot.animations[name].length >= 2, name);
assert.ok(Mascot.frame({ arms: "hold", fx: ["books"] }).flat().includes("N"), "a stack of books");
assert.ok(Mascot.frame({ arms: "hold", fx: ["sign"] }).flat().includes("H"), "a sign with a red !");
assert.equal(typeof Mascot.cameo, "function");
assert.match(app, /function planMascotCameo\(\)/);
assert.match(app, /entries = \["left", "right", "corner"\]/, "enters from the left, the right or the top-left corner");
assert.match(app, /prop: "sign", text: "「" \+ shortTitle\(d\.title, 18\) \+ "」" \+ whenWord\(d\.days\)/, "deadline reminders name the item and when it is due");
assert.match(app, /prop: "books"/, "brings books and tells you to study");
assert.match(app, /CAMEO_MAX = 4/, "at most a few cameos per visit");
assert.match(app, /function cameoBlocked\(\)[\s\S]*INPUT\|TEXTAREA\|SELECT/, "never pops out while the user is typing");
assert.match(css, /\.mascot-cameo \{ position: fixed;/);

/* 小訊 does things on its own (read, write, draw, phone game) and perches in the header on
   every page except 問校務, where the chat has its own 小訊. */
const anims = typeof Mascot.animations === "function" ? Mascot.animations() : Mascot.animations;
for (const name of ["read", "write", "draw", "game", "gameWin", "gameLose"]) assert.ok(anims[name] && anims[name].length >= 3, name);
const reading = Mascot.frame(anims.read[0]).map(r => r.join(""));
assert.ok(reading.slice(18, 24).some(r => /E{5}/.test(r)), "the open book is drawn in front of the body");
assert.notDeepEqual(Mascot.frame(anims.write[0]), Mascot.frame(anims.write[6]), "the writing grows");
assert.match(index, /<div class="mast-tools">\s*<span id="mascotPerch" class="mascot-perch-slot" hidden><\/span>/, "the perch sits in the header, not over the content");
assert.match(app, /var show = state\.tab !== "assistant";/, "one 小訊 at a time: the chat page has its own");
assert.match(app, /if \(perched\) perched\.style\.visibility = "hidden";/, "the perch hides during a cameo");
assert.match(css, /\.mascot-perch \.mascot-bubble \{ bottom: auto; top: calc\(100% \+ 2px\)/, "the perch talks below the header");
/* Drawer: account, log out and the settings gear at the bottom. */
assert.match(index, /<\/nav>\s*<!--[^>]*-->\s*<div class="side-account">[\s\S]*id="sideLogout"[\s\S]*id="tabSub" class="side-settings"/);
assert.match(css, /\.side-account \{\s*display: flex; align-items: center; gap: 8px; margin-top: auto;/, "pinned to the bottom of the drawer");
assert.match(app, /new MutationObserver\(renderSideAccount\)\.observe\(box/, "follows the real account state");
assert.match(index, /<h2>設定<\/h2>/);
/* 2026-11-01: answers type out like a typewriter; tap to show all; reduced motion skips it. */
assert.match(app, /function typeAnswer\(box\) \{\s*if \(!box \|\| !box\.querySelectorAll \|\| prefersReducedMotion\(\)\) return;/);
assert.match(app, /finishAnswerTyping\(\);\s*el\.assistantAnswer\.innerHTML = '<div class="assistant-result chat-answer">' \+ html \+ '<\/div>';\s*typeAnswer\(el\.assistantAnswer\.firstChild\);/);
assert.match(app, /spoken\.className = "visually-hidden";/, "screen readers get the whole answer at once");
assert.match(app, /box\.addEventListener\("click", finish\);/, "tap shows the whole answer");
assert.match(css, /\.chat-answer \.is-typing-hidden \{ display: none; \}/, "sources wait until the text is typed");
assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.type-caret \{ animation: none; \}/);
/* 活動總覽 is a public page in the sidebar. */
assert.match(index, /<button id="tabActivities" class="tab">[\s\S]*?活動總覽/);
assert.match(index, /<section id="viewActivities" class="activity-view" hidden/);
assert.match(app, /tab === "latest" \|\| tab === "cross" \|\| tab === "activities"/);

console.log("Chat landing and layout contract passed");
