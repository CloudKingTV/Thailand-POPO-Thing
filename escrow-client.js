// ---------------------------------------------------------------------------
// Backend ↔ on-chain escrow bridge (step 2).
//
// Used ONLY in live mode (see the guardrail in payments.js). It lets the
// server, acting as the arbiter (the licensed operator), talk to the deployed
// popo_escrow program: verify a payer actually funded an order on-chain,
// assign the settler who claimed it, and — once the merchant is confirmed
// paid — release the escrowed USDC (or refund on dispute/timeout).
//
// @solana/web3.js and @coral-xyz/anchor are heavy, so they're lazy-imported
// only when live mode initialises. Demo mode never loads them.
//
// This module is written against the deployed program's IDL
// (onchain/target/idl/popo_escrow.json), produced by `anchor build`. Until the
// program is built + deployed and PAY_* env vars are set, live mode stays off
// and none of this runs — by design.
// ---------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let ctx = null; // { connection, program, arbiter, mint, programId }

export function isReady() {
  return ctx !== null;
}

export async function initEscrowClient({ rpcUrl, programId, arbiterSecret, usdcMint, idlPath }) {
  const anchor = await import("@coral-xyz/anchor");
  const { Connection, PublicKey, Keypair } = await import("@solana/web3.js");

  const connection = new Connection(rpcUrl, "confirmed");
  const arbiter = Keypair.fromSecretKey(loadSecret(arbiterSecret));
  const wallet = new anchor.Wallet(arbiter);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const idl = JSON.parse(
    fs.readFileSync(idlPath || path.join(__dirname, "onchain/target/idl/popo_escrow.json"), "utf8")
  );
  const program = new anchor.Program(idl, new PublicKey(programId), provider);

  ctx = {
    anchor,
    connection,
    program,
    arbiter,
    programId: new PublicKey(programId),
    mint: new PublicKey(usdcMint),
    PublicKey,
  };
  return ctx;
}

function loadSecret(secret) {
  // Accept a path to a keypair json, or a JSON array string.
  if (typeof secret === "string" && secret.trim().startsWith("[")) {
    return Uint8Array.from(JSON.parse(secret));
  }
  return Uint8Array.from(JSON.parse(fs.readFileSync(secret, "utf8")));
}

// order id (uuid string) → the 16-byte seed used by the program
function orderSeed(orderId) {
  return Buffer.from(orderId.replace(/-/g, ""), "hex"); // 16 bytes
}

function escrowPda(orderId) {
  return ctx.PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), orderSeed(orderId)],
    ctx.programId
  )[0];
}

// Has the payer actually funded this order's escrow on-chain?
export async function isFunded(orderId) {
  try {
    const acct = await ctx.program.account.escrow.fetch(escrowPda(orderId));
    return acct.mint.equals(ctx.mint) && Number(acct.amount) > 0;
  } catch {
    return false; // account not created yet
  }
}

// Arbiter assigns the settler who claimed the job off-chain.
export async function assignSettler(orderId, settlerPubkey) {
  const { PublicKey } = ctx;
  return ctx.program.methods
    .assignSettler(new PublicKey(settlerPubkey))
    .accounts({ arbiter: ctx.arbiter.publicKey, escrow: escrowPda(orderId) })
    .rpc();
}

// Release escrowed USDC to the settler — call ONLY after the merchant payment
// is verified against the settler's KYC'd proof.
export async function release(orderId, settlerPubkey, payerPubkey) {
  const { PublicKey, anchor } = ctx;
  const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = await import("@solana/spl-token");
  const escrow = escrowPda(orderId);
  const settlerToken = getAssociatedTokenAddressSync(ctx.mint, new PublicKey(settlerPubkey));
  return ctx.program.methods
    .release()
    .accounts({
      authority: ctx.arbiter.publicKey,
      escrow,
      mint: ctx.mint,
      escrowVault: getAssociatedTokenAddressSync(ctx.mint, escrow, true),
      settlerToken,
      payer: new PublicKey(payerPubkey),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

// Refund the payer (dispute resolution or timeout).
export async function refund(orderId, payerPubkey) {
  const { PublicKey } = ctx;
  const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = await import("@solana/spl-token");
  const escrow = escrowPda(orderId);
  return ctx.program.methods
    .refund()
    .accounts({
      authority: ctx.arbiter.publicKey,
      escrow,
      mint: ctx.mint,
      escrowVault: getAssociatedTokenAddressSync(ctx.mint, escrow, true),
      payerToken: getAssociatedTokenAddressSync(ctx.mint, new PublicKey(payerPubkey)),
      payer: new PublicKey(payerPubkey),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}
