const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Auth = require("../docs/account-auth.js");

const production = "https://tsaibohau.github.io/cy-school-news/";
const localhost = "http://127.0.0.1:8266/";
const staging = "https://cy-school-news-staging.vercel.app/";
let oauthRequest = null;
let userUpdateRequest = null;
const client = {
  auth: {
    getSession() {
      return Promise.resolve({
        data: { session: { access_token: "test-access-token", user: { id: "verified-session-id", email: "ignored@example.test" } } },
        error: null,
      });
    },
    getUser(token) {
      assert.equal(token, "test-access-token");
      return Promise.resolve({ data: { user: { id: "verified-session-id", email: "student@example.test" } }, error: null });
    },
    signInWithOAuth(request) {
      oauthRequest = request;
      return Promise.resolve({ data: { provider: request.provider }, error: null });
    },
    updateUser(request) {
      userUpdateRequest = request;
      return Promise.resolve({ data: { user: { id: "verified-session-id", user_metadata: request.data } }, error: null });
    },
  },
};

const controller = Auth.createController({
  client,
  config: {
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "publishable-test-key",
    productionRedirectUrl: production,
    localhostRedirectUrl: localhost,
    stagingRedirectUrl: staging,
    allowedRedirectUrls: [production, localhost, staging],
  },
  location: { href: localhost },
});

async function singletonAndRetryChecks() {
  let loaderCalls = 0;
  let createCalls = 0;
  const singletonClient = { auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) } };
  const singleton = Auth.createController({
    config: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "publishable-test-key" },
    loader: () => { loaderCalls += 1; return new Promise(resolve => setTimeout(() => resolve({ createClient: () => { createCalls += 1; return singletonClient; } }), 5)); },
  });
  const clients = await Promise.all([singleton.getClient(), singleton.getClient(), singleton.getClient()]);
  assert.equal(loaderCalls, 1, "concurrent getClient calls invoke the loader once");
  assert.equal(createCalls, 1, "concurrent getClient calls create one client");
  assert.strictEqual(clients[0], clients[1]);
  assert.strictEqual(clients[1], clients[2]);

  let failures = 0;
  let retryLoaderCalls = 0;
  const retryClient = Auth.createController({
    config: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "publishable-test-key" },
    loader: () => {
      retryLoaderCalls += 1;
      if (retryLoaderCalls === 1) return Promise.reject(new Error("temporary loader failure"));
      return Promise.resolve({ auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) } });
    },
    updateUser(request) {
      userUpdateRequest = request;
      return Promise.resolve({ data: { user: { id: "verified-session-id", user_metadata: request.data } }, error: null });
    },
  });
  await assert.rejects(retryClient.getClient(), error => { failures += 1; return /temporary/.test(error.message); });
  assert.ok(await retryClient.getClient());
  assert.equal(failures, 1);
  assert.equal(retryLoaderCalls, 2, "failed initialization resets the memoized promise for one retry");
}

assert.equal(controller.getApprovedRedirectTo(), localhost);
assert.equal(Auth.normalizeAppUrl(localhost + "?code=oauth"), null);
assert.equal(Auth.normalizeAppUrl("https://tsaibohau.github.io/cy-school-news.evil/"), "https://tsaibohau.github.io/cy-school-news.evil/");
assert.equal(Auth.normalizeAppUrl("not a URL"), null);
const productionController = Auth.createController({
  client,
  config: { supabaseUrl: "x", supabaseAnonKey: "y", productionRedirectUrl: production, localhostRedirectUrl: localhost },
  location: { href: production },
});
assert.equal(productionController.getApprovedRedirectTo(), production);
const stagingController = Auth.createController({
  client,
  config: { supabaseUrl: "x", supabaseAnonKey: "y", allowedRedirectUrls: [production, staging] },
  location: { href: staging + "?acceptance=user-tasks&code=oauth" },
});
assert.equal(stagingController.getApprovedRedirectTo(), staging, "staging callback parameters normalize to exact staging root");
const unlistedVercel = Auth.createController({
  client,
  config: { supabaseUrl: "x", supabaseAnonKey: "y", allowedRedirectUrls: [staging] },
  location: { href: "https://cy-school-news-staging-git-work.example.vercel.app/" },
});
assert.equal(unlistedVercel.getApprovedRedirectTo(), null, "per-commit preview domains are not OAuth allow-listed");
assert.equal(typeof controller.getVerifiedSession, "function");
assert.equal(controller.sendMagicLink, undefined, "Magic Link is deferred and cannot bypass redirect allowlist");

singletonAndRetryChecks().then(() => controller.signInWithGoogle()).then(async () => {
  assert.deepEqual(oauthRequest, {
    provider: "google",
    options: { redirectTo: localhost },
  });

  await controller.signInWithGoogle({ forceAccountChooser: true });
  assert.deepEqual(oauthRequest, {
    provider: "google",
    options: { redirectTo: localhost, queryParams: { prompt: "select_account" } },
  });

  await stagingController.signInWithGoogle({ forceAccountChooser: true });
  assert.deepEqual(oauthRequest, {
    provider: "google",
    options: { redirectTo: staging, queryParams: { prompt: "select_account" } },
  });

  const session = await Auth.verifiedSession(client);
  assert.equal(session.user.id, "verified-session-id");
  assert.equal(await controller.getVerifiedUid(), "verified-session-id");
  assert.equal(Auth.normalizeNickname("  Hau\nTest  "), "Hau Test");
  assert.equal(Auth.displayName({ user_metadata: { nickname: "Hau" }, email: "ignored@example.test" }), "Hau");
  assert.equal(Auth.displayName({ user_metadata: { given_name: "Bo" }, email: "ignored@example.test" }), "Bo");
  assert.equal(Auth.displayEmail({ email: " student@example.test\n" }), "student@example.test");
  assert.equal(Auth.displayEmail({ email: "not-an-email" }), "");
  const updatedUser = await controller.updateNickname("  Hau  ");
  assert.deepEqual(userUpdateRequest, { data: { nickname: "Hau" } });
  assert.equal(updatedUser.user_metadata.nickname, "Hau");
  await assert.rejects(controller.updateNickname("   "), /nickname required/);
  const emailOnlyClient = { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "test-access-token", user: { email: "email-only@example.test" } } }, error: null }), getUser: () => Promise.resolve({ data: { user: null }, error: null }) } };
  assert.equal(await Auth.verifiedUid(emailOnlyClient), null, "email cannot determine account ownership");

  const mismatchedIdentityClient = { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "test-access-token", user: { id: "claimed-id" } } }, error: null }), getUser: () => Promise.resolve({ data: { user: { id: "different-verified-id" } }, error: null }) } };
  await assert.rejects(Auth.verifiedSession(mismatchedIdentityClient), /identity changed/);

  const callbackWithClaimedUuid = Auth.createController({
    client,
    config: { supabaseUrl: "x", supabaseAnonKey: "y", localhostRedirectUrl: localhost },
    location: { href: localhost + "?user_id=attacker-claimed-id" },
  });
  const verified = await callbackWithClaimedUuid.getVerifiedSession();
  assert.equal(verified.user.id, "verified-session-id", "callback URL UUID cannot become account identity");
  assert.notEqual(verified.user.id, "attacker-claimed-id");
  const callbackRedirect = Auth.createController({
    client,
    config: { supabaseUrl: "x", supabaseAnonKey: "y", localhostRedirectUrl: localhost },
    location: { href: localhost + "?code=oauth" },
  });
  assert.equal(callbackRedirect.getApprovedRedirectTo(), localhost, "OAuth callback parameters normalize to the app root");

  const unapproved = Auth.createController({
    client,
    config: { supabaseUrl: "x", supabaseAnonKey: "y", localhostRedirectUrl: localhost },
    location: { href: "https://evil.example/" },
  });
  assert.equal(unapproved.getApprovedRedirectTo(), null);
  await assert.rejects(unapproved.signInWithGoogle(), /allow-listed/);
  const lookalike = Auth.createController({
    client,
    config: { supabaseUrl: "x", supabaseAnonKey: "y", localhostRedirectUrl: localhost },
    location: { href: "http://127.0.0.1:8266.evil.example/" },
  });
  assert.equal(lookalike.getApprovedRedirectTo(), null);
  const malformed = Auth.createController({
    client,
    config: { supabaseUrl: "x", supabaseAnonKey: "y", localhostRedirectUrl: localhost },
    location: { href: "%%%" },
  });
  assert.equal(malformed.getApprovedRedirectTo(), null);

  const index = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(__dirname, "..", "docs", "sw.js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");
  assert(index.includes("使用 Google 登入"));
  assert(index.includes('src="account-sync.js?v=41"'), "index must load versioned Account Sync before app.js");
  assert(index.includes('src="account-config.js?v=41"'), "index must load versioned account config");
  assert(index.includes('src="account-auth.js?v=41"'), "index must load versioned account auth");
  assert(sw.includes('"./account-sync.js?v=41"'), "Service Worker shell must cache versioned Account Sync");
  assert(index.includes('id="accountEmail"'));
  assert(app.includes('"登入信箱：" + email'));
  assert(!app.includes("sendMagicLink"));
  assert(app.includes("getVerifiedSession"));
  assert(app.indexOf("auth.onAuthStateChange") < app.indexOf("auth.getClient().then(function () { return handleVerifiedSession(); })"), "OAuth listener subscribes before the initial session read");
  assert(app.includes("authRetry === 0"), "OAuth callback sync has one bounded credential-hydration retry");
  assert(app.includes("auth.signOut()"));
  assert(app.includes("restoreAnonymous();"));
  assert(app.includes("syncGeneration += 1;"));
  assert(app.includes("accountSwitch"));
  assert(app.includes("同步待完成"));
  assert(app.includes("已登入・同步中"));
  assert(app.includes("已登入・同步待完成"));
  assert(sw.includes("cy-news-v53"), "Service Worker cache must advance for the current app shell");
  assert(app.includes('register("sw.js?v=41")'), "App and Service Worker must use one shell version");
  assert(app.includes("if (!auth.isConfigured())"));
  assert.equal(Auth.createController({ config: {} }).isConfigured(), false);
  console.log("Google OAuth account auth tests passed");
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});

