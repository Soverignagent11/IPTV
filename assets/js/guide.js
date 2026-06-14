/* ============================================================
 * Nova TV — Channel Guide layer
 * Adds an Apple TV / Prime-style guide without inventing exact EPG data.
 * ============================================================ */

(() => {
  const GUIDE_FILTERS = [
    ["all", "All"],
    ["favorites", "Favorites"],
    ["recent", "Recent"],
    ["news", "News"],
    ["sports", "Sports"],
    ["movies", "Movies"],
    ["music", "Music"],
    ["kids", "Kids"],
  ];

  let guideFilter = "all";

  window.addEventListener("DOMContentLoaded", () => {
    installGuideNav();
    installGuideView();
  });

  function q(sel, root = document) { return root.querySelector(sel); }
  function qa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
  function safe(value) {
    return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function installGuideNav() {
    const nav = q(".nav-list");
    if (!nav || q('[data-guide-view="guide"]')) return;
    const guideBtn = document.createElement("button");
    guideBtn.className = "nav-item";
    guideBtn.type = "button";
    guideBtn.dataset.guideView = "guide";
    guideBtn.innerHTML = "<span>▤</span>Guide";

    const wall = q('[data-view="wall"]', nav);
    nav.insertBefore(guideBtn, wall || null);
    guideBtn.addEventListener("click", showGuide);
  }

  function installGuideView() {
    if (q("#guideView")) return;
    const guide = document.createElement("section");
    guide.className = "guide-view";
    guide.id = "guideView";
    guide.hidden = true;
    guide.innerHTML = `
      <div class="view-head inline">
        <div>
          <span class="eyebrow mini"><i></i> Channel Guide</span>
          <h2>What’s live</h2>
        </div>
        <span class="view-count" id="guideCount"></span>
      </div>

      <div class="guide-toolbar">
        <div class="guide-filter-bar" id="guideFilters"></div>
        <p class="guide-note">This guide shows live channels in a familiar TV-guide layout. Exact program titles depend on external EPG availability, so Nova labels public streams honestly instead of fabricating schedules.</p>
      </div>

      <div class="guide-shell">
        <div class="guide-grid" id="guideGrid"></div>
      </div>
    `;

    const wall = q("#wall");
    if (wall) wall.insertAdjacentElement("beforebegin", guide);
    else q("#app")?.appendChild(guide);

    renderFilterButtons();
  }

  function renderFilterButtons() {
    const wrap = q("#guideFilters");
    if (!wrap) return;
    wrap.innerHTML = "";
    GUIDE_FILTERS.forEach(([id, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `guide-filter ${guideFilter === id ? "active" : ""}`;
      btn.dataset.guideFilter = id;
      btn.textContent = label;
      btn.addEventListener("click", () => {
        guideFilter = id;
        renderFilterButtons();
        renderGuide();
      });
      wrap.appendChild(btn);
    });
  }

  function showGuide() {
    q("#sidebar")?.classList.remove("open");
    hideMainViews();
    q("#guideView").hidden = false;
    qa(".nav-item").forEach((item) => item.classList.remove("active"));
    q('[data-guide-view="guide"]')?.classList.add("active");
    renderGuide();
  }

  function hideMainViews() {
    ["#signalverse", "#viewHead", "#wall", "#empty"].forEach((sel) => {
      const node = q(sel);
      if (node) node.hidden = true;
    });
    const rows = q("#rows");
    if (rows) rows.innerHTML = "";
    const grid = q("#grid");
    if (grid) grid.innerHTML = "";
  }

  function renderGuide() {
    const grid = q("#guideGrid");
    if (!grid) return;

    const channels = getGuideChannels();
    q("#guideCount").textContent = `${channels.length.toLocaleString()} guide rows`;
    grid.innerHTML = "";

    if (!channels.length) {
      grid.innerHTML = `<div class="guide-empty">No channels found for this guide filter.</div>`;
      return;
    }

    grid.appendChild(timebar());
    channels.forEach((channel) => grid.appendChild(guideRow(channel)));
  }

  function getGuideChannels() {
    const s = globalState();
    if (!s?.all?.length) return [];
    if (guideFilter === "favorites") return [...s.favorites].map((id) => s.byId.get(id)).filter(Boolean).slice(0, 80);
    if (guideFilter === "recent") return s.recent.map((id) => s.byId.get(id)).filter(Boolean).slice(0, 80);
    if (guideFilter !== "all") return s.all.filter((c) => c.categories.includes(guideFilter)).slice(0, 90);

    const favs = [...s.favorites].map((id) => s.byId.get(id)).filter(Boolean);
    const recent = s.recent.map((id) => s.byId.get(id)).filter(Boolean);
    const premium = s.all.filter((c) => c.logo && c.health >= 72);
    return uniqueChannels([...favs, ...recent, ...premium, ...s.all]).slice(0, 100);
  }

  function uniqueChannels(list) {
    const seen = new Set();
    return list.filter((channel) => {
      if (!channel || seen.has(channel.id)) return false;
      seen.add(channel.id);
      return true;
    });
  }

  function timebar() {
    const row = document.createElement("div");
    row.className = "guide-timebar";
    const labels = ["Channel", "Now", plusMinutes(30), plusMinutes(60), plusMinutes(90)];
    labels.forEach((label) => {
      const cell = document.createElement("div");
      cell.textContent = label;
      row.appendChild(cell);
    });
    return row;
  }

  function guideRow(channel) {
    const row = document.createElement("article");
    row.className = "guide-row";
    row.innerHTML = `
      <div class="guide-channel">
        <div class="guide-logo">${logoHTML(channel)}</div>
        <div class="guide-channel-copy">
          <b>${safe(channel.name)}</b>
          <span>${safe(metaText(channel))}</span>
        </div>
        <button class="guide-play" type="button" aria-label="Watch ${safe(channel.name)}">▶</button>
      </div>
    `;

    const play = q(".guide-play", row);
    play.addEventListener("click", () => openChannel(channel));

    buildSlots(channel).forEach((slot, index) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `guide-slot ${index === 0 ? "now" : ""}`;
      cell.innerHTML = `<b>${safe(slot.title)}</b><span>${safe(slot.sub)}</span><small>${safe(slot.label)}</small>`;
      cell.addEventListener("click", () => openChannel(channel));
      cell.addEventListener("pointermove", (event) => {
        const rect = cell.getBoundingClientRect();
        cell.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width * 100).toFixed(2)}%`);
        cell.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height * 100).toFixed(2)}%`);
      });
      row.appendChild(cell);
    });

    return row;
  }

  function buildSlots(channel) {
    const category = primaryCategory(channel);
    const country = channel.countryName || channel.country || "Public stream";
    const sourceText = `${channel.urls.length} source${channel.urls.length === 1 ? "" : "s"} · ${healthLabel(channel.health)}`;
    return [
      { title: `${category} live feed`, sub: country, label: "Live now" },
      { title: `Continue watching ${shortName(channel.name)}`, sub: sourceText, label: plusMinutes(30) },
      { title: "Program data pending", sub: "External EPG not attached for this public listing", label: plusMinutes(60) },
      { title: "Continuous public stream", sub: "Open channel for current broadcast", label: plusMinutes(90) },
    ];
  }

  function openChannel(channel) {
    if (typeof openPlayer === "function") openPlayer(channel);
  }

  function logoHTML(channel) {
    if (channel.logo) return `<img src="${safe(channel.logo)}" alt="" loading="lazy" />`;
    return `<span class="logo-fallback">${safe(initials(channel.name))}</span>`;
  }

  function initials(name) {
    return String(name || "TV").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "TV";
  }

  function shortName(name) {
    const clean = String(name || "channel").replace(/\s+TV$/i, "").trim();
    return clean.length > 26 ? `${clean.slice(0, 24)}…` : clean;
  }

  function primaryCategory(channel) {
    const s = globalState();
    const id = channel.categories?.[0];
    return s?.catName?.get(id) || id || "Live";
  }

  function metaText(channel) {
    const bits = [channel.flag || "", channel.countryName, primaryCategory(channel)].filter(Boolean);
    return bits.join(" · ");
  }

  function plusMinutes(minutes) {
    const date = new Date(Date.now() + minutes * 60_000);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function healthLabel(score) {
    if (score >= 82) return "strong signal";
    if (score >= 66) return "stable signal";
    if (score >= 50) return "unknown stability";
    return "weak signal";
  }

  function globalState() {
    try { return state; }
    catch { return null; }
  }

  window.NovaGuide = { showGuide, renderGuide };
})();
