# 📺 Nova TV — Free IPTV Web Player

A clean, self-contained TV app you can host for free on **GitHub Pages**. It browses
thousands of public live‑TV channels and plays them right in the browser — no backend,
no build step, no tracking.

Channel and stream data come from the open‑source **[iptv‑org](https://github.com/iptv-org/iptv)**
project's public API. Video plays via [hls.js](https://github.com/video-dev/hls.js).

![No backend](https://img.shields.io/badge/backend-none-blue) ![Static](https://img.shields.io/badge/100%25-static-success) ![License MIT](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

- **Browse** by Home rows, Categories, or Countries
- **Search** across channel names, countries, and categories
- **Favorites** saved locally in your browser (no account)
- **"Surprise me"** to jump into a random channel
- **Responsive** — works on desktop, tablet, and phone
- **Safe by default** — adult/NSFW channels are filtered out

## 🔒 Privacy & safety

- No analytics, cookies, or telemetry. Favorites live only in your browser's `localStorage`.
- Only two external resources are loaded: the iptv‑org JSON data and the hls.js library (from jsDelivr CDN).
- Streams are **video content**, not code — they can't run anything on your device.
- Streams are publicly listed by iptv‑org; some may be offline or geo‑restricted in your region.

## 🚀 Deploy to GitHub Pages

This repo includes a workflow (`.github/workflows/deploy.yml`) that publishes the site automatically.

1. Push this branch to GitHub (already done if you're reading this there).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. The "Deploy Nova TV to GitHub Pages" workflow runs on every push and gives you a live URL like:
   `https://<your-username>.github.io/<repo>/`

That's it — open the URL and start watching.

### Run locally

It's just static files, so any static server works:

```bash
# Python
python3 -m http.server 8080
# then open http://localhost:8080
```

## 🗂️ Project structure

```
index.html            # markup + layout
assets/css/style.css  # theme & responsive styles
assets/js/app.js       # data loading, rendering, search, HLS player
.github/workflows/    # GitHub Pages deployment
```

## 📄 License

MIT. Channel data is provided by iptv‑org under its own terms. This project does not host
or own any of the streams.
