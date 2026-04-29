/**
 * ============================================
 * Hospital Dashboard - API Integration Layer
 * ============================================
 * Modular API service layer. All external communication goes through here.
 * Designed to be easily connected to a real backend later.
 */

const HospitalAPI = (() => {
  // ── Private state ──
  let _pollingTimer = null;

  // ── Firestore Configuration (Direct Fallback) ──
  const PROJECT_ID = "hospital-bloodbank-management";
  const API_KEY = "AIzaSyC2nfAI1v5UjKps405pa8CAM42l2qUG_5I";
  const DOC_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/hospitals/MUM-CITY-CARE-001?key=${API_KEY}`;

  /**
   * Helper to map normal JSON to Firestore Flattened format
   */
  function toFirestoreFormat(data) {
    const fields = {
      hospital: { stringValue: data.hospital || HospitalConfig.name },
      location: { stringValue: HospitalConfig.location },
      type: { stringValue: HospitalConfig.type },
      registration: { stringValue: HospitalConfig.registrationNo },
      last_updated: { stringValue: new Date().toISOString() }
    };
    
    for (const [key, val] of Object.entries(data.beds || AppState.beds)) {
      fields[`${key}_total`] = { integerValue: (val.total || 0).toString() };
      fields[`${key}_available`] = { integerValue: (val.available || 0).toString() };
    }
    return { fields };
  }

  /**
   * Helper to map Firestore Flattened format back to normal JSON
   */
  function fromFirestoreFormat(doc) {
    if (!doc || !doc.fields) return null;
    const f = doc.fields;
    const beds = {};
    const types = ["icu", "general", "emergency", "pediatric", "oxygen", "ventilator"];
    
    types.forEach(t => {
      beds[t] = {
        total: parseInt(f[`${t}_total`]?.integerValue || 0),
        available: parseInt(f[`${t}_available`]?.integerValue || 0)
      };
    });

    return {
      hospital: f.hospital?.stringValue,
      last_updated: f.last_updated?.stringValue,
      beds: beds
    };
  }

  /**
   * GET /api/beds
   */
  async function getBeds() {
    try {
      let response = await fetch(`/api/beds?t=${Date.now()}`);
      
      // If 404, we are likely running locally without a Vercel server
      if (response.status === 404) {
        console.info("[API] Relative backend not found, falling back to direct Firestore...");
        response = await fetch(DOC_URL);
        if (!response.ok) throw new Error("Firestore fallback failed");
        const doc = await response.json();
        const result = fromFirestoreFormat(doc);
        if (result) {
          syncLocalState(result);
          return { success: true, data: result, source: "firestore-direct" };
        }
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result.success && result.data) {
        syncLocalState(result.data);
      }
      return { success: true, data: result.data };
    } catch (error) {
      console.warn("[API] GET failed:", error.message);
      return { success: true, data: AppState.toJSON(), source: "local" };
    }
  }

  function syncLocalState(data) {
    if (!data.beds) return;
    for (const [type, vals] of Object.entries(data.beds)) {
      if (AppState.beds[type]) {
        AppState.beds[type].total = vals.total;
        AppState.beds[type].available = vals.available;
      }
    }
    AppState.lastUpdated = data.last_updated || new Date().toISOString();
    EventBus.emit("beds:updated", AppState.beds);
    EventBus.emit("timestamp:updated", AppState.lastUpdated);
  }

  /**
   * Manual sync to force current AppState to Firestore
   */
  async function syncWithCloud() {
    try {
      const payload = {
        hospital: HospitalConfig.name,
        beds: AppState.beds,
        sync_all: true
      };

      let response = await fetch(`/api/update-beds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.status === 404) {
        // Direct Firestore fallback
        const updateMask = Object.keys(toFirestoreFormat(payload).fields).map(f => `updateMask.fieldPaths=${f}`).join("&");
        response = await fetch(`${DOC_URL}&${updateMask}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toFirestoreFormat(payload))
        });
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      console.error("[API] Sync Failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * POST /api/update-beds
   */
  async function updateBeds(bedType, field, value) {
    // Optimistic UI update
    if (AppState.beds[bedType]) {
      AppState.beds[bedType][field] = Math.max(0, parseInt(value) || 0);
      if (AppState.beds[bedType].available > AppState.beds[bedType].total) {
        AppState.beds[bedType].available = AppState.beds[bedType].total;
      }
      AppState.lastUpdated = new Date().toISOString();
      EventBus.emit("beds:updated", AppState.beds);
      EventBus.emit("timestamp:updated", AppState.lastUpdated);
    }

    // Trigger full sync to keep it simple and robust
    return await syncWithCloud();
  }

  /**
   * POST /api/connect
   * Tests API connection with the configured endpoint.
   */
  async function testConnection(apiUrl, apiKey) {
    try {
      EventBus.emit("api:connecting", true);

      const response = await fetch(`${apiUrl}/api/health`, {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          "Authorization": `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        HospitalConfig.api.baseUrl = apiUrl;
        HospitalConfig.api.apiKey = apiKey;
        HospitalConfig.api.connected = true;
        HospitalConfig.api.lastSyncAttempt = new Date().toISOString();
        AppState.apiConnected = true;
        EventBus.emit("api:connected", true);
        return { success: true, message: "Connected successfully!" };
      } else {
        throw new Error(`Server responded with ${response.status}`);
      }
    } catch (error) {
      HospitalConfig.api.connected = false;
      AppState.apiConnected = false;
      EventBus.emit("api:connected", false);
      return { success: false, message: error.message };
    } finally {
      EventBus.emit("api:connecting", false);
    }
  }

  /**
   * Disconnect from API
   */
  function disconnect() {
    HospitalConfig.api.connected = false;
    AppState.apiConnected = false;
    EventBus.emit("api:connected", false);
    addNotification("API disconnected", "info");
  }

  /**
   * WebSocket placeholder
   * Replace this with real WebSocket connection when backend supports it.
   */
  function connectWebSocket(wsUrl) {
    console.log(`[WS] Placeholder: Would connect to ${wsUrl}`);
    // Example real implementation:
    // const ws = new WebSocket(wsUrl);
    // ws.onmessage = (event) => {
    //   const data = JSON.parse(event.data);
    //   Object.assign(AppState.beds, data.beds);
    //   AppState.lastUpdated = data.timestamp;
    //   EventBus.emit("beds:updated", AppState.beds);
    // };
  }

  /**
   * Start polling for updates (setInterval-based real-time simulation)
   */
  function startPolling() {
    if (_pollingTimer) return;

    const fetchTask = async () => {
      const result = await getBeds();
      if (result.success && result.data && result.source !== "local") {
        // Update state from server data
        EventBus.emit("beds:updated", result.data);
      }
      EventBus.emit("polling:tick", new Date().toISOString());
    };

    // Fetch immediately on start
    fetchTask();

    // Then start polling
    _pollingTimer = setInterval(fetchTask, HospitalConfig.polling.intervalMs);

    HospitalConfig.polling.enabled = true;
    console.log(`[Polling] Started (every ${HospitalConfig.polling.intervalMs / 1000}s)`);
  }

  /**
   * Stop polling
   */
  function stopPolling() {
    if (_pollingTimer) {
      clearInterval(_pollingTimer);
      _pollingTimer = null;
    }
    HospitalConfig.polling.enabled = false;
    console.log("[Polling] Stopped");
  }

  /**
   * Add a notification to the state
   */
  function addNotification(message, type = "info") {
    const notification = {
      id: Date.now(),
      message,
      type,
      timestamp: new Date().toISOString(),
    };
    AppState.notifications.unshift(notification);
    if (AppState.notifications.length > 20) AppState.notifications.pop();
    EventBus.emit("notification:added", notification);
  }

  /**
   * Export hospital data as JSON (for external systems)
   */
  function exportData() {
    return JSON.stringify(AppState.toJSON(), null, 2);
  }

  // ── Public API ──
  return {
    getBeds,
    updateBeds,
    testConnection,
    disconnect,
    connectWebSocket,
    startPolling,
    stopPolling,
    syncWithCloud,
    addNotification,
    exportData,
  };
})();
