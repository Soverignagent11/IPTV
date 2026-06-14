/* ============================================================
 * Nova TV — Product Coherence Layer
 * View state, nav labels, grouped tabs, and copy consistency.
 * ============================================================ */

(() => {
  const FEATURE_VIEWS = [
    "#guideView",
    "#radioView",
    "#firewallView",
    "#apiSourcesView",
    "#toolsView",
  ];

  const NAV_LABELS = {
    signalverse: "Home",
    discover: "Browse",
    categories: "Categories",
    countries: "Countries",
    wall: "Wall",
    favorites: "Library",
  };

  const NAV_ORDER = [
    '[data-view="signalverse"]',
    '[data-view="discover"]',
    '[data-guide-view="guide"]',
    '[data-radio-view="radio"]',
    '[data-view="wall"]',
    '[data-view="favorites"]',
    '[data-tools-view="tools"]',
    '[data-view="categories"]',
    '[data-view="countries"]',
    '[data-firewall-view="firewall"]',
    '[data-api-view="apis"]',
    'a[href="lab.html"]',
  ];

  let reorderQueued = false;
  let reordering = false;

  window.addEventListener("DOMContentLoaded", () => {
    installToolsNav();
    installToolsView();
    labelNavigation();
    patchPrimaryLabels();
    markSecondaryNavigation();
    observeDynamicNavigation();
    patchFeatureCopy();
    patchSearchPlaceholder();
    queueReorder();
  });

  function q(sel, root = document) { return root.querySelector(sel); }
  function qa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

  function installToolsNav() {
    const nav = q(".nav-list");
    if (!nav || q('[data-tools-view="tools"]', nav)) return;
    const btn = document.createElement("button");
    btn.className = "nav-item";
    btn.type = "button";
    btn.dataset.toolsView = "tools";
    btn.innerHTML = "<span>⋯</span>Tools";
    btn.addEventListener("click", showTools);
    const lab = q('a[href="lab.html"]', nav);
    nav.insertBefore(btn, lab || null);
  }

  function installToolsView() {
    if (q("#toolsView")) return;
    const view = document.createElement("section");
    view.className = "tools-view";
    view.id = "toolsView";
    view.hidden = true;
    view.innerHTML = `
      <div class="view-head inline">
        <div><span class="eyebrow mini"><i></i> Utilities</span><h2>Tools</h2></div>
        <span class="view-count">Source controls</span>
      </div>
      <div class="tools-grid">
        <button class="tool-card" type="button" data-tool-action="firewall"><span>⛨</span><b>Source Firewall</b><p>Scan a user-owned M3U playlist locally before testing any stream.</p></button>
        <button class="tool-card" type="button" data-tool-action="apis"><span>⌬</span><b>API Hub</b><p>Search legal/free TV metadata providers and optional local TMDB metadata.</p></button>
        <button class="tool-card" type="button" data-tool-action="lab"><span>⚗</span><b>Optics Lab</b><p>Open the experimental Kinetic Optics interface lab.</p></button>
      </div>
    `;
    const wall = q("#wall");
    if (wall) wall.insertAdjacentElement("beforebegin", view);
    else q("#app")?.appendChild(view);

    view.addEventListener("click", (event) => {
      const card = event.target.closest?.("[data-tool-action]");
      if (!card) return;
      const action = card.dataset.toolAction;
      if (action === "firewall" && window.NovaFirewall?.showFirewall) return window.NovaFirewall.showFirewall();
      if (action === "apis" && window.NovaFreeTvApis?.showApiHub) return window.NovaFreeTvApis.showApiHub();
      if (action === "lab") window.location.href = "lab.html";
    });
  }

  function showTools() {
    q("#sidebar")?.classList.remove("open");
    hideMainViews();
    hideFeatureViews();
    q("#toolsView").hidden = false;
    setActiveNav('[data-tools-view="tools"]');
  }

  function hideMainViews() {
    ["#signalverse", "#viewHead", "#wall", "#empty"].forEach((selector) => {
      const view = q(selector);
      if (view) view.hidden = true;
    });
    const rows = q("#rows");
    if (rows) rows.innerHTML = "";
    const grid = q("#grid");
    if (grid) grid.innerHTML = "";
  }

  function labelNavigation() {
    qa(".nav-item").forEach((item) => {
      const label = deriveLabel(item);
      if (label) {
        item.setAttribute("aria-label", label);
        item.setAttribute("title", label);
      }
    });
  }

  function deriveLabel(item) {
    if (item.dataset.view) return NAV_LABELS[item.dataset.view] || cleanText(item.textContent);
    if (item.dataset.radioView) return "Radio";
    if (item.dataset.guideView) return "Guide";
    if (item.dataset.firewallView) return "Source Firewall";
    if (item.dataset.apiView) return "API Hub";
    if (item.dataset.toolsView) return "Tools";
    if (item.getAttribute("href") === "lab.html") return "Optics Lab";
    return cleanText(item.textContent);
  }

  function cleanText(value) {
    return String(value || "").replace(/[✦⌕◇◎▦★⚗▤◉⛨⌬⋯]/g, "").trim();
  }

  function patchPrimaryLabels() {
    setNavMarkup('[data-view="signalverse"]', "✦", "Home");
    setNavMarkup('[data-view="discover"]', "⌕", "Browse");
    setNavMarkup('[data-view="wall"]', "▦", "Wall");
    setNavMarkup('[data-view="favorites"]', "★", "Library");
  }

  function setNavMarkup(selector, icon, label) {
    const item = q(selector);
    if (!item) return;
    item.innerHTML = `<span>${icon}</span>${label}`;
    item.setAttribute("aria-label", label);
    item.setAttribute("title", label);
  }

  function markSecondaryNavigation() {
    qa('[data-view="categories"], [data-view="countries"], [data-firewall-view="firewall"], [data-api-view="apis"], a[href="lab.html"]').forEach((item) => {
      item.classList.add("nav-secondary");
      item.setAttribute("aria-hidden", "true");
      item.tabIndex = -1;
    });
  }

  function observeDynamicNavigation() {
    const nav = q(".nav-list");
    if (!nav) return;
    const observer = new MutationObserver(() => {
      if (reordering) return;
      installToolsNav();
      patchPrimaryLabels();
      markSecondaryNavigation();
      labelNavigation();
      queueReorder();
    });
    observer.observe(nav, { childList: true });
    queueReorder();
  }

  function queueReorder() {
    if (reorderQueued) return;
    reorderQueued = true;
    requestAnimationFrame(() => {
      reorderQueued = false;
      reorderNav();
    });
  }

  function reorderNav() {
    const nav = q(".nav-list");
    if (!nav) return;

    const ordered = NAV_ORDER.map((selector) => q(selector, nav)).filter(Boolean);
    const known = new Set(ordered);
    const extra = [...nav.children].filter((node) => !known.has(node));
    const desired = [...ordered, ...extra];
    const current = [...nav.children];

    if (sameOrder(current, desired)) return;

    const scrollLeft = nav.scrollLeft;
    reordering = true;
    const fragment = document.createDocumentFragment();
    desired.forEach((node) => fragment.appendChild(node));
    nav.appendChild(fragment);
    nav.scrollLeft = scrollLeft;
    requestAnimationFrame(() => {
      nav.scrollLeft = scrollLeft;
      reordering = false;
      patchPrimaryLabels();
      markSecondaryNavigation();
      labelNavigation();
    });
  }

  function sameOrder(a, b) {
    if (a.length !== b.length) return false;
    return a.every((node, index) => node === b[index]);
  }

  function patchFeatureCopy() {
    const radioTitle = q("#radioTitle");
    if (radioTitle && radioTitle.textContent === "Featured Radio") radioTitle.textContent = "Radio Stations";

    const apiTitle = q("#apiSourcesView h2");
    if (apiTitle && apiTitle.textContent === "Source Hub") apiTitle.textContent = "API Hub";

    const firewallTitle = q("#firewallView h2");
    if (firewallTitle && firewallTitle.textContent === "Quarantine first.") firewallTitle.textContent = "Source Firewall";
  }

  function patchSearchPlaceholder() {
    const search = q("#searchInput");
    if (search) search.placeholder = "Search channels, guide, radio, countries…";
  }

  document.addEventListener("click", (event) => {
    const navItem = event.target.closest?.(".nav-item");
    if (!navItem) return;

    if (navItem.classList.contains("nav-secondary")) return;

    setActiveElement(navItem);

    if (navItem.dataset.view) hideFeatureViews();

    if (navItem.dataset.view === "discover") {
      requestAnimationFrame(() => installBrowseSwitcher());
    }
  }, true);

  function installBrowseSwitcher() {
    const grid = q("#grid");
    const viewHead = q("#viewHead");
    if (!grid || !viewHead || viewHead.hidden) return;

    const title = q("#viewTitle");
    if (title) title.textContent = "Browse";

    let switcher = q("#browseSwitch");
    if (!switcher) {
      switcher = document.createElement("section");
      switcher.id = "browseSwitch";
      switcher.className = "browse-switch material";
      switcher.innerHTML = `
        <button type="button" class="browse-chip active" data-browse-action="all">All Channels</button>
        <button type="button" class="browse-chip" data-browse-action="categories">Categories</button>
        <button type="button" class="browse-chip" data-browse-action="countries">Countries</button>
      `;
      grid.insertAdjacentElement("beforebegin", switcher);
      switcher.addEventListener("click", (event) => {
        const chip = event.target.closest?.("[data-browse-action]");
        if (!chip) return;
        const action = chip.dataset.browseAction;
        if (action === "categories") return clickHiddenNav('[data-view="categories"]');
        if (action === "countries") return clickHiddenNav('[data-view="countries"]');
        return clickHiddenNav('[data-view="discover"]');
      });
    }
    switcher.hidden = false;
  }

  function clickHiddenNav(selector) {
    const nav = q(selector);
    if (nav) nav.click();
    requestAnimationFrame(() => {
      if (selector === '[data-view="discover"]') installBrowseSwitcher();
      setActiveNav('[data-view="discover"]');
    });
  }

  function setActiveElement(navItem) {
    qa(".nav-item").forEach((item) => item.classList.remove("active"));
    navItem.classList.add("active");
  }

  function setActiveNav(selector) {
    qa(".nav-item").forEach((item) => item.classList.remove("active"));
    q(selector)?.classList.add("active");
  }

  function hideFeatureViews() {
    FEATURE_VIEWS.forEach((selector) => {
      const view = q(selector);
      if (view) view.hidden = true;
    });
    const switcher = q("#browseSwitch");
    if (switcher) switcher.hidden = true;
  }

  window.NovaCoherence = {
    labelNavigation,
    reorderNav,
    hideFeatureViews,
    showTools,
    installBrowseSwitcher,
  };
})();
