/* Optional lazy Supabase Auth bridge. Anonymous site behavior is independent. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsAccountAuth = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var CLIENT_VERSION = "2.112.3";
  var CLIENT_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@" + CLIENT_VERSION + "/+esm";
  function verifiedUid(client) {
    return client.auth.getSession().then(function (result) {
      if (result.error) throw result.error;
      var session = result.data && result.data.session;
      var uid = session && session.user && session.user.id;
      if (typeof uid !== "string" || !uid.trim()) return null;
      return uid;
    });
  }
  function createController(options) {
    options = options || {};
    var config = options.config || (typeof window !== "undefined" && window.CYNEWS_ACCOUNT_CONFIG) || {};
    var client = options.client || null;
    var loader = options.loader || function () {
      if (!config.supabaseUrl || !config.supabaseAnonKey) return Promise.reject(new Error("Supabase not configured"));
      return import(CLIENT_URL).then(function (mod) {
        return mod.createClient(config.supabaseUrl, config.supabaseAnonKey);
      });
    };
    function getClient() {
      if (client) return Promise.resolve(client);
      return loader().then(function (loaded) { client = loaded && loaded.createClient ? loaded.createClient(config.supabaseUrl, config.supabaseAnonKey) : loaded; return client; });
    }
    return {
      clientVersion: CLIENT_VERSION,
      clientUrl: CLIENT_URL,
      getClient: getClient,
      getVerifiedUid: function () { return getClient().then(verifiedUid); },
      sendMagicLink: function (email, redirectTo) {
        return getClient().then(function (c) {
          return c.auth.signInWithOtp({ email: String(email || "").trim(), options: { emailRedirectTo: redirectTo || location.href } });
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
  return { CLIENT_VERSION: CLIENT_VERSION, CLIENT_URL: CLIENT_URL, verifiedUid: verifiedUid, createController: createController };
});
