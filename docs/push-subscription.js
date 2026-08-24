/* Per-device Web Push subscription bridge. Account identity always comes from
 * a server-verified Supabase session; caller-supplied user IDs are ignored. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsPushSubscription = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  function base64UrlBytes(value) {
    var normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4) normalized += "=";
    var raw = atob(normalized), bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function supported(env, config) {
    return !!(env && env.navigator && env.navigator.serviceWorker && env.Notification &&
      env.PushManager && config && String(config.vapidPublicKey || "").trim());
  }

  function createManager(options) {
    options = options || {};
    var env = options.env || (typeof window !== "undefined" ? window : {});
    var config = options.config || env.CYNEWS_ACCOUNT_CONFIG || {};
    var auth = options.auth;
    if (!auth || typeof auth.getVerifiedSession !== "function" || typeof auth.getClient !== "function") {
      throw new Error("verified auth controller required");
    }

    function verifiedContext() {
      return auth.getVerifiedSession().then(function (session) {
        var uid = session && session.user && session.user.id;
        if (typeof uid !== "string" || !uid) throw new Error("verified login required");
        return auth.getClient().then(function (client) { return { uid: uid, client: client }; });
      });
    }

    function registration() {
      return env.navigator.serviceWorker.ready;
    }

    function current() {
      if (!supported(env, config)) return Promise.resolve({ supported: false, active: false });
      return registration().then(function (reg) {
        return reg.pushManager.getSubscription().then(function (subscription) {
          return { supported: true, active: !!subscription, permission: env.Notification.permission };
        });
      });
    }

    function enable() {
      if (!supported(env, config)) return Promise.reject(new Error("push unavailable"));
      return Promise.resolve(env.Notification.requestPermission()).then(function (permission) {
        if (permission !== "granted") throw new Error(permission === "denied" ? "permission denied" : "permission not granted");
        return Promise.all([registration(), verifiedContext()]);
      }).then(function (parts) {
        var reg = parts[0], context = parts[1];
        return reg.pushManager.getSubscription().then(function (existing) {
          return existing || reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlBytes(config.vapidPublicKey),
          });
        }).then(function (subscription) {
          var json = subscription.toJSON();
          if (!json.endpoint || !json.keys || !json.keys.p256dh || !json.keys.auth) throw new Error("invalid push subscription");
          return context.client.from("user_push_subscriptions").upsert({
            user_id: context.uid,
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            user_agent: String(env.navigator.userAgent || "").slice(0, 500),
            active: true,
            disabled_at: null,
            invalidated_at: null,
          }, { onConflict: "endpoint" }).then(function (result) {
            if (result.error) throw result.error;
            return { active: true, endpoint: json.endpoint };
          });
        });
      });
    }

    function disable() {
      if (!supported(env, config)) return Promise.resolve({ active: false });
      return Promise.all([registration(), verifiedContext()]).then(function (parts) {
        var reg = parts[0], context = parts[1];
        return reg.pushManager.getSubscription().then(function (subscription) {
          if (!subscription) return { active: false };
          return context.client.from("user_push_subscriptions").update({
            active: false,
            disabled_at: new Date().toISOString(),
          }).eq("user_id", context.uid).eq("endpoint", subscription.endpoint).then(function (result) {
            if (result.error) throw result.error;
            return subscription.unsubscribe().then(function () { return { active: false }; });
          });
        });
      });
    }

    return { supported: function () { return supported(env, config); }, current: current, enable: enable, disable: disable };
  }

  return { base64UrlBytes: base64UrlBytes, supported: supported, createManager: createManager };
});
