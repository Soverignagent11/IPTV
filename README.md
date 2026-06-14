# 📺 Nova TV — Signalverse

Nova TV is a self-contained, static public live-TV browser designed for **GitHub Pages**.
It uses public channel and stream metadata from the open-source **[iptv-org](https://github.com/iptv-org/iptv)** project and plays compatible HLS streams in the browser with **[hls.js](https://github.com/video-dev/hls.js)**.

Build 30 redesigns the product around **Signalverse**: a live broadcast field where channels appear as orbiting signals instead of a normal grid-first TV app.

![Static](https://img.shields.io/badge/100%25-static-success) ![No backend](https://img.shields.io/badge/backend-none-blue) ![Safe public mode](https://img.shields.io/badge/safe-public_mode-green) ![License MIT](https://img.shields.io/badge/license-MIT-green)

---

## What Signalverse changes

- **Signal Field home**
  - channels appear as orbiting live-signal nodes
  - selecting a node opens a lens-style preview
  - nearby/random/far-away scanning changes the field

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
- Local favorites
- Recent signals
- Signal Wall multi-view
- Player with source fallback
- Command scanner with `Cmd/Ctrl + K`
- Static GitHub Pages deployment

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
index.html            # Signalverse shell
assets/css/style.css  # Signalverse/Kinetic Optics V2 visual system
assets/js/app.js      # data loading, signal field, scanner, player, Signal Wall
lab.html              # standalone Kinetic Optics Lab
.github/workflows/    # GitHub Pages deployment
```

---

## License

MIT. Channel data is provided by iptv-org under its own terms. This project does not host, own, or claim rights to any stream.
