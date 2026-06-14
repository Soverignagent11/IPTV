/* ============================================================
 * Nova TV — Kinetic Optics Edition
 * Static, public, safe-by-default live-TV browser.
 * ============================================================ */

const API = "https://iptv-org.github.io/api";
const SAFE_STORAGE = {
  favs: "nova:favorites:v20",
  recent: "nova:recent:v20",
  multiview: "nova:multiview:v20",
};

const state = {
  allChannels: [],
  channels: [],
  byId: new Map(),
  categories: [],
  countries: [],
  catName: new Map(),
  countryName: new Map(),
  favorites: new Set(readJSON(SAFE_STORAGE.favs, [])),
  recent: readJSON(SAFE_STORAGE.recent, []),
  multi: readJSON(SAFE_STORAGE.multiview, []),
  multiCols: 2,
  view: "home",
  current: null,
  sourceIndex: 0,
  hls: null,
  mvPlayers: [],
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function show(sel) { const n = typeof sel === "string" ? $(sel) : sel; if (n) n.hidden = false; }
function hide(sel) { const n = typeof sel === "string" ? $(sel) : sel; if (n) n.hidden = true; }

/* ============================================================
 * Boot
 * ============================================================ */

window.addEventListener("DOMContentLoaded", () => {
  bindGlobalUI();
  bootLightField();
  loadData();
});

async function loadData() {
  show("#loading");
  hide("#loadError");

  try {
    const [channels, streams, categories, countries] = await Promise.all([
      fetch(`${API}/channels.json`).then((r) => r.json()),
      fetch(`${API}/streams.json`).then((r) => r.json()),
      fetch(`${API}/categories.json`).then((r) => r.json()),
      fetch(`${API}/countries.json`).then((r) => r.json()),
    ]);

    state.categories = categories
      .filter((c) => c && c.id !== "xxx")
      .sort((a, b) => a.name.localeCompare(b.name));
    state.countries = countries.sort((a, b) => a.name.localeCompare(b.name));
    state.catName = new Map(state.categories.map((c) => [c.id, c.name]));
    state.countryName = new Map(state.countries.map((c) => [c.code, c]));

    const streamMap = new Map();
    for (const s of streams) {
      if (!s.channel || !s.url) continue;
      if (!s.url.startsWith("https:")) continue;
      const list = streamMap.get(s.channel) || [];
      if (!list.includes(s.url)) list.push(s.url);
      streamMap.set(s.channel, list);
    }

    const built = [];
    for (const channel of channels) {
      const urls = streamMap.get(channel.id) || [];
      if (!urls.length) continue;
      const categories = (channel.categories || []).filter((id) => id !== "xxx");
      const nsfw = Boolean(channel.is_nsfw || (channel.categories || []).includes("xxx"));
      if (nsfw) continue;
      const country = state.countryName.get(channel.country);
      built.push({
        id: channel.id,
        name: channel.name || channel.id,
        logo: channel.logo || "",
        urls,
        categories,
        country: channel.country || "",
        countryName: country ? country.name : channel.country || "",
        flag: country ? country.flag : "",
        network: channel.network || "",
        owners: channel.owners || [],
        city: channel.city || "",
        launched: channel.launched || "",
        closed: channel.closed || "",
        website: channel.website || "",
        altNames: channel.alt_names || [],
      });
    }

    built.sort((a, b) => a.name.localeCompare(b.name));
    state.allChannels = built;
    state.channels = built;
    state.byId = new Map(built.map((c) => [c.id, c]));
    state.recent = state.recent.filter((id) => state.byId.has(id)).slice(0, 40);
    state.multi = state.multi.filter((id) => state.byId.has(id)).slice(0, 9);
    writeJSON(SAFE_STORAGE.recent, state.recent);
    writeJSON(SAFE_STORAGE.multiview, state.multi);

    hide("#loading");
    renderChrome();
    renderHome();
  } catch (err) {
    console.error(err);
    hide("#loading");
    show("#loadError");
  }
}

function renderChrome() {
  const cats = new Set();
  const countries = new Set();
  for (const c of state.channels) {
    c.categories.forEach((x) => cats.add(x));
    if (c.country) countries.add(c.country);
  }

  $("#safeCount").textContent = state.channels.length.toLocaleString();
  $("#countryCount").textContent = countries.size.toLocaleString();
  $("#categoryCount").textContent = cats.size.toLocaleString();
  $("#topbarMeta").textContent = `${state.channels.length.toLocaleString()} safe public channels`;

  const heroStats = $("#heroStats");
  heroStats.innerHTML = "";
  [[state.channels.length, "Safe channels"], [countries.size, "Countries"], [cats.size, "Categories"]].forEach(([n, label]) => {
    heroStats.appendChild(el("div", "stat", `<b>${Number(n).toLocaleString()}</b><span>${label}</span>`));
  });

  const quick = $("#quickCategories");
  quick.innerHTML = "";
  ["news", "sports", "movies", "music", "entertainment", "kids", "documentary"].forEach((id) => {
    if (!state.catName.has(id)) return;
    const chip = el("button", "chip", esc(state.catName.get(id)));
    chip.type = "button";
    chip.addEventListener("click", () => showCategory(id));
    quick.appendChild(chip);
  });
}

/* ============================================================
 * Navigation and views
 * ============================================================ */

function bindGlobalUI() {
  document.addEventListener("pointermove", updateOpticPointer, { passive: true });
  document.addEventListener("click", createContactLight, true);

  $("#menuToggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $$(".nav-item[data-view]").forEach((btn) => btn.addEventListener("click", () => route(btn.dataset.view)));
  $("#searchInput").addEventListener("input", handleSearch);
  $("#searchClear").addEventListener("click", clearSearch);
  $("#cmdBtn").addEventListener("click", openCommand);
  $("#cmdClose").addEventListener("click", closeCommand);
  $("#cmdInput").addEventListener("input", renderCommandResults);
  $("#surpriseBtn").addEventListener("click", surprise);
  $("#heroSurprise").addEventListener("click", surprise);
  $("#heroWatch").addEventListener("click", () => state.current ? openPlayer(state.current) : surprise());

  $("#playerClose").addEventListener("click", closePlayer);
  $("#playerRetry").addEventListener("click", nextSource);
  $("#playerSource").addEventListener("click", nextSource);
  $("#playerFav").addEventListener("click", () => state.current && toggleFavorite(state.current.id, true));
  $("#playerInfo").addEventListener("click", togglePlayerDetails);
  $("#playerPip").addEventListener("click", requestPip);

  $("#pickerClose").addEventListener("click", closePicker);
  $("#pickerInput").addEventListener("input", renderPickerResults);

  $$(".seg-btn").forEach((btn) => btn.addEventListener("click", () => setMultiCols(Number(btn.dataset.cols))));

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === "k") { event.preventDefault(); openCommand(); }
    if (event.key === "Escape") { closeCommand(); closePicker(); closePlayer(); $("#sidebar").classList.remove("open"); }
  });
}

function route(view) {
  clearSearch(false);
  teardownMultiview();
  hide("#empty");
  $("#sidebar").classList.remove("open");
  if (view === "home") return renderHome();
  if (view === "discover") return showGrid("Discover", smartShuffle(state.channels).slice(0, 180));
  if (view === "categories") return showCategories();
  if (view === "countries") return showCountries();
  if (view === "favorites") return showFavorites();
  if (view === "multiview") return showMultiview();
}

function setActiveNav(view) {
  state.view = view;
  $$(".nav-item[data-view]").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
}

function clearMain() {
  $("#rows").innerHTML = "";
  $("#grid").innerHTML = "";
  $("#viewHead").hidden = true;
  $("#multiview").hidden = true;
}

function renderHome() {
  setActiveNav("home");
  clearMain();
  $("#hero").hidden = false;
  const rows = $("#rows");
  const featured = pickFeatured();
  setHero(featured);

  const spotlight = buildSpotlight();
  if (spotlight) rows.appendChild(spotlight);

  const recent = state.recent.map((id) => state.byId.get(id)).filter(Boolean);
  if (recent.length) rows.appendChild(buildRow("Recently watched", recent.slice(0, 20)));

  const favs = [...state.favorites].map((id) => state.byId.get(id)).filter(Boolean);
  if (favs.length) rows.appendChild(buildRow("Favorites", favs.slice(0, 20), showFavorites));

  const curated = [
    ["News", "news"],
    ["Sports", "sports"],
    ["Movies", "movies"],
    ["Music", "music"],
    ["Entertainment", "entertainment"],
    ["Kids", "kids"],
    ["Documentary", "documentary"],
  ];
  for (const [title, cat] of curated) {
    const list = state.channels.filter((c) => c.categories.includes(cat));
    if (list.length) rows.appendChild(buildRow(title, smartShuffle(list).slice(0, 22), () => showCategory(cat)));
  }
}

function showGrid(title, channels) {
  setActiveNav(state.view === "home" ? "discover" : state.view);
  clearMain();
  $("#hero").hidden = true;
  $("#viewHead").hidden = false;
  $("#gridTitle").textContent = title;
  $("#gridCount").textContent = `${channels.length.toLocaleString()} channels`;
  const grid = $("#grid");
  grid.innerHTML = "";
  channels.forEach((c) => grid.appendChild(channelCard(c)));
  $("#empty").hidden = channels.length !== 0;
  enhanceOptics(grid);
}

function showCategory(id) {
  state.view = "categories";
  setActiveNav("categories");
  const name = state.catName.get(id) || id;
  showGrid(name, state.channels.filter((c) => c.categories.includes(id)));
}

function showCountry(code) {
  state.view = "countries";
  setActiveNav("countries");
  const country = state.countryName.get(code);
  showGrid(country ? `${country.flag || ""} ${country.name}`.trim() : code, state.channels.filter((c) => c.country === code));
}

function showFavorites() {
  state.view = "favorites";
  setActiveNav("favorites");
  const list = [...state.favorites].map((id) => state.byId.get(id)).filter(Boolean);
  showGrid("Favorites", list);
}

function showCategories() {
  setActiveNav("categories");
  clearMain();
  $("#hero").hidden = true;
  $("#viewHead").hidden = false;
  $("#gridTitle").textContent = "Categories";
  const counts = countBy((c) => c.categories);
  $("#gridCount").textContent = `${counts.size.toLocaleString()} active categories`;
  const grid = $("#grid");
  grid.innerHTML = "";
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([id, count]) => grid.appendChild(indexCard(state.catName.get(id) || id, `${count.toLocaleString()} channels`, () => showCategory(id))));
}

function showCountries() {
  setActiveNav("countries");
  clearMain();
  $("#hero").hidden = true;
  $("#viewHead").hidden = false;
  $("#gridTitle").textContent = "Countries";
  const counts = countBy((c) => c.country ? [c.country] : []);
  $("#gridCount").textContent = `${counts.size.toLocaleString()} active countries`;
  const grid = $("#grid");
  grid.innerHTML = "";
  [...counts.entries()]
    .sort((a, b) => (state.countryName.get(a[0])?.name || a[0]).localeCompare(state.countryName.get(b[0])?.name || b[0]))
    .forEach(([code, count]) => {
      const country = state.countryName.get(code);
      grid.appendChild(indexCard(`${country?.flag || ""} ${country?.name || code}`.trim(), `${count.toLocaleString()} channels`, () => showCountry(code)));
    });
}

/* ============================================================
 * Search, command, picker
 * ============================================================ */

function handleSearch() {
  const q = $("#searchInput").value.trim();
  $("#searchClear").hidden = !q;
  if (!q) return state.view === "home" ? renderHome() : route(state.view);
  setActiveNav("discover");
  const list = searchChannels(q, state.channels).slice(0, 240);
  showGrid(`Search: ${q}`, list);
}
function clearSearch(rerender = true) {
  $("#searchInput").value = "";
  $("#searchClear").hidden = true;
  if (rerender) renderHome();
}
function searchChannels(query, source = state.channels) {
  const q = query.toLowerCase();
  return source.filter((c) => [
    c.name,
    c.countryName,
    c.country,
    c.network,
    c.city,
    ...c.altNames,
    ...c.categories.map((id) => state.catName.get(id) || id),
  ].join(" ").toLowerCase().includes(q));
}

function openCommand() {
  show("#cmdOverlay");
  $("#cmdInput").value = "";
  renderCommandResults();
  setTimeout(() => $("#cmdInput").focus(), 30);
}
function closeCommand() { hide("#cmdOverlay"); }
function renderCommandResults() {
  const q = $("#cmdInput").value.trim();
  const results = $("#cmdResults");
  results.innerHTML = "";
  const actions = [
    ["Home", "Return to featured rows", () => { closeCommand(); renderHome(); }],
    ["Discover", "Browse a shuffled public channel wall", () => { closeCommand(); route("discover"); }],
    ["Signal Wall", "Open multi-view", () => { closeCommand(); showMultiview(); }],
    ["Favorites", "Open saved local favorites", () => { closeCommand(); showFavorites(); }],
    ["Surprise", "Open a random live channel", () => { closeCommand(); surprise(); }],
  ];
  actions
    .filter(([name, desc]) => !q || `${name} ${desc}`.toLowerCase().includes(q.toLowerCase()))
    .forEach(([name, desc, fn]) => results.appendChild(commandRow(name, desc, fn)));

  if (q) {
    searchChannels(q, state.channels).slice(0, 8).forEach((c) => results.appendChild(pickerRow(c, () => { closeCommand(); openPlayer(c); })));
  } else {
    smartShuffle(state.channels).slice(0, 8).forEach((c) => results.appendChild(pickerRow(c, () => { closeCommand(); openPlayer(c); })));
  }
}
function commandRow(title, desc, fn) {
  const row = el("button", "picker-row", `<span class="picker-logo">⌘</span><span class="picker-meta"><b>${esc(title)}</b><span>${esc(desc)}</span></span><span class="picker-add">›</span>`);
  row.type = "button";
  row.addEventListener("click", fn);
  return row;
}

function openPicker() {
  show("#pickerOverlay");
  $("#pickerInput").value = "";
  renderPickerResults();
  setTimeout(() => $("#pickerInput").focus(), 30);
}
function closePicker() { hide("#pickerOverlay"); }
function renderPickerResults() {
  const q = $("#pickerInput").value.trim();
  const list = (q ? searchChannels(q, state.channels) : smartShuffle(state.channels)).slice(0, 80);
  const wrap = $("#pickerResults");
  wrap.innerHTML = "";
  list.forEach((c) => wrap.appendChild(pickerRow(c, () => { addToMultiview(c.id); closePicker(); })));
}
function pickerRow(c, fn) {
  const row = el("button", "picker-row", `
    <span class="picker-logo">${logoHTML(c)}</span>
    <span class="picker-meta"><b>${esc(c.name)}</b><span>${esc(meta(c))}</span></span>
    <span class="picker-add">+</span>
  `);
  row.type = "button";
  row.addEventListener("click", fn);
  return row;
}

/* ============================================================
 * Rendering helpers
 * ============================================================ */

function pickFeatured() {
  const pools = ["news", "sports", "movies", "music", "documentary"];
  for (const cat of pools) {
    const list = state.channels.filter((c) => c.logo && c.categories.includes(cat));
    if (list.length) return smartShuffle(list)[0];
  }
  return smartShuffle(state.channels)[0] || null;
}
function setHero(channel) {
  state.current = channel || state.current;
  if (!channel) return;
  $("#heroTitle").textContent = channel.name;
  $("#heroDesc").textContent = `${meta(channel)}. Public listing with ${channel.urls.length} available source${channel.urls.length === 1 ? "" : "s"}.`;
}
function buildRow(title, channels, moreFn) {
  const row = el("section", "row");
  const head = el("div", "row-head", `<h2>${esc(title)}</h2>`);
  if (moreFn) {
    const more = el("button", "", "View all");
    more.type = "button";
    more.addEventListener("click", moreFn);
    head.appendChild(more);
  }
  const scroll = el("div", "row-scroll");
  channels.forEach((c) => scroll.appendChild(channelCard(c)));
  row.append(head, scroll);
  enhanceOptics(row);
  return row;
}
function buildSpotlight() {
  const cats = ["sports", "news", "movies", "music", "entertainment", "documentary"];
  const picks = [];
  const used = new Set();
  cats.forEach((cat) => {
    const list = state.channels.filter((c) => c.logo && c.categories.includes(cat) && !used.has(c.id));
    if (list.length) { const c = smartShuffle(list)[0]; picks.push(c); used.add(c.id); }
  });
  smartShuffle(state.channels.filter((c) => c.logo && !used.has(c.id))).slice(0, 8).forEach((c) => {
    if (picks.length < 8) { picks.push(c); used.add(c.id); }
  });
  if (!picks.length) return null;
  const wrap = el("section", "row");
  wrap.appendChild(el("div", "bento-label", `<span class="live-dot"></span><h2>On now</h2>`));
  const bento = el("div", "bento");
  picks.forEach((c, i) => bento.appendChild(bentoTile(c, i === 0 ? "big" : i < 3 ? "wide" : "")));
  wrap.appendChild(bento);
  enhanceOptics(wrap);
  return wrap;
}
function bentoTile(c, span) {
  const hue = hueFor(c);
  const tile = el("article", `bento-tile ${span}`.trim(), `
    ${c.logo ? `<img class="b-logo" src="${esc(c.logo)}" alt="" loading="lazy" />` : `<div class="b-fallback">${initials(c.name)}</div>`}
    <div class="b-glass"><span class="b-now">Live</span><div class="b-name">${esc(c.name)}</div><div class="b-meta">${esc(meta(c))}</div></div>
  `);
  tile.style.setProperty("--g1", `hsl(${hue} 80% 28%)`);
  tile.style.setProperty("--g2", `hsl(${(hue + 52) % 360} 70% 12%)`);
  tile.tabIndex = 0;
  tile.addEventListener("click", () => openPlayer(c));
  tile.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") openPlayer(c); });
  return tile;
}
function channelCard(c) {
  const card = el("article", "card", `
    <div class="card-thumb">
      <span class="badge">Live</span>
      ${logoHTML(c)}
      <button class="card-fav icon-button ${state.favorites.has(c.id) ? "on" : ""}" aria-label="Favorite ${esc(c.name)}">★</button>
    </div>
    <div class="card-body"><div class="card-title">${esc(c.name)}</div><div class="card-meta">${esc(meta(c))}</div></div>
  `);
  card.tabIndex = 0;
  card.addEventListener("click", () => openPlayer(c));
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") openPlayer(c); });
  $(".card-fav", card).addEventListener("click", (event) => { event.stopPropagation(); toggleFavorite(c.id); });
  return card;
}
function indexCard(title, sub, fn) {
  const card = el("button", "card", `
    <div class="card-thumb"><span class="badge secure">Index</span><span class="fallback-logo">${initials(title)}</span></div>
    <div class="card-body"><div class="card-title">${esc(title)}</div><div class="card-meta">${esc(sub)}</div></div>
  `);
  card.type = "button";
  card.addEventListener("click", fn);
  return card;
}
function logoHTML(c) {
  return c.logo ? `<img src="${esc(c.logo)}" alt="" loading="lazy" />` : `<span class="fallback-logo">${initials(c.name)}</span>`;
}
function initials(name) {
  return String(name || "TV").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "TV";
}
function meta(c) {
  const cat = c.categories.map((id) => state.catName.get(id)).filter(Boolean)[0];
  return [c.flag || "", c.countryName, cat, c.network].filter(Boolean).join(" · ");
}
function hueFor(c) {
  const key = c.categories[0] || c.country || c.name;
  let n = 0;
  for (let i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) % 360;
  return n;
}
function countBy(expand) {
  const map = new Map();
  for (const c of state.channels) for (const key of expand(c)) if (key) map.set(key, (map.get(key) || 0) + 1);
  return map;
}
function smartShuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* ============================================================
 * Player
 * ============================================================ */

function openPlayer(channel) {
  if (!channel) return;
  state.current = channel;
  state.sourceIndex = 0;
  remember(channel.id);
  setHero(channel);
  updatePlayerInfo();
  show("#playerOverlay");
  loadPlayerSource();
}
function updatePlayerInfo() {
  const c = state.current;
  $("#playerTitle").textContent = c.name;
  $("#playerSub").textContent = meta(c) || "Public live stream";
  $("#playerLogo").src = c.logo || "";
  $("#playerLogo").hidden = !c.logo;
  $("#playerFav").classList.toggle("on", state.favorites.has(c.id));
  $("#playerSource").hidden = c.urls.length < 2;
  $("#playerSource").textContent = `Source ${state.sourceIndex + 1}/${c.urls.length}`;
  renderPlayerDetails();
}
function loadPlayerSource() {
  const c = state.current;
  const video = $("#video");
  const url = c.urls[state.sourceIndex];
  hide("#playerFail");
  show("#playerLoading");
  updatePlayerInfo();

  if (state.hls) { state.hls.destroy(); state.hls = null; }
  video.pause();
  video.removeAttribute("src");
  video.load();

  const fail = () => {
    hide("#playerLoading");
    if (state.sourceIndex < c.urls.length - 1) {
      state.sourceIndex++;
      loadPlayerSource();
    } else {
      show("#playerFail");
    }
  };

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    video.play().catch(() => {});
  } else if (window.Hls && Hls.isSupported()) {
    state.hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    state.hls.loadSource(url);
    state.hls.attachMedia(video);
    state.hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    state.hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) fail(); });
  } else {
    fail();
    return;
  }

  video.onplaying = () => hide("#playerLoading");
  video.onerror = fail;
}
function nextSource() {
  const c = state.current;
  if (!c) return;
  state.sourceIndex = (state.sourceIndex + 1) % c.urls.length;
  loadPlayerSource();
}
function closePlayer() {
  const video = $("#video");
  video.pause();
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  hide("#playerOverlay");
  hide("#playerDetails");
}
function togglePlayerDetails() {
  const details = $("#playerDetails");
  details.hidden = !details.hidden;
}
function renderPlayerDetails() {
  const c = state.current;
  const details = $("#playerDetails");
  const cats = c.categories.map((id) => state.catName.get(id) || id).join(", ") || "—";
  const website = c.website ? `<a href="${esc(c.website)}" target="_blank" rel="noopener">Official website</a>` : "—";
  details.innerHTML = `<dl>
    <dt>Channel</dt><dd>${esc(c.name)}</dd>
    <dt>Country</dt><dd>${esc(c.flag ? `${c.flag} ${c.countryName}` : c.countryName || "—")}</dd>
    <dt>Categories</dt><dd>${esc(cats)}</dd>
    <dt>Network</dt><dd>${esc(c.network || "—")}</dd>
    <dt>Sources</dt><dd>${c.urls.length}</dd>
    <dt>Website</dt><dd>${website}</dd>
  </dl>`;
}
async function requestPip() {
  const video = $("#video");
  if (!document.pictureInPictureEnabled || video.disablePictureInPicture) return toast("Picture-in-picture is not available here.");
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture();
  } catch { toast("Picture-in-picture could not start."); }
}

/* ============================================================
 * Favorites, recent, surprise
 * ============================================================ */

function toggleFavorite(id, refreshPlayer = false) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  writeJSON(SAFE_STORAGE.favs, [...state.favorites]);
  $$(".card").forEach((card) => {
    const title = $(".card-title", card)?.textContent;
    const c = state.channels.find((x) => x.name === title);
    if (c) $(".card-fav", card)?.classList.toggle("on", state.favorites.has(c.id));
  });
  if (refreshPlayer) updatePlayerInfo();
  toast(state.favorites.has(id) ? "Added to favorites." : "Removed from favorites.");
}
function remember(id) {
  state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 40);
  writeJSON(SAFE_STORAGE.recent, state.recent);
}
function surprise() {
  const pick = smartShuffle(state.channels)[0];
  if (pick) openPlayer(pick);
}
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.hidden = false;
  requestAnimationFrame(() => node.classList.add("show"));
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.hidden = true, 260);
  }, 2200);
}

/* ============================================================
 * Multiview
 * ============================================================ */

function showMultiview() {
  setActiveNav("multiview");
  clearMain();
  $("#hero").hidden = true;
  show("#multiview");
  renderMultiview();
}
function setMultiCols(cols) {
  state.multiCols = cols;
  $$(".seg-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.cols) === cols));
  $("#mvGrid").style.setProperty("--mv-cols", cols);
}
function addToMultiview(id) {
  if (!state.multi.includes(id)) state.multi.push(id);
  state.multi = state.multi.slice(0, 9);
  writeJSON(SAFE_STORAGE.multiview, state.multi);
  renderMultiview();
}
function removeFromMultiview(id) {
  state.multi = state.multi.filter((x) => x !== id);
  writeJSON(SAFE_STORAGE.multiview, state.multi);
  renderMultiview();
}
function renderMultiview() {
  teardownMultiview();
  const grid = $("#mvGrid");
  grid.innerHTML = "";
  grid.style.setProperty("--mv-cols", state.multiCols);
  state.multi.map((id) => state.byId.get(id)).filter(Boolean).forEach((c) => grid.appendChild(mvTile(c)));
  const add = el("button", "mv-add", `<span class="mv-add-inner"><span>+</span><b>Add channel</b><small>Search public streams</small></span>`);
  add.type = "button";
  add.addEventListener("click", openPicker);
  grid.appendChild(add);
}
function mvTile(c) {
  const tile = el("article", "mv-tile", `<video muted playsinline autoplay></video><div class="mv-bar"><span class="mv-name">${esc(c.name)}</span><button class="mv-btn" title="Unmute">🔇</button><button class="mv-btn" title="Remove">×</button></div>`);
  const video = $("video", tile);
  const mute = $$(".mv-btn", tile)[0];
  const remove = $$(".mv-btn", tile)[1];
  remove.addEventListener("click", () => removeFromMultiview(c.id));
  mute.addEventListener("click", () => { video.muted = !video.muted; mute.textContent = video.muted ? "🔇" : "🔊"; });
  attachMiniPlayer(video, c.urls[0], tile);
  return tile;
}
function attachMiniPlayer(video, url, tile) {
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    video.play().catch(() => {});
    return;
  }
  if (window.Hls && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) markMvOff(tile); });
    state.mvPlayers.push(hls);
  } else markMvOff(tile);
}
function markMvOff(tile) { tile.innerHTML = `<div class="mv-off">Stream unavailable</div>`; }
function teardownMultiview() {
  state.mvPlayers.forEach((hls) => hls.destroy());
  state.mvPlayers = [];
  $$("#mvGrid video").forEach((v) => { v.pause(); v.removeAttribute("src"); v.load(); });
}

/* ============================================================
 * Optical interaction layer
 * ============================================================ */

function updateOpticPointer(event) {
  const candidates = ["[data-optic]", ".card", ".bento-tile", ".btn", ".icon-button", ".optic-control", ".search-surface", ".nav-item", ".chip"].join(",");
  const target = event.target.closest?.(candidates);
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  target.style.setProperty("--mx", `${x.toFixed(2)}%`);
  target.style.setProperty("--my", `${y.toFixed(2)}%`);

  if (target.classList.contains("card") || target.classList.contains("bento-tile")) {
    const rx = ((event.clientY - rect.top) / rect.height - .5) * -5;
    const ry = ((event.clientX - rect.left) / rect.width - .5) * 7;
    target.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
    target.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
  }
}
function enhanceOptics(root = document) {
  $$(".card, .bento-tile", root).forEach((node) => {
    node.addEventListener("mouseleave", () => {
      node.style.setProperty("--rx", "0deg");
      node.style.setProperty("--ry", "0deg");
    });
  });
}
function createContactLight(event) {
  const host = event.target.closest?.(".kinetic-surface, .kinetic-card, .card, .bento-tile, .btn, .icon-button, .nav-item, .search-surface");
  if (!host) return;
  const rect = host.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.style.cssText = `position:absolute;left:${event.clientX - rect.left}px;top:${event.clientY - rect.top}px;width:12px;height:12px;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(255,255,255,.65),rgba(142,232,255,.22),transparent 72%);border:1px solid rgba(255,255,255,.35);animation:contactPulse .72s ease-out forwards;mix-blend-mode:screen;z-index:9;`;
  host.appendChild(ripple);
  setTimeout(() => ripple.remove(), 760);
}

const style = document.createElement("style");
style.textContent = `@keyframes contactPulse{to{width:260px;height:260px;opacity:0}}`;
document.head.appendChild(style);

function bootLightField() {
  const canvas = $("#lightField");
  const ctx = canvas.getContext("2d", { alpha: true });
  let w = 0, h = 0, dpr = 1;
  const points = Array.from({ length: 34 }, (_, i) => ({
    x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2, s: .0006 + Math.random() * .0014, a: Math.random() * Math.PI * 2, hue: i % 3,
  }));
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.width = Math.floor(innerWidth * dpr);
    h = canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
  }
  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (const p of points) {
      p.a += p.s;
      const x = (p.x + Math.sin(p.a) * .035) * w;
      const y = (p.y + Math.cos(p.a * .8) * .035) * h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 120 * dpr);
      const color = p.hue === 0 ? "142,232,255" : p.hue === 1 ? "182,156,255" : "255,226,168";
      g.addColorStop(0, `rgba(${color},.16)`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 120 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  resize();
  window.addEventListener("resize", resize);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) draw();
}
