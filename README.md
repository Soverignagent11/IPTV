# 📺 Nova TV — Kinetic Optics Live TV

Nova TV is a self-contained, static public live-TV browser designed for **GitHub Pages**.
It uses public channel and stream metadata from the open-source **[iptv-org](https://github.com/iptv-org/iptv)** project and plays compatible HLS streams in the browser with **[hls.js](https://github.com/video-dev/hls.js)**.

This version redesigns the app around a new visual language called **Kinetic Optics**: selective optical responsiveness, adaptive glass, pressure-like controls, safe focus halos, context fog, and legibility-first motion.

![Static](https://img.shields.io/badge/100%25-static-success) ![No backend](https://img.shields.io/badge/backend-none-blue) ![License MIT](https://img.shields.io/badge/license-MIT-green)

---

## ✨ What changed in Build 20

- **Top-to-bottom Kinetic Optics redesign**
  - adaptive edge-lensing surfaces
  - prismatic rim highlights
  - context fog for readability
  - pressure-style button feedback
  - contact-light propagation on interaction
  - magnetic, high-visibility focus rings
  - reduced-motion and reduced-transparency fallbacks

- **Safer public mode**
  - adult/NSFW channels are filtered out by default and no adult toggle is exposed
  - only HTTPS public stream URLs are used
  - the app does not host, own, scrape, or redistribute streams
  - no analytics, cookies, accounts, or backend tracking

- **Rebuilt browsing experience**
  - Home with featured public live channel rows
  - Discover view
  - category index
  - country index
  - local favorites
  - recent channels
  - command palette with `Cmd/Ctrl + K`
  - Signal Wall multi-view for multiple muted streams

---

## 🔒 Privacy and content policy

Nova TV is a static front-end. It does not run a backend and does not collect user data.

Local browser storage is used only for:

- favorites
- recent channels
- Signal Wall channel IDs

Channel and stream availability depends on the public sources listed by iptv-org. Some streams may be offline, unsupported by a browser, or unavailable in a region. Nova TV does not bypass broadcaster restrictions and does not provide access to private, pirated, or adult content.

---

## 🚀 Deploy to GitHub Pages

This repo includes a workflow in `.github/workflows/` that can publish the static site automatically.

1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main`.
4. Open the published GitHub Pages URL.

---

## Run locally

Use any static server:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

---

## 🗂️ Project structure

```text
index.html            # markup and app shell
assets/css/style.css  # Kinetic Optics visual language
assets/js/app.js      # data loading, rendering, search, player, Signal Wall
.github/workflows/    # GitHub Pages deployment
```

---

## 📄 License

MIT. Channel data is provided by iptv-org under its own terms. This project does not host, own, or claim rights to any stream.
