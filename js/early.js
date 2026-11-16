// Runs in <head>: marks that scripting works (so reveal states may hide content), sets the season
// and decides whether the hero is the live, scroll-driven thermostat. All of it happens before first
// paint, so the dial never flashes the wrong state and the page height never jumps.
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  var month = new Date().getMonth() + 1; // 1-12
  root.dataset.season = month >= 5 && month <= 9 ? 'cool' : 'heat';
  root.dataset.month = String(month);
  // Live hero only with motion allowed and a browser that has WebGL at all; if the context still
  // fails later, hero-air.js drops back to the static dial.
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!calm && 'WebGLRenderingContext' in window && 'IntersectionObserver' in window && 'ResizeObserver' in window) {
    root.dataset.hero = 'live';
  }
  // Safety net: if the main module never runs (very old browser, blocked file), show everything.
  window.setTimeout(function () {
    if (window.__hedefReady) return;
    root.classList.remove('js');
    delete root.dataset.hero;
  }, 3000);
})();
