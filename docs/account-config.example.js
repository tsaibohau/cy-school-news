/* Copy to a local, untracked configuration only after provisioning a dedicated
 * Supabase project. Never commit service_role or database credentials. */
window.CYNEWS_ACCOUNT_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  /* Allowed redirects to configure in Supabase Auth: */
  productionRedirectUrl: "https://tsaibohau.github.io/cy-school-news/",
  localhostRedirectUrl: "http://127.0.0.1:8266/",
};
