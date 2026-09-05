"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const child = require("node:child_process");
const os = require("node:os");

const root = path.resolve(__dirname, "..");
const outputName = "cy-school-news-staging-" + process.pid;
const output = path.join(os.tmpdir(), outputName);
child.execFileSync(process.execPath, [path.join(root, "tools", "build-staging.js")], {
  cwd: root,
  stdio: "pipe",
  env: { ...process.env, CYNEWS_STAGING_OUTPUT: output },
});
const production = fs.readFileSync(path.join(root, "docs", "index.html"), "utf8");
const staging = fs.readFileSync(path.join(output, "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(output, "manifest-staging.webmanifest"), "utf8"));
const harness = fs.readFileSync(path.join(output, "acceptance-user-tasks.js"), "utf8");
const sw = fs.readFileSync(path.join(output, "sw.js"), "utf8");
const revision = (staging.match(/(?:style\.css|app\.js)\?v=(staging-[a-f0-9]{12})/) || [])[1];
const config = fs.readFileSync(path.join(root, "docs", "account-config.js"), "utf8");
const stagingConfig = fs.readFileSync(path.join(output, "account-config.js"), "utf8");
const behavioral = fs.readFileSync(path.join(root, "tests", "test_rls_behavioral.js"), "utf8");
const deployedWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "rls-deployed.yml"), "utf8");

assert(!production.includes("acceptance-user-tasks.js"), "production source must not load the acceptance harness");
assert(!production.includes("cynews-staging-banner"), "production source must not contain a staging banner");
assert(staging.includes('name="robots" content="noindex,nofollow,noarchive"'));
assert(staging.includes("STAGING／測試環境・非正式站"));
assert(revision, "staging build must create a single content-derived shell revision");
assert(!staging.includes("?v=25"), "staging cannot retain production shell query versions");
assert(staging.includes('src="acceptance-user-tasks.js?v=' + revision + '"'));
assert(staging.includes('src="app.js?v=' + revision + '"'));
assert(staging.includes('src="detail-ui.js?v=' + revision + '"'));
assert.equal(manifest.name, "嘉校快訊 Staging／測試版");
assert.equal(fs.readFileSync(path.join(output, "robots.txt"), "utf8"), "User-agent: *\nDisallow: /\n");
assert(harness.includes('params.get("acceptance") !== "user-tasks" && !localStorage.getItem(STORAGE)'), "harness is query gated and survives the exact-root OAuth callback");
assert(harness.includes('localStorage.setItem(STORAGE'), "interrupted OAuth acceptance can resume from a new staging tab");
assert(!harness.includes('sessionStorage.setItem(STORAGE'), "acceptance progress cannot disappear with the OAuth-return tab");
assert(harness.includes("location.origin !== expected"), "harness is exact-origin gated");
assert(harness.includes("adapter ownership guard failed"));
assert(harness.includes("cross-user read isolation failed"));
assert(harness.includes("account outbox isolation failed"));
assert(harness.includes("created_at: spoofedAt"), "raw spoof fixture must satisfy schema timestamps before RLS evaluation");
assert(harness.includes('spoof.data.code !== "42501"'), "raw spoof acceptance must require an RLS-specific rejection");
assert(harness.includes("raw ownership spoof was not rejected by RLS"));
assert(harness.includes("created_at: now"), "outbox fixture must satisfy user_tasks timestamps");
assert(harness.includes('new URL("/acceptance-companion.html", location.origin)'), "USER_A companion must use the lifecycle-free staging page");
assert(harness.includes("cleanupReservedOutbox"), "acceptance recovery must remove only reserved outbox fixtures");
assert(harness.includes("function requestMessage(type, message, timeout)"), "companion requests must use the race-safe request helper");
assert(/var pending = waitMessage\(type, timeout\);\s*channel\.postMessage\(message\);/.test(harness), "acceptance listener must be installed before a companion message is posted");
assert(harness.includes('"cynews-rls-acceptance-v1-" + channelRun'), "each acceptance run must use an isolated companion channel");
assert(harness.includes('companionUrl.searchParams.set("acceptance-run", run)'), "the companion must receive the current acceptance-run identifier");
assert(harness.includes('"cynews-user-a-companion-" + run'), "a stale companion tab must never be reused for a new acceptance run");
assert(harness.includes('area.status.textContent = "BLOCKED：" + label'), "blocked reports must identify a sanitized acceptance stage");
assert(harness.includes("USER_A companion 未回覆") && harness.includes("USER_A／USER_B 為同一 session"), "blocked reports must distinguish sanitized companion causes");
assert(!harness.includes("service_role"));
assert(sw.includes('var CACHE = "cy-news-' + revision + '";'), "staging cache namespace is distinct and advances with shell changes");
assert(sw.includes('detail-ui.js?v=' + revision), "structured detail renderer is part of the coherent shell");
assert(sw.includes('"./manifest-staging.webmanifest"'));
assert(sw.includes('"./staging.css?v=' + revision + '"'));
assert(sw.includes('"./acceptance-user-tasks.js?v=' + revision + '"'));
assert(sw.includes('"./acceptance-companion.html?v=' + revision + '"'));
assert(sw.includes('if (req.mode === "navigate")'), "staging navigation must prefer fresh HTML over a stale app shell");
const companion = fs.readFileSync(path.join(output, "acceptance-companion.html"), "utf8");
assert(companion.includes('acceptance-user-tasks.js?v=' + revision));
assert(companion.includes('account-auth.js?v=' + revision));
assert(!companion.includes("app.js"), "companion must not initialize the production account lifecycle");
assert(!companion.includes("account-sync.js"), "companion must not drain any account outbox");
assert(sw.includes('url.searchParams.has("code")'), "OAuth callback navigation remains uncacheable");
assert(config.includes("allowedRedirectUrls"));
assert(config.includes("https://oppdhtnepjagdwovndra.supabase.co"));
assert(!config.includes("https://ebezqanvmgsgtatsbssn.supabase.co"));
assert(stagingConfig.includes("https://ebezqanvmgsgtatsbssn.supabase.co"));
assert(!stagingConfig.includes("https://oppdhtnepjagdwovndra.supabase.co"));
assert(!behavioral.includes("passed for A=${a}"), "behavioral test output must not reveal user UUIDs");
assert(behavioral.includes("passed for USER_A and USER_B"));
assert(deployedWorkflow.includes("Check dedicated Auth harness availability"));
assert(deployedWorkflow.includes("if: steps.auth-gate.outputs.available == 'true'"));
assert(deployedWorkflow.includes("github.event_name == 'workflow_dispatch'"));
assert(deployedWorkflow.includes("BLOCKED_EXTERNAL_AUTH"));
console.log("Staging build and sanitized acceptance harness tests passed");
fs.rmSync(output, { recursive: true, force: true });

