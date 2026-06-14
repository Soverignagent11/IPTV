/* ============================================================
 * Nova TV — a static IPTV web player.
 * Channel + stream metadata comes from the public iptv-org API
 * (https://github.com/iptv-org/api). No backend required.
 * ============================================================ */

const API = "https://iptv-org.github.io/api";

const state = {
  channels: [],          // playable channels (have at least one stream)
  byId: new Map(),
  categories: [],        // {id, name}
  countries: [],         // {code, name, flag}
  catName: new Map(),
  view: "home",
  favorites: new Set(JSON.parse(localStorage.getItem("nova:favs") || "[]")),
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

    // Map first working stream URL per channel id.
    const streamFor = new Map();
    for (const s of streams) {
      if (s.channel && s.url && !streamFor.has(s.channel)) streamFor.set(s.channel, s.url);
    }

    // Keep only channels we can actually play, and that aren't NSFW.
    state.channels = channels
      .filter((c) => streamFor.has(c.id) && !c.is_nsfw && !(c.categories || []).includes("xxx"))
      .map((c) => {
        const country = countryMap.get(c.country);
        return {
          id: c.id,
          name: c.name,
          logo: c.logo || "",
          url: streamFor.get(c.id),
          categories: c.categories || [],
          country: c.country || "",
          countryName: country ? country.name : c.country || "",
          flag: country ? country.flag : "",
        };
      });

    state.channels.forEach((c) => state.byId.set(c.id, c));
    hide("#loading");
    boot();
  } catch (err) {
    console.error(err);
    hide("#loading");
    show("#loadError");
  }
}

/* ============================================================
 * Rendering
 * ============================================================ */
function boot() {
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
  $("#hero").hidden = false;
  $("#gridHead").hidden = true;
  $("#grid").innerHTML = "";
  const rows = $("#rows");
  rows.innerHTML = "";

  if (state.favorites.size) {
    const favs = [...state.favorites].map((id) => state.byId.get(id)).filter(Boolean);
    if (favs.length) rows.appendChild(buildRow("⭐ Your favorites", favs.slice(0, 20)));
  }

  const feature = [
    ["📰 News", "news"],
    ["🏟️ Sports", "sports"],
    ["🎬 Movies", "movies"],
    ["🎵 Music", "music"],
    ["🧒 Kids", "kids"],
    ["🎭 Entertainment", "entertainment"],
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
  const card = el("div", "card");
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
    c.categories.some((cat) => (state.catName.get(cat) || cat).toLowerCase().includes(q))
  );
  renderGrid(`Results for “${q}”`, list);
}

/* ============================================================
 * Player (HLS.js)
 * ============================================================ */
let hls = null;
const video = $("#video");

function openPlayer(c) {
  $("#playerOverlay").hidden = false;
  document.body.style.overflow = "hidden";
  $("#playerTitle").textContent = c.name;
  $("#playerSub").textContent = `${c.flag ? c.flag + " " : ""}${c.countryName || ""} · ${
    c.categories.map((x) => state.catName.get(x) || x).slice(0, 3).join(", ") || "Live TV"}`;
  $("#playerLogo").src = c.logo || "";
  $("#playerLogo").style.visibility = c.logo ? "visible" : "hidden";
  $("#playerFail").hidden = true;
  $("#playerLoading").style.display = "grid";

  const favBtn = $("#playerFav");
  favBtn.classList.toggle("on", state.favorites.has(c.id));
  favBtn.onclick = () => { toggleFav(c.id); favBtn.classList.toggle("on"); };

  playStream(c.url);
}

function playStream(url) {
  destroyHls();
  const onReady = () => { $("#playerLoading").style.display = "none"; };
  const onFail = () => { $("#playerLoading").style.display = "none"; $("#playerFail").hidden = false; };

  if (window.Hls && Hls.isSupported()) {
    hls = new Hls({ maxBufferLength: 20, manifestLoadingTimeOut: 12000 });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => { onReady(); video.play().catch(() => {}); });
    hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) onFail(); });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    // Safari / iOS native HLS
    video.src = url;
    video.addEventListener("loadedmetadata", () => { onReady(); video.play().catch(() => {}); }, { once: true });
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
 * Favorites
 * ============================================================ */
function toggleFav(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem("nova:favs", JSON.stringify([...state.favorites]));
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

  $("#playerClose").onclick = closePlayer;
  $("#playerOverlay").onclick = (e) => { if (e.target.id === "playerOverlay") closePlayer(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#playerOverlay").hidden) closePlayer(); });

  $("#menuToggle").onclick = () => $("#sidebar").classList.toggle("open");
}
function closeSidebar() { $("#sidebar").classList.remove("open"); }

wire();
loadData();
