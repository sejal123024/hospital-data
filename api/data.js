/**
 * ============================================
 * Shared Data Store for Vercel Serverless API
 * ============================================
 * NOTE: Vercel serverless functions are stateless.
 * This in-memory store resets on each cold start.
 * For production, replace with Firebase/MongoDB/Supabase.
 */

const hospitalData = {
  hospital: "Mumbai City Care Hospital",
  location: "Mumbai, Maharashtra, India",
  district: "Mumbai City",
  type: "Multi-Speciality Hospital",
  registration: "MH-MUM-2005-0847",
  helpline: "1800-123-4567",
  email: "info@mumbaicitycare.gov.in",
  beds: {
    icu: { total: 12, available: 12 },
    general: { total: 45, available: 45 },
    emergency: { total: 8, available: 8 },
    pediatric: { total: 15, available: 15 },
    oxygen: { total: 20, available: 20 },
    ventilator: { total: 6, available: 6 },
  },
  last_updated: new Date().toISOString(),
};

/**
 * Get the current hospital data snapshot
 */
function getData() {
  return {
    ...hospitalData,
    beds: JSON.parse(JSON.stringify(hospitalData.beds)),
    last_updated: hospitalData.last_updated,
    total_beds: Object.values(hospitalData.beds).reduce((s, b) => s + b.total, 0),
    total_available: Object.values(hospitalData.beds).reduce((s, b) => s + b.available, 0),
  };
}

/**
 * Update a bed field
 */
function updateBed(bedType, field, value) {
  if (!hospitalData.beds[bedType]) return false;
  const numVal = Math.max(0, parseInt(value) || 0);
  hospitalData.beds[bedType][field] = numVal;

  // Clamp available to total
  if (hospitalData.beds[bedType].available > hospitalData.beds[bedType].total) {
    hospitalData.beds[bedType].available = hospitalData.beds[bedType].total;
  }

  hospitalData.last_updated = new Date().toISOString();
  return true;
}

module.exports = { getData, updateBed, hospitalData };
