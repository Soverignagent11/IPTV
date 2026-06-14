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
  $("#hero").hidden = false;
  $("#gridHead").hidden = true;
  $("#grid").innerHTML = "";
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
  fav.onclick = (e) => { e.stopPropagation(); toggleFav(c.id); fav.classList.toggle("on"); };
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

  if (window.Hls && Hls.isSupported()) {
    hls = new Hls({ maxBufferLength: 20, manifestLoadingTimeOut: 9000, manifestLoadingMaxRetry: 1 });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, onReady);
    hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) onFail(); });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    // Safari / iOS native HLS (also dodges many CORS issues hls.js hits).
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
  $("#hero").hidden = true;
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
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => (t.hidden = true), 250); }, 2200);
}

/* ============================================================
 * Navigation / wiring
 * ============================================================ */
function setActiveNav(view) {
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view));
}

function show(sel) { $(sel).hidden = false; }
function hide(sel) { $(sel).hidden = true; }
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function wire() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.onclick = () => {
      const v = btn.dataset.view;
      $("#searchInput").value = "";
      $("#searchClear").hidden = true;
      closeSidebar();
      if (v === "home") renderHome();
      else if (v === "categories") { setActiveNav("categories"); renderBrowse("categories"); }
      else if (v === "countries") { setActiveNav("countries"); renderBrowse("countries"); }
      else if (v === "multiview") renderMultiview();
      else if (v === "favorites") renderFavorites();
    };
  });

  document.querySelectorAll("[data-view-link]").forEach((b) => {
    b.onclick = () => { setActiveNav("categories"); renderBrowse("categories"); };
  });

  $("#heroSurprise").onclick = () => {
    if (!state.channels.length) return;
    openPlayer(state.channels[Math.floor(Math.random() * state.channels.length)]);
  };

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
    if (!$("#pickerOverlay").hidden) closePicker();
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
