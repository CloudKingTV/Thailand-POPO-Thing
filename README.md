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
- 📍 **"Still there?" proximity prompt**: with location on, when you drive/ride
  within ~150 m of an active checkpoint the app pops up "Still there?" so you
  can confirm or clear it in one tap — no hunting for the marker
- 🔁 **Usual spots**: persistent, community-marked recurring checkpoint
  locations, shown as quieter pins separate from live reports. Tick "usual
  spot" when reporting to add one; nearby marks merge automatically. Ships
  with a small editable seed list of well-known Bangkok areas
- 💸 **Traffic fines reference**: a quick sheet of approximate fines (no
  helmet, speeding, no licence, red light, phone, seatbelt, drink driving…)
- ⏱️ Reports auto-expire after 4 hours so the map never shows stale stops;
  markers fade after 2 hours
- 📋 Recent-reports list to jump to any active report
- 🇹🇭/🇬🇧 Thai-first UI that auto-detects browser language, with a one-tap toggle
- 📱 Mobile-first design — meant to be used from a phone
- 🔄 Auto-refreshes every 30 seconds, so everyone sees the same map

## Run it

```bash
npm install
npm start
# open http://localhost:3000
```

### Storage

- **With a database** (recommended for anything shared): set `DATABASE_URL` to a
  Postgres connection string and data is stored there, surviving restarts and
  redeploys. The `render.yaml` blueprint provisions a free Postgres and wires
  `DATABASE_URL` in automatically.
- **Without one**: data falls back to local JSON files under `data/` — perfect
  for local development, but note those files don't survive an ephemeral host's
  redeploy.

To share with your friends, deploy anywhere Node runs (Render, Railway, Fly.io,
a VPS) and send them the URL — everyone hitting the same server sees the same
reports.

## API

| Method | Path                        | Purpose                                    |
| ------ | --------------------------- | ------------------------------------------ |
| GET    | `/api/reports`              | All active (non-expired) reports           |
| POST   | `/api/reports`              | Create a report `{lat, lng, type, description?, recurring?}` |
| POST   | `/api/reports/:id/confirm`  | "Still there" — extends expiry by 2 h      |
| POST   | `/api/reports/:id/clear`    | "Gone" — 3 votes removes the report        |
| GET    | `/api/known-spots`          | All usual/recurring checkpoint spots       |
| POST   | `/api/known-spots`          | Mark a usual spot `{lat, lng, type?, label?}` (merges within 120 m) |

Usual spots persist in `data/known-spots.json`; the group can edit that file
to curate the recurring-spot layer. The traffic-fine figures are a rough,
approximate reference (Land Traffic Act) and not legal advice — actual amounts
vary with officer discretion, province, and law changes.

Abuse guards: per-IP rate limiting, one vote per IP per report, coordinates
must be inside Thailand, description capped at 200 chars.

## Pay Thai QR with Solana / USDC (🪙, demo)

An experimental flow to pay a Thai **PromptPay** merchant QR using USDC on
Solana, via a peer-to-peer *settler* model (independent people accept your
USDC into escrow and pay the merchant's THB for a small fee — the same idea as
P2P Bitcoin settlers).

What's real and implemented:

- **PromptPay QR decoding** (`payments.js`): full EMVCo TLV parse + CRC-16
  validation, extracting merchant, PromptPay target, and amount.
- **Solana Pay request**: builds a real `solana:` USDC transfer request (QR +
  wallet deep-link) — non-custodial, your wallet signs it.
- **P2P order/escrow lifecycle**: `open → funded → claimed → paid → released`,
  with the payout target revealed only to the settler who claims a job.

| Method | Path                          | Purpose                                   |
| ------ | ----------------------------- | ----------------------------------------- |
| GET    | `/api/pay/config`             | Network, fee, treasury, disclaimer        |
| POST   | `/api/pay/parse`              | Decode a PromptPay payload                 |
| POST   | `/api/pay/intent`             | Price it in USDC + open an escrow order    |
| GET    | `/api/pay/orders`             | Open/funded jobs for settlers              |
| POST   | `/api/pay/orders/:id/{fund,claim,proof,release,cancel}` | Order lifecycle |

> ⚠️ **This is a demo.** Escrow is simulated and **no real funds move**;
> it defaults to Solana **devnet**. Running it for real means operating a P2P
> crypto↔fiat exchange, which requires SEC/Bank of Thailand licensing, KYC/AML
> on both sides, a trustless on-chain escrow actually holding the USDC, and
> dispute handling — legal/operational work, not just code. The `settle()`
> seam and `PAY_*` env vars (`PAY_NETWORK`, `PAY_TREASURY`, `PAY_SETTLEMENT`,
> `PAY_SETTLER_FEE`) are where a licensed provider would plug in.

## Roadmap ideas

- Expand beyond Bangkok (the server already accepts all of Thailand)
- Telegram bot bridge so the existing group chat feeds the map
- Push/LINE notifications for reports near you
- Heatmap of frequent checkpoint locations
