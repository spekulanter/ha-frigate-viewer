/*
 * frigate-ui-card
 * Shows the original Frigate UI, served by the Frigate Viewer Proxy app,
 * inside a Home Assistant dashboard. Opens straight on one camera.
 *
 *   type: custom:frigate-ui-card
 *   addon: xxxxxxxx_frigate_viewer   # app slug (or set ingress_entry instead)
 *   camera: front_door               # optional
 *   page: review                     # review | live | explore
 *   path: review?cameras=front_door  # optional, overrides page/camera
 *   height: 80vh                     # optional CSS height
 */
const CARD_VERSION = "0.1.1";
const DEFAULT_HEIGHT = "calc(100dvh - var(--header-height, 56px) - 4px)";
const SESSION_EVENT = "frigate-ui-card-session";

const TEXT = {
  en: {
    loading: "Opening Frigate…",
    no_supervisor: "Home Assistant could not open the Frigate app.",
    not_running: "The Frigate Viewer Proxy app is not running.",
  },
  sk: {
    loading: "Otváram Frigate…",
    no_supervisor: "Home Assistant nevie otvoriť appku Frigate.",
    not_running: "Appka Frigate Viewer Proxy nebeží.",
  },
};

const supervisor = (hass, endpoint, method, data) =>
  hass.callWS({ type: "supervisor/api", endpoint, method, ...(data ? { data } : {}) });

// One ingress session is shared by every card on the page, the same way
// Home Assistant does it for an app opened from the sidebar.
const session = {
  id: null,
  pending: null,
  timer: null,
  refs: 0,
  hass: null,

  ensure(hass) {
    this.hass = hass;
    if (this.id) return Promise.resolve(this.id);
    if (!this.pending) {
      this.pending = supervisor(hass, "/ingress/session", "post")
        .then((result) => {
          const secure = location.protocol === "https:" ? ";Secure" : "";
          document.cookie = `ingress_session=${result.session};path=/api/hassio_ingress/;SameSite=Strict${secure}`;
          this.id = result.session;
          return this.id;
        })
        .finally(() => {
          this.pending = null;
        });
    }
    return this.pending;
  },

  async check() {
    if (!this.hass || !this.id) return;
    try {
      await supervisor(this.hass, "/ingress/validate_session", "post", { session: this.id });
    } catch (err) {
      this.id = null;
      try {
        await this.ensure(this.hass);
        window.dispatchEvent(new CustomEvent(SESSION_EVENT));
      } catch (_) {
        /* retried on the next tick */
      }
    }
  },

  retain() {
    this.refs += 1;
    if (!this.timer) {
      this.timer = setInterval(() => this.check(), 60000);
      this.onVisible = () => {
        if (document.visibilityState === "visible") this.check();
      };
      document.addEventListener("visibilitychange", this.onVisible);
    }
  },

  release() {
    this.refs = Math.max(0, this.refs - 1);
    if (this.refs === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      document.removeEventListener("visibilitychange", this.onVisible);
    }
  },
};

const entries = new Map();

function ingressEntry(hass, config) {
  if (config.ingress_entry) return Promise.resolve(config.ingress_entry);
  if (!entries.has(config.addon)) {
    const lookup = supervisor(hass, `/addons/${config.addon}/info`, "get").then((info) => {
      if (info.state && info.state !== "started") {
        const err = new Error("not_running");
        err.code = "not_running";
        throw err;
      }
      return info.ingress_entry;
    });
    lookup.catch(() => entries.delete(config.addon));
    entries.set(config.addon, lookup);
  }
  return entries.get(config.addon);
}

class FrigateUiCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._onSession = () => this._reload();
  }

  static getStubConfig() {
    return { addon: "", camera: "", page: "review" };
  }

  setConfig(config) {
    if (!config || (!config.addon && !config.ingress_entry)) {
      throw new Error("Set 'addon' (the app slug) or 'ingress_entry'.");
    }
    this._config = { page: "review", ...config };
    this._url = null;
    this._render();
    if (this.isConnected && this._hass) this._start();
  }

  set hass(hass) {
    this._hass = hass;
    session.hass = hass;
    if (this.isConnected && !this._url && !this._starting) this._start();
  }

  connectedCallback() {
    session.retain();
    window.addEventListener(SESSION_EVENT, this._onSession);
    if (this._hass && this._config) this._start();
  }

  disconnectedCallback() {
    session.release();
    window.removeEventListener(SESSION_EVENT, this._onSession);
    // Drop the page so its video streams stop while the view is hidden.
    if (this._frame) {
      this._frame.remove();
      this._frame = null;
    }
    this._url = null;
  }

  getCardSize() {
    return 10;
  }

  getGridOptions() {
    return { columns: "full", rows: 8, min_rows: 4 };
  }

  _t(key) {
    const lang = (this._hass && this._hass.language) || "en";
    return (TEXT[lang] || TEXT.en)[key] || TEXT.en[key];
  }

  _render() {
    const height = this._config.height || DEFAULT_HEIGHT;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .wrap {
          position: relative;
          width: 100%;
          height: ${height};
          background: #0b0b0d;
          overflow: hidden;
        }
        iframe { position: relative; z-index: 1; display: block; width: 100%; height: 100%; border: 0; }
        .msg {
          position: absolute; inset: 0; z-index: 0; pointer-events: none;
          display: flex; align-items: center; justify-content: center;
          padding: 16px; text-align: center;
          color: #b8bcc4; font: 14px/1.4 system-ui, sans-serif;
        }
      </style>
      <div class="wrap"><div class="msg"></div></div>`;
    this._frame = null;
  }

  _message(text) {
    const msg = this.shadowRoot.querySelector(".msg");
    if (msg) msg.textContent = text;
  }

  _target(entry) {
    const config = this._config;
    const base = String(entry).replace(/\/+$/, "");
    if (config.path) return `${base}/${String(config.path).replace(/^\/+/, "")}`;
    const camera = config.camera ? encodeURIComponent(config.camera) : "";
    if (config.page === "live") return camera ? `${base}/#${camera}` : `${base}/`;
    if (config.page === "explore") return `${base}/explore${camera ? `?cameras=${camera}` : ""}`;
    return `${base}/review${camera ? `?cameras=${camera}` : ""}`;
  }

  async _start() {
    if (this._starting || this._url) return;
    this._starting = true;
    this._message(this._t("loading"));
    try {
      const entry = await ingressEntry(this._hass, this._config);
      await session.ensure(this._hass);
      if (!this.isConnected) return;
      this._url = this._target(entry);
      this._show();
    } catch (err) {
      this._message(this._t(err && err.code === "not_running" ? "not_running" : "no_supervisor"));
    } finally {
      this._starting = false;
    }
  }

  _show() {
    const wrap = this.shadowRoot.querySelector(".wrap");
    if (!wrap || !this._url) return;
    if (this._frame) this._frame.remove();
    const frame = document.createElement("iframe");
    frame.setAttribute("allow", "fullscreen; autoplay; picture-in-picture");
    frame.setAttribute("allowfullscreen", "");
    frame.setAttribute("title", "Frigate");
    frame.addEventListener("load", () => this._message(""));
    frame.src = this._url;
    wrap.appendChild(frame);
    this._frame = frame;
  }

  _reload() {
    if (this.isConnected && this._url) this._show();
  }
}

if (!customElements.get("frigate-ui-card")) {
  customElements.define("frigate-ui-card", FrigateUiCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "frigate-ui-card",
    name: "Frigate UI",
    description: "The original Frigate UI through the Frigate Viewer Proxy app",
  });
  console.info(`%c frigate-ui-card %c ${CARD_VERSION} `, "background:#1f6feb;color:#fff", "");
}
