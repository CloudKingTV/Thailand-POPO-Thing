# 🚨 POPO Map — Thailand Police Checkpoint Map

A community map for Bangkok (and eventually all of Thailand) where anyone can
**see, report, and confirm police checkpoints** in real time — like the police
report feature in Waze, but as its own simple app. Built to replace the
"someone types the soi name into the Telegram group" workflow.

## Features

- 🗺️ Full-screen map of Bangkok (OpenStreetMap + Leaflet, no API key needed)
- 📍 **Report a stop**: tap "รายงานด่าน", tap the map, pick the type, done
- 🚧 Six report types: checkpoint, license check, alcohol checkpoint, helmet
  check, speed check, and general police presence
- 👀 **Confirm or clear**: anyone can vote "still there" (extends the report)
  or "gone" — 3 "gone" votes removes it from the map
- ⏱️ Reports auto-expire after 4 hours so the map never shows stale stops;
  markers fade after 2 hours
- 📋 Recent-reports list to jump to any active report
- 🇹🇭/🇬🇧 Thai-first UI with one-tap English toggle
- 📱 Mobile-first design — meant to be used from a phone
- 🔄 Auto-refreshes every 30 seconds, so everyone sees the same map

## Run it

```bash
npm install
npm start
# open http://localhost:3000
```

Reports are stored in `data/reports.json` (created automatically). To share
with your friends, deploy anywhere Node runs (Railway, Fly.io, Render, a VPS)
and send them the URL — everyone hitting the same server sees the same
reports.

## API

| Method | Path                        | Purpose                                    |
| ------ | --------------------------- | ------------------------------------------ |
| GET    | `/api/reports`              | All active (non-expired) reports           |
| POST   | `/api/reports`              | Create a report `{lat, lng, type, description?}` |
| POST   | `/api/reports/:id/confirm`  | "Still there" — extends expiry by 2 h      |
| POST   | `/api/reports/:id/clear`    | "Gone" — 3 votes removes the report        |

Abuse guards: per-IP rate limiting, one vote per IP per report, coordinates
must be inside Thailand, description capped at 200 chars.

## Roadmap ideas

- Expand beyond Bangkok (the server already accepts all of Thailand)
- Telegram bot bridge so the existing group chat feeds the map
- Push/LINE notifications for reports near you
- Heatmap of frequent checkpoint locations
