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
      var token = session && session.access_token;
      /* A session-shaped object in storage is not sufficient for ownership.
         Re-check it with Auth before beginning any account-owned sync. */
      if (typeof uid !== "string" || !uid.trim() || typeof token !== "string" || !token) return null;
      if (typeof client.auth.getUser !== "function") throw new Error("Supabase Auth verification unavailable");
      return client.auth.getUser(token).then(function (verified) {
        if (verified.error) throw verified.error;
        var user = verified.data && verified.data.user;
        if (!user || user.id !== uid) throw new Error("verified session identity changed");
        session.user = user;
        return session;
      });
    });
  }
  function verifiedUid(client) { return verifiedSession(client).then(function (session) { return session && session.user.id; }); }
  function normalizeNickname(value) {
    return String(value == null ? "" : value).replace(/[\t\r\n]+/g, " ")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 32);
  }
  function displayName(user) {
    user = user && typeof user === "object" ? user : {};
    var metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
    var nickname = normalizeNickname(metadata.nickname);
    if (nickname) return nickname;
    var providerName = normalizeNickname(metadata.given_name || metadata.full_name || metadata.name);
    if (providerName) return providerName;
    var email = String(user.email || "").trim();
    return normalizeNickname(email.split("@")[0]);
  }
  function displayEmail(user) {
    var email = String(user && user.email || "").replace(/[\t\r\n\u0000-\u001f\u007f]+/g, "").trim();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(email) ? email : "";
  }
  function normalizeEmail(value) {
    var email = String(value == null ? "" : value).replace(/[\t\r\n\u0000-\u001f\u007f]+/g, "").trim().toLowerCase();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  }
  function validPassword(value) {
    /* This is a usability floor, not the password policy. Supabase Auth remains
       the authority and must have leaked-password protection enabled before production. */
    return typeof value === "string" && value.length >= 12 && value.length <= 72;
  }
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
      signInWithPassword: function (email, password) {
        email = normalizeEmail(email);
        if (!email || !validPassword(password)) return Promise.reject(new Error("invalid email or password"));
        return getClient().then(function (c) {
          return c.auth.signInWithPassword({ email: email, password: password }).then(function (result) {
            if (result.error) throw result.error;
            return result.data || {};
          });
        });
      },
      signUpWithPassword: function (email, password, nickname) {
        email = normalizeEmail(email);
        nickname = normalizeNickname(nickname);
        if (!email || !validPassword(password)) return Promise.reject(new Error("invalid email or password"));
        var redirectTo = approvedRedirect(config, options.location);
        if (!redirectTo) return Promise.reject(new Error("current app URL is not allow-listed"));
        return getClient().then(function (c) {
          var signUpOptions = { emailRedirectTo: redirectTo };
          if (nickname) signUpOptions.data = { nickname: nickname };
          return c.auth.signUp({ email: email, password: password, options: signUpOptions }).then(function (result) {
            if (result.error) throw result.error;
            return result.data || {};
          });
        });
      },
      signOut: function () {
        return getClient().then(function (c) { return c.auth.signOut(); });
      },
      updateNickname: function (value) {
        var nickname = normalizeNickname(value);
        if (!nickname) return Promise.reject(new Error("nickname required"));
        return getClient().then(function (c) {
          return c.auth.updateUser({ data: { nickname: nickname } }).then(function (result) {
            if (result.error) throw result.error;
            return result.data && result.data.user;
          });
        });
      },
      onAuthStateChange: function (callback) {
        return getClient().then(function (c) {
          return c.auth.onAuthStateChange(function (event, session) {
            /* GoTrue is still committing an OAuth session when it emits SIGNED_IN.
               Defer app work one turn so subsequent database requests inherit the
               completed authenticated client session rather than an interim state. */
            setTimeout(function () { callback(event, session); }, 0);
          });
        });
      },
    };
  }
  return { CLIENT_VERSION: CLIENT_VERSION, CLIENT_URL: CLIENT_URL, verifiedSession: verifiedSession, verifiedUid: verifiedUid,
    normalizeNickname: normalizeNickname, normalizeEmail: normalizeEmail, validPassword: validPassword, displayName: displayName, displayEmail: displayEmail, normalizeAppUrl: normalizeAppUrl,
    approvedRedirect: approvedRedirect, createController: createController };
});
