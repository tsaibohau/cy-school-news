/* Public deployment configuration. Keep empty until a dedicated Supabase
 * project is provisioned. Never put service_role, passwords, or tokens here. */
window.CYNEWS_ACCOUNT_CONFIG = {
  // Dedicated Preview backend. This branch must never point at the shared
  // production backend while username-password login is being validated.
  supabaseUrl: "https://ebezqanvmgsgtatsbssn.supabase.co",
  supabaseAnonKey: "sb_publishable_AMraTwpKL4GF-U0UdA8AmQ_jRmt6izJ",
  /* Public VAPID key only. The matching private key is a server secret. */
  vapidPublicKey: "",
  productionRedirectUrl: "https://tsaibohau.github.io/cy-school-news/",
  localhostRedirectUrl: "http://127.0.0.1:8266/",
  stagingRedirectUrl: "https://cy-school-news-staging.vercel.app/",
  allowedRedirectUrls: [
    "https://tsaibohau.github.io/cy-school-news/",
    "http://127.0.0.1:8266/",
    "https://cy-school-news-staging.vercel.app/",
  ],
};
