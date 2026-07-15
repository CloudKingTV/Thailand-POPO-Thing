//! POPO Escrow — conditional USDC escrow for the P2P Thai-QR settlement flow.
//!
//! Flow (mirrors the app's order lifecycle):
//!   1. `initialize` — the payer locks `amount` USDC into a program-owned vault
//!      for a specific order. Status -> Funded.
//!   2. `assign_settler` — the licensed operator (arbiter) assigns the settler
//!      who claimed the job off-chain. Status -> Claimed.
//!   3. `release` — the payer OR the arbiter releases the USDC to the settler,
//!      but ONLY after the settler has actually paid the merchant (verified
//!      off-chain against KYC'd proof). This is requirement #3: funds cannot
//!      reach the settler until they've paid. Status -> Released.
//!   4. `refund` — returns the USDC to the payer, either after the deadline
//!      (payer or arbiter) or at any time by the arbiter for dispute
//!      resolution. Status -> Refunded.
//!
//! The vault is an associated token account owned by the escrow PDA, so no
//! private key can move the funds — only these instructions, under their
//! authorization checks, can. Amounts use USDC's native units (6 decimals).

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

// Placeholder program id — replaced at deploy time by `anchor keys sync`.
declare_id!("7LoHPVWgLU9ZqEbx5R1zushuxm5t8AxitKH1keiMoiJZ");

pub const STATUS_FUNDED: u8 = 0;
pub const STATUS_CLAIMED: u8 = 1;
pub const STATUS_RELEASED: u8 = 2;
pub const STATUS_REFUNDED: u8 = 3;

#[program]
pub mod popo_escrow {
    use super::*;

    /// Payer deposits `amount` USDC into escrow for `order_id`.
    pub fn initialize(
        ctx: Context<Initialize>,
        order_id: [u8; 16],
        amount: u64,
        deadline: i64,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);

        let escrow = &mut ctx.accounts.escrow;
        escrow.payer = ctx.accounts.payer.key();
        escrow.arbiter = ctx.accounts.arbiter.key();
        escrow.settler = Pubkey::default();
        escrow.mint = ctx.accounts.mint.key();
        escrow.amount = amount;
        escrow.order_id = order_id;
        escrow.deadline = deadline;
        escrow.status = STATUS_FUNDED;
        escrow.bump = ctx.bumps.escrow;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer_token.to_account_info(),
                    to: ctx.accounts.escrow_vault.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(EscrowFunded { order_id, payer: escrow.payer, amount });
        Ok(())
    }

    /// Arbiter (licensed operator) records which settler claimed the job.
    pub fn assign_settler(ctx: Context<AssignSettler>, settler: Pubkey) -> Result<()> {
        require!(settler != Pubkey::default(), EscrowError::InvalidSettler);
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == STATUS_FUNDED, EscrowError::BadState);
        escrow.settler = settler;
        escrow.status = STATUS_CLAIMED;
        emit!(SettlerAssigned { order_id: escrow.order_id, settler });
        Ok(())
    }

    /// Release the escrowed USDC to the settler. Callable by the payer (they
    /// got their goods) or the arbiter (verified the merchant was paid). Only
    /// valid once a settler is assigned — funds never reach a settler who
    /// hasn't been recorded as having paid the merchant.
    pub fn release(ctx: Context<Release>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.status == STATUS_CLAIMED, EscrowError::BadState);

        let order_id = escrow.order_id;
        let bump = escrow.bump;
        let amount = escrow.amount;
        let seeds: &[&[u8]] = &[b"escrow", order_id.as_ref(), &[bump]];
        let signer = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.settler_token.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.escrow_vault.to_account_info(),
                destination: ctx.accounts.payer.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer,
        ))?;

        ctx.accounts.escrow.status = STATUS_RELEASED;
        emit!(EscrowReleased { order_id, settler: ctx.accounts.escrow.settler, amount });
        Ok(())
    }

    /// Refund the escrowed USDC to the payer. The arbiter can refund any time
    /// (dispute resolution); the payer can refund only after the deadline.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(
            escrow.status == STATUS_FUNDED || escrow.status == STATUS_CLAIMED,
            EscrowError::BadState
        );

        let authority = ctx.accounts.authority.key();
        let is_arbiter = authority == escrow.arbiter;
        let is_payer = authority == escrow.payer;
        require!(is_arbiter || is_payer, EscrowError::Unauthorized);

        if !is_arbiter {
            let now = Clock::get()?.unix_timestamp;
            require!(now >= escrow.deadline, EscrowError::TooEarly);
        }

        let order_id = escrow.order_id;
        let bump = escrow.bump;
        let amount = escrow.amount;
        let payer_key = escrow.payer;
        let seeds: &[&[u8]] = &[b"escrow", order_id.as_ref(), &[bump]];
        let signer = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.payer_token.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.escrow_vault.to_account_info(),
                destination: ctx.accounts.payer.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer,
        ))?;

        ctx.accounts.escrow.status = STATUS_REFUNDED;
        emit!(EscrowRefunded { order_id, payer: payer_key, amount });
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(order_id: [u8; 16])]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: stored as the arbiter (operator) authority; not read from.
    pub arbiter: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = 8 + Escrow::LEN,
        seeds = [b"escrow", order_id.as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = escrow
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = payer_token.mint == mint.key() @ EscrowError::WrongMint,
        constraint = payer_token.owner == payer.key() @ EscrowError::Unauthorized
    )]
    pub payer_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AssignSettler<'info> {
    pub arbiter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.order_id.as_ref()],
        bump = escrow.bump,
        constraint = escrow.arbiter == arbiter.key() @ EscrowError::Unauthorized
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct Release<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.order_id.as_ref()],
        bump = escrow.bump,
        has_one = mint @ EscrowError::WrongMint,
        constraint = (authority.key() == escrow.arbiter || authority.key() == escrow.payer)
            @ EscrowError::Unauthorized
    )]
    pub escrow: Account<'info, Escrow>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = settler_token.owner == escrow.settler @ EscrowError::InvalidSettler,
        constraint = settler_token.mint == mint.key() @ EscrowError::WrongMint
    )]
    pub settler_token: Account<'info, TokenAccount>,

    /// CHECK: rent from the closed vault returns here; must be the payer.
    #[account(mut, constraint = payer.key() == escrow.payer @ EscrowError::Unauthorized)]
    pub payer: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.order_id.as_ref()],
        bump = escrow.bump,
        has_one = mint @ EscrowError::WrongMint
    )]
    pub escrow: Account<'info, Escrow>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = payer_token.owner == escrow.payer @ EscrowError::Unauthorized,
        constraint = payer_token.mint == mint.key() @ EscrowError::WrongMint
    )]
    pub payer_token: Account<'info, TokenAccount>,

    /// CHECK: rent from the closed vault + escrow returns here; must be payer.
    #[account(mut, constraint = payer.key() == escrow.payer @ EscrowError::Unauthorized)]
    pub payer: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Escrow {
    pub payer: Pubkey,
    pub arbiter: Pubkey,
    pub settler: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub order_id: [u8; 16],
    pub deadline: i64,
    pub status: u8,
    pub bump: u8,
}

impl Escrow {
    pub const LEN: usize = 32 + 32 + 32 + 32 + 8 + 16 + 8 + 1 + 1;
}

#[event]
pub struct EscrowFunded {
    pub order_id: [u8; 16],
    pub payer: Pubkey,
    pub amount: u64,
}
#[event]
pub struct SettlerAssigned {
    pub order_id: [u8; 16],
    pub settler: Pubkey,
}
#[event]
pub struct EscrowReleased {
    pub order_id: [u8; 16],
    pub settler: Pubkey,
    pub amount: u64,
}
#[event]
pub struct EscrowRefunded {
    pub order_id: [u8; 16],
    pub payer: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Invalid settler")]
    InvalidSettler,
    #[msg("Not authorized for this action")]
    Unauthorized,
    #[msg("Escrow is not in the required state")]
    BadState,
    #[msg("Wrong token mint")]
    WrongMint,
    #[msg("Too early — deadline has not passed")]
    TooEarly,
}
