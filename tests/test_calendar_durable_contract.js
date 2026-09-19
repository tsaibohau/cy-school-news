"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(repo, "docs", "app.js"), "utf8");
const calendar = fs.readFileSync(path.join(repo, "docs", "calendar-state.js"), "utf8");
const account = fs.readFileSync(path.join(repo, "docs", "account-sync.js"), "utf8");
const sync = fs.readFileSync(path.join(repo, "docs", "supabase-sync.js"), "utf8");
const html = fs.readFileSync(path.join(repo, "docs", "index.html"), "utf8");

assert.match(calendar, /cyNews\.calendarEvents\.v2:/);
assert.match(calendar, /cyNews\.calendarEvents\.v2:legacy-claim/);
assert.match(calendar, /existing\.account_id !== accountId/);
assert.match(calendar, /claim\.entries\.every/);
assert(app.includes("lifecycle.replaceCalendarEvents(remote && remote.calendar_events || [])"), "remote canonical rows rebuild the local cache before pending replay");
assert(app.includes('window.addEventListener("online"'), "online recovery drains calendar outbox");
assert(app.includes("drainCalendarOutbox();"), "online mutations attempt an immediate best-effort drain");
assert(app.includes("CalendarState.createLegacyClaim(localStorage, readyUid)"), "explicit legacy import persists claim before enqueue");
assert(app.includes("window.confirm(\"要把這個瀏覽器中的舊行事曆事件"), "legacy import requires explicit confirmation");
assert(!/localStorage\.setItem\(LS_EVENTS/.test(app), "legacy v1 is never the active source of truth");
assert(account.includes("adoptableAnonymous.calendar_events = []"), "anonymous v2 is excluded from automatic account adoption");
assert(sync.includes('client.rpc("apply_user_calendar_event_mutation"'), "calendar writes use the versioned mutation RPC");
assert(sync.includes('client.rpc("delete_own_user_calendar_events"'), "cloud delete includes calendar rows");
assert.match(html, /id="legacyEventImport"[^>]*hidden/);
console.log("Calendar durable frontend contract tests passed");
