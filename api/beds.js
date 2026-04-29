/**
 * GET /api/beds
 * Returns current bed availability for the hospital.
 * 
 * Response format:
 * {
 *   "success": true,
 *   "data": {
 *     "hospital": "Mumbai City Care Hospital",
 *     "location": "Mumbai, Maharashtra, India",
 *     "beds": { "icu": { "total": 12, "available": 10 }, ... },
 *     "total_beds": 106,
 *     "total_available": 98,
 *     "last_updated": "2026-04-28T16:00:00.000Z"
 *   }
 * }
 */

const { fetchDbData } = require("./db");

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use GET." });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  const hospitalData = await fetchDbData();
  
  // Format response data
  const data = {
    ...hospitalData,
    beds: JSON.parse(JSON.stringify(hospitalData.beds)),
    total_beds: Object.values(hospitalData.beds).reduce((s, b) => s + b.total, 0),
    total_available: Object.values(hospitalData.beds).reduce((s, b) => s + b.available, 0),
  };

  return res.status(200).json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
};
