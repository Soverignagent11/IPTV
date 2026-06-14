/* ============================================================
 * Nova TV — Radio
 * Legal public internet radio directory using Radio Browser API.
 * ============================================================ */

(() => {
  const RADIO_API = "https://all.api.radio-browser.info/json";
  const RADIO_FAVS = "nova:radio:favorites:v1";
  const BLOCK_WORDS = [
    "adult", "xxx", "porn", "sex", "erotic", "nsfw", "18+", "explicit"
  ];

  let radioResults = [];
  let radioFavorites = new Set(readJson(RADIO_FAVS, []));
  let currentStation = null;

  window.addEventListener("DOMContentLoaded", () => {
    installRadioNav();
    installRadioView();
  });

  function q(sel, root = document) { return root.querySelector(sel); }
  function qa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
  function safe(value) {
    return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  }
  function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function installRadioNav() {
    const nav = q(".nav-list");
    if (!nav || q('[data-radio-view="radio"]')) return;
    const btn = document.createElement("button");
    btn.className = "nav-item";
    btn.type = "button";
    btn.dataset.radioView = "radio";
    btn.innerHTML = "<span>◉</span>Radio";
    const guide = q('[data-guide-view="guide"]', nav);
    const wall = q('[data-view="wall"]', nav);
    nav.insertBefore(btn, guide || wall || null);
    btn.addEventListener("click", showRadio);
  }

  function installRadioView() {
    if (q("#radioView")) return;
    const section = document.createElement("section");
    section.className = "radio-view";
    section.id = "radioView";
    section.hidden = true;
    section.innerHTML = `
      <div class="radio-hero">
        <div class="radio-copy">
          <span class="eyebrow mini"><i></i> Public Internet Radio</span>
          <h2>Nova Radio</h2>
          <p>Search legal public internet radio stations by name, country, or genre. Streams play in the browser and stay separate from TV sources.</p>
        </div>
        <div class="radio-tuner">
          <label class="radio-search" for="radioSearchInput">
            <span aria-hidden="true">◉</span>
            <input id="radioSearchInput" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Search radio: Toronto, jazz, news, rock…" />
            <button class="primary-action" id="radioSearchBtn" type="button">Search radio</button>
          </label>
          <div class="radio-actions" id="radioQuickTags"></div>
          <div class="radio-now" id="radioNow" hidden>
            <div class="radio-now-art" id="radioNowArt"><span class="logo-fallback">FM</span></div>
            <div class="radio-now-copy"><b id="radioNowTitle">—</b><span id="radioNowMeta">—</span></div>
            <audio id="radioAudio" controls preload="none"></audio>
          </div>
        </div>
      </div>
      <div class="view-head inline">
        <div><span class="eyebrow mini"><i></i> Stations</span><h2 id="radioTitle">Featured Radio</h2></div>
        <span class="view-count" id="radioCount"></span>
      </div>
      <div class="radio-grid" id="radioGrid"><div class="radio-status">Open Radio to load public stations.</div></div>
    `;

    const guide = q("#guideView");
    const api = q("#apiSourcesView");
    const wall = q("#wall");
    if (api) api.insertAdjacentElement("beforebegin", section);
    else if (guide) guide.insertAdjacentElement("afterend", section);
    else if (wall) wall.insertAdjacentElement("beforebegin", section);
    else q("#app")?.appendChild(section);

    bindRadioUI();
  }

  function bindRadioUI() {
    const input = q("#radioSearchInput");
    q("#radioSearchBtn")?.addEventListener("click", () => searchRadio(input?.value || ""));
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") searchRadio(input.value);
    });
    input?.addEventListener("touchend", () => input.focus({ preventScroll: true }), { passive: true });

    const tags = ["Canada", "News", "Sports", "Jazz", "Rock", "Pop", "Talk", "Classical", "Toronto"];
    const wrap = q("#radioQuickTags");
    if (wrap) {
      wrap.innerHTML = "";
      tags.forEach((tag) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "radio-chip";
        btn.textContent = tag;
        btn.addEventListener("click", () => {
          if (input) input.value = tag;
          searchRadio(tag);
        });
        wrap.appendChild(btn);
      });
    }
  }

  function showRadio() {
    q("#sidebar")?.classList.remove("open");
    hideMainViews();
    q("#radioView").hidden = false;
    qa(".nav-item").forEach((item) => item.classList.remove("active"));
    q('[data-radio-view="radio"]')?.classList.add("active");
    if (!radioResults.length) searchRadio("Canada");
  }

  function hideMainViews() {
    ["#signalverse", "#viewHead", "#wall", "#empty", "#guideView", "#apiSourcesView", "#firewallView"].forEach((sel) => {
      const node = q(sel);
      if (node) node.hidden = true;
    });
    const rows = q("#rows");
    if (rows) rows.innerHTML = "";
    const grid = q("#grid");
    if (grid) grid.innerHTML = "";
  }

  async function searchRadio(query) {
    const grid = q("#radioGrid");
    const title = q("#radioTitle");
    const count = q("#radioCount");
    if (!grid) return;

    const cleaned = String(query || "Canada").trim() || "Canada";
    title.textContent = `Radio: ${cleaned}`;
    count.textContent = "Searching…";
    grid.innerHTML = `<div class="radio-status">Searching public radio directory…</div>`;

    try {
      const params = new URLSearchParams({
        name: cleaned,
        hidebroken: "true",
        order: "clickcount",
        reverse: "true",
        limit: "60",
      });
      const res = await fetch(`${RADIO_API}/stations/search?${params.toString()}`);
      if (!res.ok) throw new Error("radio search failed");
      const data = await res.json();
      radioResults = normalizeStations(data).slice(0, 48);
      renderRadioResults();
    } catch (err) {
      console.error(err);
      count.textContent = "0 stations";
      grid.innerHTML = `<div class="radio-status">Radio directory unavailable. Try again in a moment.</div>`;
    }
  }

  function normalizeStations(stations) {
    return (stations || [])
      .filter((s) => s && s.name && s.url_resolved)
      .filter((s) => String(s.url_resolved).startsWith("https://"))
      .filter((s) => !isBlocked(`${s.name} ${s.tags} ${s.country}`))
      .map((s) => ({
        id: s.stationuuid,
        name: s.name,
        url: s.url_resolved,
        homepage: s.homepage || "",
        favicon: s.favicon || "",
        country: s.country || s.countrycode || "",
        language: s.language || "",
        tags: splitTags(s.tags).slice(0, 4),
        codec: s.codec || "",
        bitrate: s.bitrate || "",
        clicks: s.clickcount || 0,
      }));
  }

  function renderRadioResults() {
    const grid = q("#radioGrid");
    const count = q("#radioCount");
    if (!grid) return;
    count.textContent = `${radioResults.length.toLocaleString()} stations`;
    if (!radioResults.length) {
      grid.innerHTML = `<div class="radio-status">No safe HTTPS stations found for this search.</div>`;
      return;
    }
    grid.innerHTML = "";
    radioResults.forEach((station) => grid.appendChild(radioCard(station)));
  }

  function radioCard(station) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "radio-card";
    card.innerHTML = `
      <div class="radio-card-head">
        <div class="radio-logo">${station.favicon ? `<img src="${safe(station.favicon)}" alt="" loading="lazy" />` : `<span class="logo-fallback">${safe(initials(station.name))}</span>`}</div>
        <div><b>${safe(station.name)}</b><span>${safe([station.country, station.language, station.codec].filter(Boolean).join(" · "))}</span></div>
      </div>
      <span>${safe(station.bitrate ? `${station.bitrate} kbps` : "Public radio stream")}</span>
      <div class="radio-tags">${station.tags.map((tag) => `<span class="radio-tag">${safe(tag)}</span>`).join("")}</div>
    `;
    card.addEventListener("click", () => playStation(station));
    return card;
  }

  function playStation(station) {
    currentStation = station;
    q("#radioNow").hidden = false;
    q("#radioNowTitle").textContent = station.name;
    q("#radioNowMeta").textContent = [station.country, station.language, station.codec, station.bitrate ? `${station.bitrate} kbps` : ""].filter(Boolean).join(" · ");
    q("#radioNowArt").innerHTML = station.favicon ? `<img src="${safe(station.favicon)}" alt="" />` : `<span class="logo-fallback">${safe(initials(station.name))}</span>`;
    const audio = q("#radioAudio");
    audio.src = station.url;
    audio.play().catch(() => {});
    if (!radioFavorites.has(station.id)) {
      radioFavorites.add(station.id);
      writeJson(RADIO_FAVS, [...radioFavorites].slice(-120));
    }
  }

  function splitTags(tags) {
    return String(tags || "").split(",").map((t) => t.trim()).filter(Boolean);
  }

  function isBlocked(text) {
    const lower = String(text || "").toLowerCase();
    return BLOCK_WORDS.some((word) => lower.includes(word));
  }

  function initials(name) {
    return String(name || "FM").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "FM";
  }

  window.NovaRadio = { showRadio, searchRadio };
})();
