"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(root, "docs", "index.html"), "utf8");
const style = fs.readFileSync(path.join(root, "docs", "style.css"), "utf8");
const app = fs.readFileSync(path.join(root, "docs", "app.js"), "utf8");

assert.match(index, /立即檢查更新/, "refresh control uses truthful wording across staging and production");
assert.match(index, /id="refreshState"[^>]*role="status"[^>]*aria-live="polite"/, "refresh progress is announced accessibly");
assert.match(app, /正在取得雲端已發布資料/);
assert.match(app, /同步完成；雲端尚未發布新版本/);
assert.match(app, /目前顯示離線快取，未取得雲端新資料/);
assert.match(style, /--sans: var\(--serif\)/, "one readable serif family is used across the interface");
const cyshColor = style.match(/--cysh:\s*([^;]+);/);
const cygshColor = style.match(/--cygsh:\s*([^;]+);/);
assert.ok(cyshColor && cygshColor && cyshColor[1] !== cygshColor[1], "the two schools use distinct calendar colors");
assert.match(style, /\.day-dot\.school-cysh[\s\S]*var\(--cysh\)/, "CYSH calendar events use the CYSH color");
assert.match(style, /\.day-dot\.school-cygsh[\s\S]*var\(--cygsh\)/, "CYGSH calendar events use the CYGSH color");
assert.doesNotMatch(index, /<option value="(?:cysh|cygsh|fjsh|pksh|ccjh)">/, "school options are generated from the registry, never hardcoded");
assert.match(app, /\["adminClassificationSchool", "adminArchiveSchool"\][\s\S]*CyNewsSchoolRegistry\.schools\(\)/, "admin school selectors come from the registry");
assert.match(index, /<footer class="foot">[\s\S]*<a href="schools\.html">各校官網與使用說明<\/a>/, "the footer links to the school-site list instead of enumerating schools");
assert.doesNotMatch(index.slice(index.indexOf('<footer class="foot">')), /cy\.edu\.tw|ylc\.edu\.tw|cyc\.edu\.tw/, "no per-school links crowd the footer");
assert.match(app, /HIDDEN_SCHOOL_IDS\s*=\s*SCHOOL_REGISTRY && SCHOOL_REGISTRY\.hiddenIds/, "hidden schools come from the registry, not hardcoded ids");
assert.match(app, /HIDDEN_SCHOOL_NAMES\s*=\s*SCHOOL_REGISTRY && SCHOOL_REGISTRY\.hiddenNames/, "hidden display names come from the registry");
assert.match(app, /row\.date_status === "unverified" \|\| row\.date_source === "legacy_unverified"\) return false/, "unverified legacy dates are never shown");
assert.doesNotMatch(app, /fjsh: true|pksh: true/, "no hardcoded hidden-school list");
assert.match(app, /function cardHTML\(it\) \{[\s\S]*if \(!visibleSchool\(it\)\) return "";/, "card rendering fails closed for disabled sources");
assert.match(index, /<h1>校訊<\/h1>/, "the masthead uses the short service name");
assert.match(index, /嘉義・雲林公告彙整/, "the subtitle describes the current Chiayi + Yunlin scope truthfully");
assert.doesNotMatch(index, /嘉中・嘉女公告彙整/, "the retired two-school subtitle is gone");
assert.doesNotMatch(index, /嘉雲校訊|從三校公告中/, "retired cross-county and three-school copy is removed");
assert.match(index, /legal\.html\?v=20260925/, "the legal notice link bypasses stale installed-shell entries");

{
  const vm = require("vm");
  // 用一份假的登錄表（含一所隱藏學校）驗證篩選規則完全由登錄表決定
  const Registry = require("../docs/school-registry.js");
  const fakeRegistry = Object.assign({}, Registry, {
    hiddenIds: () => ({ xxsh: true }),
    hiddenNames: () => ["停用測試高中", "停用高中"],
  });
  const context = vm.createContext({ window: { CyNewsSchoolRegistry: fakeRegistry } });
  const start = app.indexOf("    // 停用或隱藏的學校");
  const end = app.indexOf("    var state = {", start);
  vm.runInContext(app.slice(start, end), context);
  assert.equal(context.visibleSchool({ id: "legacy-1", school: "unknown", school_name: "停用高中" }), false,
    "a malformed legacy row cannot bypass a hidden school through its display name");
  assert.equal(context.visibleSchool({ id: "xxsh-9", school: "unknown" }), false,
    "hidden-school ids are filtered even when the id appears before school");
  assert.equal(context.visibleSchool({ id: "pksh-1", school: "pksh", school_name: "北港高中" }), true,
    "PKSH is public again");
  assert.equal(context.visibleSchool({ id: "pksh-3", school: "pksh", date_status: "unverified" }), false,
    "the persisted public marker also hides the item");
  assert.equal(context.visibleSchool({ id: "pksh-4", school: "pksh", date_status: "verified" }), true,
    "confirmed legacy items are shown");
  assert.equal(context.visibleSchool({ id: "pksh-2", school: "pksh", date_source: "legacy_unverified" }), false,
    "unverified legacy dates stay hidden until the official article confirms them");
  assert.equal(context.visibleSchool({ id: "legacy-2", school: "cysh", school_name: "嘉義高中" }), true,
    "an active Chiayi school remains visible");
}
assert.match(style, /#btnRefresh\.is-refreshing svg/);
assert.match(style, /@media \(prefers-reduced-motion: reduce\)/, "motion preference remains respected");
assert.ok((style.match(/@media \(prefers-color-scheme: dark\)/g) || []).length >= 2,
  "the final editorial palette preserves a readable dark variant");
assert.match(index, /Noto\+Serif\+TC:wght@400;500;700;900/, "the complete readable font family is loaded");
assert.match(index, /style\.css\?v=97/);
assert.match(index, /search-taxonomy\.js\?v=53/, "search taxonomy loads before the query parser");
assert.match(index, /search-query\.js\?v=54/, "semantic search terms load before the application");
assert.match(index, /search-query\.js\?v=54[\s\S]*announcement-validity-reviewed\.js\?v=52[\s\S]*announcement-validity\.js\?v=52[\s\S]*assistant-qa\.js\?v=57/, "reviewed validity loads before answers");
const appVersion = index.match(/src="app\.js\?v=(\d+)"/);
assert.ok(appVersion, "application script has a numeric cache version");
const serviceWorker = fs.readFileSync(path.join(root, "docs", "sw.js"), "utf8");
assert.match(serviceWorker, /\/legal\\\.html\$[\s\S]*fetch\(req\)/, "the legal notice is network-first with cache fallback");
assert.ok(serviceWorker.includes("./app.js?v=" + appVersion[1] + '"'),
  "the HTML and Service Worker cache refer to the same application version");
assert.match(index, /id="appLoading"[^>]*role="status"/, "initial data loading is announced accessibly");
assert.match(style, /\.app-loading/, "initial data loading has a dedicated view");
assert.doesNotMatch(style, /--calligraphy:/, "the interface does not mix a second display font into reading UI");
assert.match(app, /finishInitialLoading/, "the loading view closes after initial data work");
assert.doesNotMatch(index, /不會猜/, "assistant copy is direct rather than defensive");
assert.match(app, /資料說明/, "assistant keeps limitations available without interrupting the answer");
assert.match(app, /官方來源（/, "assistant answers use a source panel template");
assert.match(app, /為什麼這樣回答/, "assistant evidence is available without interrupting the answer");
assert.match(app, /searchTimer = setTimeout[\s\S]*200\);/, "full-corpus ranking is debounced while the user types");
assert.doesNotMatch(index, /id="navMenuToggle"/, "navigation is an always-visible tab bar, not a hidden pop-up menu");
assert.match(index, /<nav id="navMenu" class="tabbar" aria-label="主要功能">/, "primary navigation is one labelled tab bar");
{
  const nav = index.slice(index.indexOf('<nav id="navMenu"'), index.indexOf("</nav>"));
  assert.ok((nav.match(/class="tab"/g) || []).length <= 6, "the tab bar stays short: at most five visible destinations plus the timetable-only fallback");
  assert.doesNotMatch(nav, /id="tabAdmin"|id="tabToday"/, "admin and today live inside pages, not the tab bar");
}
assert.match(index, /id="tabAdmin"[^>]*hidden/, "administrator tab starts hidden");
assert.match(index, /id="viewSub"[\s\S]*id="tabAdmin"[\s\S]*id="viewAdmin"/, "administrator entry lives on the personal page");
assert.match(index, /id="tabCalendar"[\s\S]*id="tabTimetable"[\s\S]*<\/nav>/, "timetable-only accounts still reach the timetable from the tab bar");
assert.match(style, /#tabCalendar:not\(\[hidden\]\) ~ #tabTimetable \{ display: none; \}/, "accounts with a calendar reach the timetable inside the calendar page");
assert.match(index, /id="viewCalendar"[\s\S]*data-view-switch="timetable"/, "the calendar page has a timetable switch");
assert.match(index, /id="viewTimetable"[\s\S]*data-view-switch="calendar"/, "the timetable page switches back to the calendar");
assert.match(style, /\.badge\[hidden\] \{ display: none; \}/, "an empty notification badge never shows 0");
assert.match(style, /\.tab\[hidden\]\s*\{\s*display:\s*none;/, "hidden navigation tabs must override the tab display layout");
assert.match(index, /id="brandHome"[^>]*aria-label="返回主畫面"/, "the masthead always exposes a route back home");
assert.match(app, /brandHome.*addEventListener\("click"[\s\S]*(?:pickTab|switchTab)\("home"\)/, "the masthead returns approved accounts to the home view");
assert.match(index, /id="viewHome"[^>]*aria-labelledby="homeTitle"/);
assert.match(index, /id="homeTitle"[^>]*class="calligraphy-title"[^>]*>.*學校公告.*匯集系統/s);
assert.match(index, /data-home-tab="today"/);
assert.match(index, /data-home-tab="timetable"/);
assert.match(index, /id="taskComposerToggle"[^>]*aria-expanded="false"/);
assert.match(index, /id="taskForm"[^>]*hidden/);
assert.match(index, /class="my-card/);
assert.match(style, /\.calligraphy-title/);
assert.match(style, /\.task-composer\[hidden\]/);
assert.match(index, /id="nicknameSchool"[^>]*required/, "first-login onboarding asks for the preferred school");
assert.match(index, /id="profileSchool" required/, "account settings require an explicit school");
assert.match(index, /id="assistantScope"/, "school assistant exposes an explicit cross-school search scope");
assert.match(app, /mentionedSchool\(question\)/, "a school named in the question overrides the default scope");
assert.match(app, /applyPreferredSchool\(state\.profile\.school_id/, "the account school becomes the default data shard");
assert.match(style, /\.function-dock/, "the tab bar has a dedicated responsive layout");
assert.match(index, /id="todayTimetable"/, "today view includes a class timetable region");
assert.match(index, /我的班級（查看課表需要）/, "profile explains when a class is needed");
assert.match(app, /data\/class-timetables\.json/, "today view loads the generated public timetable data");
assert.match(app, /officialTimetableUrl/, "timetable source links are constrained to the official school origin");
assert.match(style, /\.timetable-week/, "weekly timetable has a dedicated responsive layout");
assert.match(index, /未登入可查看公告索引/, "anonymous visitors are told that only the public index is available");
assert.match(index, /公告內文不對非會員提供/, "anonymous visitors are told that announcement content requires approval");
assert.match(index, /id="publicAccessTitle"/, "account state has a dedicated, accessible heading");
assert.match(app, /帳號已建立，正在等待核准/, "pending accounts receive a clear status and next step");
assert.match(index, /基本資料[\s\S]*讓內容更符合我/, "profile fields are progressively disclosed into essential and optional groups");
assert.match(index, /今天先做什麼/, "home actions use task-oriented language");
assert.match(app, /classList\.toggle\("btn-primary", signup \|\| reset\)/, "the current authentication action has clear visual priority");

console.log("Editorial UI and honest refresh status contract tests passed");

// Exercise the actual account-shell transitions with a deterministic clock.
{
  const vm = require("vm");
  const source = fs.readFileSync(path.join(__dirname, "../docs/app.js"), "utf8");
  const timers = new Map();
  let clock = 0, nextId = 0;
  const card = { hidden: false, dataset: {}, classList: new Set() };
  card.classList.remove = card.classList.delete.bind(card.classList);
  const el = { publicAccountEntry: card };
  for (const key of ["functionDock", "publicAccountLogin", "publicAccountSignUp", "publicAccountLogout", "publicAccessTitle", "publicAccessLead", "publicAccessStatus", "tabAdmin"]) el[key] = {};
  const state = { accountUser: { id: "user-a" }, tab: "latest" };
  const context = vm.createContext({ el, state, setNavMenu() {}, switchTab() {},
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(source.slice(source.indexOf("      var welcomeUid ="), source.indexOf("      function setAccountUser")), context);
  function advance(ms) {
    const end = clock + ms;
    while (true) {
      const entry = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry || entry[1].at > end) break;
      clock = entry[1].at; timers.delete(entry[0]); entry[1].fn();
    }
    clock = end;
  }
  context.showAnonymousShell();
  context.showAccountShell();
  assert.equal(el.publicAccountLogin.hidden, true);
  assert.equal(el.publicAccountSignUp.hidden, true);
  assert.match(el.publicAccessStatus.textContent, /登入成功/);
  advance(1999); assert.equal(card.hidden, false);
  advance(1); assert.equal(card.classList.has("is-leaving"), true);
  advance(600); assert.equal(card.hidden, true);
  context.showAccountShell(); assert.equal(card.hidden, true, "session refresh must not replay welcome");
  context.showAnonymousShell(); context.showAccountShell(); advance(2100);
  context.showAnonymousShell(); advance(1000);
  assert.equal(card.hidden, false, "old fade must not hide the signed-out guest card");
  assert.equal(el.publicAccountLogin.hidden, false);
  assert.equal(card.classList.has("is-leaving"), false);
  context.showAccountShell(); context.showPendingAccountShell("等待核准"); advance(3000);
  assert.equal(card.hidden, false, "pending status stays visible");
  assert.equal(el.publicAccountLogout.hidden, false);
  assert.equal(card.dataset.state, "pending");
  const cssSource = fs.readFileSync(path.join(__dirname, "../docs/style.css"), "utf8");
  assert.match(cssSource, /\.access-card\[hidden\]\s*\{\s*display:\s*none/);
}

// 行事曆預設只看個人設定的學校；只有使用者主動改看別校或「所有學校」才記住（之後學校變多也不混亂）。
assert.match(app, /LS_CALENDAR_SCHOOL = "cyNews\.calendarSchool\.v2"/, "old 'all schools' defaults are not carried over");
assert.match(app, /state\.calendarSchool = choice && [\s\S]*?\? choice : preferred;/, "calendar falls back to the profile school");
assert.match(app, /state\.calendarSchoolChoice = value === preferredCalendarSchool\(\) \? "" : value;/, "choosing your own school again stops overriding");
assert.match(app, /officialEvents: state\.officialEvents\.filter\(function \(ev\) \{[\s\S]*?ev\.school_id === school/, "today only lists your own school's calendar");
assert.doesNotMatch(app, /row\.event_type \|\| row\.kind/, "internal event types are never shown as labels");
console.log("Calendar school preference contract passed");
