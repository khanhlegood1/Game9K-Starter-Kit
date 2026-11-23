/**
 * agentops-sdk.js
 * Drop-in AgentOps Observability, Helicone Prompt Cache, Chidori Reactive Bus,
 * SID Context Capsule & Steamship Signed Webhooks Shim for Poki / Game9K Sandboxed Games (`<iframe sandbox="allow-scripts">`).
 */
(function (global) {
  "use strict";
  if (global.AgentOpsSDK && global.PokiSDK?.agentOps) {
    return;
  }
  if (typeof document !== "undefined" && !global.Game9K) {
    const s = document.createElement("script");
    s.src = "/sdk/game9k-sdk.js";
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
  }
})(typeof window !== "undefined" ? window : globalThis);
