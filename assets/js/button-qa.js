/* ============================================================
 * Nova TV — Button QA Guard
 * Loaded last. Ensures visible controls route cleanly in the grouped app model.
 * ============================================================ */

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  window.addEventListener("DOMContentLoaded", () => {
    installBrandHomeRoute();
    installRandomButtonRoute();
    installToolsActiveGuard();
    installBrowseStateGuard();
    normalizeButtonMetadata();
    queueSyncActiveParent();
  });

  function installBrandHomeRoute() {
    const brand = $(".brand");
    if (!brand || brand.dataset.qaBound) return;
    brand.dataset.qaBound = "true";
    brand.addEventListener("click", (event) => {
      event.preventDefault();
      $("[data-view='signalverse']")?.click();
      syncPrimary("[data-view='signalverse']");
    });
  }

  function installRandomButtonRoute() {
    const button = $("#randomBtn");
    if (!button || button.dataset.qaBound) return;
    button.dataset.qaBound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      $("[data-view='signalverse']")?.click();
      requestAnimationFrame(() => {
        if (typeof window.randomSignal === "function") window.randomSignal();
        syncPrimary("[data-view='signalverse']");
      });
    }, true);
  }

  function installToolsActiveGuard() {
    document.addEventListener("click", (event) => {
      const tool = event.target.closest?.("[data-tool-action]");
      if (!tool) return;
      requestAnimationFrame(() => syncPrimary("[data-tools-view='tools']"));
      setTimeout(() => syncPrimary("[data-tools-view='tools']"), 50);
    }, true);
  }

  function installBrowseStateGuard() {
    document.addEventListener("click", (event) => {
      const browseChip = event.target.closest?.("[data-browse-action]");
      if (!browseChip) return;
      const wrap = browseChip.closest("#browseSwitch");
      wrap?.querySelectorAll(".browse-chip").forEach((chip) => chip.classList.remove("active"));
      browseChip.classList.add("active");
      requestAnimationFrame(() => syncPrimary("[data-view='discover']"));
      setTimeout(() => syncPrimary("[data-view='discover']"), 50);
    }, true);
  }

  function normalizeButtonMetadata() {
    $$('button').forEach((button) => {
      if (!button.type) button.type = "button";
      const text = button.textContent.trim();
      if (!button.getAttribute("aria-label") && text.length <= 2) {
        const title = button.getAttribute("title") || inferButtonLabel(button);
        if (title) button.setAttribute("aria-label", title);
      }
    });
  }

  function inferButtonLabel(button) {
    if (button.id === "previewClose") return "Close preview";
    if (button.id === "playerClose") return "Close player";
    if (button.id === "cmdClose") return "Close scanner";
    if (button.id === "wallPickerClose") return "Close picker";
    if (button.classList.contains("guide-play")) return "Play channel";
    if (button.classList.contains("clear-search")) return "Clear search";
    return "Button";
  }

  function queueSyncActiveParent() {
    document.addEventListener("click", () => requestAnimationFrame(syncActiveParent), true);
    const observer = new MutationObserver(() => requestAnimationFrame(syncActiveParent));
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class", "hidden"] });
  }

  function syncActiveParent() {
    const active = $(".nav-item.active");
    if (!active) return;

    if (active.matches("[data-view='categories'], [data-view='countries']")) {
      syncPrimary("[data-view='discover']");
      return;
    }

    if (active.matches("[data-firewall-view='firewall'], [data-api-view='apis']")) {
      syncPrimary("[data-tools-view='tools']");
      return;
    }
  }

  function syncPrimary(selector) {
    const target = $(selector);
    if (!target) return;
    $$(".nav-item").forEach((item) => item.classList.remove("active"));
    target.classList.add("active");
  }

  window.NovaButtonQA = {
    syncActiveParent,
    syncPrimary,
    normalizeButtonMetadata,
  };
})();
