# lastflag contract

The Last Flag game contract: rounds, deposits, the hazard tick, settlement, withdrawals, and the banner NFTs (NEP-171, token id N = banner of round N). It has no owner and no upgrade key. Params are fixed at `new`.

```bash
cargo test
cargo near build          # deployable wasm (install: cargo install cargo-near)
cargo near deploy <account> with-init-call new json-args '{}' ...
```

`new` with no params uses the testnet demo defaults from `LASTFLAG-DESIGN.md` §3, except a 1 NEAR first block. Pass `{"params": {...}}` to override them. `new` refuses params whose first block can't pay its storage (the pot fee of `min_deposit_start` must cover 1,500 bytes, 0.015 NEAR), and a hard cap above 7 days.

`new` is `#[private]`: only the contract account can call it. Deploy and init in one transaction (`with-init-call` does this), so nobody can initialise first with their own params.

"No owner" holds only once the account's full-access keys are deleted after deploy. Until then, whoever holds a key can redeploy the code and take the funds.

## Methods

| Method | What it does |
| --- | --- |
| `deposit(round_id)` payable | Charges the current minimum and refunds the rest of the attached deposit. Panics, which refunds everything, if the round moved on or the hard cap passed. |
| `tick()` | Allowed after grace, one roll per block. Ends the round on a hazard roll or at the hard cap: mints the banner, pays the ringer, opens the next round. |
| `withdraw(round_id)` | Pulls principal back. Past rounds any time; the current round only if you are not the leader. |
| `claim_prize(token_id)` | Pays the banner's owner the unclaimed tower plus the chest. Refused while the token has approvals (listed for sale). |
| `get_round`, `get_params`, `get_tent`, `get_banner`, `get_banners` | Views. |
| `nft_*` | NEP-171 core, approval, enumeration, metadata. |

Events are NEP-297 logs under standard `lastflag`: `flag_planted`, `bell`, `strike`, `tent_packed`, `prize_claimed`. `nft_mint` goes out on settle.

## Differences from the design doc

- The NFT lives in this contract, not in a separate `trophy` contract. That keeps the owner check in `claim_prize` synchronous and removes the `Settling` retry state.
- `deposit` takes `round_id`, so a flag that lands after the strike is refunded instead of opening the next round.
- There is no yield adapter yet. The tower is fed by fees only.
- The ringer's reward is capped at 10% of the tower.
- The demo starts at 1 NEAR, not 0.1. A 0.1 NEAR first block pays 0.003 NEAR into the tower, too little for a banner's storage.
- Storage is paid from fees, never from principal. Each new tent's storage (at most 133 bytes measured) comes out of that block's pot fee. The first block of every round also sets aside 1,300 bytes (0.013 NEAR) in `storage_reserve` for the banner (at most 1,022 bytes measured). At settle, whatever the banner doesn't use goes into the tower.

## Not done

- near-workspaces sandbox tests: failed-payout callback restore, real block heights and randomness, and `new` rejecting other callers. Unit tests call `new` directly, which skips the `#[private]` check.
- Deploying with `cargo near` has not been tried. A plain `cargo build --target wasm32-unknown-unknown --release` compiles.
- Dependencies are pinned to near-sdk 5.29.1 by `Cargo.lock`, because 5.30 requires rustc 1.95.
