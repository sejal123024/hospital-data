/**
 * GET /api/health
 * Health check endpoint for API connectivity testing.
 * External systems ping this to verify the API is alive.
 * Accepts X-API-Key or Authorization header for validation.
 */

const VALID_API_KEY = "HOSP-MUM-2026-CITYCARE-9X4K";

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Validate API key (allow if no key provided too, for open health checks)
  const providedKey =
    req.headers["x-api-key"] ||
    (req.headers["authorization"] || "").replace("Bearer ", "");

  const keyValid = !providedKey || providedKey === VALID_API_KEY;

  return res.status(200).json({
    success: true,
    status: "operational",
    authenticated: keyValid,
    hospital: "Mumbai City Care Hospital",
    hospital_id: "MUM-CITY-CARE-001",
    location: "Mumbai, Maharashtra, India",
    api_version: "1.0.0",
    endpoints: [
      { method: "GET",  path: "/api/beds",        description: "Fetch current bed availability" },
      { method: "POST", path: "/api/update-beds",  description: "Update bed counts" },
      { method: "GET",  path: "/api/health",       description: "Health check" },
    ],
    timestamp: new Date().toISOString(),
  });
};
