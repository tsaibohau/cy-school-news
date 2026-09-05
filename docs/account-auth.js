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
  function normalizeUsername(value) {
    var username = String(value == null ? "" : value).trim().toLowerCase();
    return /^[a-z][a-z0-9_]{2,31}$/.test(username) ? username : "";
  }
  function validPassword(value) {
    /* This is a usability floor, not the password policy. Supabase Auth remains
       the authority and must have leaked-password protection enabled before production. */
    return typeof value === "string" && value.length >= 6 && value.length <= 72;
  }
  function signUpErrorMessage(error) {
    var code = error && error.code;
    if (code === "invalid_username") return "帳號名稱須為 3～32 個字元，以英文字母開頭，只能使用英文字母、數字與底線，例如 hau_115。";
    if (code === "invalid_email" || code === "email_address_invalid") return "請填寫有效的救援 Email。";
    if (code === "invalid_password") return "密碼須為 6～72 個字元。";
    if (code === "23505") return "Email 帳號已建立，但帳號名稱無法啟用，請聯絡管理員處理，不必重複註冊。";
    if (code === "weak_password") return "密碼未符合帳號服務的要求，請換一組密碼；若已滿 6 個字元仍失敗，請回報管理員。";
    if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || (error && error.status === 429)) return "操作太頻繁，請稍後再試，不必更換帳號名稱。";
    if (code === "email_address_not_authorized") return "目前驗證信服務尚未開放寄送到這個 Email，請聯絡管理員處理。";
    if (code === "signup_disabled") return "目前暫停新帳號註冊，請聯絡管理員。";
    if (code === "user_already_exists" || code === "email_exists") return "這個 Email 已註冊，請登入或使用忘記密碼。";
    if (error && error.message === "current app URL is not allow-listed") return "這個測試網址尚未開放註冊，請使用已設定的測試站網址。";
    return "註冊暫時失敗，請稍後再試；若持續發生，請回報管理員。這不代表帳號名稱已被使用。";
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
    if (!currentUrl || allowed.indexOf(currentUrl) === -1) return null;
    var callback = config.callbackRedirects && config.callbackRedirects[currentUrl];
    if (callback) {
      callback = normalizeAppUrl(callback, false);
      return callback && allowed.indexOf(callback) !== -1 ? callback : null;
    }
    return currentUrl;
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
      signInWithIdentifier: function (identifier, password) {
        var email = normalizeEmail(identifier);
        if (email) return this.signInWithPassword(email, password);
        return this.signInWithUsername(identifier, password);
      },
      getAdminAccounts: function (filters) {
        filters = filters || {};
        return getClient().then(function (c) { return c.rpc("admin_list_account_access", {
          search_text: String(filters.search || "").trim().slice(0, 120),
          status_filter: filters.status || "all",
          role_filter: filters.role || "all",
          service_filter: filters.service || "all",
          page_size: Math.min(100, Math.max(1, Number(filters.limit) || 50)),
          page_offset: Math.max(0, Number(filters.offset) || 0),
        }).then(function (result) { if (result.error) throw result.error; return result.data || []; }); });
      },
      updateAccountAccess: function (userId, status, serviceLevel) {
        return getClient().then(function (c) { return c.rpc("admin_update_account", { target_user_id: userId, next_status: status, next_service_level: serviceLevel }).then(function (result) { if (result.error) throw result.error; }); });
      },
      setAdminRole: function (userId, role) {
        return getClient().then(function (c) { return c.rpc("owner_set_admin_role", { target_user_id: userId, next_role: role }).then(function (result) { if (result.error) throw result.error; }); });
      },
      requestAccountAccess: function () {
        return getClient().then(function (c) { return c.rpc("request_account_access").then(function (result) { if (result.error) throw result.error; return result.data; }); });
      },
      getAccountAccess: function () {
        return getClient().then(function (c) {
          return c.rpc("current_account_access").then(function (result) {
            if (result.error) throw result.error;
            var row = Array.isArray(result.data) ? result.data[0] : result.data;
            if (!row || typeof row.status !== "string") throw new Error("account access unavailable");
            return row;
          });
        });
      },
      resetPasswordForEmail: function (email) {
        email = normalizeEmail(email);
        var redirectTo = approvedRedirect(config, options.location);
        if (!email || !redirectTo) return Promise.reject(new Error("invalid email or redirect"));
        return getClient().then(function (c) {
          return c.auth.resetPasswordForEmail(email, { redirectTo: redirectTo }).then(function (result) {
            if (result.error) throw result.error;
            return result.data || {};
          });
        });
      },
      updatePassword: function (password) {
        if (!validPassword(password)) return Promise.reject(new Error("invalid password"));
        return getClient().then(function (c) {
          return c.auth.updateUser({ password: password }).then(function (result) {
            if (result.error) throw result.error;
            return result.data && result.data.user;
          });
        });
      },
      signInWithUsername: function (username, password) {
        username = normalizeUsername(username);
        if (!username || !validPassword(password)) return Promise.reject(new Error("invalid username or password"));
        return getClient().then(function (c) {
          return fetch(String(config.supabaseUrl).replace(/\/$/, "") + "/functions/v1/username-auth", {
            method: "POST",
            headers: { "apikey": config.supabaseAnonKey, "content-type": "application/json" },
            body: JSON.stringify({ action: "sign_in", username: username, password: password }),
          }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (body) {
              if (!response.ok || !body.access_token || !body.refresh_token) throw new Error("invalid username or password");
              return c.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
            });
          }).then(function (result) {
            if (result.error) throw result.error;
            return result.data || {};
          });
        });
      },
      signUpWithPassword: function (email, password, nickname, username) {
        email = normalizeEmail(email);
        nickname = normalizeNickname(nickname);
        username = normalizeUsername(username);
        if (!username) return Promise.reject(Object.assign(new Error("invalid username"), { code: "invalid_username" }));
        if (!email) return Promise.reject(Object.assign(new Error("invalid email"), { code: "invalid_email" }));
        if (!validPassword(password)) return Promise.reject(Object.assign(new Error("invalid password"), { code: "invalid_password" }));
        var redirectTo = approvedRedirect(config, options.location);
        if (!redirectTo) return Promise.reject(new Error("current app URL is not allow-listed"));
        return getClient().then(function (c) {
          var signUpOptions = { emailRedirectTo: redirectTo };
          signUpOptions.data = { pending_username: username };
          if (nickname) signUpOptions.data.nickname = nickname;
          return c.auth.signUp({ email: email, password: password, options: signUpOptions }).then(function (result) {
            if (result.error) throw result.error;
            var data = result.data || {};
            if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
              throw Object.assign(new Error("email already registered"), { code: "email_exists" });
            }
            return data;
          });
        });
      },
      claimUsername: function (username) {
        username = normalizeUsername(username);
        if (!username) return Promise.reject(new Error("invalid username"));
        return getClient().then(function (c) {
          return c.rpc("claim_account_username", { requested_username: username }).then(function (result) {
            if (result.error) throw result.error;
            return c.auth.updateUser({ data: { pending_username: "" } }).then(function (updated) {
              if (updated.error) throw updated.error;
              return username;
            });
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
    normalizeNickname: normalizeNickname, normalizeEmail: normalizeEmail, normalizeUsername: normalizeUsername, validPassword: validPassword, signUpErrorMessage: signUpErrorMessage, displayName: displayName, displayEmail: displayEmail, normalizeAppUrl: normalizeAppUrl,
    approvedRedirect: approvedRedirect, createController: createController };
});
