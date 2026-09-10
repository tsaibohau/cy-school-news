/* Public Preview configuration. Never put service_role, passwords, or tokens here. */
window.CYNEWS_ACCOUNT_CONFIG = {
  supabaseUrl: "https://ebezqanvmgsgtatsbssn.supabase.co",
  supabaseAnonKey: "sb_publishable_AMraTwpKL4GF-U0UdA8AmQ_jRmt6izJ",
  vapidPublicKey: "",
  productionRedirectUrl: "https://tsaibohau.github.io/cy-school-news/",
  localhostRedirectUrl: "http://127.0.0.1:8266/",
  stagingRedirectUrl: "https://cy-school-news-staging.vercel.app/",
  previewHostnamePrefix: "cy-school-news-staging-git-",
  previewHostnameSuffix: "-tsaibohau-9644s-projects.vercel.app",
  callbackRedirects: {
    "https://cy-school-news-staging-git-code-184992-tsaibohau-9644s-projects.vercel.app/": "https://cy-school-news-staging.vercel.app/",
  },
  allowedRedirectUrls: [
    "https://cy-school-news-staging-git-code-184992-tsaibohau-9644s-projects.vercel.app/",
    "http://127.0.0.1:8266/",
    "https://cy-school-news-staging.vercel.app/",
  ],
};
/* Load the capability layer from the actual staging configuration that survives build-staging.js. */
if (typeof document !== "undefined" && document.readyState === "loading") {
  document.write('<script src="capability-layer.js?v=3"></' + 'script>');
}
