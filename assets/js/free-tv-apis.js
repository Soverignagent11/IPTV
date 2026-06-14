/* ============================================================
 * Nova TV — Free TV API Hub
 * Legal/free TV metadata APIs only. No piracy feeds, no adult sources.
 * ============================================================ */

(() => {
  const TMDB_KEY_STORE = "nova:api:tmdb:v1";
  const activeProviders = new Set(["iptv", "tvmaze", "episodate"]);

  const PROVIDERS = [
    {
      id: "iptv",
      name: "IPTV-org",
      kind: "Live channel index",
      auth: "No key",
      status: "Active",
      description: "Public live-channel metadata and HTTPS stream index already powering Nova TV.",
      docs: "https://github.com/iptv-org/api",
      searchable: true,
      keyRequired: false,
    },
    {
      id: "tvmaze",
      name: "TVmaze",
      kind: "TV schedule + show metadata",
      auth: "No key",
      status: "Active",
      description: "Free JSON API for show search, schedules, episodes, networks, images, and web-channel schedules.",
      docs: "https://www.tvmaze.com/api",
      searchable: true,
      keyRequired: false,
    },
    {
      id: "episodate",
      name: "EpisoDate",
      kind: "TV show database",
      auth: "No key",
      status: "Active",
      description: "Free TV-show API with search, most-popular, and show-details endpoints. Data requires source credit.",
      docs: "https://www.episodate.com/api",
      searchable: true,
      keyRequired: false,
    },
    {
      id: "tmdb",
      name: "TMDB",
      kind: "TV/movie metadata + images",
      auth: "Free account key",
      status: "Optional",
      description: "Free developer API key required. Key is stored only in this browser, never committed to GitHub.",
      docs: "https://developer.themoviedb.org/docs/getting-started",
      searchable: true,
      keyRequired: true,
    },
  ];

  window.addEventListener("DOMContentLoaded", () => {
    installApiNav();
    installApiView();
  });

  function q(sel, root = document) { return root.querySelector(sel); }
  function qa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
  function safe(value) {
    return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function installApiNav() {
    const nav = q(".nav-list");
    if (!nav || q('[data-api-view="apis"]')) return;
    const apiBtn = document.createElement("button");
    apiBtn.className = "nav-item";
    apiBtn.type = "button";
    apiBtn.dataset.apiView = "apis";
    apiBtn.innerHTML = "<span>⌬</span>APIs";

    const lab = q('a[href="lab.html"]', nav);
    nav.insertBefore(apiBtn, lab || null);
    apiBtn.addEventListener("click", showApiHub);
  }

  function installApiView() {
    if (q("#apiSourcesView")) return;
    const section = document.createElement("section");
    section.className = "api-view";
    section.id = "apiSourcesView";
    section.hidden = true;
    section.innerHTML = `
      <div class="view-head inline">
        <div>
          <span class="eyebrow mini"><i></i> Free TV APIs</span>
          <h2>Source Hub</h2>
        </div>
        <span class="view-count" id="apiProviderCount"></span>
      </div>

      <div class="api-toolbar">
        <div class="api-search-shell">
          <span aria-hidden="true">⌬</span>
          <input id="apiSearchInput" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Search legal TV APIs: channel, show, network…" />
          <button class="primary-action" id="apiSearchBtn" type="button">Search APIs</button>
        </div>
        <div class="api-provider-strip" id="apiProviderStrip"></div>
        <p class="api-note">Nova only integrates legal/free TV APIs that are usable from a static web app. It does not add pirate IPTV feeds, adult sources, private playlists, or anything that tries to bypass regional rights.</p>
        <div class="api-key-panel">
          <label>Optional TMDB API key <input id="tmdbKeyInput" type="password" autocomplete="off" placeholder="Paste key here for TMDB search" /></label>
          <button class="secondary-action" id="saveTmdbKey" type="button">Save key locally</button>
          <button class="secondary-action" id="clearTmdbKey" type="button">Clear</button>
        </div>
      </div>

      <div class="api-providers" id="apiProviders"></div>
      <div class="api-results" id="apiResults"><div class="api-status">Search across IPTV-org, TVmaze, EpisoDate, and optional TMDB metadata.</div></div>
    `;

    const guide = q("#guideView");
    const wall = q("#wall");
    if (guide) guide.insertAdjacentElement("afterend", section);
    else if (wall) wall.insertAdjacentElement("beforebegin", section);
    else q("#app")?.appendChild(section);

    bindApiView();
    renderProviderCards();
  }

  function bindApiView() {
    q("#apiSearchBtn")?.addEventListener("click", runApiSearch);
    q("#apiSearchInput")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runApiSearch();
    });
    q("#apiSearchInput")?.addEventListener("touchend", () => q("#apiSearchInput")?.focus({ preventScroll: true }), { passive: true });

    q("#saveTmdbKey")?.addEventListener("click", () => {
      const key = q("#tmdbKeyInput")?.value.trim();
      if (!key) return status("Paste a TMDB API key first.");
      localStorage.setItem(TMDB_KEY_STORE, key);
      activeProviders.add("tmdb");
      renderProviderStrip();
      status("TMDB key saved locally in this browser only.");
    });

    q("#clearTmdbKey")?.addEventListener("click", () => {
      localStorage.removeItem(TMDB_KEY_STORE);
      activeProviders.delete("tmdb");
      if (q("#tmdbKeyInput")) q("#tmdbKeyInput").value = "";
      renderProviderStrip();
      status("TMDB key cleared.");
    });
  }

  function showApiHub() {
    q("#sidebar")?.classList.remove("open");
    hideMainViews();
    q("#apiSourcesView").hidden = false;
    qa(".nav-item").forEach((item) => item.classList.remove("active"));
    q('[data-api-view="apis"]')?.classList.add("active");
    renderProviderCards();
    renderProviderStrip();
  }

  function hideMainViews() {
    ["#signalverse", "#viewHead", "#wall", "#empty", "#guideView"].forEach((sel) => {
      const node = q(sel);
      if (node) node.hidden = true;
    });
    const rows = q("#rows");
    if (rows) rows.innerHTML = "";
    const grid = q("#grid");
    if (grid) grid.innerHTML = "";
  }

  function renderProviderCards() {
    const wrap = q("#apiProviders");
    const count = q("#apiProviderCount");
    if (count) count.textContent = `${PROVIDERS.length} legal providers`;
    if (!wrap) return;
    wrap.innerHTML = "";
    PROVIDERS.forEach((provider) => {
      const card = document.createElement("article");
      card.className = "api-provider-card";
      card.innerHTML = `
        <h3>${safe(provider.name)}</h3>
        <p>${safe(provider.description)}</p>
        <div class="api-badges">
          <span class="api-badge good">${safe(provider.status)}</span>
          <span class="api-badge">${safe(provider.kind)}</span>
          <span class="api-badge ${provider.keyRequired ? "key" : "good"}">${safe(provider.auth)}</span>
        </div>
      `;
      card.addEventListener("click", () => window.open(provider.docs, "_blank", "noopener"));
      wrap.appendChild(card);
    });
  }

  function renderProviderStrip() {
    const strip = q("#apiProviderStrip");
    if (!strip) return;
    strip.innerHTML = "";
    PROVIDERS.forEach((provider) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `api-toggle ${activeProviders.has(provider.id) ? "active" : ""}`;
      btn.textContent = provider.keyRequired && !getTmdbKey() ? `${provider.name} + key` : provider.name;
      btn.addEventListener("click", () => {
        if (provider.keyRequired && !getTmdbKey()) {
          q("#tmdbKeyInput")?.focus({ preventScroll: true });
          status("TMDB needs a free API key. Paste it in the local key field.");
          return;
        }
        if (activeProviders.has(provider.id)) activeProviders.delete(provider.id);
        else activeProviders.add(provider.id);
        renderProviderStrip();
      });
      strip.appendChild(btn);
    });
  }

  async function runApiSearch() {
    const query = q("#apiSearchInput")?.value.trim();
    if (!query) return status("Enter a channel, TV show, network, or category to search.");

    const resultWrap = q("#apiResults");
    resultWrap.innerHTML = `<div class="api-status">Searching selected legal/free TV APIs…</div>`;

    const tasks = [];
    if (activeProviders.has("iptv")) tasks.push(searchIptv(query));
    if (activeProviders.has("tvmaze")) tasks.push(searchTvMaze(query));
    if (activeProviders.has("episodate")) tasks.push(searchEpisodate(query));
    if (activeProviders.has("tmdb") && getTmdbKey()) tasks.push(searchTmdb(query));

    const settled = await Promise.allSettled(tasks);
    const results = settled.flatMap((item) => item.status === "fulfilled" ? item.value : []);

    if (!results.length) return status("No matches found across selected TV APIs.");
    resultWrap.innerHTML = "";
    results.slice(0, 48).forEach((result) => resultWrap.appendChild(resultCard(result)));
  }

  async function searchIptv(query) {
    const s = globalState();
    if (!s?.all?.length) return [];
    const qLower = query.toLowerCase();
    return s.all
      .filter((channel) => [channel.name, channel.countryName, channel.country, channel.network, channel.city, ...(channel.altNames || []), ...(channel.categories || []).map((id) => s.catName.get(id) || id)].join(" ").toLowerCase().includes(qLower))
      .slice(0, 12)
      .map((channel) => ({
        provider: "IPTV-org",
        title: channel.name,
        sub: [channel.flag, channel.countryName, primaryCategory(channel), `${channel.urls.length} source${channel.urls.length === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
        image: channel.logo,
        channelId: channel.id,
        action: () => typeof openPlayer === "function" ? openPlayer(channel) : null,
      }));
  }

  async function searchTvMaze(query) {
    const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.slice(0, 12).map((item) => {
      const show = item.show || {};
      return {
        provider: "TVmaze",
        title: show.name || "Untitled show",
        sub: [show.type, show.language, show.premiered ? `Premiered ${show.premiered}` : "", show.status].filter(Boolean).join(" · "),
        image: show.image?.medium || show.image?.original || "",
        url: show.url,
      };
    });
  }

  async function searchEpisodate(query) {
    const res = await fetch(`https://www.episodate.com/api/search?q=${encodeURIComponent(query)}&page=1`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.tv_shows || []).slice(0, 12).map((show) => ({
      provider: "EpisoDate",
      title: show.name || "Untitled show",
      sub: [show.country, show.start_date ? `Started ${show.start_date}` : "", show.status].filter(Boolean).join(" · "),
      image: show.image_thumbnail_path || "",
      url: show.permalink ? `https://www.episodate.com/tv-show/${show.permalink}` : "https://www.episodate.com/",
    }));
  }

  async function searchTmdb(query) {
    const key = getTmdbKey();
    if (!key) return [];
    const res = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&include_adult=false`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, 12).map((show) => ({
      provider: "TMDB",
      title: show.name || show.original_name || "Untitled show",
      sub: [show.first_air_date ? `First aired ${show.first_air_date}` : "", show.vote_average ? `Rating ${show.vote_average}` : "", show.origin_country?.join(", ")].filter(Boolean).join(" · "),
      image: show.poster_path ? `https://image.tmdb.org/t/p/w185${show.poster_path}` : "",
      url: `https://www.themoviedb.org/tv/${show.id}`,
    }));
  }

  function resultCard(result) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "api-result-card";
    card.innerHTML = `
      <div class="api-result-art">${result.image ? `<img src="${safe(result.image)}" alt="" loading="lazy" />` : `<span class="logo-fallback">${safe(initials(result.title))}</span>`}</div>
      <div class="api-result-copy">
        <span class="api-result-provider">${safe(result.provider)}</span>
        <b>${safe(result.title)}</b>
        <span>${safe(result.sub || "Metadata result")}</span>
      </div>
      <span class="result-action">›</span>
    `;
    card.addEventListener("click", () => {
      if (result.action) return result.action();
      if (result.url) window.open(result.url, "_blank", "noopener");
    });
    return card;
  }

  function status(message) {
    const out = q("#apiResults");
    if (out) out.innerHTML = `<div class="api-status">${safe(message)}</div>`;
  }

  function getTmdbKey() {
    return localStorage.getItem(TMDB_KEY_STORE) || "";
  }

  function globalState() {
    try { return state; }
    catch { return null; }
  }

  function initials(name) {
    return String(name || "TV").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "TV";
  }

  function primaryCategory(channel) {
    const s = globalState();
    const id = channel.categories?.[0];
    return s?.catName?.get(id) || id || "Live";
  }

  window.NovaFreeTvApis = {
    providers: PROVIDERS,
    showApiHub,
    search: runApiSearch,
  };
})();
