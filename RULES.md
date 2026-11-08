# Last Flag rules

Everything a player needs to know. The game words are the hill words you see on screen; the
contract word is in brackets.

## The numbers

The live game on `lastflag-v2.testnet` was deployed with the numbers in the Live column. The
Demo column is `Params::demo()` in `contracts/lastflag/src/lib.rs`, which a deploy gets when it
calls `new` with no params, and which the local sandbox uses.

| | Live | Demo | Contract field |
| --- | --- | --- | --- |
| First bid of a hill | 1 NEAR | 1 NEAR | `min_deposit_start` |
| Each bid raises the next minimum by | 2% | 5% | `growth_bps` |
| The minimum stops growing at | 2 NEAR | 5 NEAR | `min_deposit_cap` |
| Share of each bid that goes to the tower | 3% | 3% | `pot_fee_bps` = 300 |
| Share of each bid that goes to the last banner's chest | 1% | 1% | `royalty_fee_bps` = 100 |
| Share of each bid that is your deposit, returned in full | 96% | 96% | the rest |
| The sun: after a bid, nobody can win for | 5 minutes | 30 seconds | `grace_ms` |
| The storm: chance that one bell brings the strike | 5% | 5% | `hazard_bps` = 500 |
| The hill always ends this long after the last bid | 30 minutes | 5 minutes | `hard_cap_ms` |
| Reward for ringing the bell that strikes | 0.05 NEAR, at most 10% of the tower | same | `keeper_reward` |
| Share of the tower split by the tents still standing at the strike | 20% | 20% | `camp_share_bps` = 2000 |
| Mock yield paid into the tower each second, from a funded reserve | 0.002% of deposits | same | `yield_ppb_per_sec` = 20000 |

Parameters are fixed when the contract is deployed (`new`). There is no owner, no admin key and
no method that changes them. Anyone can read them with the `get_params` view. The live game's
mock-yield reserve is not funded, so it pays no yield until someone calls `fund_yield`.

On testnet the demo bots keep each hill going for about 55 minutes and then stop bidding, so a
hill with no other players lasts about an hour. A real bid after that extends it.

The local sandbox has a faster variant (`FAST=1 pnpm sandbox`): a 10 second sun, 10% per bell
and a 2 minute hard cap. Everything else is the same. The browser simulator uses its own numbers;
see `web/README.md`.

## One hill (round)

1. **The hill opens.** The tower is empty and nobody's flag is up. The first bid costs 1 NEAR.
2. **Bid to take the lead** (deposit). A bid always costs the current minimum. Your flag goes
   on top of the tower and you lead. The minimum grows 2% for the next bid, until it reaches
   2 NEAR (from the 37th bid of a hill on, every bid costs 2 NEAR). You may attach more than
   the minimum; the contract charges the minimum and sends the rest back, so a bid that lands
   just after someone else's still goes through.
3. **The sun** (grace). Every bid puts the sun back to noon: for 5 minutes nobody can win.
   Anyone can outbid the leader, and that resets the sun again.
4. **The storm** (armed). When the sun sets, anyone may ring the bell (`tick()`), once per
   block. Each bell rolls block randomness: 5% chance of a strike, 95% chance of a miss. On
   average that is 20 bells, but there is no countdown to watch: the next bell can always be
   the one. A bid during the storm brings the sun back up.
5. **The strike** (round end). When a bell strikes, whoever has the flag on top wins. If 30
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

The tower can also grow from mock yield, paid out of a reserve that anyone can top up with
`fund_yield`. When the reserve is empty, yield stops. It never touches deposits.

## The campfire (camp share)

At the strike, after the ringer's reward, 20% of the tower goes to the campfire and the banner
holds the other 80%. Every tent still standing splits the campfire in proportion to its deposit,
the winner's included. You take your part with your deposit when you `withdraw` from the finished
hill. The fewer tents stay, the bigger each part.

## Packing up early (early withdraw)

If you are not on top, you can pack up your tent during the hill and get your 96% back. You give
up your part of the campfire. The fees you paid stay in the tower and the chest. The flag holder
cannot pack up while leading. You can bid again later; that pitches a new tent.

## The war chest (purse)

You can prefund bids with `fund_purse`. The first top-up pays the purse's small storage out of
what you attach. `bid(round_id, max)` then plants your flag from the purse. It charges the current
minimum like any bid, and refuses if that is above `max`.

Because `bid` takes no deposit, a function-call key limited to that method can sign it, so bids
need no wallet popup. The web app calls this one-tap and keeps that key in your browser. Such a key
can only bid, and can spend at most its 0.25 NEAR gas allowance. `withdraw_purse` takes the NEAR
back out and needs your own full-access key.

## The banner (trophy NFT)

The winner gets banner N, a NEP-171 NFT minted by the game contract at the strike. It holds:

- **the tower**: everything the hill's fees and yield put in it, minus the bell ringer's reward
  and the campfire;
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
