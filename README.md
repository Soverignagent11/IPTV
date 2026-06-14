# 📺 Nova TV — Signalverse

Nova TV is a self-contained, static public live-TV browser designed for **GitHub Pages**.
It uses public channel and stream metadata from the open-source **[iptv-org](https://github.com/iptv-org/iptv)** project and plays compatible HLS streams in the browser with **[hls.js](https://github.com/video-dev/hls.js)**.

Build 34 expands Signalverse with **Nova Radio**, a **Source Firewall**, the premium **Channel Guide**, and the legal **Free TV API Hub**. Nova is still safe-by-default: no backend, no accounts, no tracking, no adult toggle, and no built-in pirate IPTV feeds.

![Static](https://img.shields.io/badge/100%25-static-success) ![No backend](https://img.shields.io/badge/backend-none-blue) ![Safe public mode](https://img.shields.io/badge/safe-public_mode-green) ![License MIT](https://img.shields.io/badge/license-MIT-green)

---

## What Signalverse changes

- **Signal Field home**
  - channels appear as orbiting live-signal nodes
  - selecting a node opens a lens-style preview
  - nearby/random/far-away scanning changes the field

- **Premium streaming layout**
  - Apple TV / Prime-style content rails
  - full-width mobile layout
  - bottom mobile navigation
  - large readable cards and touch targets

- **Channel Guide**
  - guide tab added dynamically
  - channels down the side on desktop
  - time blocks across: Now / +30 / +60 / +90
  - stacked guide cards on mobile
  - does not fabricate program titles when a real EPG source is unavailable

- **Nova Radio**
  - legal public internet radio tab
  - Radio Browser directory search
  - genre/country/name search
  - HTTPS stream filtering
  - browser audio player

- **Source Firewall**
  - local-only M3U paste/import scanner
  - blocks adult/unsafe terms
  - blocks non-HTTPS streams
  - blocks tokenized portal-style URLs
  - quarantines obvious premium/pay-TV risk labels
  - lets only strict-pass local imports be tested
  - does not find playlists for the user

- **Free TV API Hub**
  - IPTV-org local channel index search
  - TVmaze show/schedule metadata search
  - EpisoDate TV-show metadata search
  - optional TMDB search using a user-provided local API key
  - no keys are committed to the repo

- **Mobile keyboard fix**
  - search/scanner inputs are real 16px text inputs
  - input overlays avoid decorative click-ripple interception
  - scanner focus happens directly during the user tap/click event

- **Kinetic Optics V2**
  - living starfield canvas
  - orbit rings
  - signal health bars
  - contact-light only on non-input surfaces
  - pressure-style controls
  - magnetic focus halo
  - reduced-motion / contrast / transparency fallbacks

- **Safe public mode**
  - adult/NSFW listings are filtered before rendering
  - only HTTPS public stream URLs are used
  - no backend, no accounts, no tracking
  - Nova does not host streams or bypass regional rights

---

## Features

- Signalverse live-signal home
- Search / scan channels, countries, and categories
- Category and country browse layers
- Channel Guide
- Nova Radio
- Source Firewall for local M3U scanning
- Free TV API Hub
- Local favorites
- Recent signals
- Signal Wall multi-view
- Player with source fallback
- Command scanner with `Cmd/Ctrl + K`
- Static GitHub Pages deployment

---

## API provider policy

Nova only integrates legal/free TV APIs that can be used responsibly from a static web app.

Included providers:

| Provider | Type | Auth | Used for |
|---|---|---:|---|
| IPTV-org | Public channel/stream index | No key | Live channel metadata and playable public stream URLs |
| TVmaze | TV schedule/show metadata | No key | Show search, schedule metadata, episode/show info |
| EpisoDate | TV-show database | No key | Show search and show details |
| TMDB | TV/movie metadata/images | Free key required | Optional TV metadata search |
| Radio Browser | Public internet radio directory | No key | Legal public radio station search |

Nova does **not** add pirate IPTV lists, adult sources, or tools to bypass broadcaster restrictions. The Source Firewall is for user-owned local playlist scanning and quarantine only.

---

## Run locally

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

---

## Project structure

```text
index.html                       # Signalverse shell
assets/css/style.css             # Signalverse/Kinetic Optics V2 visual system
assets/css/guide.css             # Channel Guide layer
assets/css/radio.css             # Nova Radio layer
assets/css/source-firewall.css   # Source Firewall layer
assets/css/api-sources.css       # Free TV API Hub styles
assets/js/app.js                 # data loading, signal field, scanner, player, Signal Wall
assets/js/guide.js               # Channel Guide logic
assets/js/radio.js               # Legal internet radio logic
assets/js/source-firewall.js     # Local M3U scan/quarantine logic
assets/js/free-tv-apis.js        # Legal/free TV API hub
assets/js/nav-state.js           # Global nav active-state guard
lab.html                         # standalone Kinetic Optics Lab
.github/workflows/               # GitHub Pages deployment
```

---

## License

MIT. Channel data is provided by iptv-org under its own terms. This project does not host, own, or claim rights to any stream.
