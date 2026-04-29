const DB_URL = "https://api.restful-api.dev/objects/ff8081819d82fab6019dd7d36eff6253";

// Fallback local data if API fails
const { hospitalData: localData } = require("./data");

let cachedData = null;

async function fetchDbData() {
  try {
    const res = await fetch(DB_URL);
    if (!res.ok) throw new Error("API error");
    const json = await res.json();
    if (json.data && json.data.beds) {
      cachedData = json.data;
      return json.data;
    }
  } catch (error) {
    console.error("DB Fetch Error:", error.message);
  }
  return cachedData || localData;
}

async function saveDbData(newData) {
  cachedData = newData;
  try {
    await fetch(DB_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "HospitalData", data: newData })
    });
    return true;
  } catch (error) {
    console.error("DB Save Error:", error.message);
    return false;
  }
}

module.exports = { fetchDbData, saveDbData, localData };
