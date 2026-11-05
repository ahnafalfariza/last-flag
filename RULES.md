# Last Flag rules

Everything a player needs to know. The game words are the hill words you see on screen; the
contract word is in brackets.

## The numbers

These are the demo parameters, `Params::demo()` in `contracts/lastflag/src/lib.rs`. A deploy
that calls `new` with no params gets exactly these.

| | Demo value | Contract field |
| --- | --- | --- |
| First bid of a hill | 1 NEAR | `min_deposit_start` |
| Each bid raises the next minimum by | 5% | `growth_bps` = 500 |
| The minimum stops growing at | 5 NEAR | `min_deposit_cap` |
| Share of each bid that goes to the tower | 3% | `pot_fee_bps` = 300 |
| Share of each bid that goes to the last banner's chest | 1% | `royalty_fee_bps` = 100 |
| Share of each bid that is your deposit, returned in full | 96% | the rest |
| The sun: after a bid, nobody can win for | 30 seconds | `grace_ms` = 30000 |
| The storm: chance that one bell brings the strike | 5% | `hazard_bps` = 500 |
| The hill always ends this long after the last bid | 5 minutes | `hard_cap_ms` = 300000 |
| Reward for ringing the bell that strikes | 0.05 NEAR, at most 10% of the tower | `keeper_reward` |

Parameters are fixed when the contract is deployed (`new`). There is no owner, no admin key and
no method that changes them. Anyone can read them with the `get_params` view.

The local sandbox has a faster variant (`FAST=1 pnpm sandbox`): a 10 second sun, 10% per bell
and a 2 minute hard cap. Everything else is the same. The browser simulator uses its own numbers;
see `web/README.md`.

## One hill (round)

1. **The hill opens.** The tower is empty and nobody's flag is up. The first bid costs 1 NEAR.
2. **Bid to take the lead** (deposit). A bid always costs the current minimum. Your flag goes
   on top of the tower and you lead. The minimum grows 5% for the next bid, until it reaches
   5 NEAR (from the 34th bid of a hill on, every bid costs 5 NEAR). You may attach more than
   the minimum; the contract charges the minimum and sends the rest back, so a bid that lands
   just after someone else's still goes through.
3. **The sun** (grace). Every bid puts the sun back to noon: for 30 seconds nobody can win.
   Anyone can outbid the leader, and that resets the sun again.
4. **The storm** (armed). When the sun sets, anyone may ring the bell (`tick()`), once per
   block. Each bell rolls block randomness: 5% chance of a strike, 95% chance of a miss. On
   average that is 20 bells, but there is no countdown to watch: the next bell can always be
   the one. A bid during the storm brings the sun back up.
5. **The strike** (round end). When a bell strikes, whoever has the flag on top wins. If 5
   minutes pass after the last bid, the hill ends on the next bell no matter what, and no more
   bids are accepted.
6. **The next hill** opens at once, starting again at 1 NEAR.

## Where each bid goes

- **96% is your deposit, your tent** (principal). It is never spent. After the hill ends you
  take it home in full with `withdraw`. It stays yours until you do; there is no deadline.
- **3% goes to the tower** (prize). The tower also pays the storage of the game's records: each
  new tent, and on the first bid of a hill, 0.013 NEAR set aside for the banner. Storage left
  unused at the strike goes back into the tower. Your deposit never pays for storage.
- **1% goes to the chest of the previous hill's banner** (royalty). On hill 1 there is no banner
  yet, so this 1% goes to the tower.

## Packing up early (early withdraw)

If you are not on top, you can pack up your tent during the hill and get your 96% back. The fees
you paid stay in the tower and the chest. The flag holder cannot pack up while leading. You can
bid again later; that pitches a new tent.

## The banner (trophy NFT)

The winner gets banner N, a NEP-171 NFT minted by the game contract at the strike. It holds:

- **the tower**: everything the hill's fees put in it, minus the bell ringer's reward;
- **the chest**: 1% of every bid in the next hill. The chest fills until the next hill ends.

Whoever holds the banner calls `claim_prize` to collect the tower and whatever the chest has
gathered since the last claim. It can be called again as the chest fills. The banner is a
standard NEP-171 token, so it can be transferred, and whoever holds it collects. While a banner
has approvals (listed for sale), claims are refused, so a listed banner can't be emptied
mid-sale.

## Ringing the bell (keeper)

Anyone can ring the bell once the sun has set; it only costs gas. Who rings does not change the
roll. The ringer whose bell brings the strike gets 0.05 NEAR from the tower, capped at 10% of
the tower. `keeper/` has a script that rings once per block.

## What you can lose

- The 4% fees on each bid you make (3% tower, 1% chest). Your 96% comes back.
- Time: your deposit is locked while you lead, and stays in the contract until you withdraw it.
- Gas for each transaction.
