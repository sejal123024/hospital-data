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

  /**
   * GET /api/beds
   * Fetches current bed availability from the backend.
   */
  async function getBeds() {
    try {
      // Add timestamp to bypass potential browser/Vercel caching
      const response = await fetch(`/api/beds?t=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      
      if (result.success && result.data && result.data.beds) {
        // Sync local state
        for (const [type, vals] of Object.entries(result.data.beds)) {
          if (AppState.beds[type]) {
            AppState.beds[type].total = vals.total;
            AppState.beds[type].available = vals.available;
          }
        }
        AppState.lastUpdated = result.data.last_updated || new Date().toISOString();
        EventBus.emit("beds:updated", AppState.beds);
        EventBus.emit("timestamp:updated", AppState.lastUpdated);
      }
      return { success: true, data: result.data };
    } catch (error) {
      console.warn("[API] GET /api/beds failed (falling back to local state):", error.message);
      return { success: true, data: AppState.toJSON(), source: "local" };
    }
  }

  /**
   * Manual sync to force current AppState to Firestore
   */
  async function syncWithCloud() {
    try {
      const payload = {
        hospital: HospitalConfig.name,
        beds: AppState.beds,
        force_sync: true,
        timestamp: new Date().toISOString()
      };

      const response = await fetch(`/api/update-beds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, sync_all: true })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      console.error("[API] Manual Sync Failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * POST /api/update-beds
   * Sends updated bed counts to the backend.
   */
  async function updateBeds(bedType, field, value) {
    const payload = {
      hospital: HospitalConfig.name,
      bed_type: bedType,
      field: field,
      value: value,
      timestamp: new Date().toISOString(),
    };

    // Always update local AppState immediately so UI reflects change instantly
    if (AppState.beds[bedType]) {
      AppState.beds[bedType][field] = Math.max(0, parseInt(value) || 0);

      if (AppState.beds[bedType].available > AppState.beds[bedType].total) {
        AppState.beds[bedType].available = AppState.beds[bedType].total;
      }

      AppState.lastUpdated = new Date().toISOString();
      EventBus.emit("beds:updated", AppState.beds);
      EventBus.emit("timestamp:updated", AppState.lastUpdated);
    }

    // Persist to backend
    try {
      const response = await fetch(`/api/update-beds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      // If the server returns updated beds data, sync AppState to ensure consistency
      if (result.success && result.data && result.data.beds) {
        for (const [type, vals] of Object.entries(result.data.beds)) {
          if (AppState.beds[type]) {
            AppState.beds[type].total = vals.total;
            AppState.beds[type].available = vals.available;
          }
        }
        AppState.lastUpdated = result.data.last_updated || new Date().toISOString();
        EventBus.emit("beds:updated", AppState.beds);
        EventBus.emit("timestamp:updated", AppState.lastUpdated);
      }

      return { success: true, data: result };
    } catch (error) {
      console.warn("[API] POST /api/update-beds failed:", error.message);
      return { success: false, error: error.message };
    }
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
