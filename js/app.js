/**
 * ============================================
 * Hospital Dashboard - Main Application
 * ============================================
 * Redesigned for Government Hospital Dashboard UI.
 * Handles rendering, navigation, bed management,
 * real-time simulation, and API integration.
 */

const App = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const bedMeta = [
    { key: "icu",       label: "ICU",          full: "Intensive Care Unit",  icon: "🚨", color: "pink" },
    { key: "general",   label: "General",      full: "General Ward",         icon: "🛏️", color: "green" },
    { key: "emergency", label: "Emergency",    full: "Emergency Dept.",      icon: "🚑", color: "blue" },
    { key: "pediatric", label: "Pediatric",    full: "Children's Ward",      icon: "👶", color: "orange" },
    { key: "oxygen",    label: "Oxygen",       full: "Oxygen Supported",     icon: "💨", color: "teal" },
    { key: "ventilator",label: "Ventilator",   full: "Ventilator Beds",      icon: "🫁", color: "purple" },
  ];

  function init() {
    renderHospitalInfo();
    renderStatCards();
    renderWardTable();
    renderBedGrid();
    renderReports();
    bindNavigation();
    bindBedControls();
    bindAPISettings();
    bindMobileMenu();
    updateTimestamp();
    startSimulation();

    EventBus.on("beds:updated", () => {
      renderStatCards();
      renderWardTable();
      renderBedGrid();
      renderReports();
      updateTimestamp();
    });
    EventBus.on("timestamp:updated", updateTimestamp);
    EventBus.on("notification:added", (n) => { showToast(n.message, n.type); addActivity(n.message, n.type); });
    EventBus.on("api:connected", (c) => { renderAPIStatus(c); });
    EventBus.on("api:connecting", (l) => {
      const btn = $("#connect-api-btn");
      if (btn) { btn.disabled = l; btn.innerHTML = l ? "⏳ Connecting..." : "🔗 Connect API"; }
    });

    addActivity("Dashboard initialized", "success");
    addActivity(`${HospitalConfig.name} system online`, "info");
    HospitalAPI.startPolling();

    // Refresh button
    const refreshBtn = $("#btn-refresh");
    if (refreshBtn) refreshBtn.addEventListener("click", () => {
      renderStatCards(); renderWardTable(); renderBedGrid(); renderReports(); updateTimestamp();
      showToast("Dashboard refreshed", "success");
    });
  }

  function renderHospitalInfo() {
    const n = $("#header-hospital-name");
    if (n) n.textContent = HospitalConfig.name;
    const infoName = $("#info-name"); if (infoName) infoName.textContent = HospitalConfig.name;
    const infoLoc = $("#info-location"); if (infoLoc) infoLoc.textContent = HospitalConfig.location;
    const infoType = $("#info-type"); if (infoType) infoType.textContent = HospitalConfig.type;
    const infoReg = $("#info-reg"); if (infoReg) infoReg.textContent = HospitalConfig.registrationNo;
  }

  function renderStatCards() {
    animVal($("#stat-total-beds"), AppState.getTotalBeds());
    animVal($("#stat-total-avail"), AppState.getTotalAvailable());
    animVal($("#stat-icu-avail"), AppState.beds.icu.available);
    animVal($("#stat-emergency-avail"), AppState.beds.emergency.available);
  }

  function animVal(el, val) {
    if (!el) return;
    const cur = parseInt(el.textContent) || 0;
    if (cur === val) return;
    const start = performance.now();
    (function step(ts) {
      const p = Math.min((ts - start) / 400, 1);
      el.textContent = Math.round(cur + (val - cur) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(start);
    requestAnimationFrame((ts) => {
      const step = (ts2) => {
        const p = Math.min((ts2 - ts) / 400, 1);
        el.textContent = Math.round(cur + (val - cur) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      step(ts);
    });
  }

  function renderWardTable() {
    const tb = $("#ward-table-body"); if (!tb) return;
    tb.innerHTML = bedMeta.map((m, i) => {
      const b = AppState.beds[m.key]; if (!b) return "";
      const occ = b.total - b.available;
      const rate = b.total > 0 ? Math.round((occ / b.total) * 100) : 0;
      const cls = rate >= 80 ? "critical" : rate >= 50 ? "low" : "available";
      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${m.icon} ${m.label}</strong><br><span style="font-size:11px;color:var(--gray-500)">${m.full}</span></td>
        <td>${b.total}</td><td><strong>${b.available}</strong></td><td>${occ}</td>
        <td>${rate}%</td>
        <td><span class="status-badge ${cls}">${cls === "available" ? "✅ Available" : cls === "low" ? "⚠️ Low" : "🔴 Critical"}</span></td>
      </tr>`;
    }).join("");
  }

  function renderBedGrid() {
    const grid = $("#bed-grid"); if (!grid) return;
    grid.innerHTML = bedMeta.map(m => {
      const b = AppState.beds[m.key]; if (!b) return "";
      const occ = b.total - b.available;
      const rate = b.total > 0 ? Math.round((occ / b.total) * 100) : 0;
      return `<div class="bed-card">
        <div class="bed-card-header">
          <div class="bed-card-icon stat-icon ${m.color}">${m.icon}</div>
          <div><div class="bed-card-title">${m.label} Beds</div><div class="bed-card-sub">${m.full}</div></div>
        </div>
        <div class="bed-card-body">
          <div class="counter-row">
            <span class="counter-label">Total Beds</span>
            <div class="counter-control">
              <button class="counter-btn" onclick="App.adjustBed('${m.key}','total',-1)">−</button>
              <input type="number" class="counter-input" id="bed-${m.key}-total" value="${b.total}" min="0"
                onchange="App.setBed('${m.key}','total',this.value)" />
              <button class="counter-btn" onclick="App.adjustBed('${m.key}','total',1)">+</button>
            </div>
          </div>
          <div class="counter-row">
            <span class="counter-label">Available</span>
            <div class="counter-control">
              <button class="counter-btn" onclick="App.adjustBed('${m.key}','available',-1)">−</button>
              <input type="number" class="counter-input" id="bed-${m.key}-avail" value="${b.available}" min="0"
                onchange="App.setBed('${m.key}','available',this.value)" />
              <button class="counter-btn" onclick="App.adjustBed('${m.key}','available',1)">+</button>
            </div>
          </div>
          <div class="bed-stats-row">
            <div class="bed-stat-item"><div class="val">${occ}</div><div class="lbl">Occupied</div></div>
            <div class="bed-stat-item"><div class="val">${rate}%</div><div class="lbl">Occupancy</div></div>
          </div>
        </div>
      </div>`;
    }).join("");
  }

  function adjustBed(type, field, delta) {
    const b = AppState.beds[type]; if (!b) return;
    let val = b[field] + delta;
    val = Math.max(0, val);
    if (field === "available") val = Math.min(val, b.total);
    HospitalAPI.updateBeds(type, field, val);
    // renderBedGrid is triggered via EventBus "beds:updated" event
    HospitalAPI.addNotification(`${type.toUpperCase()} ${field} → ${val}`, "success");
  }

  function setBed(type, field, value) {
    let val = Math.max(0, parseInt(value) || 0);
    if (field === "available") val = Math.min(val, AppState.beds[type].total);
    HospitalAPI.updateBeds(type, field, val);
    // renderBedGrid is triggered via EventBus "beds:updated" event
  }

  function renderReports() {
    const tb = $("#report-table-body"); if (tb) {
      tb.innerHTML = bedMeta.map(m => {
        const b = AppState.beds[m.key]; if (!b) return "";
        const occ = b.total - b.available;
        const rate = b.total > 0 ? Math.round((occ / b.total) * 100) : 0;
        return `<tr><td><strong>${m.label}</strong></td><td>${b.total}</td><td>${b.available}</td><td>${occ}</td><td>${rate}%</td></tr>`;
      }).join("");
    }
    const jsonEl = $("#json-output"); if (jsonEl) {
      jsonEl.innerHTML = syntaxHL(JSON.stringify(AppState.toJSON(), null, 2));
    }
  }

  function syntaxHL(json) {
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (m) => { let c = "json-number"; if (/^"/.test(m)) c = /:$/.test(m) ? "json-key" : "json-string"; return `<span class="${c}">${m}</span>`; });
  }

  function bindNavigation() {
    $$(".nav-link[data-tab]").forEach(item => {
      item.addEventListener("click", (e) => { e.preventDefault(); switchTab(item.dataset.tab); });
    });
  }

  function switchTab(tab) {
    $$(".nav-link[data-tab]").forEach(n => n.classList.remove("active"));
    $(`.nav-link[data-tab="${tab}"]`)?.classList.add("active");
    $$(".tab-panel").forEach(p => p.classList.remove("active"));
    $(`#panel-${tab}`)?.classList.add("active");
    const titles = { dashboard:"Dashboard", beds:"Bed Management", reports:"Reports", api:"API Integration", contact:"Contact Us" };
    $(".banner-title").textContent = titles[tab] || "Dashboard";
    $(".breadcrumb-page").textContent = titles[tab] || "Dashboard";
    if (tab === "reports") renderReports();
    if (tab === "beds") renderBedGrid();
    // Close mobile nav
    $("#nav-bar-inner")?.classList.remove("open");
  }

  function bindBedControls() { /* Controls are inline via onclick in renderBedGrid */ }

  function bindAPISettings() {
    $("#connect-api-btn")?.addEventListener("click", async () => {
      const url = $("#api-url")?.value?.trim();
      const key = $("#api-key")?.value?.trim();
      if (!url) { showToast("Please enter an API URL", "warning"); return; }
      const r = await HospitalAPI.testConnection(url, key);
      showToast(r.success ? "API connected!" : `Failed: ${r.message}`, r.success ? "success" : "danger");
    });
    $("#disconnect-api-btn")?.addEventListener("click", () => { HospitalAPI.disconnect(); showToast("Disconnected", "info"); });
    const pt = $("#polling-toggle"); if (pt) {
      pt.checked = HospitalConfig.polling.enabled;
      pt.addEventListener("change", () => { pt.checked ? HospitalAPI.startPolling() : HospitalAPI.stopPolling(); showToast(pt.checked ? "Auto-sync on" : "Auto-sync off", "info"); });
    }
    // Copy/Export
    const copyHandler = () => {
      const json = HospitalAPI.exportData();
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(json).then(() => showToast("Copied!", "success")).catch(() => copyFB(json));
      } else { copyFB(json); }
    };
    $("#copy-json-btn")?.addEventListener("click", copyHandler);
    $("#copy-json-btn-2")?.addEventListener("click", copyHandler);
    $("#export-data-btn")?.addEventListener("click", () => {
      const blob = new Blob([HospitalAPI.exportData()], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `hospital_data_${Date.now()}.json`; a.click(); showToast("Exported!", "success");
    });
  }

  function copyFB(text) {
    const ta = document.createElement("textarea"); ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta);
    ta.select(); try { document.execCommand("copy"); showToast("Copied!", "success"); } catch { showToast("Copy failed", "warning"); }
    document.body.removeChild(ta);
  }

  function renderAPIStatus(connected) {
    const area = $("#api-status-area"); if (!area) return;
    area.innerHTML = connected
      ? `<div style="font-size:40px;margin-bottom:10px;">✅</div><div style="font-size:14px;font-weight:600;color:var(--icon-green);">Connected</div><div style="font-size:12px;color:var(--gray-500);margin-top:4px;">Syncing with ${HospitalConfig.api.baseUrl}</div>`
      : `<div style="font-size:40px;margin-bottom:10px;">🔌</div><div style="font-size:14px;font-weight:600;color:var(--gray-700);">Not Connected</div><div style="font-size:12px;color:var(--gray-500);margin-top:4px;">Configure settings to sync with central system</div>`;
  }

  function updateTimestamp() {
    const els = $$(".last-updated-time");
    const t = new Date(AppState.lastUpdated).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    els.forEach(el => el.textContent = t);
  }

  function showToast(msg, type = "info") {
    const c = $(".toast-container"); if (!c) return;
    const icons = { success: "✅", danger: "❌", warning: "⚠️", info: "ℹ️" };
    const t = document.createElement("div"); t.className = `toast ${type}`;
    t.innerHTML = `<span>${icons[type] || "ℹ️"}</span> ${msg}`; c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  function addActivity(msg, type = "info") {
    const list = $("#activity-list"); if (!list) return;
    const icons = { success: "✅", danger: "🚨", warning: "⚠️", info: "ℹ️" };
    const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const item = document.createElement("div");
    item.style.cssText = "display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray-100);font-size:13px;animation:fadeIn 0.3s ease;";
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
        EventBus.emit("timestamp:updated", AppState.lastUpdated);
        addActivity(`Patient ${d > 0 ? "discharged" : "admitted"} — ${k.toUpperCase()} ward`, d > 0 ? "success" : "warning");
      }
      setTimeout(tick, 25000 + Math.random() * 35000);
    }
    setTimeout(tick, 12000);
  }

  return { init, switchTab, showToast, adjustBed, setBed };
})();

document.addEventListener("DOMContentLoaded", App.init);
