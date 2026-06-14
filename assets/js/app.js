/* ============================================================
 * Nova TV — a static IPTV web player.
 * Channel + stream metadata comes from the public iptv-org API
 * (https://github.com/iptv-org/api). No backend required.
 * ============================================================ */

const API = "https://iptv-org.github.io/api";

const state = {
  channels: [],          // currently visible channels (adult filter applied)
  allChannels: [],       // everything loaded, including 18+ and experimental
  adult: localStorage.getItem("nova:adult") === "1",
  byId: new Map(),
  categories: [],        // {id, name}
  countries: [],         // {code, name, flag}
  catName: new Map(),
  view: "home",
  favorites: new Set(JSON.parse(localStorage.getItem("nova:favs") || "[]")),
  recent: JSON.parse(localStorage.getItem("nova:recent") || "[]"),
  multi: [],          // channel ids currently on the multi-view wall
  multiCols: 2,       // grid columns for multi-view
};

/* ---------- tiny DOM helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ============================================================
 * Data loading
 * ============================================================ */
async function loadData() {
  show("#loading");
  try {
    const [channels, streams, categories, countries] = await Promise.all([
      fetch(`${API}/channels.json`).then((r) => r.json()),
      fetch(`${API}/streams.json`).then((r) => r.json()),
      fetch(`${API}/categories.json`).then((r) => r.json()),
      fetch(`${API}/countries.json`).then((r) => r.json()),
    ]);

    state.categories = categories.sort((a, b) => a.name.localeCompare(b.name));
    state.categories.forEach((c) => state.catName.set(c.id, c.name));
    state.countries = countries;
    const countryMap = new Map(countries.map((c) => [c.code, c]));

    // Collect ALL stream URLs per channel (for automatic failover), not just
    // the first. When several sources exist and one is offline or geo-blocked,
    // we can fall through to the next.
    const onHttps = location.protocol === "https:";
    // Track native https streams and http streams separately per channel.
    const streamsForCh = new Map();   // id -> { https: [], http: [] }
    for (const s of streams) {
      if (!s.channel || !s.url) continue;
      const rec = streamsForCh.get(s.channel) || { https: [], http: [] };
      if (s.url.startsWith("https:")) { if (!rec.https.includes(s.url)) rec.https.push(s.url); }
      else if (s.url.startsWith("http:")) { if (!rec.http.includes(s.url)) rec.http.push(s.url); }
      streamsForCh.set(s.channel, rec);
    }

    // Build channels. http-only channels are kept as "experimental": on an https
    // site we attempt a secure https-upgrade of the URL (no third-party proxy,
    // so it stays private) — it works on servers that also serve https.
    const built = [];
    for (const c of channels) {
      const rec = streamsForCh.get(c.id);
      if (!rec) continue;
      const upgraded = rec.http.map((u) => "https:" + u.slice(5));
      const urls = onHttps ? [...rec.https, ...upgraded] : [...rec.https, ...rec.http];
      if (!urls.length) continue;
      const country = countryMap.get(c.country);
      built.push({
        id: c.id,
        name: c.name,
        logo: c.logo || "",
        urls,
        experimental: rec.https.length === 0,   // only playable via https-upgrade
        nsfw: !!c.is_nsfw || (c.categories || []).includes("xxx"),
        categories: c.categories || [],
        country: c.country || "",
        countryName: country ? country.name : c.country || "",
        flag: country ? country.flag : "",
        network: c.network || "",
        owners: c.owners || [],
        city: c.city || "",
        launched: c.launched || "",
        closed: c.closed || "",
        website: c.website || "",
        altNames: c.alt_names || [],
      });
    }

    // Merge in FAST services (Samsung TV Plus, Pluto, Plex, …) — resilient.
    if (onHttps || location.protocol === "http:") {
      const fast = await loadFastSources(countryMap);
      const seen = new Set(built.map((c) => c.id));
      for (const c of fast) if (!seen.has(c.id)) { built.push(c); seen.add(c.id); }
    }

    state.allChannels = built;
    applyAdultFilter();
    hide("#loading");
    boot();
  } catch (err) {
    console.error(err);
    hide("#loading");
    show("#loadError");
  }
}

/* ---- FAST / free ad-supported services via i.mjh.nz (HLS, https, reliable) ---- */
const FAST_SOURCES = [
  { id: "samsung", name: "Samsung TV Plus", url: "https://i.mjh.nz/SamsungTVPlus/all.m3u8" },
  { id: "pluto",   name: "Pluto TV",        url: "https://i.mjh.nz/PlutoTV/all.m3u8" },
  { id: "plex",    name: "Plex",            url: "https://i.mjh.nz/Plex/all.m3u8" },
  { id: "stirr",   name: "Stirr",           url: "https://i.mjh.nz/Stirr/all.m3u8" },
  { id: "roku",    name: "Roku",            url: "https://i.mjh.nz/Roku/all.m3u8" },
  { id: "pbs",     name: "PBS",             url: "https://i.mjh.nz/PBS/all.m3u8" },
];

async function loadFastSources(countryMap) {
  // Map category *names* -> iptv ids so FAST group-titles slot into our rows.
  const catByName = new Map(state.categories.map((c) => [c.name.toLowerCase(), c.id]));
  const results = await Promise.allSettled(
    FAST_SOURCES.map((s) =>
      fetch(s.url).then((r) => (r.ok ? r.text() : Promise.reject(r.status))).then((t) => ({ s, t }))
    )
  );
  const channels = [];
  for (const res of results) {
    if (res.status !== "fulfilled") continue;
    const { s, t } = res.value;
    for (const e of parseM3U(t)) {
      if (!e.url.startsWith("https:")) continue;     // https-only on a secure site
      const id = `${s.id}:${e.tvgId || e.name}`;
      // Region code is often the tvg-id suffix, e.g. "Channel.us".
      const cc = (e.tvgId.match(/\.([a-z]{2})$/i) || [])[1];
      const code = cc ? cc.toUpperCase() : "";
      const country = code ? countryMap.get(code) : null;
      // Match the playlist's group to one of our categories when possible.
      const g = e.group.toLowerCase();
      const catId = catByName.get(g) || [...catByName.keys()].find((n) => g.includes(n));
      channels.push({
        id,
        name: e.name,
        logo: e.logo,
        urls: [e.url],
        categories: catId ? [catByName.get(g) || catId] : [],
        country: code,
        countryName: country ? country.name : "",
        flag: country ? country.flag : "",
        network: s.name,
        provider: s.name,
        owners: [],
        city: "",
        launched: "",
        closed: "",
        website: "",
        altNames: [],
      });
    }
  }
  return channels;
}

function parseM3U(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXTINF")) continue;
    const info = lines[i];
    let url = "";
    for (let j = i + 1; j < lines.length && j < i + 4; j++) {
      const l = lines[j].trim();
      if (l && !l.startsWith("#")) { url = l; break; }
    }
    if (!url) continue;
    out.push({
      name: (info.split(",").pop() || "").trim(),
      logo: (info.match(/tvg-logo="([^"]*)"/) || [])[1] || "",
      tvgId: (info.match(/tvg-id="([^"]*)"/) || [])[1] || "",
      group: (info.match(/group-title="([^"]*)"/) || [])[1] || "",
      url,
    });
  }
  return out;
}

/* ============================================================
 * Rendering
 * ============================================================ */
function boot() {
  syncAdultToggle();
  renderQuickCategories();
  renderStats();
  renderHome();
  $("#topbarMeta").textContent = `${state.channels.length.toLocaleString()} channels available`;
}

function renderStats() {
  const cats = new Set();
  const ctrs = new Set();
  state.channels.forEach((c) => {
    c.categories.forEach((x) => cats.add(x));
    if (c.country) ctrs.add(c.country);
  });
  $("#heroStats").innerHTML = "";
  const stats = [
    [state.channels.length, "Channels"],
    [ctrs.size, "Countries"],
    [cats.size, "Categories"],
  ];
  for (const [n, label] of stats) {
    $("#heroStats").appendChild(
      el("div", "stat", `<b>${n.toLocaleString()}</b><span>${label}</span>`)
    );
  }
}

function renderQuickCategories() {
  const wrap = $("#quickCategories");
  wrap.innerHTML = "";
  const popular = ["news", "sports", "movies", "music", "entertainment", "kids", "documentary"];
  popular.forEach((id) => {
    if (!state.catName.has(id)) return;
    const chip = el("button", "chip", esc(state.catName.get(id)));
    chip.onclick = () => showCategory(id);
    wrap.appendChild(chip);
  });
}

/* ----- Home: a few curated rows ----- */
function renderHome() {
  setActiveNav("home");
  teardownMultiview();
  $("#ondemand").hidden = true;
  state.view = "home";
  $("#hero").hidden = true;
  pauseHero();
  $("#gridHead").hidden = true;
  $("#grid").innerHTML = "";
  startSurf();                       // immersive reel is the home
  const rows = $("#rows");
  rows.innerHTML = "";

  if (state.recent.length) {
    const rec = state.recent.map((id) => state.byId.get(id)).filter(Boolean);
    if (rec.length) rows.appendChild(buildRow("🕘 Recently watched", rec.slice(0, 20)));
  }

  if (state.favorites.size) {
    const favs = [...state.favorites].map((id) => state.byId.get(id)).filter(Boolean);
    if (favs.length) rows.appendChild(buildRow("⭐ Your favorites", favs.slice(0, 20)));
  }

  const feature = [
    ["🏟️ Sports", "sports"],
    ["📰 News", "news"],
    ["🎬 Movies", "movies"],
    ["🎭 Entertainment", "entertainment"],
    ["🎵 Music", "music"],
    ["🧒 Kids", "kids"],
  ];
  for (const [title, cat] of feature) {
    const list = state.channels.filter((c) => c.categories.includes(cat));
    if (list.length) rows.appendChild(buildRow(title, shuffle(list).slice(0, 18), () => showCategory(cat)));
  }
}

/* ----- Living Bento spotlight (adaptive, importance-weighted) ----- */
function buildSpotlight() {
  const want = ["sports", "news", "movies", "music", "entertainment"];
  const picks = [], used = new Set();
  for (const cat of want) {
    const list = state.channels.filter((c) => c.logo && c.categories.includes(cat) && !c.nsfw && !used.has(c.id));
    if (list.length) { const c = shuffle(list)[0]; picks.push(c); used.add(c.id); }
  }
  const extra = shuffle(state.channels.filter((c) => c.logo && !c.nsfw && !used.has(c.id)));
  while (picks.length < 7 && extra.length) { const c = extra.pop(); if (!used.has(c.id)) { picks.push(c); used.add(c.id); } }
  if (!picks.length) return null;
  const wrap = el("div");
  wrap.appendChild(el("div", "bento-label", `<span class="live-dot"></span><h2>On now</h2>`));
  const bento = el("div", "bento");
  picks.forEach((c, i) => bento.appendChild(bentoTile(c, i === 0 ? "big" : (i <= 2 ? "wide" : ""))));
  wrap.appendChild(bento);
  return wrap;
}
function bentoTile(c, span) {
  let hue = 250;
  for (const cat of c.categories) { if (CAT_HUE[cat] != null) { hue = CAT_HUE[cat]; break; } }
  const t = el("div", "b-tile" + (span ? " " + span : ""));
  t.style.setProperty("--g1", `hsl(${hue} 55% 32%)`);
  t.style.setProperty("--g2", `hsl(${(hue + 30) % 360} 45% 12%)`);
  const initials = c.name.replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 2).toUpperCase() || "TV";
  const cats = c.categories.map((x) => state.catName.get(x) || x);
  t.innerHTML =
    (c.logo ? `<img class="b-logo" src="${esc(c.logo)}" alt="" loading="lazy">` : `<div class="b-fallback">${esc(initials)}</div>`) +
    `<div class="b-sheen"></div>` +
    (c.experimental ? `<span class="b-badge beta">beta</span>` : "") +
    `<div class="b-glass"><span class="b-now">On now</span><div class="b-name">${esc(c.name)}</div><div class="b-meta">${esc((c.flag ? c.flag + " " : "") + (c.countryName || "") + (cats[0] ? " · " + cats[0] : ""))}</div></div>`;
  const img = t.querySelector(".b-logo");
  if (img) img.onerror = function () { this.outerHTML = `<div class="b-fallback">${esc(initials)}</div>`; };
  t.onclick = () => openPlayer(c);
  return t;
}

function buildRow(title, channels, onSeeAll) {
  const row = el("div", "row");
  const head = el("div", "row-head");
  head.appendChild(el("h2", null, esc(title)));
  if (onSeeAll) {
    const link = el("span", "count", "See all →");
    link.style.cursor = "pointer";
    link.onclick = onSeeAll;
    head.appendChild(link);
  }
  row.appendChild(head);
  const scroll = el("div", "row-scroll");
  channels.forEach((c) => scroll.appendChild(buildCard(c)));
  row.appendChild(scroll);
  return row;
}

function buildCard(c) {
  const card = el("div", "card" + (c.nsfw ? " nsfw" : ""));
  const initials = c.name.replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 2).toUpperCase() || "TV";
  const thumb = el("div", "card-thumb");
  if (c.logo) {
    const img = el("img");
    img.loading = "lazy";
    img.alt = c.name;
    img.src = c.logo;
    img.onerror = () => { thumb.innerHTML = `<div class="fallback">${esc(initials)}</div>`; };
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = `<div class="fallback">${esc(initials)}</div>`;
  }

  card.appendChild(el("span", "badge-live", "live"));
  if (c.nsfw) card.appendChild(el("span", "badge-flag badge-18", "18+"));
  else if (c.experimental) card.appendChild(el("span", "badge-flag badge-exp", "⚠ beta"));

  const fav = el("button", "card-fav" + (state.favorites.has(c.id) ? " on" : ""), "★");
  fav.title = "Toggle favorite";
  fav.onclick = (e) => {
    e.stopPropagation();
    toggleFav(c.id); fav.classList.toggle("on");
    const added = state.favorites.has(c.id);
    toast(added ? "★ Added to favorites" : "Removed from favorites", "Undo", () => { toggleFav(c.id); fav.classList.toggle("on"); });
  };
  card.appendChild(fav);

  card.appendChild(thumb);
  const body = el("div", "card-body");
  body.appendChild(el("div", "card-title", esc(c.name)));
  const meta = `${c.flag ? c.flag + " " : ""}${esc(c.countryName || "Unknown")}`;
  body.appendChild(el("div", "card-meta", meta));
  card.appendChild(body);

  card.onclick = () => openPlayer(c);
  return card;
}

/* ----- Grid views ----- */
function renderGrid(title, channels) {
  teardownMultiview();
  pauseHero();
  teardownSurf();
  $("#ondemand").hidden = true;
  state.view = "other";
  $("#hero").hidden = true;
  $("#rows").innerHTML = "";
  $("#gridHead").hidden = false;
  $("#gridTitle").textContent = title;
  $("#gridCount").textContent = `${channels.length.toLocaleString()} channels`;
  hide("#empty");
  const grid = $("#grid");
  grid.innerHTML = "";
  if (!channels.length) { show("#empty"); return; }
  const frag = document.createDocumentFragment();
  channels.slice(0, 600).forEach((c) => frag.appendChild(buildCard(c)));
  grid.appendChild(frag);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showCategory(id) {
  setActiveNav(null);
  const list = state.channels.filter((c) => c.categories.includes(id));
  renderGrid(state.catName.get(id) || id, list);
}

function showCountry(code) {
  setActiveNav(null);
  const list = state.channels.filter((c) => c.country === code);
  const country = state.countries.find((c) => c.code === code);
  renderGrid(`${country ? country.flag + " " + country.name : code}`, list);
}

/* ----- Browse menus (categories / countries lists as chips grid) ----- */
function renderBrowse(kind) {
  teardownMultiview();
  pauseHero();
  teardownSurf();
  $("#ondemand").hidden = true;
  state.view = "other";
  $("#hero").hidden = true;
  $("#rows").innerHTML = "";
  $("#grid").innerHTML = "";
  $("#gridHead").hidden = false;
  hide("#empty");

  const counts = new Map();
  state.channels.forEach((c) => {
    if (kind === "categories") c.categories.forEach((x) => counts.set(x, (counts.get(x) || 0) + 1));
    else if (c.country) counts.set(c.country, (counts.get(c.country) || 0) + 1);
  });

  const grid = $("#grid");
  if (kind === "categories") {
    $("#gridTitle").textContent = "Categories";
    $("#gridCount").textContent = `${counts.size} categories`;
    state.categories
      .filter((c) => counts.has(c.id))
      .sort((a, b) => counts.get(b.id) - counts.get(a.id))
      .forEach((c) => grid.appendChild(browseTile(c.name, counts.get(c.id), () => showCategory(c.id))));
  } else {
    $("#gridTitle").textContent = "Countries";
    $("#gridCount").textContent = `${counts.size} countries`;
    state.countries
      .filter((c) => counts.has(c.code))
      .sort((a, b) => counts.get(b.code) - counts.get(a.code))
      .forEach((c) => grid.appendChild(browseTile(`${c.flag} ${c.name}`, counts.get(c.code), () => showCountry(c.code))));
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function browseTile(label, count, onClick) {
  const card = el("div", "card");
  card.style.cursor = "pointer";
  const thumb = el("div", "card-thumb");
  thumb.innerHTML = `<div class="fallback" style="font-size:18px;width:auto;height:auto;padding:14px 18px">${count}</div>`;
  card.appendChild(thumb);
  const body = el("div", "card-body");
  body.appendChild(el("div", "card-title", esc(label)));
  body.appendChild(el("div", "card-meta", `${count} channels`));
  card.appendChild(body);
  card.onclick = onClick;
  return card;
}

function renderFavorites() {
  setActiveNav("favorites");
  const favs = [...state.favorites].map((id) => state.byId.get(id)).filter(Boolean);
  renderGrid("⭐ Favorites", favs);
  if (!favs.length) {
    $("#empty").querySelector("p").textContent = "No favorites yet. Tap the ★ on any channel to save it here.";
    show("#empty");
  }
}

/* ============================================================
 * Search
 * ============================================================ */
let searchTimer;
function onSearch(q) {
  q = q.trim().toLowerCase();
  $("#searchClear").hidden = !q;
  if (!q) { renderHome(); return; }
  setActiveNav(null);
  const list = state.channels.filter((c) =>
    c.name.toLowerCase().includes(q) ||
    c.countryName.toLowerCase().includes(q) ||
    (c.network || "").toLowerCase().includes(q) ||
    c.categories.some((cat) => (state.catName.get(cat) || cat).toLowerCase().includes(q))
  );
  renderGrid(`Results for “${q}”`, list);
}

/* ============================================================
 * Player (HLS.js)
 * ============================================================ */
let hls = null;
const video = $("#video");
let current = { urls: [], idx: 0 };  // active channel's sources + which one we're on
let currentChannel = null;

function openPlayer(c) {
  // Experimental (https-upgraded) channels show a one-time notice first.
  if (c.experimental) { experimentalNotice(() => openPlayerNow(c)); return; }
  openPlayerNow(c);
}

function openPlayerNow(c) {
  currentChannel = c;
  pauseSurf();
  $("#playerOverlay").hidden = false;
  document.body.style.overflow = "hidden";
  $("#playerTitle").textContent = c.name;
  $("#playerSub").textContent = `${c.flag ? c.flag + " " : ""}${c.countryName || ""} · ${
    c.categories.map((x) => state.catName.get(x) || x).slice(0, 3).join(", ") || "Live TV"}`;
  $("#playerLogo").src = c.logo || "";
  $("#playerLogo").style.visibility = c.logo ? "visible" : "hidden";
  $("#playerDesc").hidden = true;

  const favBtn = $("#playerFav");
  favBtn.classList.toggle("on", state.favorites.has(c.id));
  favBtn.onclick = () => {
    toggleFav(c.id); favBtn.classList.toggle("on");
    toast(state.favorites.has(c.id) ? "★ Added to favorites" : "Removed from favorites");
  };

  pushRecent(c.id);
  current = { urls: c.urls.slice(), idx: 0 };
  updateSourceBtn();
  playCurrent();
}

/* ----- Recently watched ----- */
function pushRecent(id) {
  state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 20);
  localStorage.setItem("nova:recent", JSON.stringify(state.recent));
}

/* ----- Channel info guide ----- */
function channelDescription(c) {
  const cats = c.categories.map((x) => state.catName.get(x) || x);
  const place = [c.city, c.countryName].filter(Boolean).join(", ");
  const lead = `${c.name} is a ${cats[0] ? cats[0].toLowerCase() + " " : ""}channel${
    place ? ` based in ${place}` : ""}${c.network ? `, operated by ${c.network}` : ""}.`;
  const rows = [
    ["Country", `${c.flag ? c.flag + " " : ""}${c.countryName || "—"}`],
    c.city && ["City", c.city],
    cats.length && ["Categories", cats.join(", ")],
    c.network && ["Network", c.network],
    c.owners.length && ["Owner", c.owners.join(", ")],
    c.launched && ["Launched", c.launched.slice(0, 4)],
    c.altNames.length && ["Also known as", c.altNames.slice(0, 4).join(", ")],
    ["Streams", `${c.urls.length} source${c.urls.length > 1 ? "s" : ""} available`],
  ].filter(Boolean);
  return `<p class="desc-lead">${esc(lead)}</p>` +
    `<dl class="desc-list">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` +
    (c.website ? `<a class="desc-link" href="${esc(c.website)}" target="_blank" rel="noopener">Visit official website ↗</a>` : "");
}

function toggleInfo() {
  const panel = $("#playerDesc");
  if (!currentChannel) return;
  if (panel.hidden) {
    $("#descTitle").textContent = currentChannel.name;
    $("#descBody").innerHTML = channelDescription(currentChannel);
    panel.hidden = false;
  } else {
    panel.hidden = true;
  }
}

/* ----- Picture-in-picture ----- */
async function togglePip() {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (document.pictureInPictureEnabled) await video.requestPictureInPicture();
    else toast("Picture-in-picture isn't supported on this browser");
  } catch { toast("Couldn't start picture-in-picture"); }
}

function playCurrent() {
  $("#playerFail").hidden = true;
  $("#playerLoading").style.display = "grid";
  playStream(current.urls[current.idx]);
}

// Move to the next source. `auto` = triggered by a failure (silent),
// otherwise it's a manual user tap that wraps around the list.
function nextSource(auto) {
  if (auto) {
    if (current.idx >= current.urls.length - 1) return false;
    current.idx++;
  } else {
    current.idx = (current.idx + 1) % current.urls.length;
  }
  updateSourceBtn();
  playCurrent();
  return true;
}

function updateSourceBtn() {
  const btn = $("#playerSource");
  if (current.urls.length > 1) {
    btn.hidden = false;
    btn.textContent = `⤵ Source ${current.idx + 1}/${current.urls.length}`;
  } else {
    btn.hidden = true;
  }
}

// Mobile browsers block autoplay-with-sound; retry muted so the picture
// still starts, and the user can unmute with the controls.
function startPlayback() {
  startAura(video);
  const p = video.play();
  if (p && p.catch) p.catch(() => { video.muted = true; video.play().catch(() => {}); });
}

function playStream(url) {
  destroyHls();
  let settled = false;
  const onReady = () => { settled = true; $("#playerLoading").style.display = "none"; startPlayback(); };
  const onFail = () => {
    if (settled) return;
    settled = true;
    // Try the next source automatically; only show the error if none are left.
    if (!nextSource(true)) { $("#playerLoading").style.display = "none"; $("#playerFail").hidden = false; }
  };

  const isFile = /\.(mp4|m4v|webm|ogv)(\?|$)/i.test(url);   // on-demand video files
  if (!isFile && window.Hls && Hls.isSupported()) {
    hls = new Hls({ maxBufferLength: 20, manifestLoadingTimeOut: 9000, manifestLoadingMaxRetry: 1 });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, onReady);
    hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) onFail(); });
  } else if (isFile || video.canPlayType("application/vnd.apple.mpegurl")) {
    // Direct file (mp4/webm) or Safari/iOS native HLS (also dodges CORS).
    video.src = url;
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("error", onFail, { once: true });
  } else {
    onFail();
  }
}

function destroyHls() {
  if (hls) { hls.destroy(); hls = null; }
  video.removeAttribute("src");
  video.load();
}

function closePlayer() {
  $("#playerOverlay").hidden = true;
  document.body.style.overflow = "";
  destroyHls();
  stopAura();
  if (state.view === "home" && !$("#surf").hidden) resumeSurf();
  else if (state.view === "home") resumeHero();
  else auraIdle();
}

/* ============================================================
 * Adult (18+) filter & gating
 * ============================================================ */
function applyAdultFilter() {
  state.channels = state.adult ? state.allChannels : state.allChannels.filter((c) => !c.nsfw);
  state.byId = new Map(state.channels.map((c) => [c.id, c]));
}

function setAdult(on) {
  state.adult = on;
  localStorage.setItem("nova:adult", on ? "1" : "0");
  applyAdultFilter();
  syncAdultToggle();
  renderHome();
  if (state.channels.length) renderStats();
  toast(on ? "🔞 18+ channels enabled" : "18+ channels hidden");
}

function syncAdultToggle() {
  const t = $("#adultToggle");
  if (t) t.classList.toggle("on", state.adult);
}

function requestAdult() {
  if (state.adult) { setAdult(false); return; }
  // Age gate before enabling.
  showModal({
    title: "🔞 Adult content — are you 18 or older?",
    body: "Enabling this reveals sexually explicit (18+) channels from the public list. They'll be clearly marked and blurred until you tap them. Only continue if you are of legal age in your country.",
    confirmText: "I'm 18+ — show them",
    cancelText: "Cancel",
    onConfirm: () => setAdult(true),
  });
}

/* One-time notice before playing an https-upgraded (experimental) stream. */
function experimentalNotice(after) {
  if (localStorage.getItem("nova:expok") === "1") { after(); return; }
  showModal({
    title: "⚠️ Experimental channel",
    body: "This channel only had an insecure (http) source, so we attempt a secure https-upgrade of the same address — no third-party proxy, so your connection stays private. It works on some servers and not others, and may be less reliable.",
    confirmText: "Got it, play it",
    cancelText: "Back",
    onConfirm: () => { localStorage.setItem("nova:expok", "1"); after(); },
  });
}

/* ---------- Reusable confirm modal ---------- */
function showModal({ title, body, confirmText, cancelText, onConfirm }) {
  $("#modalTitle").textContent = title;
  $("#modalBody").textContent = body;
  const ok = $("#modalConfirm");
  const cancel = $("#modalCancel");
  ok.textContent = confirmText || "Confirm";
  cancel.textContent = cancelText || "Cancel";
  $("#modalOverlay").hidden = false;
  const close = () => { $("#modalOverlay").hidden = true; ok.onclick = cancel.onclick = null; };
  ok.onclick = () => { close(); onConfirm && onConfirm(); };
  cancel.onclick = close;
}

/* ============================================================
 * Favorites
 * ============================================================ */
function toggleFav(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem("nova:favs", JSON.stringify([...state.favorites]));
}

/* ============================================================
 * Multi-view (watch several channels at once)
 * ============================================================ */
const mvHls = new Map();   // tile index -> Hls instance

function renderMultiview() {
  setActiveNav("multiview");
  pauseHero();
  teardownSurf();
  state.view = "other";
  $("#hero").hidden = true;
  $("#ondemand").hidden = true;
  $("#rows").innerHTML = "";
  $("#gridHead").hidden = true;
  $("#grid").innerHTML = "";
  hide("#empty");
  $("#multiview").hidden = false;
  $("#mvGrid").style.setProperty("--mv-cols", state.multiCols);
  document.querySelectorAll(".mv-layout").forEach((b) =>
    b.classList.toggle("on", +b.dataset.cols === state.multiCols));
  drawMvTiles();
}

function drawMvTiles() {
  const grid = $("#mvGrid");
  // Tear down existing players before redrawing.
  mvHls.forEach((h) => h.destroy());
  mvHls.clear();
  grid.innerHTML = "";

  state.multi.forEach((id, i) => {
    const c = state.byId.get(id);
    if (!c) return;
    const tile = el("div", "mv-tile");
    tile.innerHTML = `
      <video playsinline muted autoplay></video>
      <div class="mv-load"><div class="spinner"></div></div>
      <div class="mv-bar">
        <span class="mv-name">${esc(c.name)}</span>
        <button class="mv-btn mv-mute" title="Unmute">🔇</button>
        <button class="mv-btn mv-max" title="Open fullscreen">⛶</button>
        <button class="mv-btn mv-rm" title="Remove">✕</button>
      </div>`;
    grid.appendChild(tile);

    const v = tile.querySelector("video");
    mvPlay(v, c.urls, i, tile);

    tile.querySelector(".mv-mute").onclick = (e) => {
      const btn = e.currentTarget;
      // Solo audio: unmuting one tile mutes the others.
      grid.querySelectorAll("video").forEach((other) => { if (other !== v) other.muted = true; });
      grid.querySelectorAll(".mv-mute").forEach((b) => { if (b !== btn) { b.textContent = "🔇"; b.title = "Unmute"; } });
      v.muted = !v.muted;
      btn.textContent = v.muted ? "🔇" : "🔊";
      btn.title = v.muted ? "Unmute" : "Mute";
    };
    tile.querySelector(".mv-max").onclick = () => openPlayer(c);
    tile.querySelector(".mv-rm").onclick = () => {
      state.multi = state.multi.filter((x) => x !== id);
      drawMvTiles();
    };
  });

  if (state.multi.length < 9) {
    const add = el("div", "mv-tile mv-add");
    add.innerHTML = `<div class="mv-add-inner"><span>＋</span><b>Add channel</b></div>`;
    add.onclick = () => openPicker((c) => {
      if (!state.multi.includes(c.id)) state.multi.push(c.id);
      drawMvTiles();
    });
    grid.appendChild(add);
  }
}

function mvPlay(v, urls, i, tile) {
  let idx = 0;
  const load = tile.querySelector(".mv-load");
  const start = () => {
    if (mvHls.has(i)) { mvHls.get(i).destroy(); mvHls.delete(i); }
    const ok = () => { load.style.display = "none"; v.play().catch(() => {}); };
    const bad = () => {
      if (idx < urls.length - 1) { idx++; start(); }
      else { load.innerHTML = '<span class="mv-off">Offline</span>'; }
    };
    if (window.Hls && Hls.isSupported()) {
      const h = new Hls({ manifestLoadingTimeOut: 9000, manifestLoadingMaxRetry: 1 });
      mvHls.set(i, h);
      h.loadSource(urls[idx]); h.attachMedia(v);
      h.on(Hls.Events.MANIFEST_PARSED, ok);
      h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) bad(); });
    } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = urls[idx];
      v.addEventListener("loadedmetadata", ok, { once: true });
      v.addEventListener("error", bad, { once: true });
    } else { bad(); }
  };
  start();
}

function teardownMultiview() {
  mvHls.forEach((h) => h.destroy());
  mvHls.clear();
  $("#multiview").hidden = true;
}

/* ============================================================
 * Channel picker
 * ============================================================ */
let pickerPick = null;
function openPicker(onPick) {
  pickerPick = onPick;
  $("#pickerOverlay").hidden = false;
  $("#pickerInput").value = "";
  renderPicker("");
  setTimeout(() => $("#pickerInput").focus(), 50);
}
function closePicker() { $("#pickerOverlay").hidden = true; pickerPick = null; }

function renderPicker(q) {
  q = q.trim().toLowerCase();
  const list = (q
    ? state.channels.filter((c) => c.name.toLowerCase().includes(q) || c.countryName.toLowerCase().includes(q))
    : state.channels
  ).slice(0, 80);
  const wrap = $("#pickerResults");
  wrap.innerHTML = "";
  const frag = document.createDocumentFragment();
  list.forEach((c) => {
    const row = el("div", "picker-row");
    const initials = c.name.replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 2).toUpperCase() || "TV";
    row.innerHTML = `
      <div class="picker-logo">${c.logo ? `<img src="${esc(c.logo)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc(initials)}'))">` : esc(initials)}</div>
      <div class="picker-meta"><b>${esc(c.name)}</b><span>${c.flag ? c.flag + " " : ""}${esc(c.countryName || "")}</span></div>
      <span class="picker-add">＋</span>`;
    row.onclick = () => { if (pickerPick) pickerPick(c); closePicker(); toast(`Added ${c.name} to the wall`); };
    frag.appendChild(row);
  });
  wrap.appendChild(frag);
}

/* ============================================================
 * Toast
 * ============================================================ */
let toastTimer;
function toast(msg, actionLabel, actionFn) {
  const t = $("#toast");
  t.innerHTML = "";
  t.appendChild(document.createTextNode(msg));
  if (actionLabel && actionFn) {
    const b = el("button", "toast-action", esc(actionLabel));
    b.onclick = () => { actionFn(); t.classList.remove("show"); setTimeout(() => (t.hidden = true), 200); };
    t.appendChild(b);
  }
  t.hidden = false;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => (t.hidden = true), 250); }, actionLabel ? 4000 : 2200);
}

/* ============================================================
 * Aura chroma engine — the UI tints to on-screen content
 * ============================================================ */
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const CAT_HUE = { sports: 142, news: 212, movies: 280, music: 330, kids: 38, entertainment: 255, documentary: 188, comedy: 48, business: 205, classic: 30, religious: 265, lifestyle: 160, cooking: 24, travel: 175, science: 200, weather: 198, auto: 8, family: 50, general: 250, education: 210 };
let auraCanvas, auraCtx, auraRAF = 0, auraVideo = null, auraLast = 0;

function setAura(a1, a2, a3) {
  const s = document.documentElement.style;
  s.setProperty("--aura-1", a1); s.setProperty("--aura-2", a2); s.setProperty("--aura-3", a3);
}
function auraIdle() { setAura("#7c6cff", "#2dd4bf", "#1b2a6b"); }
function auraFromChannel(c) {
  let hue = 250;
  for (const cat of (c && c.categories) || []) { if (CAT_HUE[cat] != null) { hue = CAT_HUE[cat]; break; } }
  setAura(`hsl(${hue} 72% 56%)`, `hsl(${(hue + 38) % 360} 64% 46%)`, `hsl(${(hue + 200) % 360} 58% 24%)`);
}
function startAura(v) {
  if (reduceMotion) return;
  if (!auraCanvas) { auraCanvas = document.createElement("canvas"); auraCanvas.width = 32; auraCanvas.height = 18; auraCtx = auraCanvas.getContext("2d", { willReadFrequently: true }); }
  auraVideo = v;
  if (!auraRAF) auraRAF = requestAnimationFrame(auraLoop);
}
function stopAura() { auraVideo = null; }
function auraLoop(t) {
  auraRAF = requestAnimationFrame(auraLoop);
  if (!auraVideo) return;
  if (t - auraLast < 220) return; auraLast = t;
  const v = auraVideo;
  if (v.readyState < 2 || !v.videoWidth) return;
  try {
    auraCtx.drawImage(v, 0, 0, 32, 18);
    const d = auraCtx.getImageData(0, 0, 32, 18).data;
    let r = 0, g = 0, b = 0, n = 0, mr = 0, mg = 0, mb = 0, ms = -1;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      r += R; g += G; b += B; n++;
      const sat = Math.max(R, G, B) - Math.min(R, G, B);
      if (sat > ms) { ms = sat; mr = R; mg = G; mb = B; }
    }
    r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
    const bo = (c) => Math.min(255, Math.round(c * 1.12));
    setAura(`rgb(${bo(mr)} ${bo(mg)} ${bo(mb)})`, `rgb(${r} ${g} ${b})`, `rgb(${Math.round(r * 0.35)} ${Math.round(g * 0.35)} ${Math.round(b * 0.5)})`);
  } catch (e) {
    // tainted canvas (cross-origin video without CORS) → graceful fallback
    auraVideo = null;
    if (currentChannel) auraFromChannel(currentChannel); else auraIdle();
  }
}

/* ============================================================
 * Holo tilt — spatial depth on pointer (desktop, motion-safe)
 * ============================================================ */
const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
let tiltEl = null;
function onTiltMove(e) {
  const t = e.target.closest(".card, .b-tile");
  if (t !== tiltEl) { if (tiltEl) { tiltEl.style.setProperty("--rx", "0deg"); tiltEl.style.setProperty("--ry", "0deg"); } tiltEl = t; }
  if (!t) return;
  const r = t.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
  t.style.setProperty("--rx", ((0.5 - py) * 7).toFixed(2) + "deg");
  t.style.setProperty("--ry", ((px - 0.5) * 9).toFixed(2) + "deg");
  t.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
  t.style.setProperty("--my", (py * 100).toFixed(1) + "%");
}

/* ============================================================
 * Cinematic featured hero (muted live preview behind the title)
 * ============================================================ */
let heroHls = null, heroFeatured = null, heroReady = false;

function streamInto(v, urls, onReady) {
  let idx = 0, h = null, dead = false;
  const start = () => {
    if (dead) return;
    if (h) { h.destroy(); h = null; }
    const ok = () => onReady && onReady();
    const bad = () => { if (idx < urls.length - 1) { idx++; start(); } };
    const isFile = /\.(mp4|m4v|webm|ogv)(\?|$)/i.test(urls[idx]);
    if (!isFile && window.Hls && Hls.isSupported()) {
      h = new Hls({ manifestLoadingTimeOut: 9000, manifestLoadingMaxRetry: 1 });
      h.loadSource(urls[idx]); h.attachMedia(v);
      h.on(Hls.Events.MANIFEST_PARSED, ok);
      h.on(Hls.Events.ERROR, (_e, dd) => { if (dd.fatal) bad(); });
    } else if (isFile || v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = urls[idx]; v.addEventListener("loadedmetadata", ok, { once: true }); v.addEventListener("error", bad, { once: true });
    } else bad();
  };
  start();
  return { destroy() { dead = true; if (h) h.destroy(); } };
}

function heroBlurb(c) {
  const cats = c.categories.map((x) => state.catName.get(x) || x);
  return `Featured live ${cats[0] ? cats[0].toLowerCase() : "channel"}${c.countryName ? ` from ${c.countryName}` : ""}. Press watch to tune in — or surf the wall.`;
}
function setFeaturedHero() {
  const v = $("#heroVideo");
  if (heroHls) { heroHls.destroy(); heroHls = null; }
  const pool = state.channels.filter((c) => c.logo && !c.experimental && !c.nsfw && (c.categories.includes("sports") || c.categories.includes("news") || c.categories.includes("movies")));
  const arr = pool.length ? pool : state.channels;
  const c = arr[Math.floor(Math.random() * arr.length)];
  if (!c) return;
  heroFeatured = c; heroReady = false;
  $("#heroEyebrow").innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:var(--accent-2);display:inline-block;box-shadow:0 0 8px var(--accent-2)"></span> Featured · ${esc((c.flag ? c.flag + " " : "") + (c.countryName || "Live"))}`;
  $("#heroTitle").textContent = c.name;
  $("#heroDesc").textContent = heroBlurb(c);
  heroHls = streamInto(v, c.urls, () => { heroReady = true; v.muted = true; v.classList.add("show"); v.play().catch(() => {}); if (state.view === "home") startAura(v); });
}
function ensureHero() { if (!heroFeatured) setFeaturedHero(); else resumeHero(); }
function pauseHero() { const v = $("#heroVideo"); v.pause(); v.classList.remove("show"); if (auraVideo === v) { stopAura(); auraIdle(); } }
function resumeHero() { const v = $("#heroVideo"); if (heroReady) { v.classList.add("show"); v.play().catch(() => {}); startAura(v); } else if (!heroFeatured) setFeaturedHero(); }

/* ============================================================
 * On Demand — Internet Archive (public domain) + VOD launchers
 * ============================================================ */
const VOD_LAUNCH = [
  { name: "Tubi", tag: "Free movies & TV", url: "https://tubitv.com", color: "#fa382f", icon: "📺" },
  { name: "Pluto TV", tag: "Live + on demand", url: "https://pluto.tv/en/on-demand", color: "#2d2d6b", icon: "🅿️" },
  { name: "Plex", tag: "Free movies & TV", url: "https://watch.plex.tv", color: "#e5a00d", icon: "▶️" },
  { name: "The Roku Channel", tag: "Free on demand", url: "https://therokuchannel.roku.com", color: "#6f1ab1", icon: "📡" },
  { name: "Crackle", tag: "Free movies", url: "https://www.crackle.com", color: "#ff7a00", icon: "🎬" },
  { name: "Internet Archive", tag: "Public-domain films", url: "https://archive.org/details/feature_films", color: "#2a6b9b", icon: "🏛️" },
];
const ARCHIVE_ROWS = [
  ["🎞️ Feature Films", "collection:(feature_films)"],
  ["📺 Classic TV", "collection:(classic_tv)"],
  ["👽 Sci-Fi & Horror", "collection:(SciFi_Horror)"],
  ["🕵️ Film Noir", "collection:(film_noir)"],
  ["🐭 Cartoons", "collection:(animationandcartoons)"],
  ["😂 Comedy", "collection:(comedy_films)"],
];

function renderOnDemand() {
  setActiveNav("ondemand"); state.view = "other";
  pauseHero(); teardownSurf(); teardownMultiview(); auraIdle();
  $("#hero").hidden = true; $("#rows").innerHTML = ""; $("#gridHead").hidden = true; $("#grid").innerHTML = ""; hide("#empty");
  const od = $("#ondemand"); od.hidden = false;
  od.innerHTML =
    `<div class="od-section"><h2>📲 Free on-demand apps</h2><div class="od-launchers">` +
    VOD_LAUNCH.map((s) => `<a class="od-launch" href="${s.url}" target="_blank" rel="noopener" style="background:linear-gradient(135deg, ${s.color}, rgba(0,0,0,0.45))"><span class="logo">${s.icon}</span><span>${esc(s.name)}<small>${esc(s.tag)} ↗</small></span></a>`).join("") +
    `</div></div><div id="odLib"></div>`;
  const lib = $("#odLib");
  for (const [title, q] of ARCHIVE_ROWS) {
    const row = el("div", "od-section");
    row.innerHTML = `<h2>${esc(title)}</h2><div class="row-scroll"></div>`;
    lib.appendChild(row);
    archiveSearch(q, 18).then((items) => {
      if (!items.length) { row.remove(); return; }
      const sc = row.querySelector(".row-scroll");
      items.forEach((it) => sc.appendChild(odCard(it)));
    }).catch(() => row.remove());
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function archiveSearch(q, rows) {
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q + " AND mediatype:(movies)")}&fl[]=identifier&fl[]=title&sort[]=downloads+desc&rows=${rows}&output=json`;
  const r = await fetch(url);
  const j = await r.json();
  return ((j.response && j.response.docs) || []).map((d) => ({ id: d.identifier, title: d.title }));
}
function odCard(it) {
  const card = el("div", "card");
  const thumb = `https://archive.org/services/img/${encodeURIComponent(it.id)}`;
  card.innerHTML = `<div class="card-thumb"><img loading="lazy" src="${thumb}" alt=""></div><div class="card-body"><div class="card-title">${esc(it.title || it.id)}</div><div class="card-meta">🏛️ Internet Archive</div></div>`;
  card.querySelector("img").onerror = function () { this.parentNode.innerHTML = '<div class="fallback">🎬</div>'; };
  card.onclick = () => openArchive(it);
  return card;
}
async function openArchive(it) {
  toast("Loading film…");
  try {
    const r = await fetch(`https://archive.org/metadata/${encodeURIComponent(it.id)}`);
    const j = await r.json();
    const files = (j.files || []).filter((f) => /\.(mp4|m4v|ogv|webm)$/i.test(f.name));
    if (!files.length) { toast("No playable file for this title"); return; }
    files.sort((a, b) => (a.name.toLowerCase().endsWith(".mp4") ? -1 : 1) - (b.name.toLowerCase().endsWith(".mp4") ? -1 : 1));
    const url = `https://archive.org/download/${encodeURIComponent(it.id)}/${encodeURIComponent(files[0].name)}`;
    openPlayerNow({ id: "ia:" + it.id, name: it.title || it.id, logo: `https://archive.org/services/img/${it.id}`, urls: [url], categories: [], country: "", countryName: "Internet Archive", flag: "🏛️", network: "Internet Archive (public domain)", owners: [], city: "", launched: "", website: `https://archive.org/details/${it.id}`, altNames: [], nsfw: false, experimental: false });
  } catch (e) { toast("Couldn't load this title"); }
}

/* ============================================================
 * Command palette (⌘/Ctrl+K) — the command layer
 * ============================================================ */
const CMDS = [
  { icon: "🏠", label: "Home", run: () => navTo("home") },
  { icon: "🗂️", label: "Categories", run: () => navTo("categories") },
  { icon: "🌍", label: "Countries", run: () => navTo("countries") },
  { icon: "🔲", label: "Multi-view", run: () => navTo("multiview") },
  { icon: "🎬", label: "On Demand", run: () => navTo("ondemand") },
  { icon: "⭐", label: "Favorites", run: () => navTo("favorites") },
  { icon: "🎲", label: "Surprise me", run: () => { closeCmd(); if (state.channels.length) openPlayer(state.channels[Math.floor(Math.random() * state.channels.length)]); } },
  { icon: "🔞", label: "Toggle 18+ channels", run: () => { closeCmd(); requestAdult(); } },
];
function openCmd() { $("#cmdOverlay").hidden = false; $("#cmdInput").value = ""; renderCmd(""); setTimeout(() => $("#cmdInput").focus(), 40); }
function closeCmd() { $("#cmdOverlay").hidden = true; }
function renderCmd(q) {
  q = q.trim().toLowerCase();
  const res = $("#cmdResults"); res.innerHTML = "";
  const frag = document.createDocumentFragment();
  CMDS.filter((c) => !q || c.label.toLowerCase().includes(q)).forEach((c) => {
    const row = el("div", "picker-row");
    row.innerHTML = `<div class="picker-logo">${c.icon}</div><div class="picker-meta"><b>${esc(c.label)}</b><span>Action</span></div><span class="picker-add">↵</span>`;
    row.onclick = c.run; frag.appendChild(row);
  });
  if (q) {
    state.channels.filter((c) => c.name.toLowerCase().includes(q) || (c.network || "").toLowerCase().includes(q)).slice(0, 40).forEach((c) => {
      const row = el("div", "picker-row");
      const initials = c.name.replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 2).toUpperCase() || "TV";
      row.innerHTML = `<div class="picker-logo">${c.logo ? `<img src="${esc(c.logo)}" alt="" onerror="this.replaceWith(document.createTextNode('${esc(initials)}'))">` : esc(initials)}</div><div class="picker-meta"><b>${esc(c.name)}</b><span>${c.flag ? c.flag + " " : ""}${esc(c.countryName || "")}</span></div><span class="picker-add">▶</span>`;
      row.onclick = () => { closeCmd(); openPlayer(c); };
      frag.appendChild(row);
    });
  }
  res.appendChild(frag);
}

/* View Transition wrapper for continuity (progressive enhancement) */
function go(fn) {
  if (document.startViewTransition && !reduceMotion) document.startViewTransition(() => fn());
  else fn();
}

/* ============================================================
 * Surf reel — immersive, one-channel-at-a-time home
 * ============================================================ */
let surf = { list: [], i: 0, hls: null, muted: true, to: 0, current: null };

function surfPool() {
  const fast = state.channels.filter((c) => c.provider && !c.nsfw);          // reliable first
  const rest = state.channels.filter((c) => !c.provider && c.logo && !c.nsfw);
  return [...shuffle(fast), ...shuffle(rest)];
}
function startSurf() {
  $("#surf").hidden = false;
  if (!surf.list.length) { surf.list = surfPool(); surf.i = 0; }
  surfLoad();
}
function surfLoad() {
  const c = surf.list[surf.i];
  if (!c) return;
  surf.current = c;
  const surfEl = $("#surf");
  surfEl.classList.remove("ready");
  $("#surfName").textContent = c.name;
  $("#surfMeta").textContent = `${c.flag ? c.flag + " " : ""}${c.countryName || ""} · ${c.categories.map((x) => state.catName.get(x) || x)[0] || "Live"}`;
  $("#surfLogo").src = c.logo || ""; $("#surfLogo").style.visibility = c.logo ? "visible" : "hidden";
  $("#surfFav").classList.toggle("on", state.favorites.has(c.id));
  $("#surfLoading").style.display = "grid";
  auraFromChannel(c);                 // instant colour, before pixels arrive
  if (surf.hls) { surf.hls.destroy(); surf.hls = null; }
  const v = $("#surfVideo");
  v.muted = surf.muted;
  surf.hls = streamInto(v, c.urls, () => {
    clearTimeout(surf.to);
    $("#surfLoading").style.display = "none";
    surfEl.classList.add("ready");
    v.muted = surf.muted;
    v.play().catch(() => { surf.muted = true; v.muted = true; updateSurfMute(); v.play().catch(() => {}); });
    startAura(v);
  });
  // If nothing plays within a few seconds, surf onward automatically.
  clearTimeout(surf.to);
  surf.to = setTimeout(() => { if (!surfEl.classList.contains("ready")) surfGo(1); }, 9000);
}
function surfGo(dir) {
  if (!surf.list.length) return;
  surf.i = (surf.i + dir + surf.list.length) % surf.list.length;
  surfLoad();
}
function updateSurfMute() {
  const b = $("#surfMute");
  if (!b) return;
  b.textContent = surf.muted ? "🔇" : "🔊";
  b.classList.toggle("on", !surf.muted);
}
function pauseSurf() { const v = $("#surfVideo"); v.pause(); if (auraVideo === v) stopAura(); }
function resumeSurf() { const v = $("#surfVideo"); if (!$("#surf").hidden) { v.play().catch(() => {}); startAura(v); } }
function teardownSurf() {
  if (surf.hls) { surf.hls.destroy(); surf.hls = null; }
  clearTimeout(surf.to);
  const v = $("#surfVideo"); v.pause();
  try { v.removeAttribute("src"); v.load(); } catch (e) {}
  if (auraVideo === v) stopAura();
  $("#surf").hidden = true;
}

/* ============================================================
 * Navigation / wiring
 * ============================================================ */
function navTo(v) {
  $("#searchInput").value = ""; $("#searchClear").hidden = true; closeSidebar(); closeCmd();
  go(() => {
    if (v === "home") renderHome();
    else if (v === "categories") { setActiveNav("categories"); renderBrowse("categories"); }
    else if (v === "countries") { setActiveNav("countries"); renderBrowse("countries"); }
    else if (v === "multiview") renderMultiview();
    else if (v === "ondemand") renderOnDemand();
    else if (v === "favorites") renderFavorites();
  });
}

function setActiveNav(view) {
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view));
}

function show(sel) { $(sel).hidden = false; }
function hide(sel) { $(sel).hidden = true; }
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function wire() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.onclick = () => navTo(btn.dataset.view);
  });
  document.querySelectorAll("[data-view-link]").forEach((b) => {
    b.onclick = () => navTo(b.dataset.viewLink || "categories");
  });

  $("#heroSurprise").onclick = () => {
    if (!state.channels.length) return;
    openPlayer(state.channels[Math.floor(Math.random() * state.channels.length)]);
  };
  $("#heroWatch").onclick = () => { if (heroFeatured) openPlayer(heroFeatured); };

  // Command palette (⌘/Ctrl + K)
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#cmdOverlay").hidden ? openCmd() : closeCmd(); }
  });
  // Surf reel
  $("#surfPrev").onclick = () => surfGo(-1);
  $("#surfNext").onclick = () => surfGo(1);
  $("#surfExpand").onclick = () => { if (surf.current) openPlayer(surf.current); };
  $("#surfMute").onclick = () => {
    surf.muted = !surf.muted; const v = $("#surfVideo"); v.muted = surf.muted;
    if (!surf.muted) v.play().catch(() => {});
    updateSurfMute();
  };
  $("#surfFav").onclick = () => {
    if (!surf.current) return;
    const id = surf.current.id;
    toggleFav(id); const on = state.favorites.has(id); $("#surfFav").classList.toggle("on", on);
    toast(on ? "★ Added to favorites" : "Removed from favorites", "Undo", () => { toggleFav(id); $("#surfFav").classList.toggle("on", state.favorites.has(id)); });
  };
  updateSurfMute();
  const surfEl = $("#surf");
  let sy0 = null;
  surfEl.addEventListener("touchstart", (e) => { sy0 = e.touches[0].clientY; }, { passive: true });
  surfEl.addEventListener("touchend", (e) => { if (sy0 == null) return; const dy = e.changedTouches[0].clientY - sy0; if (Math.abs(dy) > 55) surfGo(dy < 0 ? 1 : -1); sy0 = null; }, { passive: true });
  let wheelLock = false;
  surfEl.addEventListener("wheel", (e) => { if (wheelLock || Math.abs(e.deltaY) < 12) return; wheelLock = true; setTimeout(() => (wheelLock = false), 700); surfGo(e.deltaY > 0 ? 1 : -1); }, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (state.view !== "home" || $("#surf").hidden) return;
    if (!$("#playerOverlay").hidden || !$("#cmdOverlay").hidden || !$("#pickerOverlay").hidden || !$("#modalOverlay").hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); surfGo(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); surfGo(-1); }
  });

  $("#cmdBtn").onclick = openCmd;
  $("#cmdClose").onclick = closeCmd;
  $("#cmdOverlay").onclick = (e) => { if (e.target.id === "cmdOverlay") closeCmd(); };
  const cmdIn = $("#cmdInput");
  cmdIn.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => renderCmd(cmdIn.value), 120); };

  // Holo tilt (desktop, motion-safe)
  if (canHover && !reduceMotion) document.addEventListener("pointermove", onTiltMove, { passive: true });

  const input = $("#searchInput");
  input.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => onSearch(input.value), 220); };
  $("#searchClear").onclick = () => { input.value = ""; onSearch(""); input.focus(); };

  $("#playerSource").onclick = () => nextSource(false);
  $("#playerRetry").onclick = () => { current.idx = 0; updateSourceBtn(); playCurrent(); };
  $("#playerInfo").onclick = toggleInfo;
  $("#playerPip").onclick = togglePip;
  $("#descClose").onclick = () => ($("#playerDesc").hidden = true);
  $("#playerClose").onclick = closePlayer;
  $("#playerOverlay").onclick = (e) => { if (e.target.id === "playerOverlay") closePlayer(); };

  // Channel picker (multi-view)
  $("#pickerClose").onclick = closePicker;
  $("#pickerOverlay").onclick = (e) => { if (e.target.id === "pickerOverlay") closePicker(); };
  const pIn = $("#pickerInput");
  pIn.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => renderPicker(pIn.value), 180); };

  // Multi-view layout buttons
  document.querySelectorAll(".mv-layout").forEach((b) => {
    b.onclick = () => {
      state.multiCols = +b.dataset.cols;
      $("#mvGrid").style.setProperty("--mv-cols", state.multiCols);
      document.querySelectorAll(".mv-layout").forEach((x) => x.classList.toggle("on", x === b));
    };
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#cmdOverlay").hidden) closeCmd();
    else if (!$("#pickerOverlay").hidden) closePicker();
    else if (!$("#playerDesc").hidden) $("#playerDesc").hidden = true;
    else if (!$("#playerOverlay").hidden) closePlayer();
  });

  $("#adultToggle").onclick = requestAdult;
  $("#modalOverlay").onclick = (e) => { if (e.target.id === "modalOverlay") $("#modalOverlay").hidden = true; };

  $("#menuToggle").onclick = () => $("#sidebar").classList.toggle("open");
}
function closeSidebar() { $("#sidebar").classList.remove("open"); }

wire();
loadData();
