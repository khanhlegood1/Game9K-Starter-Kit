/**
 * poki-sdk.js
 * Drop-in Poki Portal SDK compatibility loader for Game9K Starter Kit.
 * Any HTML5 / Unity WebGL / Godot / GDevelop / Cocos / Defold game referencing
 * `poki-sdk.js` automatically gets `window.PokiSDK` + `window.Game9K` + `window.XsollaSDK`.
 */
(function ensurePokiPortalSDK() {
  if (typeof window !== "undefined" && !window.PokiSDK) {
    const script = document.createElement("script");
    script.src = "/sdk/game9k-sdk.js";
    document.head.appendChild(script);
  }
})();
