/**
 * GET /api/health
 * Health check endpoint for API connectivity testing.
 * External systems can ping this to verify the API is alive.
 */

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  return res.status(200).json({
    success: true,
    status: "operational",
    hospital: "Mumbai City Care Hospital",
    api_version: "1.0.0",
    endpoints: [
      { method: "GET",  path: "/api/beds",        description: "Fetch current bed availability" },
      { method: "POST", path: "/api/update-beds",  description: "Update bed counts" },
      { method: "GET",  path: "/api/health",       description: "Health check" },
    ],
    timestamp: new Date().toISOString(),
  });
};
