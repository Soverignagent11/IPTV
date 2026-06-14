/* ============================================================
 * Nova TV — Navigation compatibility shim
 * The consolidated navigation model now lives in coherence.js.
 * This file only exposes a tiny compatibility API for older modules.
 * ============================================================ */

(() => {
  const EXTRA_VIEWS = ["#guideView", "#apiSourcesView", "#radioView", "#firewallView", "#toolsView"];

  function activate(selector) {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    document.querySelector(selector)?.classList.add("active");
  }

  function hideExtraViews() {
    EXTRA_VIEWS.forEach((selector) => {
      const view = document.querySelector(selector);
      if (view) view.hidden = true;
    });
  }

  window.NovaNav = { activate, hideExtraViews };
})();
