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
| `withdraw(round_id)` | Pulls principal back. Past rounds any time, with the tent's part of the camp pool; the current round only if you are not the leader, which gives up that part. |
| `bid(round_id, max)` | Plants a flag from the caller's purse for the current minimum, refused if that is above `max`. Takes no deposit, so a function-call key can sign it. |
| `fund_purse()` payable | Adds the attached NEAR to the caller's purse, less the entry's storage on the first top-up. |
| `withdraw_purse(amount?)` payable | Takes NEAR out of the purse, all of it by default. Needs 1 yocto, so a function-call key can't call it. |
| `get_purse(account_id)` | The account's purse. |
| `claim_prize(token_id)` | Pays the banner's owner the unclaimed tower plus the chest. Refused while the token has approvals (listed for sale). |
| `fund_yield()` payable | Adds the attached NEAR to the mock-yield reserve. Anyone can call it. |
| `get_round`, `get_params`, `get_tent`, `get_banner`, `get_banners` | Views. `get_round` carries the latest bell's `last_roll`, the yield reserve, and a `prize` that already includes the yield owed up to now. |
| `get_tents(round_id, from_index?, limit?)` | Standing tents of a round in pitch order, 100 per page. |
| `get_tents_of(account_id, rounds?)` | One account's standing tents in the current round and the 10 (up to 100) before it. |
| `nft_*` | NEP-171 core, approval, enumeration, metadata. |
| `nft_payout`, `nft_transfer_payout` | NEP-199, so marketplaces can sell banners. The seller gets the whole price: a banner's royalty is its chest, which the next round pays. The sale clears every approval, so the buyer can claim right away. |

Events are NEP-297 logs under standard `lastflag`: `flag_planted`, `bell`, `strike`, `tent_packed`, `prize_claimed`, `yield_funded`, `purse_funded`, `purse_withdrawn`. `nft_mint` goes out on settle.

## Camp share

`camp_share_bps` of the tower, after the ringer's reward, moves into the banner's `camp_pool` at settle. The demo default is 2,000, 20%, and `new` refuses more than 50%. A tent still standing takes `camp_pool * tent / banner.principal` when it withdraws from the finished round. `banner.principal` counts only the tents standing at the strike, so a mid-round pack-up gets nothing. Rounding is down, and `camp_paid` caps the total at the pool.

## Mock yield

The design doc's `MockYield` stands in for real staking. Liquid staking exists on testnet, but unstaking takes 24 to 28 hours, which would break instant pack-up, and a 5 minute round would earn dust. Each second a flag is up, `yield_ppb_per_sec` parts per billion of the round's principal move from the yield reserve into the tower. The demo default is 20,000, so 20 NEAR camped earns about 0.12 NEAR in 5 minutes. Yield accrues until the hard cap and stops there, so a round that nobody ends stops earning. The banner records what its round earned in `yield_earned`.

The reserve is real NEAR, topped up with `fund_yield`. It is only ever paid into towers, never mixed with principal. When it runs dry, yield stops, so the contract can never promise more than it holds. Set `yield_ppb_per_sec` to 0 to turn yield off. The cap is 1,000,000, which is 0.1% a second.

## Differences from the design doc

- The NFT lives in this contract, not in a separate `trophy` contract. That keeps the owner check in `claim_prize` synchronous and removes the `Settling` retry state.
- `deposit` takes `round_id`, so a flag that lands after the strike is refunded instead of opening the next round.
- The yield adapter is a funded mock (above), not liquid staking. The mainnet adapter is still the design doc's open question.
- The ringer's reward is capped at 10% of the tower.
- The demo starts at 1 NEAR, not 0.1. A 0.1 NEAR first block pays 0.003 NEAR into the tower, too little for a banner's storage.
- Storage is paid from fees, never from principal. Each new tent's storage, with its index entry so tents can be listed (at most 254 bytes measured), comes out of that block's pot fee. The first block of every round also sets aside 1,300 bytes (0.013 NEAR) in `storage_reserve` for the banner (at most 1,022 bytes measured). At settle, whatever the banner doesn't use goes into the tower.

## Failed payouts

`withdraw`, `withdraw_purse` and `claim_prize` zero the ledger entry, then transfer. If the
transfer fails, `on_payout` puts the tent (and the round's `principal_total`, if it is the current
round), the purse, or the banner's tower and chest back. A tent gets its principal back and
`camp_paid` drops by its share, which is worked out again on the next withdraw. If the strike landed
while a mid-round pack-up was in flight, the principal goes to the account's purse instead, because
`banner.principal` doesn't count that tent and it must not take a share. A transfer only fails if the receiver is gone, and the receiver is
always the caller, so the e2e tests in `../../keeper` use `../vanisher`: a contract that calls the
game and deletes its own account in the same receipt. The deletion runs a block before the payout
can land, so the transfer fails every time. The tests check both paths: a tent withdrawn from the
current round, and a banner claim with an unclaimed tower and a chest.

## Not done

- Dependencies are pinned to near-sdk 5.29.1 by `Cargo.lock`, because 5.30 requires rustc 1.95.
