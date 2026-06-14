/* ============================================================
 * Nova TV — Global nav state guard
 * Keeps dynamically added tabs from staying visually selected.
 * ============================================================ */

(() => {
  const EXTRA_VIEWS = ["#guideView", "#apiSourcesView", "#radioView"];

  document.addEventListener("click", (event) => {
    const navItem = event.target.closest?.(".nav-item");
    if (!navItem) return;

    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    navItem.classList.add("active");

    if (navItem.dataset.view) {
      EXTRA_VIEWS.forEach((selector) => {
        const view = document.querySelector(selector);
        if (view) view.hidden = true;
      });
    }
  }, true);

  window.NovaNav = {
    activate(selector) {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      document.querySelector(selector)?.classList.add("active");
    },
    hideExtraViews() {
      EXTRA_VIEWS.forEach((selector) => {
        const view = document.querySelector(selector);
        if (view) view.hidden = true;
      });
    },
  };
})();
