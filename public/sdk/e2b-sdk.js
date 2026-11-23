/**
 * e2b-sdk.js
 * Drop-in E2B Runtime, Code Interpreter, Fragments & Open Computer Use Shim
 * for Poki / Game9K Sandboxed Games (`<iframe sandbox="allow-scripts">`).
 */
(function (global) {
  "use strict";
  if (global.E2BRuntimeSDK && global.CodeInterpreterSDK && global.FragmentsSDK && global.ComputerUseSDK) {
    return;
  }
  if (typeof document !== "undefined" && !global.Game9K) {
    const s = document.createElement("script");
    s.src = "/sdk/game9k-sdk.js";
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
  }
})(typeof window !== "undefined" ? window : globalThis);
