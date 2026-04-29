const https = require("https");
const { hospitalData: localData } = require("./data");

const DB_HOST = "api.restful-api.dev";
const DB_PATH = "/objects/ff8081819d82fab6019dd7d36eff6253";

let cachedData = null;

function fetchDbData() {
  return new Promise((resolve) => {
    const req = https.request({ host: DB_HOST, path: DB_PATH, method: "GET" }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const json = JSON.parse(body);
            if (json.data && json.data.beds) {
              cachedData = json.data;
              return resolve(json.data);
            }
          }
        } catch (e) {
          console.error("DB Fetch Parse Error:", e.message);
        }
        resolve(cachedData || localData);
      });
    });
    req.on("error", (e) => {
      console.error("DB Fetch Request Error:", e.message);
      resolve(cachedData || localData);
    });
    req.end();
  });
}

function saveDbData(newData) {
  cachedData = newData;
  return new Promise((resolve) => {
    const payload = JSON.stringify({ name: "HospitalData", data: newData });
    const req = https.request({
      host: DB_HOST,
      path: DB_PATH,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on("error", (e) => {
      console.error("DB Save Error:", e.message);
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

module.exports = { fetchDbData, saveDbData, localData };
