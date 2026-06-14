/* ============================================================
 * Nova TV — Signalverse V2
 * Static, public, safe-by-default live-TV signal browser.
 * ============================================================ */

const API = "https://iptv-org.github.io/api";
const STORE = {
  favs: "nova:signalverse:favorites:v30",
  recent: "nova:signalverse:recent:v30",
  wall: "nova:signalverse:wall:v30",
};

const state = {
  all: [],
  visible: [],
  field: [],
  byId: new Map(),
  categories: [],
  countries: [],
  catName: new Map(),
  countryMap: new Map(),
  favorites: new Set(readJSON(STORE.favs, [])),
  recent: readJSON(STORE.recent, []),
  wall: readJSON(STORE.wall, []),
  wallCols: 2,
  selected: null,
  current: null,
  sourceIndex: 0,
  hls: null,
  wallPlayers: [],
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}
function show(nodeOrSel) { const n = typeof nodeOrSel === "string" ? $(nodeOrSel) : nodeOrSel; if (n) n.hidden = false; }
function hide(nodeOrSel) { const n = typeof nodeOrSel === "string" ? $(nodeOrSel) : nodeOrSel; if (n) n.hidden = true; }

window.addEventListener("DOMContentLoaded", () => {
  bindUI();
  bootStarfield();
  loadData();
});

/* ============================================================
 * Data
 * ============================================================ */

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

    state.categories = categories.filter((c) => c?.id && c.id !== "xxx").sort((a, b) => a.name.localeCompare(b.name));
    state.countries = countries.filter((c) => c?.code).sort((a, b) => a.name.localeCompare(b.name));
    state.catName = new Map(state.categories.map((c) => [c.id, c.name]));
    state.countryMap = new Map(state.countries.map((c) => [c.code, c]));

    const streamMap = new Map();
    for (const s of streams) {
      if (!s.channel || !s.url || !s.url.startsWith("https:")) continue;
      const list = streamMap.get(s.channel) || [];
      if (!list.includes(s.url)) list.push(s.url);
      streamMap.set(s.channel, list);
    }

    const safe = [];
    for (const c of channels) {
      const urls = streamMap.get(c.id);
      if (!urls?.length) continue;
      const rawCats = c.categories || [];
      const nsfw = Boolean(c.is_nsfw || rawCats.includes("xxx"));
      if (nsfw) continue;
      const cleanCats = rawCats.filter((id) => id !== "xxx" && state.catName.has(id));
      const country = state.countryMap.get(c.country);
      safe.push({
        id: c.id,
        name: c.name || c.id,
        logo: c.logo || "",
        urls,
        categories: cleanCats,
        country: c.country || "",
        countryName: country?.name || c.country || "",
        flag: country?.flag || "",
        network: c.network || "",
        owners: c.owners || [],
        city: c.city || "",
        website: c.website || "",
        launched: c.launched || "",
        closed: c.closed || "",
        altNames: c.alt_names || [],
        health: estimateHealth(c, urls),
      });
    }

    safe.sort((a, b) => a.name.localeCompare(b.name));
    state.all = safe;
    state.visible = safe;
    state.byId = new Map(safe.map((c) => [c.id, c]));
    state.recent = state.recent.filter((id) => state.byId.has(id)).slice(0, 40);
    state.wall = state.wall.filter((id) => state.byId.has(id)).slice(0, 9);
    state.favorites = new Set([...state.favorites].filter((id) => state.byId.has(id)));
    persistUserState();

    hide("#loading");
    renderChrome();
    renderSignalverse();
  } catch (err) {
    console.error(err);
    hide("#loading");
    show("#loadError");
  }
}

function estimateHealth(channel, urls) {
  let score = 52 + Math.min(urls.length, 5) * 8;
  if (channel.logo) score += 8;
  if ((channel.categories || []).length) score += 5;
  if (channel.website) score += 4;
  return Math.max(38, Math.min(96, score));
}
function persistUserState() {
  writeJSON(STORE.favs, [...state.favorites]);
  writeJSON(STORE.recent, state.recent);
  writeJSON(STORE.wall, state.wall);
}

/* ============================================================
 * UI binding
 * ============================================================ */

function bindUI() {
  document.addEventListener("pointermove", opticPointer, { passive: true });
  document.addEventListener("click", contactLight, true);

  ["searchInput", "commandInput", "wallPickerInput"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("touchend", () => input.focus({ preventScroll: true }), { passive: true });
    input.addEventListener("click", () => input.focus({ preventScroll: true }));
  });

  $("#menuToggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $$(".nav-item[data-view]").forEach((btn) => btn.addEventListener("click", () => route(btn.dataset.view)));

  $("#searchInput").addEventListener("input", onSearchInput);
  $("#searchClear").addEventListener("click", () => clearSearch(true));
  $("#cmdBtn").addEventListener("click", openCommand);
  $("#cmdClose").addEventListener("click", closeCommand);
  $("#commandInput").addEventListener("input", renderCommandResults);
  $("#randomBtn").addEventListener("click", randomSignal);
  $("#scanStrong").addEventListener("click", () => setField(sampleStrongSignals()));
  $("#scanFar").addEventListener("click", jumpFarAway);

  $("#previewClose").addEventListener("click", () => hide("#signalPreview"));
  $("#previewWatch").addEventListener("click", () => state.selected && openPlayer(state.selected));
  $("#previewFav").addEventListener("click", () => state.selected && toggleFavorite(state.selected.id, true));
  $("#previewNext").addEventListener("click", nearbySignal);

  $("#playerClose").addEventListener("click", closePlayer);
  $("#playerRetry").addEventListener("click", nextSource);
  $("#playerSource").addEventListener("click", nextSource);
  $("#playerFav").addEventListener("click", () => state.current && toggleFavorite(state.current.id, true));
  $("#playerDetailsBtn").addEventListener("click", toggleDetails);
  $("#playerPip").addEventListener("click", requestPip);

  $$(".seg-btn").forEach((btn) => btn.addEventListener("click", () => setWallCols(Number(btn.dataset.cols))));
  $("#wallPickerClose").addEventListener("click", closeWallPicker);
  $("#wallPickerInput").addEventListener("input", renderWallPickerResults);

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === "k") { event.preventDefault(); openCommand(); }
    if (event.key === "Escape") { closeCommand(); closeWallPicker(); closePlayer(); hide("#signalPreview"); $("#sidebar").classList.remove("open"); }
  });
}

function route(view) {
  $("#sidebar").classList.remove("open");
  clearSearch(false);
  hide("#signalPreview");
  teardownWall();
  if (view === "signalverse") return renderSignalverse();
  if (view === "discover") return showGrid("Discover", smartShuffle(state.all).slice(0, 240), "discover");
  if (view === "categories") return showCategories();
  if (view === "countries") return showCountries();
  if (view === "favorites") return showFavorites();
  if (view === "wall") return showWall();
}
function setActive(view) {
  $$(".nav-item[data-view]").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
}
function clearViews() {
  hide("#viewHead");
  hide("#wall");
  hide("#empty");
  $("#rows").innerHTML = "";
  $("#grid").innerHTML = "";
}

/* ============================================================
 * Chrome and Signalverse
 * ============================================================ */

function renderChrome() {
  const cats = new Set();
  const countries = new Set();
  for (const c of state.all) {
    c.categories.forEach((x) => cats.add(x));
    if (c.country) countries.add(c.country);
  }
  $("#safeCount").textContent = state.all.length.toLocaleString();
  $("#countryCount").textContent = countries.size.toLocaleString();
  $("#categoryCount").textContent = cats.size.toLocaleString();
  $("#topbarMeta").textContent = `${state.all.length.toLocaleString()} safe public signals`;

  const filters = $("#quickFilters");
  filters.innerHTML = "";
  ["news", "sports", "movies", "music", "entertainment", "kids", "documentary"].forEach((id) => {
    if (!state.catName.has(id)) return;
    const btn = el("button", "filter-chip", esc(state.catName.get(id)));
    btn.type = "button";
    btn.addEventListener("click", () => showCategory(id));
    filters.appendChild(btn);
  });
}

function renderSignalverse(list = null) {
  setActive("signalverse");
  clearViews();
  show("#signalverse");
  const source = list || buildHomeField();
  setField(source);
  renderHomeRows();
}

function buildHomeField() {
  const wanted = ["news", "sports", "movies", "music", "entertainment", "documentary"];
  const picks = [];
  const used = new Set();
  for (const cat of wanted) {
    const pool = state.all.filter((c) => c.logo && c.categories.includes(cat) && !used.has(c.id));
    smartShuffle(pool).slice(0, 8).forEach((c) => { picks.push(c); used.add(c.id); });
  }
  smartShuffle(state.all.filter((c) => c.logo && !used.has(c.id))).slice(0, 18).forEach((c) => picks.push(c));
  return picks.slice(0, 56);
}

function setField(list) {
  state.field = list.filter(Boolean).slice(0, 64);
  const field = $("#signalField");
  field.innerHTML = "";
  const count = state.field.length || 1;
  state.field.forEach((channel, index) => {
    const node = signalNode(channel, index, count);
    field.appendChild(node);
  });
  if (state.field[0]) previewSignal(state.field[0], false);
}

function signalNode(channel, index, count) {
  const ring = index % 3;
  const ringRadius = [24, 34, 43][ring];
  const angle = (index / count) * Math.PI * 2 + ring * .48;
  const wobble = Math.sin(index * 2.17) * 4;
  const x = 50 + Math.cos(angle) * (ringRadius + wobble);
  const y = 50 + Math.sin(angle) * (ringRadius + Math.cos(index) * 3);
  const size = Math.max(42, Math.min(74, 44 + channel.health * .28 + (channel.logo ? 8 : 0)));
  const hue = hueFor(channel);
  const node = el("button", "signal-node", channel.logo ? `<img src="${esc(channel.logo)}" alt="" loading="lazy" />` : `<span class="letters">${initials(channel.name)}</span>`);
  node.type = "button";
  node.title = `${channel.name} — ${meta(channel)}`;
  node.style.setProperty("--x", `${x}%`);
  node.style.setProperty("--y", `${y}%`);
  node.style.setProperty("--size", `${size}px`);
  node.style.setProperty("--hue", String(hue));
  node.style.setProperty("--delay", `${(index % 9) * .13}s`);
  node.dataset.id = channel.id;
  node.addEventListener("click", () => previewSignal(channel, true));
  node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") previewSignal(channel, true); });
  return node;
}

function previewSignal(channel, userIntent = true) {
  state.selected = channel;
  $$(".signal-node").forEach((n) => n.classList.toggle("focused", n.dataset.id === channel.id));
  const preview = $("#signalPreview");
  $("#previewLogo").innerHTML = logoHTML(channel);
  $("#previewTitle").textContent = channel.name;
  $("#previewMeta").textContent = `${meta(channel)} · ${channel.urls.length} source${channel.urls.length === 1 ? "" : "s"}`;
  $("#healthLabel").textContent = healthLabel(channel.health);
  $("#healthBar").style.setProperty("--health", `${channel.health}%`);
  $("#previewFav").textContent = state.favorites.has(channel.id) ? "Favorited" : "Favorite";
  show(preview);
  if (userIntent) pulseStage(channel);
}

function nearbySignal() {
  if (!state.selected || !state.field.length) return;
  const sameCategory = state.selected.categories[0];
  const pool = state.field.filter((c) => c.id !== state.selected.id && (!sameCategory || c.categories.includes(sameCategory)));
  const next = smartShuffle(pool.length ? pool : state.field.filter((c) => c.id !== state.selected.id))[0];
  if (next) previewSignal(next, true);
}
function randomSignal() { const pick = smartShuffle(state.all)[0]; if (pick) previewSignal(pick, true); }
function jumpFarAway() {
  const usedCountries = new Set(state.field.map((c) => c.country));
  const far = state.all.filter((c) => c.logo && c.country && !usedCountries.has(c.country));
  setField(smartShuffle(far.length ? far : state.all).slice(0, 56));
  toast("Jumped to a distant signal cluster.");
}
function sampleStrongSignals() {
  return smartShuffle(state.all.filter((c) => c.logo && c.health >= 78)).slice(0, 56);
}
function pulseStage(channel) {
  const stage = $("#signalStage");
  stage.style.setProperty("--mx", `${28 + (hueFor(channel) % 44)}%`);
  stage.style.setProperty("--my", `${28 + ((hueFor(channel) * 3) % 44)}%`);
}
function healthLabel(score) {
  if (score >= 82) return "Strong signal";
  if (score >= 66) return "Stable signal";
  if (score >= 50) return "Unknown stability";
  return "Weak signal";
}

function renderHomeRows() {
  const rows = $("#rows");
  rows.innerHTML = "";
  const recent = state.recent.map((id) => state.byId.get(id)).filter(Boolean);
  if (recent.length) rows.appendChild(buildRow("Recently entered", recent.slice(0, 20)));
  const favs = [...state.favorites].map((id) => state.byId.get(id)).filter(Boolean);
  if (favs.length) rows.appendChild(buildRow("Favorite signals", favs.slice(0, 20), showFavorites));
  [["News", "news"], ["Sports", "sports"], ["Movies", "movies"], ["Music", "music"]].forEach(([title, cat]) => {
    const list = smartShuffle(state.all.filter((c) => c.categories.includes(cat))).slice(0, 20);
    if (list.length) rows.appendChild(buildRow(title, list, () => showCategory(cat)));
  });
}

/* ============================================================
 * Browse views
 * ============================================================ */

function onSearchInput() {
  const q = $("#searchInput").value.trim();
  $("#searchClear").hidden = !q;
  if (!q) return renderSignalverse();
  const results = searchChannels(q).slice(0, 240);
  setActive("discover");
  clearViews();
  show("#signalverse");
  setField(results.slice(0, 56));
  showGrid(`Scan: ${q}`, results, "discover", false);
}
function clearSearch(rerender = true) {
  $("#searchInput").value = "";
  $("#searchClear").hidden = true;
  if (rerender) renderSignalverse();
}
function showGrid(title, channels, active = "discover", hideSignal = true) {
  setActive(active);
  if (hideSignal) hide("#signalverse");
  hide("#wall");
  $("#rows").innerHTML = "";
  show("#viewHead");
  $("#viewTitle").textContent = title;
  $("#viewCount").textContent = `${channels.length.toLocaleString()} signals`;
  const grid = $("#grid");
  grid.innerHTML = "";
  channels.forEach((c) => grid.appendChild(channelCard(c)));
  $("#empty").hidden = channels.length !== 0;
}
function showCategory(id) { showGrid(state.catName.get(id) || id, state.all.filter((c) => c.categories.includes(id)), "categories"); }
function showCategories() {
  setActive("categories");
  hide("#signalverse");
  clearViews();
  show("#viewHead");
  $("#viewTitle").textContent = "Categories";
  const counts = countBy((c) => c.categories);
  $("#viewCount").textContent = `${counts.size.toLocaleString()} active categories`;
  const grid = $("#grid");
  [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([id, count]) => grid.appendChild(indexCard(state.catName.get(id) || id, `${count.toLocaleString()} signals`, () => showCategory(id))));
}
function showCountry(code) {
  const country = state.countryMap.get(code);
  showGrid(country ? `${country.flag || ""} ${country.name}`.trim() : code, state.all.filter((c) => c.country === code), "countries");
}
function showCountries() {
  setActive("countries");
  hide("#signalverse");
  clearViews();
  show("#viewHead");
  $("#viewTitle").textContent = "Countries";
  const counts = countBy((c) => c.country ? [c.country] : []);
  $("#viewCount").textContent = `${counts.size.toLocaleString()} active countries`;
  const grid = $("#grid");
  [...counts.entries()].sort((a, b) => (state.countryMap.get(a[0])?.name || a[0]).localeCompare(state.countryMap.get(b[0])?.name || b[0])).forEach(([code, count]) => {
    const country = state.countryMap.get(code);
    grid.appendChild(indexCard(`${country?.flag || ""} ${country?.name || code}`.trim(), `${count.toLocaleString()} signals`, () => showCountry(code)));
  });
}
function showFavorites() {
  const favs = [...state.favorites].map((id) => state.byId.get(id)).filter(Boolean);
  showGrid("Favorites", favs, "favorites");
}

function buildRow(title, channels, moreFn) {
  const section = el("section", "row");
  const head = el("div", "row-head", `<h2>${esc(title)}</h2>`);
  if (moreFn) {
    const more = el("button", "", "View all");
    more.type = "button";
    more.addEventListener("click", moreFn);
    head.appendChild(more);
  }
  const scroll = el("div", "row-scroll");
  channels.forEach((c) => scroll.appendChild(channelCard(c)));
  section.append(head, scroll);
  return section;
}
function channelCard(c) {
  const card = el("article", "channel-card", `
    <div class="card-thumb"><span class="badge">Live</span>${logoHTML(c)}<button class="card-fav icon-btn ${state.favorites.has(c.id) ? "on" : ""}" type="button" aria-label="Favorite ${esc(c.name)}">★</button></div>
    <div class="card-body"><div class="card-title">${esc(c.name)}</div><div class="card-meta">${esc(meta(c))}</div></div>
  `);
  card.tabIndex = 0;
  card.addEventListener("click", () => previewSignal(c, true));
  card.addEventListener("dblclick", () => openPlayer(c));
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") previewSignal(c, true); });
  $(".card-fav", card).addEventListener("click", (event) => { event.stopPropagation(); toggleFavorite(c.id); });
  return card;
}
function indexCard(title, sub, fn) {
  const card = el("button", "index-card", `<div class="card-thumb"><span class="logo-fallback">${initials(title)}</span></div><div class="card-body"><div class="card-title">${esc(title)}</div><div class="card-meta">${esc(sub)}</div></div>`);
  card.type = "button";
  card.addEventListener("click", fn);
  return card;
}

/* ============================================================
 * Command scanner
 * ============================================================ */

function openCommand() {
  show("#commandOverlay");
  const input = $("#commandInput");
  input.value = "";
  renderCommandResults();
  input.focus({ preventScroll: true });
}
function closeCommand() { hide("#commandOverlay"); }
function renderCommandResults() {
  const q = $("#commandInput").value.trim();
  const out = $("#commandResults");
  out.innerHTML = "";
  const actions = [
    ["Open Signalverse", "Return to the orbiting signal field", () => { closeCommand(); renderSignalverse(); }],
    ["Scan strong signals", "Show logo-rich channels with better source depth", () => { closeCommand(); renderSignalverse(sampleStrongSignals()); }],
    ["Jump far away", "Load a distant country/category cluster", () => { closeCommand(); jumpFarAway(); }],
    ["Signal Wall", "Open multi-stream wall", () => { closeCommand(); showWall(); }],
    ["Favorites", "Open saved local favorites", () => { closeCommand(); showFavorites(); }],
  ];
  actions.filter(([a, b]) => !q || `${a} ${b}`.toLowerCase().includes(q.toLowerCase())).forEach(([a, b, fn]) => out.appendChild(resultRow({ title: a, sub: b, mark: "⌘" }, fn)));
  const matches = q ? searchChannels(q).slice(0, 12) : smartShuffle(state.all).slice(0, 10);
  matches.forEach((c) => out.appendChild(resultRow(c, () => { closeCommand(); previewSignal(c, true); })));
}

/* ============================================================
 * Signal Wall
 * ============================================================ */

function showWall() {
  setActive("wall");
  hide("#signalverse");
  clearViews();
  show("#wall");
  renderWall();
}
function setWallCols(cols) {
  state.wallCols = cols;
  $$(".seg-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.cols) === cols));
  $("#wallGrid").style.setProperty("--wall-cols", cols);
}
function renderWall() {
  teardownWall();
  const grid = $("#wallGrid");
  grid.innerHTML = "";
  grid.style.setProperty("--wall-cols", state.wallCols);
  state.wall.map((id) => state.byId.get(id)).filter(Boolean).forEach((c) => grid.appendChild(wallTile(c)));
  const add = el("button", "wall-add", `<span><b>+</b>Add signal</span>`);
  add.type = "button";
  add.addEventListener("click", openWallPicker);
  grid.appendChild(add);
}
function openWallPicker() {
  show("#wallPickerOverlay");
  const input = $("#wallPickerInput");
  input.value = "";
  renderWallPickerResults();
  input.focus({ preventScroll: true });
}
function closeWallPicker() { hide("#wallPickerOverlay"); }
function renderWallPickerResults() {
  const q = $("#wallPickerInput").value.trim();
  const list = (q ? searchChannels(q) : smartShuffle(state.all)).slice(0, 80);
  const out = $("#wallPickerResults");
  out.innerHTML = "";
  list.forEach((c) => out.appendChild(resultRow(c, () => { addWall(c.id); closeWallPicker(); })));
}
function addWall(id) {
  if (!state.wall.includes(id)) state.wall.push(id);
  state.wall = state.wall.slice(0, 9);
  persistUserState();
  renderWall();
}
function removeWall(id) {
  state.wall = state.wall.filter((x) => x !== id);
  persistUserState();
  renderWall();
}
function wallTile(c) {
  const tile = el("article", "wall-tile", `<video muted autoplay playsinline></video><div class="wall-bar"><span class="wall-name">${esc(c.name)}</span><button class="wall-btn" type="button" title="Mute">🔇</button><button class="wall-btn" type="button" title="Remove">×</button></div>`);
  const video = $("video", tile);
  const [mute, remove] = $$(".wall-btn", tile);
  mute.addEventListener("click", () => { video.muted = !video.muted; mute.textContent = video.muted ? "🔇" : "🔊"; });
  remove.addEventListener("click", () => removeWall(c.id));
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
    hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) tile.innerHTML = `<div class="wall-off">Signal unavailable</div>`; });
    state.wallPlayers.push(hls);
  } else tile.innerHTML = `<div class="wall-off">HLS unsupported</div>`;
}
function teardownWall() {
  state.wallPlayers.forEach((hls) => hls.destroy());
  state.wallPlayers = [];
  $$("#wallGrid video").forEach((v) => { v.pause(); v.removeAttribute("src"); v.load(); });
}

/* ============================================================
 * Player
 * ============================================================ */

function openPlayer(channel) {
  if (!channel) return;
  state.current = channel;
  state.sourceIndex = 0;
  remember(channel.id);
  updatePlayerInfo();
  show("#playerOverlay");
  loadPlayerSource();
}
function updatePlayerInfo() {
  const c = state.current;
  $("#playerTitle").textContent = c.name;
  $("#playerSub").textContent = meta(c) || "Public live stream";
  $("#playerLogo").innerHTML = logoHTML(c);
  $("#playerFav").classList.toggle("on", state.favorites.has(c.id));
  $("#playerSource").hidden = c.urls.length < 2;
  $("#playerSource").textContent = `Source ${state.sourceIndex + 1}/${c.urls.length}`;
  renderPlayerDetails();
}
function loadPlayerSource() {
  const c = state.current;
  const url = c.urls[state.sourceIndex];
  const video = $("#video");
  hide("#playerFail");
  show("#playerLoading");
  updatePlayerInfo();
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  video.pause();
  video.removeAttribute("src");
  video.load();

  const fail = () => {
    hide("#playerLoading");
    if (state.sourceIndex < c.urls.length - 1) { state.sourceIndex++; loadPlayerSource(); }
    else show("#playerFail");
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
  } else fail();

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
function toggleDetails() { $("#playerDetails").hidden = !$("#playerDetails").hidden; }
function renderPlayerDetails() {
  const c = state.current;
  const cats = c.categories.map((id) => state.catName.get(id) || id).join(", ") || "—";
  const website = c.website ? `<a href="${esc(c.website)}" target="_blank" rel="noopener">Official website</a>` : "—";
  $("#playerDetails").innerHTML = `<dl><dt>Channel</dt><dd>${esc(c.name)}</dd><dt>Country</dt><dd>${esc(c.flag ? `${c.flag} ${c.countryName}` : c.countryName || "—")}</dd><dt>Categories</dt><dd>${esc(cats)}</dd><dt>Network</dt><dd>${esc(c.network || "—")}</dd><dt>Signal score</dt><dd>${c.health}/100</dd><dt>Sources</dt><dd>${c.urls.length}</dd><dt>Website</dt><dd>${website}</dd></dl>`;
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
 * Utilities
 * ============================================================ */

function resultRow(item, fn) {
  const isChannel = !!item.id;
  const row = el("button", "result-row", isChannel ? `
    <span class="result-logo">${logoHTML(item)}</span><span class="result-meta"><b>${esc(item.name)}</b><span>${esc(meta(item))}</span></span><span class="result-action">›</span>
  ` : `<span class="result-logo">${esc(item.mark || "⌘")}</span><span class="result-meta"><b>${esc(item.title)}</b><span>${esc(item.sub)}</span></span><span class="result-action">›</span>`);
  row.type = "button";
  row.addEventListener("click", fn);
  return row;
}
function searchChannels(query) {
  const q = query.toLowerCase();
  return state.all.filter((c) => [c.name, c.countryName, c.country, c.network, c.city, ...c.altNames, ...c.categories.map((id) => state.catName.get(id) || id)].join(" ").toLowerCase().includes(q));
}
function logoHTML(c) {
  if (!c || !c.logo) return `<span class="logo-fallback">${initials(c?.name || "TV")}</span>`;
  return `<img src="${esc(c.logo)}" alt="" loading="lazy" />`;
}
function initials(name) { return String(name || "TV").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "TV"; }
function meta(c) {
  const cat = c.categories.map((id) => state.catName.get(id)).filter(Boolean)[0];
  return [c.flag || "", c.countryName, cat, c.network].filter(Boolean).join(" · ");
}
function hueFor(c) {
  const key = c.categories[0] || c.country || c.name || "signal";
  let n = 0;
  for (let i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) % 360;
  return n;
}
function countBy(expand) {
  const map = new Map();
  for (const c of state.all) for (const key of expand(c)) if (key) map.set(key, (map.get(key) || 0) + 1);
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
function toggleFavorite(id, refresh = false) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  persistUserState();
  if (state.selected?.id === id) $("#previewFav").textContent = state.favorites.has(id) ? "Favorited" : "Favorite";
  if (refresh && state.current) updatePlayerInfo();
  $$(".card-fav").forEach((btn) => btn.classList.remove("on"));
  toast(state.favorites.has(id) ? "Signal saved to favorites." : "Signal removed from favorites.");
}
function remember(id) {
  state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 40);
  persistUserState();
}
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.hidden = false;
  requestAnimationFrame(() => node.classList.add("show"));
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.classList.remove("show"); setTimeout(() => node.hidden = true, 260); }, 2100);
}

/* ============================================================
 * Optical interactions
 * ============================================================ */

function opticPointer(event) {
  const target = event.target.closest?.(".material,.signal-node,.channel-card,.index-card,.pill-btn,.primary-action,.secondary-action,.icon-btn,.nav-item,.filter-chip,.search-box");
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  target.style.setProperty("--mx", `${x.toFixed(2)}%`);
  target.style.setProperty("--my", `${y.toFixed(2)}%`);
}
function contactLight(event) {
  if (event.target.closest?.("input, textarea, select")) return;
  const host = event.target.closest?.(".material,.signal-node,.channel-card,.index-card,.pill-btn,.primary-action,.secondary-action,.icon-btn,.nav-item,.filter-chip");
  if (!host) return;
  const rect = host.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.style.cssText = `position:absolute;left:${event.clientX - rect.left}px;top:${event.clientY - rect.top}px;width:10px;height:10px;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(255,255,255,.68),rgba(142,232,255,.22),transparent 72%);border:1px solid rgba(255,255,255,.35);animation:contactPulse .7s ease-out forwards;mix-blend-mode:screen;z-index:20;`;
  host.appendChild(ripple);
  setTimeout(() => ripple.remove(), 760);
}
const contactStyle = document.createElement("style");
contactStyle.textContent = `@keyframes contactPulse{to{width:260px;height:260px;opacity:0}}`;
document.head.appendChild(contactStyle);

function bootStarfield() {
  const canvas = $("#starfield");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  let width = 0, height = 0, dpr = 1;
  const particles = Array.from({ length: 90 }, (_, i) => ({
    x: Math.random(), y: Math.random(), r: .6 + Math.random() * 1.8, v: .00025 + Math.random() * .0009, a: Math.random() * Math.PI * 2, h: i % 3,
  }));
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = canvas.width = Math.floor(innerWidth * dpr);
    height = canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      p.a += p.v;
      const x = (p.x + Math.sin(p.a) * .025) * width;
      const y = (p.y + Math.cos(p.a * .8) * .025) * height;
      const color = p.h === 0 ? "142,232,255" : p.h === 1 ? "182,156,255" : "255,226,168";
      const g = ctx.createRadialGradient(x, y, 0, x, y, 90 * dpr);
      g.addColorStop(0, `rgba(${color},.15)`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 90 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  resize();
  window.addEventListener("resize", resize);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) draw();
}
