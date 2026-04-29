/**
 * POST /api/update-beds
 * Updates bed availability for a specific ward.
 * 
 * Request body:
 * {
 *   "bed_type": "icu",       // icu | general | emergency | pediatric | oxygen | ventilator
 *   "field": "available",    // total | available
 *   "value": 10
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "ICU available updated to 10",
 *   "data": { ...updated hospital data }
 * }
 */

const { fetchDbData, saveDbData } = require("./db");

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  const { bed_type, field, value } = req.body || {};

  // Validation
  const validTypes = ["icu", "general", "emergency", "pediatric", "oxygen", "ventilator"];
  const validFields = ["total", "available"];

  if (!bed_type || !validTypes.includes(bed_type)) {
    return res.status(400).json({
      success: false,
      error: `Invalid bed_type. Must be one of: ${validTypes.join(", ")}`,
    });
  }

  if (!field || !validFields.includes(field)) {
    return res.status(400).json({
      success: false,
      error: `Invalid field. Must be one of: ${validFields.join(", ")}`,
    });
  }

  if (value === undefined || value === null || isNaN(parseInt(value))) {
    return res.status(400).json({
      success: false,
      error: "Invalid value. Must be a number.",
    });
  }

  // Get current DB data
  const hospitalData = await fetchDbData();
  
  if (!hospitalData || !hospitalData.beds[bed_type]) {
    return res.status(500).json({ success: false, error: "Failed to load database state." });
  }

  // Update
  const numVal = Math.max(0, parseInt(value) || 0);
  hospitalData.beds[bed_type][field] = numVal;

  if (hospitalData.beds[bed_type].available > hospitalData.beds[bed_type].total) {
    hospitalData.beds[bed_type].available = hospitalData.beds[bed_type].total;
  }

  hospitalData.last_updated = new Date().toISOString();

  // Save back to DB
  const saved = await saveDbData(hospitalData);

  if (!saved) {
    return res.status(500).json({ success: false, error: "Failed to save bed data to database." });
  }

  // Format return data
  const returnData = {
    ...hospitalData,
    beds: JSON.parse(JSON.stringify(hospitalData.beds)),
    total_beds: Object.values(hospitalData.beds).reduce((s, b) => s + b.total, 0),
    total_available: Object.values(hospitalData.beds).reduce((s, b) => s + b.available, 0),
  };

  return res.status(200).json({
    success: true,
    message: `${bed_type.toUpperCase()} ${field} updated to ${parseInt(value)}`,
    data: returnData,
    timestamp: new Date().toISOString(),
  });
};
