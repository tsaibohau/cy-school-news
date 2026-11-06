/* Public production configuration. Never put service_role, passwords, or tokens here. */
/* The site moved to Cloudflare Pages. The old GitHub Pages address forwards there, keeping the
   path, query and #hash (login links carry their token in the hash). This file is network-first
   in sw.js, so visitors whose cached page predates the move are forwarded too. */
(function () {
  if (typeof location === "undefined" || location.hostname !== "tsaibohau.github.io") return;
  var rest = location.pathname.replace(/^\/cy-school-news\/?/, "");
  location.replace("https://cy-school-news.pages.dev/" + rest + location.search + location.hash);
})();
window.CYNEWS_ACCOUNT_CONFIG = {
  supabaseUrl: "https://oppdhtnepjagdwovndra.supabase.co",
  supabaseAnonKey: "sb_publishable_Pgq4FNPvMwnKCWdm4rSWnw_BL9r1CHt",
  /* Public VAPID key only. The matching private key is a server secret. */
  vapidPublicKey: "",
  productionRedirectUrl: "https://cy-school-news.pages.dev/",
  localhostRedirectUrl: "http://127.0.0.1:8266/",
  stagingRedirectUrl: "",
  callbackRedirects: {},
  allowedRedirectUrls: [
    "https://cy-school-news.pages.dev/",
    /* Old address: kept so a login started there just before the move still completes. */
    "https://tsaibohau.github.io/cy-school-news/",
  ],
  /* Keep true until owner_auth_cutover_readiness() is true in Production and
     Google Provider shutdown is separately authorized. */
  googleLoginUiEnabled: true,
};
/* Capability layer must load before account-auth.js so the auth controller is capability-aware. */
if (typeof document !== "undefined" && document.readyState === "loading") {
  document.write('<script src="capability-layer.js?v=12"></' + 'script>');
}
