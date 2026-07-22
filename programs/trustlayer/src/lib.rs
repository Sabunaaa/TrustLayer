use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

declare_id!("3RboLzPe7dQf6S8YdC9ecmhDT2KdyU4MuS2ybwyaHMan");

pub const ESCROW_SEED: &[u8] = b"escrow";
pub const VAULT_SEED: &[u8] = b"vault";

#[program]
pub mod trustlayer {
    use super::*;

    /// Seller opens an escrow for a given listing (`escrow_id`) and locks in the
    /// agreed `amount` of the SPL token (USDC/Demo USDC). No buyer is required
    /// yet - whoever deposits first becomes the buyer for this escrow.
    pub fn initialize_escrow(ctx: Context<InitializeEscrow>, escrow_id: u64, amount: u64) -> Result<()> {
        require!(amount > 0, TrustLayerError::InvalidAmount);

        let escrow = &mut ctx.accounts.escrow;
        escrow.seller = ctx.accounts.seller.key();
        escrow.buyer = None;
        escrow.mint = ctx.accounts.mint.key();
        escrow.amount = amount;
        escrow.escrow_id = escrow_id;
        escrow.status = EscrowStatus::Created;
        escrow.bump = ctx.bumps.escrow;
        escrow.vault_bump = ctx.bumps.vault;

        Ok(())
    }

    /// Buyer locks the agreed amount into the PDA-owned vault. The platform
    /// never custodies funds directly - only the on-chain program controls
    /// the vault authority.
    pub fn deposit(ctx: Context<Deposit>) -> Result<()> {
        {
            let escrow = &ctx.accounts.escrow;
            require!(escrow.status == EscrowStatus::Created, TrustLayerError::InvalidStatus);
            require!(
                ctx.accounts.buyer_token_account.mint == escrow.mint,
                TrustLayerError::MintMismatch
            );
        }

        let escrow = &mut ctx.accounts.escrow;
        match escrow.buyer {
            Some(existing) => {
                require!(existing == ctx.accounts.buyer.key(), TrustLayerError::BuyerAlreadySet);
            }
            None => escrow.buyer = Some(ctx.accounts.buyer.key()),
        }

        let amount = escrow.amount;
        let cpi_accounts = Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        ctx.accounts.escrow.status = EscrowStatus::Funded;
        Ok(())
    }

    /// Buyer-authorized release of the vault balance to the seller. This is the
    /// "delivery confirmed" step; for the hackathon MVP delivery itself is
    /// simulated in the UI, but the fund movement here is real.
    pub fn release(ctx: Context<Release>) -> Result<()> {
        let (seller_key, escrow_id, bump, amount, status, buyer) = {
            let escrow = &ctx.accounts.escrow;
            (
                escrow.seller,
                escrow.escrow_id,
                escrow.bump,
                ctx.accounts.vault.amount,
                escrow.status,
                escrow.buyer,
            )
        };

        require!(status == EscrowStatus::Funded, TrustLayerError::InvalidStatus);
        require!(buyer == Some(ctx.accounts.buyer.key()), TrustLayerError::UnauthorizedBuyer);

        let escrow_id_bytes = escrow_id.to_le_bytes();
        let seeds: &[&[u8]] = &[ESCROW_SEED, seller_key.as_ref(), &escrow_id_bytes, &[bump]];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.seller_token_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;

        ctx.accounts.escrow.status = EscrowStatus::Released;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(escrow_id: u64, amount: u64)]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        init,
        payer = seller,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [ESCROW_SEED, seller.key().as_ref(), &escrow_id.to_le_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = seller,
        seeds = [VAULT_SEED, escrow.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = escrow,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.seller.as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(address = escrow.mint)]
    pub mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [VAULT_SEED, escrow.key().as_ref()],
        bump = escrow.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Release<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.seller.as_ref(), &escrow.escrow_id.to_le_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(address = escrow.mint)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [VAULT_SEED, escrow.key().as_ref()],
        bump = escrow.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut, address = escrow.seller)]
    pub seller: SystemAccount<'info>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = seller,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub seller: Pubkey,
    pub buyer: Option<Pubkey>,
    pub mint: Pubkey,
    pub amount: u64,
    pub escrow_id: u64,
    pub status: EscrowStatus,
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq)]
pub enum EscrowStatus {
    Created,
    Funded,
    Released,
}

#[error_code]
pub enum TrustLayerError {
    #[msg("Amount must be greater than zero.")]
    InvalidAmount,
    #[msg("Escrow is not in the expected status for this action.")]
    InvalidStatus,
    #[msg("Only the assigned buyer can perform this action.")]
    UnauthorizedBuyer,
    #[msg("Token mint does not match the escrow mint.")]
    MintMismatch,
    #[msg("Escrow already has a different buyer.")]
    BuyerAlreadySet,
}
