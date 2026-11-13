/*
 * Injected into the Frigate UI by Frigate Viewer Proxy.
 * Keeps the Settings and Config pages out of reach inside the embedded UI.
 * This is a convenience on top of the real protection, which is Frigate's
 * viewer role plus the request blocks in nginx.
 */
(function () {
  var base = (window.baseUrl || "/").replace(/\/+$/, "") + "/";
  var blocked = /^(settings|config)(\/|$)/;

  function isBlocked(url) {
    try {
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
      if (url != null && isBlocked(url)) {
        if (name === "pushState") {
          setTimeout(function () {
            history.back();
          }, 0);
        } else {
          location.replace(base);
        }
      }
      return result;
    };
  });

  window.addEventListener("popstate", function () {
    if (isBlocked(location.href)) location.replace(base);
  });

  var style = document.createElement("style");
  style.textContent =
    'a[href$="/settings"],a[href*="/settings#"],a[href*="/settings?"],' +
    'a[href$="/config"],a[href$="/api/logout"]{display:none!important}';
  document.head.appendChild(style);
})();
