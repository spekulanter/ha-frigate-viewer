# Frigate Viewer Proxy for Home Assistant

The original [Frigate](https://frigate.video) UI inside Home Assistant, signed
in as a read-only viewer. Not affiliated with the Frigate project.

- **`frigate_viewer/`** is a Home Assistant app. It signs in to an external
  Frigate server with a viewer account and serves the UI through ingress, so
  users need no Frigate login and cannot reach the config editor or settings.
- **`card/frigate-ui-card.js`** is a dashboard card that embeds that UI and
  opens it on one camera.

## Install

1. In Home Assistant open **Settings → Apps → App store → ⋮ → Repositories**
   and add `https://github.com/spekulanter/ha-frigate-viewer`.
2. Install **Frigate Viewer Proxy**, fill in the options and start it.
3. Add `card/frigate-ui-card.js` as a dashboard resource (JavaScript module).

Details are in [frigate_viewer/DOCS.md](frigate_viewer/DOCS.md).

The app icon uses the Frigate bird logo from
[blakeblackshear/frigate](https://github.com/blakeblackshear/frigate)
(`web/images/favicon.svg`, MIT license), recolored on a dark tile.
