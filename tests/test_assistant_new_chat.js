"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(root, "docs", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "docs", "app.js"), "utf8");
const style = fs.readFileSync(path.join(root, "docs", "style.css"), "utf8");

assert.match(index, /<button type="button" id="assistantNewChat"[^>]*aria-label="[^"]*"[^>]*hidden>[\s\S]*?開啟新問校務<\/button>/, "button exists, labelled, hidden while the thread is empty");
assert.ok(index.indexOf('id="assistantNewChat"') > index.indexOf('id="assistantForm"') && index.indexOf('id="assistantNewChat"') < index.indexOf('id="assistantQuestion"'), "button sits just above the input");
assert.match(style, /\.chat-newchat\[hidden\]\s*\{\s*display:\s*none/);
assert.match(style, /\.chat-newchat\s*\{[^}]*var\(--line\)[^}]*var\(--card\)[^}]*var\(--ink\)/, "uses theme variables");
assert.match(app, /closest\("#assistantNewChat"\)\) \{ resetAssistantChat\(\)/, "click is wired");

const grab = (name) => { const r = app.match(new RegExp("function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n")); assert.ok(r, name); return r[0]; };
const body = grab("resetAssistantChat");
for (const re of [/state\.assistantTurns = \[\]/, /localStorage\.removeItem\(ASSISTANT_HISTORY_KEY\)/, /toggleAssistantSources\(false\)/, /count\.textContent = "0"/, /assistantQuestion\.value = ""/, /renderAssistantGreeting\(\)/, /renderAssistantExamples\(\)/, /assistantQuestion\.focus\(\)/, /remove\("has-turns"\)/]) assert.match(body, re, String(re));
assert.doesNotMatch(body, /ASSISTANT_DEEP_KEY|assistantScope/, "scope and deep toggle are untouched");

// Simulation: run the real function against minimal fakes.
const store = { "cynews-assistant-history": '["a"]', "cynews-assistant-deep": "1" };
const mk = () => ({ hidden: false, value: "x", textContent: "3", innerHTML: "old", classList: { remove() {}, add() {} }, focus() { this.focused = true; }, querySelector() { return {}; } });
const nodes = { assistantThread: mk(), assistantSourcesBody: mk(), assistantSourcesCount: mk(), assistantSourcesToggle: mk(), assistantNewChat: mk() };
const calls = [];
const factory = new Function("state", "el", "localStorage", "document", "ASSISTANT_HISTORY_KEY", "calls",
  "var finishAnswerTyping=function(){}, toggleAssistantSources=function(v){calls.push('sources:'+v)}, resizeAssistantInput=function(){}, mascotMood=function(){}, renderAssistantGreeting=function(){calls.push('greeting')}, renderAssistantExamples=function(){calls.push('examples')};\n" +
  grab("syncAssistantNewChat") + body + "return resetAssistantChat;");
const state = { assistantTurns: [{ question: "q" }], assistantAnswer: {}, assistantItems: { 1: {} } };
const el = { assistantQuestion: mk(), assistantStatus: mk(), viewAssistant: mk() };
const doc = { getElementById: (id) => nodes[id] };
const ls = { removeItem: (k) => { delete store[k]; } };
factory(state, el, ls, doc, "cynews-assistant-history", calls)();
assert.deepEqual(state.assistantTurns, []);
assert.equal(store["cynews-assistant-history"], undefined);
assert.equal(store["cynews-assistant-deep"], "1", "深度判斷 preference kept");
assert.equal(nodes.assistantSourcesCount.textContent, "0");
assert.equal(nodes.assistantSourcesBody.innerHTML, "");
assert.equal(nodes.assistantNewChat.hidden, true, "button hides on empty thread");
assert.equal(el.assistantQuestion.value, "");
assert.equal(el.assistantQuestion.focused, true);
assert.deepEqual(calls, ["sources:false", "greeting", "examples"]);
console.log("assistant new chat tests passed");
