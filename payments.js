// ---------------------------------------------------------------------------
// Crypto → Thai QR payment flow (Solana Pay / USDC).
//
// HONEST SCOPE:
//   * Decoding a Thai PromptPay (EMVCo) QR and building a Solana Pay request
//     for the USDC equivalent is fully real and implemented here.
//   * The final settlement leg — actually converting USDC to THB and paying
//     the merchant's PromptPay account — is a regulated money-transmitter
//     function. There is no drop-in API for it. It lives behind the
//     `settle()` seam below as a clearly-labelled stub. To go live you plug a
//     LICENSED off-ramp/PSP into that function and flip PAY_NETWORK to
//     mainnet. Until then this runs in demo mode and does NOT pay any
//     merchant.
// ---------------------------------------------------------------------------

import crypto from "crypto";
import express from "express";
import QRCode from "qrcode";

// --- Config ----------------------------------------------------------------

const PAY_NETWORK = (process.env.PAY_NETWORK || "devnet").toLowerCase(); // devnet | mainnet
const PAY_MODE = process.env.PAY_SETTLEMENT === "live" ? "live" : "demo";
// Treasury/settlement wallet the USDC is sent to. Placeholder (System Program
// address) until an operator sets a real one they control.
const TREASURY_WALLET = process.env.PAY_TREASURY || "11111111111111111111111111111111";
// USDC SPL mint per network.
const USDC_MINT =
  PAY_NETWORK === "mainnet"
    ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // Circle devnet USDC
// Fallback THB per 1 USDC if the live rate can't be fetched.
const RATE_FALLBACK = Number(process.env.THB_PER_USDC || 35);

// --- EMVCo / PromptPay QR decoding -----------------------------------------

// CRC-16/CCITT-FALSE, as used by the EMVCo QR spec (tag 63).
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Parse an EMVCo TLV string into an ordered list of { tag, value }.
function parseTlv(payload) {
  const out = [];
  let i = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2);
    const len = parseInt(payload.slice(i + 2, i + 4), 10);
    if (!Number.isFinite(len)) break;
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length < len) break; // truncated
    out.push({ tag, value });
    i += 4 + len;
  }
  return out;
}

function maskTarget(t) {
  if (!t) return "";
  const digits = t.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return "•••• " + digits.slice(-4);
}

// Decode a Thai PromptPay QR. Returns { valid, merchant, target, amountThb,
// dynamic, error }.
export function decodePromptPay(payload) {
  if (typeof payload !== "string" || payload.length < 8) {
    return { valid: false, error: "empty" };
  }
  payload = payload.trim();

  // Verify CRC (tag 63 is the last 8 chars: "6304" + 4 hex).
  const crcIdx = payload.lastIndexOf("6304");
  let crcOk = false;
  if (crcIdx !== -1 && crcIdx === payload.length - 8) {
    const expected = payload.slice(-4).toUpperCase();
    crcOk = crc16(payload.slice(0, payload.length - 4)) === expected;
  }

  const top = parseTlv(payload);
  const byTag = Object.fromEntries(top.map((t) => [t.tag, t.value]));

  // Merchant account templates live in tags 26–51; PromptPay uses the
  // A000000677010111 application id.
  let target = "";
  let isPromptPay = false;
  for (const { tag, value } of top) {
    const n = parseInt(tag, 10);
    if (n >= 26 && n <= 51) {
      const sub = parseTlv(value);
      for (const s of sub) {
        if (s.value === "A000000677010111") isPromptPay = true;
        // 01 = mobile, 02 = national id / tax id, 03 = e-wallet id
        if (["01", "02", "03"].includes(s.tag) && !target) target = s.value;
      }
    }
  }

  const currency = byTag["53"]; // 764 = THB
  const amountRaw = byTag["54"];
  const amountThb = amountRaw != null && amountRaw !== "" ? Number(amountRaw) : null;
  const poiMethod = byTag["01"]; // 11 = static/reusable, 12 = dynamic/one-time

  const valid = crcOk && (isPromptPay || parseInt(byTag["00"] || "0", 10) === 1);

  return {
    valid,
    crcOk,
    isPromptPay,
    merchant: byTag["59"] || "",
    city: byTag["60"] || "",
    target,
    targetMasked: maskTarget(target),
    currency,
    amountThb: Number.isFinite(amountThb) ? amountThb : null,
    dynamic: poiMethod === "12",
    error: valid ? null : crcOk ? "not-promptpay" : "bad-crc",
  };
}

// --- Solana Pay request -----------------------------------------------------

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let num = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let str = "";
  while (num > 0n) {
    const rem = Number(num % 58n);
    num = num / 58n;
    str = B58[rem] + str;
  }
  for (const b of bytes) {
    if (b === 0) str = "1" + str;
    else break;
  }
  return str;
}

// Build a Solana Pay transfer request URL for a USDC amount.
// Spec: solana:<recipient>?amount=&spl-token=&reference=&label=&message=
function buildSolanaPayUrl({ usdc, reference, label, message }) {
  const params = new URLSearchParams();
  params.set("amount", usdc.toFixed(2));
  params.set("spl-token", USDC_MINT);
  params.set("reference", reference);
  if (label) params.set("label", label);
  if (message) params.set("message", message);
  return `solana:${TREASURY_WALLET}?${params.toString()}`;
}

// --- THB → USDC rate (best effort, cached) ---------------------------------

let rateCache = { value: RATE_FALLBACK, at: 0 };
async function thbPerUsdc() {
  if (Date.now() - rateCache.at < 5 * 60 * 1000) return rateCache.value;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=thb",
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    const data = await res.json();
    const v = data?.["usd-coin"]?.thb;
    if (Number.isFinite(v) && v > 0) rateCache = { value: v, at: Date.now() };
  } catch {
    /* keep last/fallback */
  }
  return rateCache.value;
}

// --- P2P settlement model ("settlers" accept USDC, pay the merchant THB) ----
// Mirrors the human-agent model: instead of a licensed API, independent
// settlers claim open orders, pay the merchant's PromptPay in THB, submit
// proof, and receive the escrowed USDC on confirmation.
//
// DEMO / SOFTWARE ONLY. Running this for real is operating a P2P crypto↔fiat
// exchange — in Thailand that needs SEC/BoT licensing, KYC/AML on both sides,
// a trustless (on-chain) escrow actually holding the USDC, and dispute
// handling. Those are legal/operational, not things code alone provides. Here
// escrow is simulated in the backend and no real funds move.

const SETTLER_FEE = Number(process.env.PAY_SETTLER_FEE || 0.02); // 2%
const round2 = (n) => Math.round(n * 100) / 100;

let orders = [];
let persistOrders = () => {};

export async function initPayments(adapter) {
  if (!adapter) return;
  orders = (await adapter.load()) || [];
  persistOrders = () => {
    try {
      adapter.save(orders);
    } catch {
      /* best effort */
    }
  };
}

// The full PromptPay target/payload is only exposed to a settler once they've
// claimed an order (they need it to actually pay). Everyone else sees masks.
function publicOrder(o, withTarget = false) {
  const { promptpayPayload, target, ...rest } = o;
  return withTarget ? { ...rest, target, promptpayPayload } : rest;
}

const DISCLAIMER =
  "Demo: escrow is simulated and no real funds move. A live version is a P2P " +
  "crypto↔fiat exchange requiring licensing, KYC/AML, on-chain escrow and " +
  "dispute handling.";

// --- Routes ----------------------------------------------------------------

export function paymentsRouter(rateLimit) {
  const router = express.Router();

  router.get("/config", (req, res) => {
    res.json({
      network: PAY_NETWORK,
      mode: PAY_MODE,
      usdcMint: USDC_MINT,
      treasury: TREASURY_WALLET,
      treasuryIsPlaceholder: TREASURY_WALLET === "11111111111111111111111111111111",
      settlerFee: SETTLER_FEE,
      disclaimer: DISCLAIMER,
    });
  });

  router.post("/parse", rateLimit(30), (req, res) => {
    const { payload } = req.body || {};
    const decoded = decodePromptPay(payload);
    if (!decoded.valid) return res.status(400).json({ error: decoded.error || "invalid" });
    res.json(decoded);
  });

  // Payer creates a payment request: decodes the QR, prices it in USDC, and
  // opens an escrow order for a settler to fulfil. Returns the Solana Pay QR
  // to fund the escrow.
  router.post("/intent", rateLimit(20), async (req, res) => {
    const { payload, amountThb } = req.body || {};
    const decoded = decodePromptPay(payload);
    if (!decoded.valid) return res.status(400).json({ error: decoded.error || "invalid" });

    const thb = decoded.amountThb != null ? decoded.amountThb : Number(amountThb);
    if (!Number.isFinite(thb) || thb <= 0 || thb > 2_000_000) {
      return res.status(400).json({ error: "invalid-amount" });
    }

    const rate = await thbPerUsdc();
    const usdc = round2(thb / rate);
    const feeUsdc = round2(usdc * SETTLER_FEE);
    const totalUsdc = round2(usdc + feeUsdc);
    const reference = base58(crypto.randomBytes(32));
    const label = decoded.merchant || "Thai QR payment";
    const message = `POPO Pay • ฿${thb} → ${totalUsdc} USDC (incl. fee)`;
    const solanaPayUrl = buildSolanaPayUrl({ usdc: totalUsdc, reference, label, message });
    const qr = await QRCode.toDataURL(solanaPayUrl, { margin: 1, width: 320 });

    const now = Date.now();
    const order = {
      id: crypto.randomUUID(),
      reference,
      network: PAY_NETWORK,
      mode: PAY_MODE,
      merchant: decoded.merchant,
      city: decoded.city,
      targetMasked: decoded.targetMasked,
      target: decoded.target,
      promptpayPayload: payload,
      amountThb: thb,
      usdc,
      feeUsdc,
      totalUsdc,
      thbPerUsdc: rate,
      status: "open", // open → funded → claimed → paid → released | cancelled
      settler: null,
      proof: null,
      createdAt: now,
      fundedAt: null,
      claimedAt: null,
      paidAt: null,
      releasedAt: null,
    };
    orders.push(order);
    persistOrders();

    res.status(201).json({
      order: publicOrder(order),
      solanaPayUrl,
      qr,
      disclaimer: DISCLAIMER,
    });
  });

  // Payer marks the escrow as funded (in a real system this is detected
  // on-chain by watching the reference pubkey).
  router.post("/orders/:id/fund", rateLimit(20), (req, res) => {
    const o = orders.find((x) => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: "not-found" });
    if (o.status === "open") {
      o.status = "funded";
      o.fundedAt = Date.now();
      persistOrders();
    }
    res.json({ order: publicOrder(o) });
  });

  // Settlers browse work. Defaults to fundable/claimable orders.
  router.get("/orders", rateLimit(60), (req, res) => {
    const status = req.query.status;
    let list = orders;
    if (status) list = list.filter((o) => o.status === status);
    else list = list.filter((o) => o.status === "open" || o.status === "funded");
    list = [...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
    res.json({ orders: list.map((o) => publicOrder(o)) });
  });

  // A settler claims an order — now they get the payout details.
  router.post("/orders/:id/claim", rateLimit(30), (req, res) => {
    const o = orders.find((x) => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: "not-found" });
    if (o.status !== "open" && o.status !== "funded") {
      return res.status(409).json({ error: "not-claimable" });
    }
    o.status = "claimed";
    o.settler = String(req.body?.settler || "anon").slice(0, 40);
    o.claimedAt = Date.now();
    persistOrders();
    res.json({ order: publicOrder(o, true) }); // reveal target + payload to settler
  });

  // Settler submits proof they paid the merchant's PromptPay.
  router.post("/orders/:id/proof", rateLimit(30), (req, res) => {
    const o = orders.find((x) => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: "not-found" });
    if (o.status !== "claimed") return res.status(409).json({ error: "not-claimed" });
    o.proof = String(req.body?.proof || "").slice(0, 500);
    o.status = "paid";
    o.paidAt = Date.now();
    persistOrders();
    res.json({ order: publicOrder(o, true) });
  });

  // Payer confirms they got their goods → escrow releases USDC to the settler.
  router.post("/orders/:id/release", rateLimit(30), (req, res) => {
    const o = orders.find((x) => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: "not-found" });
    if (o.status !== "paid") return res.status(409).json({ error: "not-paid" });
    o.status = "released";
    o.releasedAt = Date.now();
    persistOrders();
    res.json({ order: publicOrder(o) });
  });

  // Payer cancels before anyone claims.
  router.post("/orders/:id/cancel", rateLimit(30), (req, res) => {
    const o = orders.find((x) => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: "not-found" });
    if (o.status !== "open" && o.status !== "funded") {
      return res.status(409).json({ error: "not-cancellable" });
    }
    o.status = "cancelled";
    persistOrders();
    res.json({ order: publicOrder(o) });
  });

  // Payer polls their order's status by reference.
  router.get("/orders/by-ref/:reference", rateLimit(120), (req, res) => {
    const o = orders.find((x) => x.reference === req.params.reference);
    if (!o) return res.status(404).json({ error: "not-found" });
    res.json({ order: publicOrder(o) });
  });

  return router;
}
