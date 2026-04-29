/**
 * ============================================
 * Central Hospital Hub - Core Logic
 * ============================================
 * Manages unlimited hospital API connections.
 * Stores connections in localStorage.
 * Fetches and aggregates data from all hospitals.
 */

const Hub = (() => {
  const STORAGE_KEY = "hospital_hub_connections";

  // ── Connection Store ──
  function getConnections() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function saveConnections(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function addConnection(name, url, apiKey) {
    const list = getConnections();
    const id = "h_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const conn = {
      id,
      name: name.trim(),
      url: url.trim().replace(/\/+$/, ""),
      apiKey: apiKey.trim(),
      addedAt: new Date().toISOString(),
      lastFetched: null,
      lastStatus: "pending",
      lastData: null,
    };
    list.push(conn);
    saveConnections(list);
    return conn;
  }

  function removeConnection(id) {
    const list = getConnections().filter(c => c.id !== id);
    saveConnections(list);
  }

  function updateConnection(id, updates) {
    const list = getConnections();
    const idx = list.findIndex(c => c.id === id);
    if (idx >= 0) {
      Object.assign(list[idx], updates);
      saveConnections(list);
    }
  }

  function getConnection(id) {
    return getConnections().find(c => c.id === id);
  }

  // ── Fetch from a single hospital ──
  async function fetchHospital(conn) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (conn.apiKey) {
        headers["X-API-Key"] = conn.apiKey;
        headers["Authorization"] = `Bearer ${conn.apiKey}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${conn.url}/api/beds`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      updateConnection(conn.id, {
        lastFetched: new Date().toISOString(),
        lastStatus: "online",
        lastData: json.data || json,
      });

      return { id: conn.id, success: true, data: json.data || json };
    } catch (err) {
      updateConnection(conn.id, {
        lastFetched: new Date().toISOString(),
        lastStatus: err.name === "AbortError" ? "timeout" : "offline",
        lastData: null,
      });
      return { id: conn.id, success: false, error: err.message };
    }
  }

  // ── Fetch ALL hospitals in parallel ──
  async function fetchAll(onProgress) {
    const list = getConnections();
    const total = list.length;
    let done = 0;
    const results = [];

    // Process in batches of 20 to avoid overwhelming browser
    const batchSize = 20;
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (conn) => {
          const result = await fetchHospital(conn);
          done++;
          if (onProgress) onProgress(done, total);
          return result;
        })
      );
      results.push(...batchResults.map(r => r.value || r.reason));
    }

    return results;
  }

  // ── Aggregate stats ──
  function getAggregateStats() {
    const list = getConnections();
    let totalHospitals = list.length;
    let onlineCount = 0;
    let totalBeds = 0;
    let totalAvailable = 0;
    let totalICU = 0;
    let totalICUAvail = 0;

    list.forEach(c => {
      if (c.lastStatus === "online") onlineCount++;
      if (c.lastData) {
        const d = c.lastData;
        totalBeds += d.total_beds || 0;
        totalAvailable += d.total_available || 0;
        if (d.beds) {
          totalICU += d.beds.icu?.total || 0;
          totalICUAvail += d.beds.icu?.available || 0;
        } else {
          totalICU += d.icu_beds_total || 0;
          totalICUAvail += d.icu_beds || 0;
        }
      }
    });

    return { totalHospitals, onlineCount, totalBeds, totalAvailable, totalICU, totalICUAvail };
  }

  // ── Export all data ──
  function exportAll() {
    const list = getConnections();
    const data = {
      exported_at: new Date().toISOString(),
      total_hospitals: list.length,
      hospitals: list.map(c => ({
        name: c.name,
        url: c.url,
        status: c.lastStatus,
        last_fetched: c.lastFetched,
        data: c.lastData,
      })),
      aggregate: getAggregateStats(),
    };
    return JSON.stringify(data, null, 2);
  }

  // ── Import connections from JSON ──
  function importConnections(jsonStr) {
    try {
      const imported = JSON.parse(jsonStr);
      let count = 0;
      const items = imported.hospitals || imported;
      if (!Array.isArray(items)) throw new Error("Invalid format");

      items.forEach(item => {
        if (item.name && item.url) {
          addConnection(item.name, item.url, item.apiKey || item.api_key || "");
          count++;
        }
      });
      return { success: true, count };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return {
    getConnections, addConnection, removeConnection, updateConnection,
    getConnection, fetchHospital, fetchAll, getAggregateStats,
    exportAll, importConnections,
  };
})();
