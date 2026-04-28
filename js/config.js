/**
 * ============================================
 * Hospital Dashboard - Configuration & State
 * ============================================
 * All dynamic values stored here. Nothing hardcoded in the UI.
 */

const HospitalConfig = {
  name: "Mumbai City Care Hospital",
  location: "Mumbai, Maharashtra, India",
  type: "Multi-Speciality Hospital",
  tagline: "Excellence in Healthcare Since 2005",
  registrationNo: "MH-MUM-2005-0847",

  defaults: { icu_beds: 12, general_beds: 45, emergency_beds: 8, pediatric_beds: 15, oxygen_beds: 20, ventilator_beds: 6 },

  api: { baseUrl: "", apiKey: "", connected: false, lastSyncAttempt: null },
  polling: { enabled: true, intervalMs: 30000, wsEndpoint: "", wsConnected: false },
};

const AppState = {
  beds: {
    icu:        { total: 12, available: 12 },
    general:    { total: 45, available: 45 },
    emergency:  { total: 8,  available: 8  },
    pediatric:  { total: 15, available: 15 },
    oxygen:     { total: 20, available: 20 },
    ventilator: { total: 6,  available: 6  },
  },
  lastUpdated: new Date().toISOString(),
  isLoading: false,
  activeTab: "dashboard",
  notifications: [],
  apiConnected: false,

  toJSON() {
    const out = {
      hospital: HospitalConfig.name,
      location: HospitalConfig.location,
      type: HospitalConfig.type,
      registration: HospitalConfig.registrationNo,
      last_updated: this.lastUpdated,
    };
    for (const [k, v] of Object.entries(this.beds)) {
      out[`${k}_beds`] = v.available;
      out[`${k}_beds_total`] = v.total;
    }
    return out;
  },

  getTotalBeds()      { return Object.values(this.beds).reduce((s, b) => s + b.total, 0); },
  getTotalAvailable() { return Object.values(this.beds).reduce((s, b) => s + b.available, 0); },
  getOccupancyRate()  { const t = this.getTotalBeds(); return t === 0 ? 0 : Math.round(((t - this.getTotalAvailable()) / t) * 100); },
};

const EventBus = {
  _l: {},
  on(e, cb) { (this._l[e] = this._l[e] || []).push(cb); },
  emit(e, d) { (this._l[e] || []).forEach(cb => cb(d)); },
  off(e, cb) { if (this._l[e]) this._l[e] = this._l[e].filter(c => c !== cb); },
};
