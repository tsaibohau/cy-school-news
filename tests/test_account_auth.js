const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Auth = require("../docs/account-auth.js");

const production = "https://tsaibohau.github.io/cy-school-news/";
const localhost = "http://127.0.0.1:8266/";
let oauthRequest = null;
const client = {
  auth: {
    getSession() {
      return Promise.resolve({
        data: { session: { user: { id: "verified-session-id", email: "ignored@example.test" } } },
        error: null,
      });
    },
    signInWithOAuth(request) {
      oauthRequest = request;
      return Promise.resolve({ data: { provider: request.provider }, error: null });
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
  },
  location: { href: localhost },
});

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
assert.equal(typeof controller.getVerifiedSession, "function");
assert.equal(controller.sendMagicLink, undefined, "Magic Link is deferred and cannot bypass redirect allowlist");

controller.signInWithGoogle().then(async () => {
  assert.deepEqual(oauthRequest, {
    provider: "google",
    options: { redirectTo: localhost },
  });

  const session = await Auth.verifiedSession(client);
  assert.equal(session.user.id, "verified-session-id");
  assert.equal(await controller.getVerifiedUid(), "verified-session-id");
  const emailOnlyClient = { auth: { getSession: () => Promise.resolve({ data: { session: { user: { email: "email-only@example.test" } } }, error: null }) } };
  assert.equal(await Auth.verifiedUid(emailOnlyClient), null, "email cannot determine account ownership");

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
  const app = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");
  assert(index.includes("使用 Google 登入"));
  assert(!index.includes("accountEmail"));
  assert(!app.includes("sendMagicLink"));
  assert(app.includes("getVerifiedSession"));
  assert(app.includes("auth.signOut()"));
  assert(app.includes("restoreAnonymous();"));
  assert(app.includes("syncGeneration += 1;"));
  assert(app.includes("if (!auth.isConfigured())"));
  assert.equal(Auth.createController({ config: {} }).isConfigured(), false);
  console.log("Google OAuth account auth tests passed");
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
