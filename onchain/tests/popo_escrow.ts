import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PopoEscrow } from "../target/types/popo_escrow";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import * as crypto from "crypto";

chai.use(chaiAsPromised);
const { assert } = chai;

describe("popo_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.PopoEscrow as Program<PopoEscrow>;
  const conn = provider.connection;

  const payer = (provider.wallet as anchor.Wallet).payer;
  const arbiter = Keypair.generate();
  const settler = Keypair.generate();

  let mint: PublicKey;
  let payerAta: any;
  let settlerAta: any;

  const AMOUNT = 10_000_000; // 10 USDC (6 decimals)

  const orderId = () => Array.from(crypto.randomBytes(16));
  const escrowPda = (id: number[]) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(id)],
      program.programId
    )[0];
  const vaultOf = (escrow: PublicKey) =>
    getAssociatedTokenAddressSync(mint, escrow, true);

  before(async () => {
    await conn.confirmTransaction(
      await conn.requestAirdrop(arbiter.publicKey, 1e9)
    );
    mint = await createMint(conn, payer, payer.publicKey, null, 6);
    payerAta = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
    settlerAta = await getOrCreateAssociatedTokenAccount(conn, payer, mint, settler.publicKey);
    await mintTo(conn, payer, mint, payerAta.address, payer, 1_000_000_000);
  });

  async function initEscrow(id: number[], deadline: number) {
    const escrow = escrowPda(id);
    await program.methods
      .initialize(id, new anchor.BN(AMOUNT), new anchor.BN(deadline))
      .accounts({
        payer: payer.publicKey,
        arbiter: arbiter.publicKey,
        mint,
        escrow,
        escrowVault: vaultOf(escrow),
        payerToken: payerAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return escrow;
  }

  it("funds escrow and holds the USDC in the vault", async () => {
    const id = orderId();
    const escrow = await initEscrow(id, Math.floor(Date.now() / 1000) + 3600);
    const vault = await getAccount(conn, vaultOf(escrow));
    assert.equal(Number(vault.amount), AMOUNT);
    const acct = await program.account.escrow.fetch(escrow);
    assert.equal(acct.status, 0); // Funded
  });

  it("assigns a settler (arbiter only) then releases to them", async () => {
    const id = orderId();
    const escrow = await initEscrow(id, Math.floor(Date.now() / 1000) + 3600);

    // outsider cannot assign
    await assert.isRejected(
      program.methods
        .assignSettler(settler.publicKey)
        .accounts({ arbiter: settler.publicKey, escrow })
        .signers([settler])
        .rpc()
    );

    await program.methods
      .assignSettler(settler.publicKey)
      .accounts({ arbiter: arbiter.publicKey, escrow })
      .signers([arbiter])
      .rpc();

    const before = Number((await getAccount(conn, settlerAta.address)).amount);

    // arbiter releases (having verified the merchant was paid)
    await program.methods
      .release()
      .accounts({
        authority: arbiter.publicKey,
        escrow,
        mint,
        escrowVault: vaultOf(escrow),
        settlerToken: settlerAta.address,
        payer: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([arbiter])
      .rpc();

    const after = Number((await getAccount(conn, settlerAta.address)).amount);
    assert.equal(after - before, AMOUNT);
    const acct = await program.account.escrow.fetch(escrow);
    assert.equal(acct.status, 2); // Released
  });

  it("blocks release before a settler is assigned", async () => {
    const id = orderId();
    const escrow = await initEscrow(id, Math.floor(Date.now() / 1000) + 3600);
    await assert.isRejected(
      program.methods
        .release()
        .accounts({
          authority: arbiter.publicKey,
          escrow,
          mint,
          escrowVault: vaultOf(escrow),
          settlerToken: settlerAta.address,
          payer: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([arbiter])
        .rpc()
    );
  });

  it("arbiter can refund the payer at any time (dispute)", async () => {
    const id = orderId();
    const escrow = await initEscrow(id, Math.floor(Date.now() / 1000) + 3600);
    const before = Number((await getAccount(conn, payerAta.address)).amount);
    await program.methods
      .refund()
      .accounts({
        authority: arbiter.publicKey,
        escrow,
        mint,
        escrowVault: vaultOf(escrow),
        payerToken: payerAta.address,
        payer: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([arbiter])
      .rpc();
    const after = Number((await getAccount(conn, payerAta.address)).amount);
    assert.equal(after - before, AMOUNT);
    assert.equal((await program.account.escrow.fetch(escrow)).status, 3); // Refunded
  });

  it("payer cannot refund before the deadline", async () => {
    const id = orderId();
    const escrow = await initEscrow(id, Math.floor(Date.now() / 1000) + 3600);
    await assert.isRejected(
      program.methods
        .refund()
        .accounts({
          authority: payer.publicKey,
          escrow,
          mint,
          escrowVault: vaultOf(escrow),
          payerToken: payerAta.address,
          payer: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc()
    );
  });
});
