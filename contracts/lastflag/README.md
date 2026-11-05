# lastflag contract

The Last Flag game contract: rounds, deposits, the hazard tick, settlement, withdrawals, and the banner NFTs (NEP-171, token id N = banner of round N). It has no owner and no upgrade key. Params are fixed at `new`.

```bash
cargo test
RUSTFLAGS='--cfg near' cargo build --target wasm32-unknown-unknown --release   # or: cd ../../keeper && pnpm wasm
cargo near build          # same result, if you have cargo-near
```

The wasm must be built with `--cfg near`. `cargo near` sets it; a plain `cargo build` doesn't, and
then near-sdk compiles its off-chain code paths: the contract deploys and runs, but every panic
message turns into a bare `unreachable` trap. Deploy and integration tests live in `../../keeper`.

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
| `get_round`, `get_params`, `get_tent`, `get_banner`, `get_banners` | Views. `get_round` carries the latest bell's `last_roll`. |
| `get_tents(round_id, from_index?, limit?)` | Standing tents of a round in pitch order, 100 per page. |
| `get_tents_of(account_id, rounds?)` | One account's standing tents in the current round and the 10 (up to 100) before it. |
| `nft_*` | NEP-171 core, approval, enumeration, metadata. |

Events are NEP-297 logs under standard `lastflag`: `flag_planted`, `bell`, `strike`, `tent_packed`, `prize_claimed`. `nft_mint` goes out on settle.

## Differences from the design doc

- The NFT lives in this contract, not in a separate `trophy` contract. That keeps the owner check in `claim_prize` synchronous and removes the `Settling` retry state.
- `deposit` takes `round_id`, so a flag that lands after the strike is refunded instead of opening the next round.
- There is no yield adapter yet. The tower is fed by fees only.
- The ringer's reward is capped at 10% of the tower.
- The demo starts at 1 NEAR, not 0.1. A 0.1 NEAR first block pays 0.003 NEAR into the tower, too little for a banner's storage.
- Storage is paid from fees, never from principal. Each new tent's storage, with its index entry so tents can be listed (at most 254 bytes measured), comes out of that block's pot fee. The first block of every round also sets aside 1,300 bytes (0.013 NEAR) in `storage_reserve` for the banner (at most 1,022 bytes measured). At settle, whatever the banner doesn't use goes into the tower.

## Not done

- No test covers the failed-payout callback restore. A transfer only fails if the receiver is gone, and the receiver is always the caller, so a sandbox test needs a contract account that deletes itself mid-call.
- Not deployed to testnet yet. `keeper/` has `pnpm deploy-game`; the sandbox runs the same wasm.
- Dependencies are pinned to near-sdk 5.29.1 by `Cargo.lock`, because 5.30 requires rustc 1.95.
