'use strict';
(function () {
  let theme = null;
  try {
    theme = JSON.parse(window.localStorage.getItem('dp.theme'));
  } catch (e) {
    // Storage may be blocked; fall back to dark mode for Game9K Studio.
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = 'dark';
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
})();
