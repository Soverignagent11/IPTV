/* ============================================================
 * Nova TV — Source Firewall
 * Local-only M3U scanner/quarantine. No built-in sketchy lists.
 * ============================================================ */

(() => {
  const FIREWALL_STORE = "nova:firewall:last:v1";
  const BLOCK_WORDS = [
    "adult", "xxx", "porn", "sex", "erotic", "nsfw", "18+", "playboy", "babes", "hot girls"
  ];
  const PREMIUM_RISK_WORDS = [
    "ppv", "pay per view", "dazn", "hbo", "showtime", "starz", "sky sports", "bt sport", "tnt sports",
    "espn+", "bein", "ufc", "nfl sunday ticket", "nba league pass", "mlb.tv", "f1 tv", "crave", "netflix",
    "disney+", "prime video", "hulu", "paramount+", "peacock premium"
  ];
  const TECH_RISK_WORDS = [
    "token=", "username=", "password=", "user=", "pass=", "get.php", "xtream", "stalker_portal", "portal.php"
  ];

  let lastScan = [];

  window.addEventListener("DOMContentLoaded", () => {
    installFirewallNav();
    installFirewallView();
  });

  function q(sel, root = document) { return root.querySelector(sel); }
  function qa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
  function safe(value) {
    return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function installFirewallNav() {
    const nav = q(".nav-list");
    if (!nav || q('[data-firewall-view="firewall"]')) return;
    const btn = document.createElement("button");
    btn.className = "nav-item";
    btn.type = "button";
    btn.dataset.firewallView = "firewall";
    btn.innerHTML = "<span>⛨</span>Firewall";
    const api = q('[data-api-view="apis"]', nav);
    const lab = q('a[href="lab.html"]', nav);
    nav.insertBefore(btn, api || lab || null);
    btn.addEventListener("click", showFirewall);
  }

  function installFirewallView() {
    if (q("#firewallView")) return;
    const view = document.createElement("section");
    view.className = "firewall-view";
    view.id = "firewallView";
    view.hidden = true;
    view.innerHTML = `
      <div class="firewall-panel">
        <div class="firewall-copy">
          <span class="eyebrow mini"><i></i> Source Firewall</span>
          <h2>Quarantine first.</h2>
          <p>Paste a playlist you already own. Nova scans it locally before anything can be tested. It blocks adult terms, non-HTTPS streams, tokenized portal links, and obvious premium/pay-TV risk labels.</p>
          <p class="firewall-note">This does not find playlists for you and does not ship unverified sources. It is a containment layer for user-owned imports.</p>
        </div>
        <div class="firewall-scanner">
          <textarea class="firewall-textarea" id="firewallInput" spellcheck="false" placeholder="#EXTM3U\n#EXTINF:-1 tvg-name=&quot;Example Public Channel&quot;,Example Public Channel\nhttps://example.com/public-stream.m3u8"></textarea>
          <div class="firewall-actions">
            <button class="primary-action" id="firewallScan" type="button">Scan playlist</button>
            <button class="secondary-action" id="firewallClear" type="button">Clear</button>
            <button class="secondary-action" id="firewallLoadLast" type="button">Load last scan</button>
          </div>
          <div class="firewall-summary" id="firewallSummary">
            <div class="firewall-stat"><b>0</b><span>items</span></div>
            <div class="firewall-stat"><b>0</b><span>safe</span></div>
            <div class="firewall-stat"><b>0</b><span>warn</span></div>
            <div class="firewall-stat"><b>0</b><span>blocked</span></div>
          </div>
        </div>
      </div>
      <div class="view-head inline" style="margin-top:22px">
        <div><span class="eyebrow mini"><i></i> Scan results</span><h2>Firewall Report</h2></div>
        <span class="view-count" id="firewallCount">No scan yet</span>
      </div>
      <div class="firewall-results">
        <div class="firewall-list" id="firewallList"><div class="firewall-row"><div class="firewall-row-title"><b>Paste an M3U playlist to scan locally.</b><span>No playlist data leaves the browser.</span></div></div></div>
      </div>
    `;

    const radio = q("#radioView");
    const api = q("#apiSourcesView");
    const wall = q("#wall");
    if (api) api.insertAdjacentElement("beforebegin", view);
    else if (radio) radio.insertAdjacentElement("afterend", view);
    else if (wall) wall.insertAdjacentElement("beforebegin", view);
    else q("#app")?.appendChild(view);

    bindFirewallUI();
  }

  function bindFirewallUI() {
    const input = q("#firewallInput");
    q("#firewallScan")?.addEventListener("click", () => scanInput());
    q("#firewallClear")?.addEventListener("click", () => {
      if (input) input.value = "";
      lastScan = [];
      renderResults([]);
    });
    q("#firewallLoadLast")?.addEventListener("click", () => {
      const last = localStorage.getItem(FIREWALL_STORE) || "";
      if (input) input.value = last;
      if (last) scanInput();
    });
  }

  function showFirewall() {
    q("#sidebar")?.classList.remove("open");
    hideMainViews();
    q("#firewallView").hidden = false;
    qa(".nav-item").forEach((item) => item.classList.remove("active"));
    q('[data-firewall-view="firewall"]')?.classList.add("active");
  }

  function hideMainViews() {
    ["#signalverse", "#viewHead", "#wall", "#empty", "#guideView", "#apiSourcesView", "#radioView"].forEach((sel) => {
      const node = q(sel);
      if (node) node.hidden = true;
    });
    const rows = q("#rows");
    if (rows) rows.innerHTML = "";
    const grid = q("#grid");
    if (grid) grid.innerHTML = "";
  }

  function scanInput() {
    const text = q("#firewallInput")?.value || "";
    localStorage.setItem(FIREWALL_STORE, text.slice(0, 500_000));
    const parsed = parseM3U(text);
    lastScan = parsed.map(scoreItem);
    renderResults(lastScan);
  }

  function parseM3U(text) {
    const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const items = [];
    let pending = null;

    for (const line of lines) {
      if (line.startsWith("#EXTINF")) {
        pending = parseExtInf(line);
      } else if (/^https?:\/\//i.test(line)) {
        const item = pending || { name: "Unnamed stream", attrs: {}, raw: "" };
        item.url = line;
        items.push(item);
        pending = null;
      }
    }
    return items;
  }

  function parseExtInf(line) {
    const comma = line.indexOf(",");
    const meta = comma >= 0 ? line.slice(0, comma) : line;
    const title = comma >= 0 ? line.slice(comma + 1).trim() : "Unnamed stream";
    const attrs = {};
    meta.replace(/([\w-]+)="([^"]*)"/g, (_, key, value) => {
      attrs[key.toLowerCase()] = value;
      return "";
    });
    return { name: attrs["tvg-name"] || title || "Unnamed stream", attrs, raw: line };
  }

  function scoreItem(item) {
    const reasons = [];
    const text = `${item.name} ${item.url} ${Object.values(item.attrs || {}).join(" ")}`.toLowerCase();
    let status = "safe";

    if (!String(item.url || "").startsWith("https://")) {
      reasons.push("blocked: non-HTTPS stream");
      status = "block";
    }
    if (BLOCK_WORDS.some((word) => text.includes(word))) {
      reasons.push("blocked: adult/unsafe term");
      status = "block";
    }
    if (TECH_RISK_WORDS.some((word) => text.includes(word))) {
      reasons.push("blocked: tokenized/portal-style URL");
      status = "block";
    }
    if (PREMIUM_RISK_WORDS.some((word) => text.includes(word))) {
      reasons.push("quarantine: premium/pay-TV risk label");
      if (status !== "block") status = "warn";
    }
    if (!/\.m3u8(\?|$)|\.mp4(\?|$)|\.mp3(\?|$)|\.aac(\?|$)|\.ogg(\?|$)|\.pls(\?|$)/i.test(item.url || "")) {
      reasons.push("warning: unknown stream extension");
      if (status === "safe") status = "warn";
    }
    if (!reasons.length) reasons.push("passes strict local checks");

    return { ...item, status, reasons };
  }

  function renderResults(items) {
    const list = q("#firewallList");
    const count = q("#firewallCount");
    const summary = q("#firewallSummary");
    if (!list || !count || !summary) return;

    const safeCount = items.filter((i) => i.status === "safe").length;
    const warnCount = items.filter((i) => i.status === "warn").length;
    const blockCount = items.filter((i) => i.status === "block").length;
    summary.innerHTML = `
      <div class="firewall-stat"><b>${items.length}</b><span>items</span></div>
      <div class="firewall-stat"><b>${safeCount}</b><span>safe</span></div>
      <div class="firewall-stat"><b>${warnCount}</b><span>warn</span></div>
      <div class="firewall-stat"><b>${blockCount}</b><span>blocked</span></div>
    `;
    count.textContent = `${items.length.toLocaleString()} checked · ${blockCount.toLocaleString()} blocked`;

    if (!items.length) {
      list.innerHTML = `<div class="firewall-row"><div class="firewall-row-title"><b>No playlist items found.</b><span>Paste a valid M3U playlist and scan again.</span></div></div>`;
      return;
    }
    list.innerHTML = "";
    items.forEach((item) => list.appendChild(resultRow(item)));
  }

  function resultRow(item) {
    const row = document.createElement("article");
    row.className = `firewall-row ${item.status}`;
    row.innerHTML = `
      <div class="firewall-row-head">
        <div class="firewall-row-title"><b>${safe(item.name)}</b><span>${safe(item.url)}</span></div>
        <span class="firewall-status ${item.status}">${safe(item.status)}</span>
      </div>
      <div class="firewall-reasons">${item.reasons.map((reason) => `<span class="firewall-reason">${safe(reason)}</span>`).join("")}</div>
      <button class="firewall-test" type="button" ${item.status !== "safe" ? "disabled" : ""}>${item.status === "safe" ? "Test safe stream" : "Quarantined"}</button>
    `;
    q(".firewall-test", row)?.addEventListener("click", () => testStream(item));
    return row;
  }

  function testStream(item) {
    if (item.status !== "safe") return;
    if (typeof openPlayer === "function") {
      openPlayer({
        id: `local-${btoa(item.url).slice(0, 16)}`,
        name: item.name,
        logo: "",
        urls: [item.url],
        categories: [],
        country: "",
        countryName: "User-owned local import",
        flag: "",
        network: "Local playlist",
        owners: [],
        city: "",
        website: "",
        launched: "",
        closed: "",
        altNames: [],
        health: 50,
      });
    }
  }

  window.NovaFirewall = { showFirewall, scanInput };
})();
