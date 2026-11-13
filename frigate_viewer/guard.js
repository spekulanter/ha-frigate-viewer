/*
 * Injected into the Frigate UI by Frigate Viewer Proxy.
 * Keeps the Settings and Config pages out of reach inside the embedded UI.
 * This is a convenience on top of the real protection, which is Frigate's
 * viewer role plus the request blocks in nginx.
 */
(function () {
  var blocked = /^(settings|config)(\/|$)/;
  // Where the UI was opened, e.g. the review page of one camera.
  var home = location.href;

  function isBlocked(url) {
    try {
      // Read on every check: Frigate sets window.baseUrl after this script loads.
      var base = (window.baseUrl || "/").replace(/\/+$/, "") + "/";
      var path = new URL(url, location.href).pathname;
      if (path.indexOf(base) !== 0) return false;
      return blocked.test(path.slice(base.length));
    } catch (e) {
      return false;
    }
  }

  ["pushState", "replaceState"].forEach(function (name) {
    var original = history[name];
    history[name] = function (state, title, url) {
      var result = original.apply(this, arguments);
      if (url != null && isBlocked(url)) location.replace(home);
      return result;
    };
  });

  window.addEventListener("popstate", function () {
    if (isBlocked(location.href)) location.replace(home);
  });

  var style = document.createElement("style");
  style.textContent =
    'a[href$="/settings"],a[href*="/settings#"],a[href*="/settings?"],' +
    'a[href$="/config"],a[href$="/api/logout"]{display:none!important}';
  document.head.appendChild(style);
})();
