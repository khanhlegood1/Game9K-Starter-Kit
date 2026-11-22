/**
 * tiktok-bridge.js
 * Drop-in compatibility shim loading Game9K's unified Multi-Platform Stream Bridge
 * (`window.TikTokBridge` + `window.LiveStreamBridge`) for games migrated from
 * `vamnguyen/tiktok-live-games`.
 */
(function ensureTikTokBridge() {
  if (typeof window !== "undefined" && !window.Game9K) {
    const script = document.createElement("script");
    script.src = "/sdk/game9k-sdk.js";
    document.head.appendChild(script);
  }
})();
