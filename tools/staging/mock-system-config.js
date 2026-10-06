// This full-interface Preview has no real authentication or database endpoint.
window.CYNEWS_ACCOUNT_CONFIG = { googleLoginUiEnabled: false, vapidPublicKey: "", mockSystem: true };
if (typeof document !== "undefined" && document.readyState === "loading") {
  document.write('<script src="capability-layer.js"></' + 'script>');
}
