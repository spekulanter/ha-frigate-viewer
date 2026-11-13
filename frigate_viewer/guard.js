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

  // ?viewer_timeline=<camera> opens the recording timeline of that camera,
  // the same way Frigate's own History button in the live view does.
  // Runs before the UI's router starts, which reads this history state.
  var params = new URLSearchParams(location.search);
  var timelineCamera = params.get("viewer_timeline");
  if (timelineCamera !== null) {
    params.delete("viewer_timeline");
    var query = params.toString();
    var cleanUrl = location.pathname + (query ? "?" + query : "") + location.hash;
    if (/^[A-Za-z0-9_-]+$/.test(timelineCamera)) {
      var startTime = Date.now() / 1000 - 30;
      history.replaceState(
        {
          usr: {
            severity: "alert",
            recording: { camera: timelineCamera, startTime: startTime, severity: "alert" },
          },
          key: "viewer",
          idx: 0,
        },
        "",
        cleanUrl
      );
    } else {
      history.replaceState(null, "", cleanUrl);
    }
  }

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
