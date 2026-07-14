import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "reports.json");

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

// ---------------------------------------------------------------------------
// Storage: everything lives in memory, flushed to a JSON file. Fine for a
// group-chat-sized user base; swap for a real database if it outgrows that.
// ---------------------------------------------------------------------------

let reports = [];

function loadReports() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    reports = JSON.parse(raw);
  } catch {
    reports = [];
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(reports));
    fs.renameSync(tmp, DATA_FILE);
  }, 500);
}

function pruneExpired() {
  const now = Date.now();
  const before = reports.length;
  reports = reports.filter((r) => r.expiresAt > now && r.clears < CLEARS_TO_REMOVE);
  if (reports.length !== before) scheduleSave();
}

loadReports();
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

app.get("/api/reports", (req, res) => {
  pruneExpired();
  res.json({ reports: reports.map(publicReport) });
});

app.post("/api/reports", rateLimit(5), (req, res) => {
  const { lat, lng, type, description } = req.body || {};

  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat and lng must be numbers" });
  }
  if (
    lat < THAILAND_BOUNDS.minLat || lat > THAILAND_BOUNDS.maxLat ||
    lng < THAILAND_BOUNDS.minLng || lng > THAILAND_BOUNDS.maxLng
  ) {
    return res.status(400).json({ error: "Location must be inside Thailand" });
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
  res.status(201).json({ report: publicReport(report) });
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
