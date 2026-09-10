/* Public production configuration. Never put service_role, passwords, or tokens here. */
window.CYNEWS_ACCOUNT_CONFIG = {
  supabaseUrl: "https://oppdhtnepjagdwovndra.supabase.co",
  supabaseAnonKey: "sb_publishable_Pgq4FNPvMwnKCWdm4rSWnw_BL9r1CHt",
  /* Public VAPID key only. The matching private key is a server secret. */
  vapidPublicKey: "",
  productionRedirectUrl: "https://tsaibohau.github.io/cy-school-news/",
  localhostRedirectUrl: "http://127.0.0.1:8266/",
  stagingRedirectUrl: "",
  callbackRedirects: {},
  allowedRedirectUrls: [
    "https://tsaibohau.github.io/cy-school-news/",
  ],
};
/* Capability bridge must install before account-auth.js assigns CyNewsAccountAuth. */
if (typeof document !== "undefined" && document.readyState === "loading") {
  document.write('<script src="capability-layer.js?v=1"><\/script>');
}
