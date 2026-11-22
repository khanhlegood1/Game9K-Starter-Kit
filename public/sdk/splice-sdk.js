/**
 * splice-sdk.js
 * Drop-in Splice Spec-to-SDK & Mock Gateway loader for Game9K Poki Portal SDK v3.0.0.
 * Exposes `window.SpliceSDK`, `window.Game9KPOS`, `window.PokiSDK`, and `window.XsollaSDK`.
 */
(function ensureSplicePortalSDK() {
  if (typeof window !== "undefined" && !window.SpliceSDK) {
    const script = document.createElement("script");
    script.src = "/sdk/game9k-sdk.js";
    document.head.appendChild(script);
  }
})();
