/* Local PWA Notification V3 行為測試:Node 內建 assert/vm,不引入依賴。 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repo = path.resolve(__dirname, "..");
const stateSource = fs.readFileSync(path.join(repo, "docs", "notification-state.js"), "utf8");
const profileSource = fs.readFileSync(path.join(repo, "docs", "profile.js"), "utf8");
const relevanceSource = fs.readFileSync(path.join(repo, "docs", "relevance.js"), "utf8");
const registrySource = fs.readFileSync(path.join(repo, "docs", "school-registry.js"), "utf8");
const appSource = fs.readFileSync(path.join(repo, "docs", "app.js"), "utf8");
assert.match(appSource, /function displayTitle\(it\)/, "UI must guard invalid source titles");
assert.match(appSource, /Legacy RulingDigital records may contain the ::: access-key label/);
assert.match(appSource, /公告標題暫時無法解析/, "invalid title fallback must fail readably");
const swSource = fs.readFileSync(path.join(repo, "docs", "sw.js"), "utf8");

class MemoryStorage {
  constructor(entries) { this.values = new Map(Object.entries(entries || {})); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class FixedDate extends Date {
  constructor(...args) {
    super(args.length ? args[0] : "2026-08-19T00:00:00.000Z");
  }
  static now() { return Date.parse("2026-08-19T00:00:00.000Z"); }
}

function loadStateApi(storage, idPrefix = "sub") {
  const root = {
    localStorage: storage,
    Date: FixedDate,
    crypto: null,
  };
  const context = vm.createContext({ window: root, Date: FixedDate });
  vm.runInContext(stateSource, context);
  return { api: root.CyNewsNotificationState, context, root };
}

class FakeElement {
  constructor() {
    this.listeners = {};
    this.innerHTML = "";
    this.textContent = "";
    this.hidden = false;
    this.value = "";
    this.dataset = {};
    this.classList = { toggle() {} };
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  setAttribute() {}
  insertAdjacentHTML(_where, html) { this.innerHTML += html; }
  focus() {}
  emit(type, event = {}) {
    const target = event.target || this;
    if (!target.closest) target.closest = () => null;
    if (this.listeners[type]) this.listeners[type]({ target, preventDefault() {} });
  }
}

function makeDocument() {
  const ids = [
    "list", "subList", "countLine", "updatedAt", "q", "schoolSeg", "catChips",
    "viewLatest", "viewSub", "tabLatest", "tabSub", "subBadge", "kwForm",
    "kwInput", "kwChips", "btnNotify", "notifyState", "btnRefresh",
    "profileBox", "profileHint", "profileForm", "profileSchool", "profileGrade",
    "profileClass", "profileInterests", "profileCategories", "profileKeywords",
    "profileSave", "profileStatus", "personalizedToggle",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  return {
    elements,
    getElementById(id) { return elements[id]; },
    createElement() {
      return { set src(_value) {}, onload: null, onerror: null };
    },
    head: { appendChild() {} },
  };
}

function response(data, source = "network") {
  return {
    ok: true,
    status: 200,
    headers: { get(name) { return name.toLowerCase() === "x-cynews-data-source" ? source : null; } },
    json() { return Promise.resolve(data); },
  };
}

function dataOf(items) {
  return {
    generated_at: "2026-08-19T01:00:00Z",
    schools: [{ id: "cysh", short: "嘉中" }],
    categories: ["一般", "段考考試"],
    items,
  };
}

function item(id, firstSeen, title) {
  return {
    id, first_seen: firstSeen, title, snippet: "", category: "一般",
    source_category: "", school: "cysh", school_name: "嘉中",
    url: "https://example.test/" + id,
  };
}

function makeNotification(behavior = {}) {
  function Notification(title, options) {
    if (behavior.throwOnCreate) throw new Error("notification failed");
    Notification.calls.push({ title, options });
  }
  Notification.permission = behavior.permission || "granted";
  Notification.calls = [];
  Notification.requestPermission = () => Promise.resolve(Notification.permission);
  return Notification;
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function createApp({ storage, responses, notification, controller = null }) {
  const document = makeDocument();
  const queue = responses.slice();
  const window = {
    localStorage: storage,
    document,
    navigator: { serviceWorker: { controller, register: () => Promise.resolve() } },
    Notification: notification,
    setTimeout,
    scrollTo() {},
    addEventListener() {},
    __CYNEWS_TEST__: true,
  };
  const context = vm.createContext({
    window,
    document,
    localStorage: storage,
    navigator: window.navigator,
    Notification: notification,
    fetch: () => {
      const next = queue.shift();
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    Date: FixedDate,
    setTimeout,
    clearTimeout,
    console,
  });
  vm.runInContext(stateSource, context);
  vm.runInContext(profileSource, context);
  vm.runInContext(relevanceSource, context);
  vm.runInContext(registrySource, context);
  vm.runInContext(appSource, context);
  await flush();
  return { context, window, document, app: window.__cyNewsAppTest, queue };
}

function addSubscription(app, document, keyword) {
  document.elements.kwInput.value = keyword;
  document.elements.kwForm.emit("submit");
}

async function testRepeatedAppOpens() {
  const storage = new MemoryStorage({ "cyNews.keywords": JSON.stringify(["考試"]) });
  const future = item("cysh-1", "2026-08-20T00:00:00Z", "期中考試程");
  const first = await createApp({ storage, responses: [response(dataOf([future]))], notification: makeNotification() });
  assert.equal(first.window.Notification.calls.length, 1);
  const secondNotification = makeNotification();
  const second = await createApp({ storage, responses: [response(dataOf([future]))], notification: secondNotification });
  assert.equal(secondNotification.calls.length, 0, "reopening PWA must not repeat delivery");
}

async function testRepeatedRefreshAndRender() {
  const storage = new MemoryStorage();
  const notification = makeNotification();
  const appRun = await createApp({
    storage,
    responses: [
      response(dataOf([])),
      response(dataOf([item("a", "2026-08-20T00:00:00Z", "考試")])),
      response(dataOf([item("a", "2026-08-20T00:00:00Z", "考試")])),
    ],
    notification,
  });
  addSubscription(appRun.app, appRun.document, "考試");
  await appRun.app.fetchData();
  assert.equal(notification.calls.length, 1);
  appRun.app.renderAll();
  assert.equal(notification.calls.length, 1, "renderAll must never notify");
  await appRun.app.fetchData();
  assert.equal(notification.calls.length, 1, "refreshing same data must not notify twice");
}

async function testArchiveDoesNotNotify() {
  const storage = new MemoryStorage();
  const notification = makeNotification();
  const appRun = await createApp({
    storage,
    responses: [
      response(dataOf([])),
      response({ items: [item("archive-1", "2026-08-20T00:00:00Z", "社團") ] }),
    ],
    notification,
  });
  addSubscription(appRun.app, appRun.document, "社團");
  appRun.app.ensureArchive();
  await flush();
  assert.equal(notification.calls.length, 0, "archive loading must never notify");
}

async function testSubscriptionBaselineAndLaterMatch() {
  const storage = new MemoryStorage();
  const notification = makeNotification();
  const oldMatch = item("old", "2026-08-18T00:00:00Z", "社團公告");
  const newMatch = item("new", "2026-08-20T00:00:00Z", "社團公告");
  const appRun = await createApp({ storage, responses: [response(dataOf([oldMatch]))], notification });
  addSubscription(appRun.app, appRun.document, "社團");
  assert.match(appRun.document.elements.subList.innerHTML, /社團公告/,
    "historical matches must remain visible after creating a subscription");
  assert.equal(notification.calls.length, 0, "new subscriptions must not notify historical matches");
  appRun.queue.push(response(dataOf([oldMatch, newMatch])));
  await appRun.app.fetchData();
  assert.equal(notification.calls.length, 1, "later matching announcements must notify");
}

async function testTwoKeywordsOneNotificationAndReadSeparate() {
  const storage = new MemoryStorage({ "cyNews.lastSeen": "2026-08-18T00:00:00Z" });
  const notification = makeNotification();
  const future = item("same", "2026-08-20T00:00:00Z", "考試社團");
  const appRun = await createApp({ storage, responses: [response(dataOf([]))], notification });
  addSubscription(appRun.app, appRun.document, "考試");
  addSubscription(appRun.app, appRun.document, "社團");
  appRun.queue.push(response(dataOf([future])));
  await appRun.app.fetchData();
  assert.equal(notification.calls.length, 1);
  assert.match(notification.calls[0].options.body, /有 1 則/);
  assert.equal(storage.getItem("cyNews.lastSeen"), "2026-08-18T00:00:00Z",
    "delivery must not mark an item read");
  const ids = JSON.parse(storage.getItem("cyNews.notificationState")).notifiedIds;
  assert.deepEqual(ids, ["same"]);
}

async function testWatermarkPreventsEvictedIdRedelivery() {
  const storage = new MemoryStorage();
  const notification = makeNotification();
  const articleA = item("A", "2026-08-20T00:00:00Z", "考試");
  const bulk = Array.from({ length: 501 }, (_, i) => item(
    "bulk-" + i,
    new Date(Date.parse("2026-08-21T00:00:00Z") + i * 1000).toISOString(),
    "考試",
  ));
  const appRun = await createApp({
    storage,
    responses: [response(dataOf([])), response(dataOf([articleA]))],
    notification,
  });
  addSubscription(appRun.app, appRun.document, "考試");
  await appRun.app.fetchData();
  assert.equal(notification.calls.length, 1);

  appRun.queue.push(response(dataOf(bulk)));
  await appRun.app.fetchData();
  const afterBulk = JSON.parse(storage.getItem("cyNews.notificationState"));
  assert.equal(afterBulk.notifiedIds.length, 500);
  assert.ok(!afterBulk.notifiedIds.includes("A"), "bulk delivery must evict A from the bounded ID list");
  const watermarkAfterBulk = afterBulk.notifiedThrough;

  appRun.queue.push(response(dataOf([articleA])));
  await appRun.app.fetchData();
  const afterReload = JSON.parse(storage.getItem("cyNews.notificationState"));
  assert.equal(notification.calls.length, 2, "evicted A must not be redelivered");
  assert.equal(afterReload.notifiedThrough, watermarkAfterBulk, "watermark must not move backwards");
}

async function testTabDoesNotResetDedupe() {
  const storage = new MemoryStorage({ "cyNews.keywords": JSON.stringify(["考試"]) });
  const notification = makeNotification();
  const future = item("tab-1", "2026-08-20T00:00:00Z", "考試");
  const appRun = await createApp({ storage, responses: [response(dataOf([future])), response(dataOf([future]))], notification });
  assert.equal(notification.calls.length, 1);
  appRun.document.elements.tabSub.emit("click");
  const afterTab = storage.getItem("cyNews.lastSeen");
  assert.ok(afterTab, "subscription tab may advance UI lastSeen");
  await appRun.app.fetchData();
  assert.equal(notification.calls.length, 1, "tab switching must not reset notification dedupe");
}

async function testUiFiltersNeverNotify() {
  const storage = new MemoryStorage({ "cyNews.keywords": JSON.stringify(["考試"]) });
  const notification = makeNotification();
  const future = item("filter-1", "2026-08-20T00:00:00Z", "考試");
  const appRun = await createApp({
    storage,
    responses: [
      response(dataOf([future])),
      response({ items: [item("archive-filter", "2026-08-20T00:00:00Z", "考試歷史")] }),
    ],
    notification,
  });
  assert.equal(notification.calls.length, 1);

  appRun.document.elements.q.value = "考試";
  appRun.document.elements.q.emit("input");
  await flush();
  appRun.document.elements.schoolSeg.emit("click", {
    target: { dataset: { school: "cysh" }, closest: () => ({ dataset: { school: "cysh" } }) },
  });
  appRun.document.elements.catChips.emit("click", {
    target: { dataset: { cat: "一般" }, closest: () => ({ dataset: { cat: "一般" } }) },
  });
  assert.equal(notification.calls.length, 1, "search and filters must never notify");
}

async function testLegacyMigration() {
  const legacyKeywords = JSON.stringify(["考試", "社團"]);
  const storage = new MemoryStorage({
    "cyNews.keywords": legacyKeywords,
    "cyNews.lastSeen": "2026-08-18T00:00:00Z",
  });
  const { api } = loadStateApi(storage);
  const state = api.load({ storage, now: new FixedDate(), idFactory: (() => {
    let n = 0; return () => "legacy-" + (++n);
  })() });
  assert.equal(state.version, 3);
  assert.deepEqual(Array.from(state.subscriptions, (s) => s.keyword), ["考試", "社團"]);
  assert.ok(state.subscriptions.every((s) => s.createdAt === "2026-08-19T00:00:00.000Z"));
  assert.equal(state.notifiedThrough, "2026-08-19T00:00:00.000Z");
  assert.equal(storage.getItem("cyNews.keywords"), legacyKeywords);
  assert.equal(storage.getItem("cyNews.lastSeen"), "2026-08-18T00:00:00Z");
  api.removeSubscription(state, state.subscriptions[0].id);
  api.save(state, storage);
  const reloaded = api.load({ storage });
  assert.deepEqual(Array.from(reloaded.subscriptions, (s) => s.keyword), ["社團"],
    "legacy keywords must not recreate deleted V2 subscriptions");
}

function testV2MigrationPreservesIds() {
  const v2 = {
    version: 2,
    subscriptions: [{ id: "sub-existing", keyword: "考試", createdAt: "2026-08-18T00:00:00Z" }],
    notifiedIds: ["already-sent"],
  };
  const storage = new MemoryStorage({
    "cyNews.notificationState": JSON.stringify(v2),
    "cyNews.keywords": JSON.stringify(["社團"]),
  });
  const { api } = loadStateApi(storage);
  const state = api.load({ storage, now: new FixedDate() });
  assert.equal(state.version, 3);
  assert.deepEqual(Array.from(state.notifiedIds), ["already-sent"]);
  assert.equal(state.notifiedThrough, "2026-08-19T00:00:00.000Z");
  assert.deepEqual(Array.from(state.subscriptions, (s) => s.keyword), ["考試"],
    "V2 subscriptions remain authoritative over legacy keywords");
}

function testNewSubscriptionKeepsCreatedAtBaseline() {
  const storage = new MemoryStorage();
  const { api } = loadStateApi(storage);
  const state = {
    version: 3,
    subscriptions: [],
    notifiedIds: [],
    notifiedThrough: "2026-08-19T00:00:00Z",
  };
  api.addSubscription(state, "考試", {
    now: new FixedDate("2026-08-21T00:00:00Z"),
    idFactory: () => "new-sub",
  });
  const candidates = api.findCandidates([
    item("before-sub", "2026-08-20T00:00:00Z", "考試"),
    item("after-sub", "2026-08-22T00:00:00Z", "考試"),
  ], state);
  assert.deepEqual(Array.from(candidates, (it) => it.id), ["after-sub"],
    "a new subscription must use its later createdAt baseline, not revive history");
}

function testNotifiedIdsCap() {
  const storage = new MemoryStorage();
  const { api } = loadStateApi(storage);
  const state = api.load({ storage, idFactory: () => "one" });
  api.markNotified(state, Array.from({ length: 501 }, (_, i) => "id-" + i), storage);
  assert.equal(state.notifiedIds.length, 500);
  assert.equal(state.notifiedIds[0], "id-1");
  assert.equal(state.notifiedIds[499], "id-500");
}

async function testCacheDoesNotNotify() {
  const storage = new MemoryStorage({ "cyNews.keywords": JSON.stringify(["考試"]) });
  const future = item("cached", "2026-08-20T00:00:00Z", "考試");
  const cachedNotification = makeNotification();
  const cached = await createApp({
    storage,
    responses: [response(dataOf([future]), "cache")],
    notification: cachedNotification,
    controller: {},
  });
  assert.equal(cachedNotification.calls.length, 0, "cache/offline data must not notify");
}

async function testPermissionFailureDoesNotPersist() {
  const storage = new MemoryStorage({ "cyNews.keywords": JSON.stringify(["考試"]) });
  const notification = makeNotification({ throwOnCreate: true });
  await createApp({
    storage,
    responses: [response(dataOf([item("fail", "2026-08-20T00:00:00Z", "考試")]), "network")],
    notification,
  });
  const state = JSON.parse(storage.getItem("cyNews.notificationState"));
  assert.deepEqual(state.notifiedIds, []);
  assert.equal(state.notifiedThrough, "2026-08-19T00:00:00.000Z",
    "a failed Notification must not advance the watermark");
}

async function testPersonalizedStrongMatchAndReasons() {
  const storage = new MemoryStorage();
  const notification = makeNotification();
  const appRun = await createApp({ storage, responses: [response(dataOf([]))], notification });
  const state = appRun.app.getState();
  state.profile = { schema_version: 1, school_id: "cysh", grade_level: 1, class_name: "109", interests: [], tracked_categories: [], tracked_keywords: [] };
  state.personalizedNotifications = true;
  appRun.app.getNotificationState().personalizedThrough = "2026-08-19T00:00:00Z";
  appRun.queue.push(response(dataOf([item("personal-strong", "2026-08-20T00:00:00Z", "高一 109班 物理競賽")])));
  await appRun.app.fetchData();
  assert.equal(notification.calls.length, 1);
  assert.match(notification.calls[0].options.body, /與你相關/);
  const stateOnDisk = JSON.parse(storage.getItem("cyNews.notificationState"));
  assert.equal(stateOnDisk.personalizedThrough, "2026-08-20T00:00:00Z");
}

async function testPersonalizedDifferentSchoolAndClass() {
  const storage = new MemoryStorage();
  const notification = makeNotification();
  const appRun = await createApp({ storage, responses: [response(dataOf([]))], notification });
  const state = appRun.app.getState();
  state.profile = { schema_version: 1, school_id: "cysh", grade_level: 1, class_name: "109", interests: [], tracked_categories: [], tracked_keywords: [] };
  state.personalizedNotifications = true;
  appRun.app.getNotificationState().personalizedThrough = "2026-08-19T00:00:00Z";
  appRun.queue.push(response(dataOf([Object.assign(item("personal-other-school", "2026-08-20T00:00:00Z", "高一 109班 物理競賽"), { school: "cygsh", school_name: "嘉女" })])));
  await appRun.app.fetchData();
  assert.equal(notification.calls.length, 0, "different school must not qualify");

  const second = await createApp({ storage: new MemoryStorage(), responses: [response(dataOf([]))], notification: makeNotification() });
  const secondState = second.app.getState();
  secondState.profile = state.profile;
  secondState.personalizedNotifications = true;
  second.app.getNotificationState().personalizedThrough = "2026-08-19T00:00:00Z";
  second.queue.push(response(dataOf([item("personal-class", "2026-08-20T00:00:00Z", "校內活動 109班")])));
  await second.app.fetchData();
  assert.equal(second.window.Notification.calls.length, 1, "explicit class must qualify");
}

async function testPersonalizedBaselineAndDedup() {
  const storage = new MemoryStorage({ "cyNews.keywords": JSON.stringify(["物理競賽"]) });
  const notification = makeNotification();
  const appRun = await createApp({ storage, responses: [response(dataOf([]))], notification });
  const state = appRun.app.getState();
  state.profile = { schema_version: 1, school_id: "cysh", grade_level: 1, class_name: "", interests: [], tracked_categories: [], tracked_keywords: [] };
  state.personalizedNotifications = true;
  appRun.app.getNotificationState().personalizedThrough = "2026-08-19T00:00:00Z";
  appRun.queue.push(response(dataOf([
    item("personal-dedup", "2026-08-20T00:00:00Z", "高一物理競賽報名"),
  ])));
  await appRun.app.fetchData();
  assert.equal(notification.calls.length, 1, "keyword + profile must produce one delivery");
  const ids = JSON.parse(storage.getItem("cyNews.notificationState")).notifiedIds;
  assert.deepEqual(ids, ["personal-dedup"]);

  const old = item("personal-old", "2026-08-18T00:00:00Z", "高二物理競賽");
  const noFloodNotification = makeNotification();
  const noFlood = await createApp({ storage: new MemoryStorage(), responses: [response(dataOf([old]))], notification: noFloodNotification });
  const noFloodState = noFlood.app.getState();
  noFloodState.profile = { schema_version: 1, school_id: "cysh", grade_level: 2, class_name: "", interests: [], tracked_categories: [], tracked_keywords: [] };
  noFloodState.personalizedNotifications = true;
  noFlood.app.getNotificationState().personalizedThrough = "2026-08-20T00:00:00Z";
  noFlood.queue.push(response(dataOf([old])));
  await noFlood.app.fetchData();
  assert.equal(noFloodNotification.calls.length, 0, "profile enable/change must not flood history");
}

function testServiceWorkerContract() {
  assert.match(appSource, /isExplicitlyImportant/);
  assert.match(appSource, /data-read-id/);
  assert.match(appSource, /read\.upsert/);
  assert.match(appSource, /it\.date is publication date/);
  assert.match(swSource, /cy-news-v30/);
  assert.match(swSource, /addEventListener\("push"/);
  assert.match(swSource, /showNotification/);
  assert.match(swSource, /addEventListener\("notificationclick"/);
  assert.match(swSource, /Never cache auth callback URLs/);
  assert.match(swSource, /\.\/profile\.js/);
  assert.match(swSource, /\.\/relevance\.js/);
  assert.doesNotMatch(swSource, /cy-news-v19/);
  assert.match(swSource, /\.\/notification-state\.js/);
  assert.match(swSource, /\.\/calendar-state\.js/);
  assert.match(swSource, /\.\/supabase-sync\.js/);
  assert.match(swSource, /\.\/account-auth\.js/);
  assert.match(swSource, /\.\/account-sync\.js/);
  assert.match(swSource, /\.\/task-state\.js/);
  assert.match(swSource, /\.\/today\.js/);
  assert.match(swSource, /searchParams\.has\("code"\)/);
  assert.match(swSource, /searchParams\.has\("access_token"\)/);
  assert.match(swSource, /searchParams\.has\("refresh_token"\)/);
  assert.match(swSource, /url\.origin !== location\.origin/);
  assert.match(swSource, /Never cache auth callback URLs or token-bearing query strings/);
  assert.match(swSource, /X-CyNews-Data-Source/);
  assert.match(swSource, /markDataSource\(res, "network"\)/);
  assert.match(swSource, /markDataSource\(hit, "cache"\)/);
}

(async function () {
  await testRepeatedAppOpens();
  await testRepeatedRefreshAndRender();
  await testArchiveDoesNotNotify();
  await testSubscriptionBaselineAndLaterMatch();
  await testTwoKeywordsOneNotificationAndReadSeparate();
  await testWatermarkPreventsEvictedIdRedelivery();
  await testTabDoesNotResetDedupe();
  await testUiFiltersNeverNotify();
  await testLegacyMigration();
  testV2MigrationPreservesIds();
  testNewSubscriptionKeepsCreatedAtBaseline();
  testNotifiedIdsCap();
  await testCacheDoesNotNotify();
  await testPermissionFailureDoesNotPersist();
  await testPersonalizedStrongMatchAndReasons();
  await testPersonalizedDifferentSchoolAndClass();
  await testPersonalizedBaselineAndDedup();
  testServiceWorkerContract();
  console.log("PWA Notification V3 tests passed (11 acceptance areas + guards)");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

