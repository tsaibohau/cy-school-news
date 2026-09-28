"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const output = path.join(root, "dist-review-station");
const files = ["index.html", "cloud_review.js", "station-config.js"];
const forbidden = /service_role|sb_secret_|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|database_password|oppdhtnepjagdwovndra|github_pat_|gh[pousr]_[A-Za-z0-9_]{20,}/i;

const contents = Object.fromEntries(files.map((name) => [name, fs.readFileSync(path.join(root, name), "utf8")]));
const bundle = Object.values(contents).join("\n");

if (forbidden.test(bundle)) throw new Error("Review Station bundle contains a forbidden credential or Production reference");
if (!contents["station-config.js"].includes("https://sshovpnepgswzvjwjuyz.supabase.co")) throw new Error("Training Supabase URL missing");
if (!contents["station-config.js"].includes("sb_publishable_")) throw new Error("Training publishable key missing");
if (/localhost|127\.0\.0\.1|file:\/\//i.test(bundle)) throw new Error("Local-only URL found in Review Station bundle");
if (contents["index.html"].includes('<option value="machine_review">')) throw new Error("Machine review mode must not be offered in the Round 1 station");
if (!contents["cloud_review.js"].includes('let cloudMode = "blind"')) throw new Error("Blind mode is not the initial review mode");
if (!contents["cloud_review.js"].includes('if (cloudMode === "machine_review")')) throw new Error("Machine query guard is missing");
if (!contents["cloud_review.js"].includes('await supabase.auth.getSession()')) throw new Error("Session recovery on page load is missing");

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of files) fs.copyFileSync(path.join(root, name), path.join(output, name));
console.log(`Prepared ${files.length} static Review Station assets in ${path.relative(root, output)}`);
