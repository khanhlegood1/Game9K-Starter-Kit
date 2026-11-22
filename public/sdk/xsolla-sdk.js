/**
 * xsolla-sdk.js
 * Drop-in Xsolla SDK 3 Browser loader for Game9K Starter Kit.
 * Exposes `window.XsollaSDK` (`authenticate`, `loadCatalog`, `purchaseProduct`, `finalizePurchase`)
 * bridged safely across `<iframe sandbox="allow-scripts">` via Game9K Portal SDK.
 */
(function ensureXsollaBrowserSDK() {
  if (typeof window !== "undefined" && !window.XsollaSDK) {
    const script = document.createElement("script");
    script.src = "/sdk/game9k-sdk.js";
    document.head.appendChild(script);
  }
})();
