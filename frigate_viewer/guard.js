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
  // the same way Frigate's own History button in the live view does: by
  // putting a "recording" starting point into the router's history state.
  //
  // Frigate 0.16 shows the timeline only if its config has loaded before the
  // review list; otherwise the page stays empty. On phones the config often
  // arrives later, so the starting point is handed over only once both have
  // loaded, followed by a popstate so the router picks it up.
  var params = new URLSearchParams(location.search);
  var timelineCamera = params.get("viewer_timeline");
  if (timelineCamera !== null) {
    params.delete("viewer_timeline");
    var query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
    if (/^[A-Za-z0-9_-]+$/.test(timelineCamera)) openTimelineWhenReady(timelineCamera);
  }

  function openTimelineWhenReady(camera) {
    var loaded = { config: false, review: false };
    var opened = false;
    var originalOpen = XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.open = function (method, url) {
      var u = String(url).split("#")[0];
      var kind = /\/api\/config(\?|$)/.test(u) ? "config" : /\/api\/review(\?|$)/.test(u) ? "review" : null;
      if (kind) {
        this.addEventListener("loadend", function () {
          loaded[kind] = true;
          // Give React a moment to store the response before switching views.
          if (loaded.config && loaded.review) setTimeout(open, 300);
        });
      }
      return originalOpen.apply(this, arguments);
    };

    function open() {
      if (opened) return;
      opened = true;
      XMLHttpRequest.prototype.open = originalOpen;
      var current = history.state && typeof history.state === "object" ? history.state : {};
      var state = {
        usr: {
          severity: "alert",
          recording: { camera: camera, startTime: Date.now() / 1000 - 30, severity: "alert" },
        },
        key: current.key || "viewer",
        idx: typeof current.idx === "number" ? current.idx : 0,
      };
      history.replaceState(state, "", location.href);
      window.dispatchEvent(new PopStateEvent("popstate", { state: state }));
    }

    // Never wait forever, e.g. if Frigate changes how it loads data.
    setTimeout(open, 15000);
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
