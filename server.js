import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "reports.json");
const SPOTS_FILE = path.join(DATA_DIR, "known-spots.json");
// When DATABASE_URL is set (e.g. on Render) data is stored in Postgres so it
// survives restarts and redeploys. Without it, we fall back to local JSON
// files — handy for local development.
const DATABASE_URL = process.env.DATABASE_URL || "";

// How long a report stays on the map without anyone confirming it.
const REPORT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
// Each "still there" confirmation pushes the expiry out from now by this much.
const CONFIRM_EXTEND_MS = 2 * 60 * 60 * 1000; // 2 hours
// This many "it's gone" votes removes a report early.
const CLEARS_TO_REMOVE = 3;

const REPORT_TYPES = new Set([
  "checkpoint", // general ด่านตรวจ
  "license", // ตรวจใบขับขี่
  "alcohol", // ด่านตรวจแอลกอฮอล์
  "helmet", // ตรวจหมวกกันน็อค
  "speed", // ตรวจจับความเร็ว
  "police", // police presence, not a formal checkpoint
]);

// Rough bounding box for Thailand so junk coordinates get rejected.
const THAILAND_BOUNDS = { minLat: 5.5, maxLat: 20.6, minLng: 97.2, maxLng: 105.7 };

// "Usual spots": persistent, recurring checkpoint locations (unlike reports,
// they don't expire). Markings within this distance are merged into one spot.
const SPOT_MERGE_M = 120;
const MAX_SPOTS = 500;

// Starter set so the layer isn't empty on first run. These are approximate,
// community-editable EXAMPLES of Bangkok areas where checkpoints are commonly
// mentioned — the group is meant to replace them with their own local
// knowledge by marking spots in the app (or editing data/known-spots.json).
const SEED_SPOTS = [
  { lat: 13.7373, lng: 100.5601, label: "Asok / Sukhumvit", labelTh: "อโศก / สุขุมวิท" },
  { lat: 13.7290, lng: 100.5818, label: "Thonglor (Sukhumvit 55)", labelTh: "ทองหล่อ (สุขุมวิท 55)" },
  { lat: 13.7205, lng: 100.5849, label: "Ekkamai", labelTh: "เอกมัย" },
  { lat: 13.7589, lng: 100.4972, label: "Khao San Rd area", labelTh: "ย่านถนนข้าวสาร" },
  { lat: 13.7692, lng: 100.5738, label: "Huai Khwang / Ratchada", labelTh: "ห้วยขวาง / รัชดา" },
  { lat: 13.6905, lng: 100.4470, label: "Rama II Rd", labelTh: "ถนนพระราม 2" },
];

// ---------------------------------------------------------------------------
// Storage: everything lives in memory, flushed to a JSON file. Fine for a
// group-chat-sized user base; swap for a real database if it outgrows that.
// ---------------------------------------------------------------------------

let reports = [];
let knownSpots = [];
let pool = null; // Postgres pool when DATABASE_URL is set

// --- File helpers (fallback when there is no database) ---------------------

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

// --- Persistence layer: Postgres if configured, otherwise JSON files -------
// Data is kept in memory and snapshotted per collection ("reports",
// "known_spots"), which keeps the rest of the app's logic simple and
// synchronous while still surviving restarts.

async function initStore() {
  if (!DATABASE_URL) {
    console.log("Storage: local JSON files (set DATABASE_URL for persistence)");
    return;
  }
  const { default: pg } = await import("pg");
  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  await pool.query("CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, value jsonb NOT NULL)");
  console.log("Storage: Postgres");
}

async function loadKey(key, file, fallback) {
  if (pool) {
    const r = await pool.query("SELECT value FROM kv WHERE key = $1", [key]);
    return r.rows.length ? r.rows[0].value : fallback;
  }
  return readJson(file, fallback);
}

async function persist(key, file, data) {
  if (pool) {
    await pool.query(
      "INSERT INTO kv (key, value) VALUES ($1, $2::jsonb) " +
        "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [key, JSON.stringify(data)]
    );
  } else {
    saveJson(file, data);
  }
}

async function loadAll() {
  reports = (await loadKey("reports", DATA_FILE, [])) || [];

  const existing = await loadKey("known_spots", SPOTS_FILE, null);
  if (Array.isArray(existing)) {
    knownSpots = existing;
    return;
  }
  // First run: seed the layer with the example spots.
  const now = Date.now();
  knownSpots = SEED_SPOTS.map((s) => ({
    id: crypto.randomUUID(),
    lat: s.lat,
    lng: s.lng,
    label: s.label,
    labelTh: s.labelTh,
    types: ["checkpoint"],
    reportCount: 0,
    seed: true,
    createdAt: now,
    lastReportAt: now,
  }));
  await persist("known_spots", SPOTS_FILE, knownSpots);
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persist("reports", DATA_FILE, reports).catch((e) =>
      console.error("Failed to save reports:", e.message)
    );
  }, 500);
}

function saveKnownSpots() {
  persist("known_spots", SPOTS_FILE, knownSpots).catch((e) =>
    console.error("Failed to save spots:", e.message)
  );
}

// Great-circle distance in metres.
function distMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function validCoord(lat, lng) {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= THAILAND_BOUNDS.minLat && lat <= THAILAND_BOUNDS.maxLat &&
    lng >= THAILAND_BOUNDS.minLng && lng <= THAILAND_BOUNDS.maxLng
  );
}

// Add a usual spot, or reinforce the nearest existing one.
function markKnownSpot({ lat, lng, type, label }) {
  const near = knownSpots.find((s) => distMeters(s.lat, s.lng, lat, lng) < SPOT_MERGE_M);
  if (near) {
    near.reportCount = (near.reportCount || 0) + 1;
    near.lastReportAt = Date.now();
    near.seed = false;
    if (type && !near.types.includes(type)) near.types.push(type);
    saveKnownSpots();
    return near;
  }
  if (knownSpots.length >= MAX_SPOTS) return null;
  const spot = {
    id: crypto.randomUUID(),
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
    label: typeof label === "string" ? label.slice(0, 80).trim() : "",
    types: [type && REPORT_TYPES.has(type) ? type : "checkpoint"],
    reportCount: 1,
    seed: false,
    createdAt: Date.now(),
    lastReportAt: Date.now(),
  };
  knownSpots.push(spot);
  saveKnownSpots();
  return spot;
}

function pruneExpired() {
  const now = Date.now();
  const before = reports.length;
  reports = reports.filter((r) => r.expiresAt > now && r.clears < CLEARS_TO_REMOVE);
  if (reports.length !== before) scheduleSave();
}

await initStore();
await loadAll();
pruneExpired();
setInterval(pruneExpired, 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Very small per-IP rate limiter so one person can't flood the map.
// ---------------------------------------------------------------------------

const rateBuckets = new Map();
function rateLimit(maxPerMinute) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.route?.path || req.path}`;
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.start > 60_000) {
      bucket = { start: now, count: 0 };
      rateBuckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > maxPerMinute) {
      return res.status(429).json({ error: "Too many requests, slow down" });
    }
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.start > 120_000) rateBuckets.delete(key);
  }
}, 60_000).unref();

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/vendor/leaflet", express.static(path.join(__dirname, "node_modules", "leaflet", "dist")));

function publicReport(r) {
  const { voterIps, ...rest } = r;
  return rest;
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    storage: pool ? "postgres" : "files",
    reports: reports.length,
    spots: knownSpots.length,
  });
});

app.get("/api/reports", (req, res) => {
  pruneExpired();
  res.json({ reports: reports.map(publicReport) });
});

app.post("/api/reports", rateLimit(5), (req, res) => {
  const { lat, lng, type, description, recurring } = req.body || {};

  if (!validCoord(lat, lng)) {
    return res.status(400).json({ error: "Location must be a valid point inside Thailand" });
  }
  if (!REPORT_TYPES.has(type)) {
    return res.status(400).json({ error: "Invalid report type" });
  }
  const desc = typeof description === "string" ? description.slice(0, 200).trim() : "";

  const now = Date.now();
  const report = {
    id: crypto.randomUUID(),
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
    type,
    description: desc,
    createdAt: now,
    expiresAt: now + REPORT_TTL_MS,
    confirms: 0,
    clears: 0,
    voterIps: [],
  };
  reports.push(report);
  scheduleSave();

  // Optionally record this location as a recurring "usual spot".
  let spot = null;
  if (recurring === true) spot = markKnownSpot({ lat, lng, type, label: desc });

  res.status(201).json({ report: publicReport(report), spot });
});

app.get("/api/known-spots", (req, res) => {
  res.json({ spots: knownSpots });
});

app.post("/api/known-spots", rateLimit(10), (req, res) => {
  const { lat, lng, type, label } = req.body || {};
  if (!validCoord(lat, lng)) {
    return res.status(400).json({ error: "Location must be a valid point inside Thailand" });
  }
  const spot = markKnownSpot({ lat, lng, type, label });
  if (!spot) return res.status(400).json({ error: "Spot limit reached" });
  res.status(201).json({ spot });
});

function vote(kind) {
  return (req, res) => {
    pruneExpired();
    const report = reports.find((r) => r.id === req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found or expired" });

    const ipHash = crypto.createHash("sha256").update(String(req.ip)).digest("hex").slice(0, 16);
    if (report.voterIps.includes(ipHash)) {
      return res.status(409).json({ error: "Already voted on this report" });
    }
    report.voterIps.push(ipHash);

    if (kind === "confirm") {
      report.confirms++;
      report.expiresAt = Math.max(report.expiresAt, Date.now() + CONFIRM_EXTEND_MS);
    } else {
      report.clears++;
      if (report.clears >= CLEARS_TO_REMOVE) {
        reports = reports.filter((r) => r.id !== report.id);
        scheduleSave();
        return res.json({ removed: true });
      }
    }
    scheduleSave();
    res.json({ report: publicReport(report) });
  };
}

app.post("/api/reports/:id/confirm", rateLimit(20), vote("confirm"));
app.post("/api/reports/:id/clear", rateLimit(20), vote("clear"));

app.listen(PORT, () => {
  console.log(`POPO map running at http://localhost:${PORT}`);
});
