# 📺 Nova TV — Signalverse

Nova TV is a self-contained, static public live-TV browser designed for **GitHub Pages**.
It uses public channel and stream metadata from the open-source **[iptv-org](https://github.com/iptv-org/iptv)** project and plays compatible HLS streams in the browser with **[hls.js](https://github.com/video-dev/hls.js)**.

Build 33 expands Signalverse with a premium **Channel Guide** and a legal **Free TV API Hub**. Nova is still safe-by-default: no backend, no accounts, no tracking, no adult toggle, and no pirate IPTV feeds.

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

Nova does **not** add pirate IPTV lists, adult sources, private playlists, or tools to bypass broadcaster restrictions.

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
index.html                    # Signalverse shell
assets/css/style.css          # Signalverse/Kinetic Optics V2 visual system
assets/css/guide.css          # Channel Guide layer
assets/css/api-sources.css    # Free TV API Hub styles
assets/js/app.js              # data loading, signal field, scanner, player, Signal Wall
assets/js/guide.js            # Channel Guide logic
assets/js/free-tv-apis.js     # Legal/free TV API hub
lab.html                      # standalone Kinetic Optics Lab
.github/workflows/            # GitHub Pages deployment
```

---

## License

MIT. Channel data is provided by iptv-org under its own terms. This project does not host, own, or claim rights to any stream.
