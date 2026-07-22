# TrustLayer

AI-assisted escrow for peer-to-peer marketplace deals. TrustLayer doesn't try to replace Facebook
Marketplace, Telegram, or Discord — it sits on top of them. A seller shares a TrustLayer link
instead of their bank details; the buyer's payment is locked in a real Solana smart contract, not
held by TrustLayer itself; and an AI model gives an *advisory* trust signal on the listing photos
and, later, on the delivery evidence photo. Funds only move when the buyer releases them on-chain.

Built in a 3-hour hackathon. See [`.cursor/plans/trustlayer_hackathon_mvp_99fae1fa.plan.md`](../.cursor/plans/trustlayer_hackathon_mvp_99fae1fa.plan.md)
for the original scope and timeline.

## How it works

1. **Seller** creates a listing (title, description, price, 1-3 photos). Gemini reviews the
   listing and returns an advisory risk score + reasons. The listing is saved to `localStorage`
   and gets a shareable `/listing/<id>` link.
2. **Seller** connects a wallet and "activates" the listing, which calls `initialize_escrow` on
   the Anchor program, deriving a PDA escrow account and PDA-owned token vault for that listing.
3. **Buyer** opens the link, connects a different wallet, and deposits the listed price in USDC
   (or the demo fallback token) into the vault via the `deposit` instruction.
4. **Seller** simulates delivery by uploading a "proof of delivery" photo. Gemini compares it
   against the original listing photos and flags whether they plausibly show the same item.
5. **Buyer** reviews the comparison result and calls `release`, which pays the seller directly
   from the vault. TrustLayer's backend never touches the funds.

The AI is explicitly advisory: the UI never says "verified safe," and no AI result blocks any
escrow action. See `lib/ai/risk.ts` for the prompts and the deterministic mock fallback used when
no Gemini API key is configured.

## Project layout

- `app/` — Next.js App Router pages: `/` (create listing) and `/listing/[id]` (transaction hub).
- `app/api/analyze/route.ts` — server route wrapping `lib/ai/risk.ts` (Gemini + mock fallback).
- `components/` — UI: trust score card, escrow timeline, image dropzone, wallet button, Explorer links.
- `lib/solana/` — `constants.ts` (RPC/program/token config) and `client.ts` (typed Anchor helpers:
  `createEscrow`, `depositEscrow`, `releaseEscrow`, `fetchEscrow`).
- `lib/storage.ts` — `localStorage`-backed listing persistence for the demo (no backend database).
- `programs/trustlayer/` — the Anchor program (`initialize_escrow`, `deposit`, `release`).
- `tests/trustlayer.ts` — Anchor/Mocha integration tests covering the happy path and key failure cases.
- `target/idl/trustlayer.json`, `target/types/trustlayer.ts` — hand-maintained IDL/types (see
  "Toolchain notes" below for why).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values, see below
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Devnet RPC endpoint (public default works fine). |
| `NEXT_PUBLIC_PROGRAM_ID` | Deployed Anchor program ID. |
| `NEXT_PUBLIC_DEMO_MINT` | SPL token mint used for deposits. Leave blank until you've created/obtained one (see below); the deposit button is disabled without it. |
| `NEXT_PUBLIC_TOKEN_DECIMALS` / `NEXT_PUBLIC_TOKEN_LABEL` | Cosmetic + math config for the token above. |
| `GEMINI_API_KEY` | Enables real Gemini vision analysis. Omit to use the deterministic mock scorer. |
| `MOCK_AI` | Set to `true` to force the mock scorer even with a key set (useful for a guaranteed-reliable demo). |

### Token setup (devnet USDC or Demo USDC)

The escrow accepts any SPL token; the plan's preference order is real devnet USDC, falling back to
a project-owned six-decimal "Demo USDC" mint:

```bash
# Only if the devnet faucet cooperates and you want real devnet USDC:
# find/paste a known devnet USDC mint address into NEXT_PUBLIC_DEMO_MINT.

# Otherwise, mint your own demo token and fund a wallet:
npm run create-demo-mint -- <buyerWalletPubkey> [sellerWalletPubkey...]
# then paste the printed mint address into NEXT_PUBLIC_DEMO_MINT
```

This requires `keys/deployer.json` (the program's deploy keypair) to hold a small amount of devnet
SOL — see "Toolchain notes" if the public faucet is rate-limited.

## Anchor program

```bash
anchor build --no-idl   # see note below on why --no-idl
anchor test --skip-build
anchor deploy --provider.cluster devnet
```

On-chain design (one PDA escrow + one PDA-owned associated token vault per listing):

- `initialize_escrow(id, amount)` — seller-signed. Records seller, buyer slot, mint, amount, sets `Created`.
- `deposit()` — buyer-signed. Transfers `amount` of `mint` from the buyer into the vault, sets `Funded`.
- `release()` — buyer-signed. Transfers the vault balance to the seller's associated token account, sets `Released`.

Enforced invariants (see `tests/trustlayer.ts`): only the recorded buyer can release, deposits must
use the escrow's own mint, and each instruction checks the escrow is in the expected status before
acting.

## Toolchain notes

A few environment quirks came up building this on a sandboxed dev machine; documenting them so a
teammate (or future you) doesn't re-debug the same things:

- **`anchor build`'s automatic IDL generation can fail** on newer nightly Rust toolchains (an
  `anchor-syn` macro depends on an unstable `proc_macro2` API that has since moved). If you hit a
  "could not create temp file" / nightly sync error, build with `anchor build --no-idl` and use the
  hand-written `target/idl/trustlayer.json` / `target/types/trustlayer.ts` in this repo instead of
  regenerating them. Keep both files' account/type names in sync manually if you change `lib.rs`:
  the raw IDL JSON uses Rust's snake_case/PascalCase, but the `.ts` types file must use the
  camelCase names Anchor's JS client actually looks up (`initializeEscrow`, `escrow`, `escrowStatus`, etc).
- **The devnet airdrop faucet rate-limits aggressively** from shared/CI-like IPs. If `solana
  airdrop` keeps failing, retry with delays (see `scripts/` for nothing pre-built here, but a
  simple shell loop with 30-60s sleeps between attempts usually gets through eventually), or use a
  browser-based faucet from a different network.
- Solana CLI keypair generation can fail with "Operation not permitted" if the sandbox blocks
  writes to `~/.config/solana/`. This repo instead keeps a project-local deploy keypair at
  `keys/deployer.json` (gitignored) and points `Anchor.toml`'s `wallet` field at it.

## Demo script (~3 minutes)

1. Explain the problem: P2P deals on Facebook/Telegram/Discord have no neutral settlement layer.
2. Create a listing, show the AI's advisory review (not a verdict).
3. Switch wallets, deposit into escrow, show the vault balance + Explorer transaction proving
   TrustLayer never held the funds.
4. Simulate delivery, upload the evidence photo, show the AI's match assessment.
5. Release funds as the buyer, show the seller's balance change + Explorer transaction.
6. Close: "Next steps are dispute arbitration, shipping-provider attestations, and production
   stablecoin support."
