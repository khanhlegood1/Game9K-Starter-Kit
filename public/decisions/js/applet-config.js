// Game9K Dev Decisions Studio configuration:
// Default to backend `/api/decisions` (which uses GEMINI_API_KEY when set on server,
// or the built-in Game9K Calibrated Decisions Engine out-of-the-box).
// Users can also link a personal Gemini API key in the UI to call
// `https://generativelanguage.googleapis.com/v1beta/decisions` (`gemini-decision-1`) directly.
'use strict';
(function () {
  const fn = window.fetch;
  const nativeFetch =
    typeof fn === 'function' && Function.prototype.toString.call(fn).includes('[native code]')
      ? fn.bind(window)
      : null;
  window.DP_CONFIG = {
    direct: false,
    modelLabel: 'Gemini Decisions · Game9K DevOps',
    nativeFetch,
  };
})();
