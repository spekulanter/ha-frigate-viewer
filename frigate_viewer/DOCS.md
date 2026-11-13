# Frigate Viewer Proxy

Shows the original Frigate UI inside Home Assistant for a Frigate server that
runs somewhere else. The app signs in to Frigate itself with one read-only
account, so people only need their Home Assistant sign-in and never see a
Frigate login screen.

It does not run Frigate.

## Before you start

1. In Frigate, open **Settings → Users** and create an account with the
   **viewer** role. The app refuses to use an admin account.
2. Make sure Home Assistant can reach Frigate's authenticated port (8971 by
   default), or a reverse proxy in front of it.

## Options

| Option | Meaning |
| --- | --- |
| `server` | Frigate address as `http(s)://host[:port]`, without a path. Use the authenticated port, for example `https://frigate.local:8971`. Port 5000 has no roles and must not be used. |
| `username` | Name of the Frigate viewer account. |
| `password` | Its password. |
| `cookie_name` | Only if you changed `auth.cookie_name` in Frigate. Defaults to `frigate_token`. |

## What people can and cannot do

Frigate decides this through the viewer role: live view, review and recordings
work, the configuration editor and settings do not. On top of that the app
itself rejects these requests:

- `/api/config/*` except the schema (raw config, save, set)
- `/api/users`, `/api/login`, `/api/logout`, `/api/restart`
- the `/config` and `/settings` pages, which redirect to the start page

Only the Supervisor ingress gateway can connect to the app. No port is
published on the host.

## Dashboard card

`card/frigate-ui-card.js` in this repository embeds the app in a dashboard and
opens it on one camera:

```yaml
type: custom:frigate-ui-card
addon: xxxxxxxx_frigate_viewer
camera: front_door
page: review
```

`addon` is the app slug, visible in the address bar when the app page is open
in Home Assistant.

## Troubleshooting

The app log says whether sign-in worked and when the session is refreshed.
While it is signed out, the UI answers with a plain 503 message instead of a
login screen.
