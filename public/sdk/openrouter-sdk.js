/**
 * openrouter-sdk.js
 * Drop-in OpenRouter Multi-Model Gateway, OAuth PKCE & Agent Protocol v1 Shim
 * for Poki / Game9K Sandboxed Games (`<iframe sandbox="allow-scripts">`).
 */
(function (global) {
  "use strict";
  if (global.OpenRouterSDK && global.PokiSDK?.ai) {
    return;
  }
  if (typeof document !== "undefined" && !global.Game9K) {
    const s = document.createElement("script");
    s.src = "/sdk/game9k-sdk.js";
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
  }
})(typeof window !== "undefined" ? window : globalThis);
