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
    const data = {
      hospital: doc.fields.hospital?.stringValue || localData.hospital,
      location: doc.fields.location?.stringValue || localData.location,
      type: doc.fields.type?.stringValue || localData.type,
      registration: doc.fields.registration?.stringValue || localData.registration,
      last_updated: doc.fields.last_updated?.stringValue || new Date().toISOString(),
      beds: {}
    };
    
    // Initialize with local defaults first in case fields are missing in Firestore
    Object.keys(localData.beds).forEach(key => {
      data.beds[key] = { ...localData.beds[key] };
    });

    if (doc.fields.beds && doc.fields.beds.mapValue && doc.fields.beds.mapValue.fields) {
      const bedsMap = doc.fields.beds.mapValue.fields;
      for (const [key, val] of Object.entries(bedsMap)) {
        if (val.mapValue && val.mapValue.fields) {
          data.beds[key] = {
            total: parseInt(val.mapValue.fields.total?.integerValue || localData.beds[key]?.total || 0),
            available: parseInt(val.mapValue.fields.available?.integerValue || localData.beds[key]?.available || 0)
          };
        }
      }
    }
    return data;
  } catch (e) {
    console.error("Parse Error:", e);
    return null;
  }
}

// Helper to convert normal JSON to Firestore format
function toFirestore(data) {
  const fields = {
    hospital: { stringValue: data.hospital || localData.hospital },
    location: { stringValue: data.location || localData.location },
    type: { stringValue: data.type || localData.type },
    registration: { stringValue: data.registration || localData.registration },
    last_updated: { stringValue: new Date().toISOString() },
    beds: { mapValue: { fields: {} } }
  };
  
  const bedsSource = data.beds || localData.beds;
  for (const [key, val] of Object.entries(bedsSource)) {
    fields.beds.mapValue.fields[key] = {
      mapValue: {
        fields: {
          total: { integerValue: val.total.toString() },
          available: { integerValue: val.available.toString() }
        }
      }
    };
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
          // Document doesn't exist, use local data but don't cache yet
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
    // We use PATCH with currentUpdateStrategy or similar, but here we just send the whole fields object
    // For Firestore REST API, PATCH on a document with fields will update those fields.
    const payload = JSON.stringify(toFirestore(newData));
    const req = https.request({
      host: DB_HOST,
      path: `${DOC_PATH}?key=${API_KEY}`,
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
