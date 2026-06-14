/* ============================================================
 * Nova TV — Product Coherence Layer
 * View state, nav labels, and copy consistency for dynamic modules.
 * ============================================================ */

(() => {
  const FEATURE_VIEWS = [
    "#guideView",
    "#radioView",
    "#firewallView",
    "#apiSourcesView",
  ];

  const NAV_LABELS = {
    signalverse: "Home",
    discover: "Discover",
    categories: "Categories",
    countries: "Countries",
    wall: "Signal Wall",
    favorites: "Favorites",
  };

  window.addEventListener("DOMContentLoaded", () => {
    labelNavigation();
    observeDynamicNavigation();
    patchFeatureCopy();
    patchSearchPlaceholder();
  });

  function q(sel, root = document) { return root.querySelector(sel); }
  function qa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

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
    if (item.getAttribute("href") === "lab.html") return "Optics Lab";
    return cleanText(item.textContent);
  }

  function cleanText(value) {
    return String(value || "").replace(/[✦⌕◇◎▦★⚗▤◉⛨⌬]/g, "").trim();
  }

  function observeDynamicNavigation() {
    const nav = q(".nav-list");
    if (!nav) return;
    const observer = new MutationObserver(() => {
      labelNavigation();
      reorderNav();
    });
    observer.observe(nav, { childList: true, subtree: true });
    reorderNav();
  }

  function reorderNav() {
    const nav = q(".nav-list");
    if (!nav) return;
    const order = [
      '[data-view="signalverse"]',
      '[data-view="discover"]',
      '[data-guide-view="guide"]',
      '[data-radio-view="radio"]',
      '[data-view="wall"]',
      '[data-view="favorites"]',
      '[data-view="categories"]',
      '[data-view="countries"]',
      '[data-firewall-view="firewall"]',
      '[data-api-view="apis"]',
      'a[href="lab.html"]',
    ];
    order.map((selector) => q(selector, nav)).filter(Boolean).forEach((node) => nav.appendChild(node));
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

    qa(".nav-item").forEach((item) => item.classList.remove("active"));
    navItem.classList.add("active");

    if (navItem.dataset.view) hideFeatureViews();
  }, true);

  function hideFeatureViews() {
    FEATURE_VIEWS.forEach((selector) => {
      const view = q(selector);
      if (view) view.hidden = true;
    });
  }

  window.NovaCoherence = {
    labelNavigation,
    reorderNav,
    hideFeatureViews,
  };
})();
