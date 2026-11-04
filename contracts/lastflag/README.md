# lastflag contract

The Last Flag game contract: rounds, deposits, the hazard tick, settlement, withdrawals, and the banner NFTs (NEP-171, token id N = banner of round N). It has no owner and no upgrade key. Params are fixed at `new`.

```bash
cargo test
cargo near build          # deployable wasm (install: cargo install cargo-near)
cargo near deploy <account> with-init-call new json-args '{}' ...
```

`new` with no params uses the testnet demo defaults from `LASTFLAG-DESIGN.md` §3. Pass `{"params": {...}}` to override them.

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
- Storage is paid from the tower: about 72 bytes per new tent and about 840 bytes per banner, roughly 0.0084 NEAR at 1e19 yocto/byte. A round of one 0.1 NEAR demo block ends with a tower of 0.

## Not done

- near-workspaces sandbox tests: failed-payout callback restore, real block heights and randomness.
- Deploying with `cargo near` has not been tried. A plain `cargo build --target wasm32-unknown-unknown --release` compiles.
- Dependencies are pinned to near-sdk 5.29.1 by `Cargo.lock`, because 5.30 requires rustc 1.95.
