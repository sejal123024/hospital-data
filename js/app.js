/**
 * ============================================
 * Hospital Dashboard - Main Application
 * ============================================
 * Government-style UI with password-protected Admin Panel.
 */

const App = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const ADMIN_PASSWORD = "sejal@123";
  let isAdmin = false;

  const bedMeta = [
    { key: "icu",       label: "ICU",        full: "Intensive Care Unit", icon: "🚨", color: "pink" },
    { key: "general",   label: "General",    full: "General Ward",        icon: "🛏️", color: "green" },
    { key: "emergency", label: "Emergency",  full: "Emergency Dept.",     icon: "🚑", color: "blue" },
    { key: "pediatric", label: "Pediatric",  full: "Children's Ward",     icon: "👶", color: "orange" },
    { key: "oxygen",    label: "Oxygen",     full: "Oxygen Supported",    icon: "💨", color: "teal" },
    { key: "ventilator",label: "Ventilator", full: "Ventilator Beds",     icon: "🫁", color: "purple" },
  ];

  function init() {
    renderHospitalInfo();
    renderStatCards();
    renderWardTable();
    renderBedGrid();
    renderReports();
    bindNavigation();
    bindAPISettings();
    bindMobileMenu();
    bindAdminLogin();
    bindHubControls();
    bindManualSync();
    updateTimestamp();
    startSimulation();

    EventBus.on("beds:updated", () => { renderStatCards(); renderWardTable(); renderBedGrid(); renderReports(); updateTimestamp(); });
    EventBus.on("timestamp:updated", updateTimestamp);
    EventBus.on("notification:added", (n) => { showToast(n.message, n.type); addActivity(n.message, n.type); });
    EventBus.on("api:connected", renderAPIStatus);
    EventBus.on("api:connecting", (l) => {
      const btn = $("#connect-api-btn");
      if (btn) { btn.disabled = l; btn.innerHTML = l ? "⏳ Connecting..." : "🔗 Connect API"; }
    });

    addActivity("Dashboard initialized", "success");
    addActivity(`${HospitalConfig.name} system online`, "info");
    HospitalAPI.startPolling();

    // Check if admin was previously logged in
    if (sessionStorage.getItem("admin_logged_in") === "true") {
      isAdmin = true;
      showAdminUI();
    }
  }

  // ═══════════════════════════════════
  // ADMIN LOGIN SYSTEM
  // ═══════════════════════════════════
  function bindAdminLogin() {
    const loginBtn = $("#admin-login-btn");
    const modal = $("#login-modal");
    const passwordInput = $("#login-password");
    const submitBtn = $("#login-submit-btn");
    const cancelBtn = $("#login-cancel-btn");
    const errorMsg = $("#login-error");
    const adminBadge = $("#admin-badge");

    // Open modal
    loginBtn?.addEventListener("click", () => {
      if (isAdmin) { return; } // Already logged in
      modal.classList.add("open");
      passwordInput.value = "";
      errorMsg.textContent = "";
      setTimeout(() => passwordInput.focus(), 200);
    });

    // Submit login
    submitBtn?.addEventListener("click", () => attemptLogin());
    passwordInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") attemptLogin(); });

    // Cancel
    cancelBtn?.addEventListener("click", () => modal.classList.remove("open"));
    modal?.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });

    // Admin badge click = logout
    adminBadge?.addEventListener("click", () => {
      if (confirm("Logout from Admin Panel?")) {
        isAdmin = false;
        sessionStorage.removeItem("admin_logged_in");
        hideAdminUI();
        switchTab("dashboard");
        showToast("Logged out from Admin Panel", "info");
      }
    });

    function attemptLogin() {
      const pwd = passwordInput.value.trim();
      if (pwd === ADMIN_PASSWORD) {
        isAdmin = true;
        sessionStorage.setItem("admin_logged_in", "true");
        modal.classList.remove("open");
        showAdminUI();
        switchTab("admin");
        showToast("Welcome Admin! Central Hub is now accessible.", "success");
        renderHubCards();
        renderHubStats();
      } else {
        errorMsg.textContent = "❌ Incorrect password. Try again.";
        passwordInput.value = "";
        passwordInput.focus();
      }
    }
  }

  function showAdminUI() {
    const tab = $(".admin-only-tab");
    const badge = $("#admin-badge");
    const loginBtn = $("#admin-login-btn");
    if (tab) tab.style.display = "flex";
    if (badge) badge.classList.add("visible");
    if (loginBtn) { loginBtn.innerHTML = "✅ Admin"; loginBtn.style.background = "#16a34a"; }
  }

  function hideAdminUI() {
    const tab = $(".admin-only-tab");
    const badge = $("#admin-badge");
    const loginBtn = $("#admin-login-btn");
    if (tab) tab.style.display = "none";
    if (badge) badge.classList.remove("visible");
    if (loginBtn) { loginBtn.innerHTML = "🔒 Admin Login"; loginBtn.style.background = ""; }
  }

  // ═══════════════════════════════════
  // CENTRAL HUB CONTROLS
  // ═══════════════════════════════════
  function bindHubControls() {
    // Add hospital
    $("#hub-add-btn")?.addEventListener("click", () => {
      const name = $("#hub-add-name")?.value?.trim();
      const url = $("#hub-add-url")?.value?.trim();
      const key = $("#hub-add-key")?.value?.trim();
      if (!name) { showToast("Enter a hospital name", "warning"); return; }
      if (!url) { showToast("Enter an API URL", "warning"); return; }
      Hub.addConnection(name, url, key || "");
      $("#hub-add-name").value = ""; $("#hub-add-url").value = ""; $("#hub-add-key").value = "";
      renderHubCards(); renderHubStats();
      showToast(`${name} added!`, "success");
    });

    // Enter key support
    ["hub-add-name", "hub-add-url", "hub-add-key"].forEach(id => {
      $(`#${id}`)?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#hub-add-btn").click(); });
    });

    // Fetch All
    $("#hub-fetch-all")?.addEventListener("click", async () => {
      const list = Hub.getConnections();
      if (list.length === 0) { showToast("No hospitals to fetch", "warning"); return; }
      const wrap = $("#hub-progress"); const fill = $("#hub-progress-fill");
      wrap.classList.add("on"); fill.style.width = "0%";
      showToast(`Fetching ${list.length} hospital(s)...`, "info");
      await Hub.fetchAll((done, total) => { fill.style.width = `${Math.round((done / total) * 100)}%`; });
      wrap.classList.remove("on");
      renderHubCards($("#hub-search")?.value); renderHubStats();
      const s = Hub.getAggregateStats();
      showToast(`Done! ${s.onlineCount}/${s.totalHospitals} online`, "success");
    });

    // Search
    $("#hub-search")?.addEventListener("input", (e) => renderHubCards(e.target.value));

    // Export
    $("#hub-export")?.addEventListener("click", () => {
      const json = Hub.exportAll();
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `hospital_hub_${Date.now()}.json`; a.click();
      showToast("Data exported!", "success");
    });

    // Clear All
    $("#hub-clear")?.addEventListener("click", () => {
      const c = Hub.getConnections().length;
      if (c === 0) { showToast("Nothing to clear", "info"); return; }
      if (confirm(`Remove all ${c} hospital connections?`)) {
        localStorage.removeItem("hospital_hub_connections");
        renderHubCards(); renderHubStats();
        showToast("All connections cleared", "info");
      }
    });
  }

  function renderHubStats() {
    const s = Hub.getAggregateStats();
    const set = (id, v) => { const el = $(`#${id}`); if (el) el.textContent = typeof v === "number" ? v.toLocaleString() : v; };
    set("hub-hospitals", s.totalHospitals);
    set("hub-online", s.onlineCount);
    set("hub-beds", s.totalBeds);
    set("hub-avail", s.totalAvailable);
    set("hub-icu", s.totalICUAvail);
    set("hub-count", s.totalHospitals);
  }

  function renderHubCards(filter = "") {
    const list = Hub.getConnections();
    const filtered = filter ? list.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()) || c.url.toLowerCase().includes(filter.toLowerCase())) : list;
    const grid = $("#hub-grid"); const empty = $("#hub-empty");
    if (!grid) return;

    if (filtered.length === 0) {
      grid.innerHTML = "";
      if (empty) empty.style.display = list.length === 0 ? "block" : "none";
      if (list.length > 0 && filtered.length === 0) grid.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;grid-column:1/-1;">🔍 No matching hospitals</div>';
      return;
    }
    if (empty) empty.style.display = "none";

    grid.innerHTML = filtered.map(c => {
      const d = c.lastData;
      const st = c.lastStatus || "pending";
      const stL = { online: "✅ Online", offline: "❌ Offline", timeout: "⏱️ Timeout", pending: "⏳ Pending" }[st] || "⏳ Pending";
      let tb = "—", ab = "—", ib = "—";
      if (d) {
        tb = d.total_beds ?? "—"; ab = d.total_available ?? "—";
        ib = d.beds ? (d.beds.icu?.available ?? "—") : (d.icu_beds ?? "—");
      }
      const lt = c.lastFetched ? new Date(c.lastFetched).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "Never";
      return `<div class="hcard">
        <div class="hcard-top">
          <div class="hcard-avatar ${st}">🏥</div>
          <div style="flex:1;min-width:0;"><div class="hcard-name">${esc(c.name)}</div><div class="hcard-url">${esc(c.url)}</div></div>
          <span class="sbadge ${st}">${stL}</span>
        </div>
        <div class="hcard-data">
          <div class="hcard-di"><div class="dv">${tb}</div><div class="dl">Total Beds</div></div>
          <div class="hcard-di"><div class="dv">${ab}</div><div class="dl">Available</div></div>
          <div class="hcard-di"><div class="dv">${ib}</div><div class="dl">ICU Avail</div></div>
        </div>
        <div class="hcard-actions">
          <span style="font-size:11px;color:#94a3b8;margin-right:auto;">Last: ${lt}</span>
          <button onclick="App.hubFetch('${c.id}')">🔄 Fetch</button>
          <button class="dbtn" onclick="App.hubRemove('${c.id}')">🗑️</button>
        </div>
      </div>`;
    }).join("");
  }

  async function hubFetch(id) {
    const conn = Hub.getConnection(id); if (!conn) return;
    showToast(`Fetching ${conn.name}...`, "info");
    await Hub.fetchHospital(conn);
    renderHubCards($("#hub-search")?.value); renderHubStats();
    const u = Hub.getConnection(id);
    showToast(u?.lastStatus === "online" ? `${conn.name} — data fetched!` : `${conn.name} — connection failed`, u?.lastStatus === "online" ? "success" : "danger");
  }

  function hubRemove(id) {
    const c = Hub.getConnection(id);
    if (confirm(`Remove "${c?.name || id}"?`)) {
      Hub.removeConnection(id);
      renderHubCards($("#hub-search")?.value); renderHubStats();
      showToast("Hospital removed", "info");
    }
  }

  function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  // ═══════════════════════════════════
  // DASHBOARD RENDERING
  // ═══════════════════════════════════
  function renderHospitalInfo() {
    const set = (id, v) => { const el = $(`#${id}`); if (el) el.textContent = v; };
    set("header-hospital-name", HospitalConfig.name);
    set("info-name", HospitalConfig.name);
    set("info-location", HospitalConfig.location);
    set("info-type", HospitalConfig.type);
    set("info-reg", HospitalConfig.registrationNo);
  }

  function renderStatCards() {
    const set = (id, v) => { const el = $(`#${id}`); if (el) el.textContent = v; };
    set("stat-total-beds", AppState.getTotalBeds());
    set("stat-total-avail", AppState.getTotalAvailable());
    set("stat-icu-avail", AppState.beds.icu.available);
    set("stat-emergency-avail", AppState.beds.emergency.available);
  }

  function renderWardTable() {
    const tb = $("#ward-table-body"); if (!tb) return;
    tb.innerHTML = bedMeta.map((m, i) => {
      const b = AppState.beds[m.key]; if (!b) return "";
      const occ = b.total - b.available;
      const rate = b.total > 0 ? Math.round((occ / b.total) * 100) : 0;
      const cls = rate >= 80 ? "critical" : rate >= 50 ? "low" : "available";
      return `<tr><td>${i+1}</td><td><strong>${m.icon} ${m.label}</strong><br><span style="font-size:11px;color:var(--gray-500)">${m.full}</span></td><td>${b.total}</td><td><strong>${b.available}</strong></td><td>${occ}</td><td>${rate}%</td><td><span class="status-badge ${cls}">${cls==="available"?"✅ Available":cls==="low"?"⚠️ Low":"🔴 Critical"}</span></td></tr>`;
    }).join("");
  }

  function renderBedGrid() {
    const grid = $("#bed-grid"); if (!grid) return;
    grid.innerHTML = bedMeta.map(m => {
      const b = AppState.beds[m.key]; if (!b) return "";
      const occ = b.total - b.available, rate = b.total > 0 ? Math.round((occ / b.total) * 100) : 0;
      return `<div class="bed-card"><div class="bed-card-header"><div class="bed-card-icon stat-icon ${m.color}">${m.icon}</div><div><div class="bed-card-title">${m.label} Beds</div><div class="bed-card-sub">${m.full}</div></div></div><div class="bed-card-body"><div class="counter-row"><span class="counter-label">Total</span><div class="counter-control"><button class="counter-btn" onclick="App.adjustBed('${m.key}','total',-1)">−</button><input type="number" class="counter-input" value="${b.total}" min="0" onchange="App.setBed('${m.key}','total',this.value)"/><button class="counter-btn" onclick="App.adjustBed('${m.key}','total',1)">+</button></div></div><div class="counter-row"><span class="counter-label">Available</span><div class="counter-control"><button class="counter-btn" onclick="App.adjustBed('${m.key}','available',-1)">−</button><input type="number" class="counter-input" value="${b.available}" min="0" onchange="App.setBed('${m.key}','available',this.value)"/><button class="counter-btn" onclick="App.adjustBed('${m.key}','available',1)">+</button></div></div><div class="bed-stats-row"><div class="bed-stat-item"><div class="val">${occ}</div><div class="lbl">Occupied</div></div><div class="bed-stat-item"><div class="val">${rate}%</div><div class="lbl">Occupancy</div></div></div></div></div>`;
    }).join("");
  }

  function adjustBed(type, field, delta) {
    const b = AppState.beds[type]; if (!b) return;
    let val = Math.max(0, b[field] + delta);
    if (field === "available") val = Math.min(val, b.total);
    HospitalAPI.updateBeds(type, field, val); renderBedGrid();
    HospitalAPI.addNotification(`${type.toUpperCase()} ${field} → ${val}`, "success");
  }

  function setBed(type, field, value) {
    let val = Math.max(0, parseInt(value) || 0);
    if (field === "available") val = Math.min(val, AppState.beds[type].total);
    HospitalAPI.updateBeds(type, field, val); renderBedGrid();
  }

  function renderReports() {
    const tb = $("#report-table-body"); if (tb) {
      tb.innerHTML = bedMeta.map(m => { const b = AppState.beds[m.key]; if (!b) return ""; const occ = b.total-b.available, rate = b.total>0?Math.round((occ/b.total)*100):0; return `<tr><td><strong>${m.label}</strong></td><td>${b.total}</td><td>${b.available}</td><td>${occ}</td><td>${rate}%</td></tr>`; }).join("");
    }
    const j = $("#json-output"); if (j) j.innerHTML = syntaxHL(JSON.stringify(AppState.toJSON(), null, 2));
  }

  function syntaxHL(json) {
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (m) => { let c = "json-number"; if (/^"/.test(m)) c = /:$/.test(m) ? "json-key" : "json-string"; return `<span class="${c}">${m}</span>`; });
  }

  function bindManualSync() {
    const syncBtn = $("#btn-manual-sync");
    const refreshBtn = $("#btn-force-refresh");

    syncBtn?.addEventListener("click", async () => {
      syncBtn.disabled = true;
      syncBtn.innerHTML = "⏳ Saving...";
      const res = await HospitalAPI.syncWithCloud();
      syncBtn.disabled = false;
      syncBtn.innerHTML = "💾 Save Changes to Cloud";
      
      if (res.success) {
        showToast("Changes persisted to Firestore ✅", "success");
      } else {
        showToast("Cloud sync failed. Check console.", "danger");
      }
    });

    refreshBtn?.addEventListener("click", async () => {
      showToast("Fetching latest data from Cloud...", "info");
      await HospitalAPI.getBeds();
      showToast("Dashboard updated!", "success");
    });
  }

  // ═══════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════
  function bindNavigation() {
    $$(".nav-link[data-tab]").forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const tab = item.dataset.tab;
        if (tab === "admin" && !isAdmin) { showToast("Please login as Admin first", "warning"); return; }
        switchTab(tab);
      });
    });
  }

  function switchTab(tab) {
    $$(".nav-link[data-tab]").forEach(n => n.classList.remove("active"));
    $(`.nav-link[data-tab="${tab}"]`)?.classList.add("active");
    $$(".tab-panel").forEach(p => p.classList.remove("active"));
    $(`#panel-${tab}`)?.classList.add("active");
    const titles = { dashboard:"Dashboard", beds:"Bed Management", reports:"Reports", api:"API Integration", contact:"Contact Us", admin:"🌐 Central Hub — Admin Panel" };
    $(".banner-title").textContent = titles[tab] || "Dashboard";
    $(".breadcrumb-page").textContent = titles[tab] || "Dashboard";
    if (tab === "reports") renderReports();
    if (tab === "beds") renderBedGrid();
    if (tab === "admin") { renderHubCards(); renderHubStats(); }
    $("#nav-bar-inner")?.classList.remove("open");
  }

  // ═══════════════════════════════════
  // API SETTINGS
  // ═══════════════════════════════════
  function bindAPISettings() {
    $("#connect-api-btn")?.addEventListener("click", async () => {
      const url = $("#api-url")?.value?.trim();
      const key = $("#api-key")?.value?.trim();
      if (!url) { showToast("Enter an API URL", "warning"); return; }
      const r = await HospitalAPI.testConnection(url, key);
      showToast(r.success ? "API connected!" : `Failed: ${r.message}`, r.success ? "success" : "danger");
    });
    $("#disconnect-api-btn")?.addEventListener("click", () => { HospitalAPI.disconnect(); showToast("Disconnected", "info"); });
    const pt = $("#polling-toggle"); if (pt) {
      pt.checked = HospitalConfig.polling.enabled;
      pt.addEventListener("change", () => { pt.checked ? HospitalAPI.startPolling() : HospitalAPI.stopPolling(); showToast(pt.checked ? "Auto-sync on" : "Auto-sync off", "info"); });
    }
    const copyHandler = () => {
      const json = HospitalAPI.exportData();
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(json).then(() => showToast("Copied!", "success")).catch(() => copyFB(json));
      else copyFB(json);
    };
    $("#copy-json-btn")?.addEventListener("click", copyHandler);
    $("#copy-json-btn-2")?.addEventListener("click", copyHandler);
    $("#export-data-btn")?.addEventListener("click", () => {
      const blob = new Blob([HospitalAPI.exportData()], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `hospital_data_${Date.now()}.json`; a.click(); showToast("Exported!", "success");
    });
  }

  function renderAPIStatus(connected) {
    const area = $("#api-status-area"); if (!area) return;
    area.innerHTML = connected
      ? `<div style="font-size:40px;margin-bottom:10px;">✅</div><div style="font-size:14px;font-weight:600;color:var(--icon-green);">Connected</div>`
      : `<div style="font-size:40px;margin-bottom:10px;">🔌</div><div style="font-size:14px;font-weight:600;color:var(--gray-700);">Not Connected</div><div style="font-size:12px;color:var(--gray-500);margin-top:4px;">Configure settings to sync</div>`;
  }

  function copyFB(text) {
    const ta = document.createElement("textarea"); ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta);
    ta.select(); try { document.execCommand("copy"); showToast("Copied!", "success"); } catch { showToast("Copy failed", "warning"); }
    document.body.removeChild(ta);
  }

  // ═══════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════
  function updateTimestamp() {
    const t = new Date(AppState.lastUpdated).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    $$(".last-updated-time").forEach(el => el.textContent = t);
  }

  function showToast(msg, type = "info") {
    const c = $(".toast-container"); if (!c) return;
    const icons = { success: "✅", danger: "❌", warning: "⚠️", info: "ℹ️" };
    const t = document.createElement("div"); t.className = `toast ${type}`;
    t.innerHTML = `<span>${icons[type]||"ℹ️"}</span> ${msg}`; c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  function addActivity(msg, type = "info") {
    const list = $("#activity-list"); if (!list) return;
    const icons = { success: "✅", danger: "🚨", warning: "⚠️", info: "ℹ️" };
    const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const item = document.createElement("div");
    item.style.cssText = "display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray-100);font-size:13px;animation:fadeIn .3s ease;";
    item.innerHTML = `<span style="font-size:16px;">${icons[type]||"ℹ️"}</span><span style="flex:1;color:var(--gray-700);">${msg}</span><span style="font-size:11px;color:var(--gray-400);">${time}</span>`;
    list.insertBefore(item, list.firstChild);
    while (list.children.length > 15) list.removeChild(list.lastChild);
  }

  function bindMobileMenu() {
    $("#mobile-toggle")?.addEventListener("click", () => { $("#nav-bar-inner")?.classList.toggle("open"); });
  }

  function startSimulation() {
    function tick() {
      const keys = Object.keys(AppState.beds);
      const k = keys[Math.floor(Math.random() * keys.length)];
      const b = AppState.beds[k];
      const d = Math.random() > 0.5 ? 1 : -1;
      const nv = Math.max(0, Math.min(b.total, b.available + d));
      if (nv !== b.available) {
        b.available = nv;
        AppState.lastUpdated = new Date().toISOString();
        EventBus.emit("beds:updated", AppState.beds);
        addActivity(`Patient ${d > 0 ? "discharged" : "admitted"} — ${k.toUpperCase()} ward`, d > 0 ? "success" : "warning");
      }
      setTimeout(tick, 25000 + Math.random() * 35000);
    }
    setTimeout(tick, 12000);
  }

  return { init, switchTab, showToast, adjustBed, setBed, hubFetch, hubRemove };
})();

document.addEventListener("DOMContentLoaded", App.init);
