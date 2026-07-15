# POPO Escrow (on-chain)

Conditional USDC escrow (Anchor / Solana) for the P2P Thai-QR settlement flow.
Funds are locked by the payer, held in a program-owned vault, and released to
the settler **only after** the merchant is confirmed paid — or refunded to the
payer on dispute/timeout.

- Program: [`programs/popo_escrow/src/lib.rs`](programs/popo_escrow/src/lib.rs)
- Tests: [`tests/popo_escrow.ts`](tests/popo_escrow.ts) — full lifecycle +
  authorization/negative cases.
- Audit checklist: [`../AUDIT.md`](../AUDIT.md)

## Instructions

| Instruction      | Who              | Effect                                            |
| ---------------- | ---------------- | ------------------------------------------------- |
| `initialize`     | payer            | Deposits USDC into the escrow vault (Funded)      |
| `assign_settler` | arbiter          | Records the settler who claimed the job (Claimed) |
| `release`        | arbiter or payer | Sends USDC to the settler once merchant is paid (Released) |
| `refund`         | arbiter (any time) / payer (after deadline) | Returns USDC to the payer (Refunded) |

The `arbiter` is you — the licensed operator. It's the key that verifies the
settler's KYC'd proof-of-payment before releasing, and that resolves disputes.

## Prerequisites (a real Solana toolchain — not this sandbox)

```bash
# Rust is assumed. Install the Solana + Anchor toolchain:
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"      # solana CLI
cargo install --git https://github.com/coral-xyz/anchor avm --force # anchor version mgr
avm install 0.30.1 && avm use 0.30.1
```

## Build, test on devnet, deploy

```bash
cd onchain
yarn install                     # test deps

anchor keys sync                 # generate the program keypair + patch declare_id!/Anchor.toml
anchor build                     # produces target/deploy/*.so and target/idl/popo_escrow.json

# Local lifecycle tests (spins up a local validator, runs tests/popo_escrow.ts):
anchor test

# Devnet:
solana config set --url devnet
solana airdrop 2                 # fund your deployer wallet
anchor deploy --provider.cluster devnet
anchor idl init --provider.cluster devnet -f target/idl/popo_escrow.json $(solana address -k target/deploy/popo_escrow-keypair.json)
```

`anchor test` must pass and you should run the flow manually on devnet before
going anywhere near mainnet.

## Wire it into the app (live mode)

The server acts as the arbiter. After deploying, set these env vars on the web
service (the guardrail in `payments.js` refuses live mode unless all are set):

```bash
PAY_SETTLEMENT=live
PAY_NETWORK=mainnet                 # or devnet while testing
PAY_ESCROW_PROGRAM=<deployed program id>
PAY_ARBITER=<arbiter pubkey>
PAY_ARBITER_KEYPAIR=/path/to/arbiter.json   # or the JSON array itself
PAY_RPC_URL=<your mainnet RPC endpoint>
PAY_TREASURY=<a real wallet you control>
```

Copy `target/idl/popo_escrow.json` to `onchain/target/idl/` on the server (or
set the path in `escrow-client.js`). With those set, `/api/pay/config` reports
`mode: "live"` and the release endpoint performs the real on-chain transfer.

## Mainnet checklist

1. `anchor test` green; manual devnet run of fund → assign → release and
   fund → refund.
2. **Independent security audit** of `programs/popo_escrow` (see `../AUDIT.md`).
3. Fix findings; re-audit deltas.
4. Deploy to mainnet, then **transfer/lock upgrade authority** (multisig or
   burn) so the program can't be silently changed.
5. Fund the arbiter for fees; secure the arbiter key (HSM/KMS, never in git).
6. Flip `PAY_NETWORK=mainnet`. Start with low per-order caps.
