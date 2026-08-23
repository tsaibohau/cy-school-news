/* Optional lazy Supabase Auth bridge. Anonymous site behavior is independent. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsAccountAuth = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var CLIENT_VERSION = "2.112.3";
  var CLIENT_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@" + CLIENT_VERSION + "/+esm";
  function verifiedSession(client) {
    return client.auth.getSession().then(function (result) {
      if (result.error) throw result.error;
      var session = result.data && result.data.session;
      var uid = session && session.user && session.user.id;
      if (typeof uid !== "string" || !uid.trim()) return null;
      return session;
    });
  }
  function verifiedUid(client) { return verifiedSession(client).then(function (session) { return session && session.user.id; }); }
  function normalizeAppUrl(value, allowCallbackParameters) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      var url = new URL(value);
      if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || (!allowCallbackParameters && (url.search || url.hash))) return null;
      var pathname = url.pathname || "/";
      if (!pathname.endsWith("/")) pathname += "/";
      return url.origin + pathname;
    } catch (_) {
      return null;
    }
  }
  function approvedRedirect(config, locationLike) {
    config = config || {};
    var configured = Array.isArray(config.allowedRedirectUrls) ? config.allowedRedirectUrls.slice() : [];
    /* Preserve compatibility with already deployed configuration while making
       the exact allow-list the canonical source for new environments. */
    configured.push(config.productionRedirectUrl, config.localhostRedirectUrl, config.stagingRedirectUrl);
    var allowed = configured.map(function (url) { return normalizeAppUrl(url, false); }).filter(function (url, index, all) {
      return !!url && all.indexOf(url) === index;
    });
    var current = locationLike || (typeof window !== "undefined" ? window.location : null);
    var currentUrl = normalizeAppUrl(current && typeof current.href === "string" ? current.href : "", true);
    return currentUrl && allowed.find(function (url) { return url === currentUrl; }) || null;
  }
  function createController(options) {
    options = options || {};
    var config = options.config || (typeof window !== "undefined" && window.CYNEWS_ACCOUNT_CONFIG) || {};
    var client = options.client || null;
    var clientPromise = null;
    var loader = options.loader || function () {
      if (!config.supabaseUrl || !config.supabaseAnonKey) return Promise.reject(new Error("Supabase not configured"));
      return import(CLIENT_URL).then(function (mod) {
        return mod.createClient(config.supabaseUrl, config.supabaseAnonKey);
      });
    };
    function getClient() {
      if (client) return Promise.resolve(client);
      if (clientPromise) return clientPromise;
      clientPromise = Promise.resolve().then(loader).then(function (loaded) {
        client = loaded && loaded.createClient ? loaded.createClient(config.supabaseUrl, config.supabaseAnonKey) : loaded;
        if (!client) throw new Error("Supabase client initialization returned no client");
        return client;
      }).catch(function (error) {
        clientPromise = null;
        throw error;
      });
      return clientPromise;
    }
    return {
      clientVersion: CLIENT_VERSION,
      clientUrl: CLIENT_URL,
      isConfigured: function () { return !!(config.supabaseUrl && config.supabaseAnonKey); },
      getClient: getClient,
      getVerifiedSession: function () { return getClient().then(verifiedSession); },
      getVerifiedUid: function () { return getClient().then(verifiedUid); },
      getApprovedRedirectTo: function () { return approvedRedirect(config, options.location); },
      signInWithGoogle: function (signInOptions) {
        signInOptions = signInOptions || {};
        var redirectTo = approvedRedirect(config, options.location);
        if (!redirectTo) return Promise.reject(new Error("current app URL is not allow-listed"));
        return getClient().then(function (c) {
          var oauthOptions = { redirectTo: redirectTo };
          if (signInOptions.forceAccountChooser) oauthOptions.queryParams = { prompt: "select_account" };
          return c.auth.signInWithOAuth({ provider: "google", options: oauthOptions });
        });
      },
      signOut: function () {
        return getClient().then(function (c) { return c.auth.signOut(); });
      },
      onAuthStateChange: function (callback) {
        return getClient().then(function (c) { return c.auth.onAuthStateChange(callback); });
      },
    };
  }
  return { CLIENT_VERSION: CLIENT_VERSION, CLIENT_URL: CLIENT_URL, verifiedSession: verifiedSession, verifiedUid: verifiedUid, normalizeAppUrl: normalizeAppUrl, approvedRedirect: approvedRedirect, createController: createController };
});
