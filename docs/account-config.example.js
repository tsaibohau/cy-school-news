/* Copy to a local, untracked configuration only after provisioning a dedicated
 * Supabase project. Google Client Secret belongs only in Supabase Auth > Google;
 * never commit service_role, database credentials, OAuth secrets, or tokens. */
window.CYNEWS_ACCOUNT_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  /* Allowed redirects to configure in Supabase Auth: */
  productionRedirectUrl: "https://tsaibohau.github.io/cy-school-news/",
  localhostRedirectUrl: "http://127.0.0.1:8266/",
  stagingRedirectUrl: "https://cy-school-news-staging.vercel.app/",
  allowedRedirectUrls: [
    "https://tsaibohau.github.io/cy-school-news/",
    "http://127.0.0.1:8266/",
    "https://cy-school-news-staging.vercel.app/",
  ],
};
