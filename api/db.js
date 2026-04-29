const https = require("https");
const { hospitalData: localData } = require("./data");

// FIREBASE FIRESTORE REST API CONFIG
const PROJECT_ID = "hospital-bloodbank-management";
const API_KEY = "AIzaSyC2nfAI1v5UjKps405pa8CAM42l2qUG_5I";
const DOC_PATH = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/hospitals/MUM-CITY-CARE-001`;
const DB_HOST = "firestore.googleapis.com";

let cachedData = null;

// Helper to convert Firestore format to normal JSON
function parseFirestore(doc) {
  if (!doc || !doc.fields) return null;
  try {
    const f = doc.fields;
    const data = {
      hospital: f.hospital?.stringValue || localData.hospital,
      location: f.location?.stringValue || localData.location,
      type: f.type?.stringValue || localData.type,
      registration: f.registration?.stringValue || localData.registration,
      last_updated: f.last_updated?.stringValue || new Date().toISOString(),
      beds: {}
    };
    
    const types = ["icu", "general", "emergency", "pediatric", "oxygen", "ventilator"];
    types.forEach(t => {
      data.beds[t] = {
        total: parseInt(f[`${t}_total`]?.integerValue || localData.beds[t]?.total || 0),
        available: parseInt(f[`${t}_available`]?.integerValue || localData.beds[t]?.available || 0)
      };
    });
    
    return data;
  } catch (e) {
    console.error("Parse Error:", e);
    return null;
  }
}

// Helper to convert normal JSON to Firestore format (Flattened for user visibility)
function toFirestore(data) {
  const fields = {
    hospital: { stringValue: data.hospital || localData.hospital },
    location: { stringValue: data.location || localData.location },
    type: { stringValue: data.type || localData.type },
    registration: { stringValue: data.registration || localData.registration },
    last_updated: { stringValue: new Date().toISOString() }
  };
  
  const bedsSource = data.beds || localData.beds;
  for (const [key, val] of Object.entries(bedsSource)) {
    fields[`${key}_total`] = { integerValue: (val.total || 0).toString() };
    fields[`${key}_available`] = { integerValue: (val.available || 0).toString() };
  }
  return { fields };
}

function fetchDbData() {
  return new Promise((resolve) => {
    const req = https.request({ host: DB_HOST, path: `${DOC_PATH}?key=${API_KEY}`, method: "GET" }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        if (res.statusCode === 200) {
          const parsed = parseFirestore(JSON.parse(body));
          if (parsed) {
            cachedData = parsed;
            return resolve(parsed);
          }
        } else if (res.statusCode === 404) {
          return resolve(localData);
        }
        resolve(cachedData || localData);
      });
    });
    req.on("error", () => resolve(cachedData || localData));
    req.end();
  });
}

function saveDbData(newData) {
  cachedData = newData;
  return new Promise((resolve) => {
    const firestoreObj = toFirestore(newData);
    const payload = JSON.stringify(firestoreObj);
    
    // Construct updateMask to tell Firestore exactly which fields we are providing
    const fieldPaths = Object.keys(firestoreObj.fields).map(f => `updateMask.fieldPaths=${f}`).join("&");
    const path = `${DOC_PATH}?key=${API_KEY}&${fieldPaths}`;

    const req = https.request({
      host: DB_HOST,
      path: path,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          console.error("Firestore Save Error Status:", res.statusCode, body);
          resolve(false);
        }
      });
    });
    req.on("error", (e) => {
      console.error("Firestore Save Connection Error:", e.message);
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

module.exports = { fetchDbData, saveDbData, localData };
