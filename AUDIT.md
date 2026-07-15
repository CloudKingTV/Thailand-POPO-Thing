# Security audit handoff — POPO Escrow

Before this escrow touches real (mainnet) funds it must pass an **independent
security audit**. A program that custodies money is a target; a single bug can
drain every open escrow. Do not skip this, and do not rely on this document as
the audit — it's the scope/checklist to hand an auditor.

## Scope

- `onchain/programs/popo_escrow/src/lib.rs` — the whole program.
- `escrow-client.js` — the arbiter-side integration (key handling, which
  transactions it signs, when).
- `payments.js` — the order state machine and the boundary where off-chain
  status meets on-chain release/refund.

## Design summary for the auditor

- One `Escrow` PDA per order, seeds `[b"escrow", order_id(16 bytes)]`.
- USDC held in an associated token account owned by the escrow PDA; only the
  program (via PDA signer seeds) can move it.
- State machine: `Funded → Claimed → Released | Refunded`.
- Authorization: `assign_settler` = arbiter only; `release` = arbiter or payer,
  and only in `Claimed`; `refund` = arbiter any time, payer only after
  `deadline`, only in `Funded`/`Claimed`.

## Checklist to verify

- [ ] **Auth**: every instruction checks the right signer; no path lets a third
      party assign, release, or refund. Arbiter compromise blast radius is
      understood.
- [ ] **State transitions**: no double-release / double-refund / release after
      refund; status is checked before every fund movement.
- [ ] **Amount integrity**: released/refunded amount always equals the deposited
      amount; vault can't be partially drained or left with dust; no overflow.
- [ ] **PDA & seeds**: escrow PDA and vault ATA derivations can't be spoofed;
      `has_one`/`constraint` cover mint, payer, settler, vault authority.
- [ ] **Account substitution**: attacker can't pass a fake `settler_token`,
      `payer_token`, `mint`, or `escrow_vault`; all are constrained.
- [ ] **Reinit / replay**: same `order_id` can't reinitialize a live or settled
      escrow; closing the vault (not the state account) prevents replay.
- [ ] **Rent / close**: vault close destination is always the payer; no rent
      griefing.
- [ ] **Deadline**: clock usage is sound; payer refund gate can't be bypassed.
- [ ] **CPI safety**: token program id is validated; no arbitrary CPI.
- [ ] **Upgrade authority**: post-deploy, program upgrade authority is a
      multisig or burned; documented.
- [ ] **Off-chain trust**: `release` still depends on the arbiter honestly
      verifying merchant payment — document this trust assumption and the KYC/
      dispute process around it.

## Operational (outside the audit, still required)

- Arbiter key in an HSM/KMS, never in the repo or plain env on shared hosts.
- Per-order and per-day caps; monitoring/alerting on escrow events.
- Incident runbook: how to pause intake and mass-refund open escrows.
- Legal: the licensing + KYC/AML program you already have, mapped to this flow.
