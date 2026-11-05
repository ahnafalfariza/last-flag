# Last Flag

A no-loss last-bidder game on NEAR, played as King of the Hill. Every bid plants your flag on
top of the tower and puts the sun back to noon. When the sun sets a storm rolls in, and every
block the bell rings with a small chance of lightning. When it strikes, the flag on top wins a
banner NFT that holds the tower: the prize, made only of fees. Everyone else takes 96% of every
bid back. The banner then earns 1% of every bid in the next hill. There is a hard cap, no owner
and no admin key, and whoever rings the striking bell gets a small reward.

Full rules with the demo numbers: [RULES.md](RULES.md).

## Try it in 1 minute

The browser simulator runs the whole game locally. No wallet, no chain.

```bash
cd web
pnpm install
pnpm dev
```

Open http://localhost:5173. You'll see:

- The hill in daylight, the tower on the summit with the leader's flag, and the sun timer top
  left. The bots (`whale`, `sniper`, `dibs`, `moss`, `pip`, `rook`) are already bidding.
- Click **CONNECT** (a mock wallet, `ahnaf.testnet` with 25 NEAR), then **Bid ... NEAR and take
  the lead** in the bottom tray. Your block drops onto the tower, your flag goes up, the sun
  resets.
- In the demo panel (bottom right), click **skip to sunset**. Night falls and rain starts. The
  keeper rings the bell; every bell is a lightning bolt that misses.
- Click **5x**. Within seconds a bolt hits the tower: the strike. The winner gets the banner and
  the next hill opens. **Take it** returns your deposit; **See banners** opens the Hall, where
  the banner's owner can claim the tower and empty the chest.
- **How to play** in the header walks through the rules on the game's own pictures.

The simulator uses its own params (a 60 s sun, among others). See [web/README.md](web/README.md).

## Play the real contract locally

This runs the actual wasm on a local NEAR node, with a keeper and bots. Needs Rust with the
`wasm32-unknown-unknown` target, Node 24 and pnpm.

```bash
cd keeper
pnpm install
pnpm wasm        # build the contract (sets --cfg near)
pnpm sandbox     # terminal 1
```

You'll see the RPC URL of a local node on port 3030, the game account and the player account.
The script deploys the contract, funds a player, a keeper and six bots, and writes their
throwaway keys to `web/.env.sandbox.local` and `keeper/.env.sandbox.json` (both git-ignored).
Leave it running. Ctrl-C stops the node and deletes its state.

```bash
cd keeper && pnpm keeper    # terminal 2
```

You'll see `round 1: Open`. Once bids land and the sun sets, it prints `bell N: roll R` once per
block, then `STRIKE round 1: <winner> wins <x> NEAR`.

```bash
cd keeper && pnpm bots      # terminal 3
```

You'll see lines like `round 1: dibs bid <amount> (block 1)`. The whale bids when the tower passes a
threshold, the sniper waits for the storm, the crowd arrives at random. They slow down after
about 45 blocks so the hill ends.

```bash
cd web && pnpm dev --mode sandbox    # terminal 4
```

Open http://localhost:5173. The demo panel is now a **LIVE · sandbox** badge with the contract
id. The hill shows the contract's state, polled every second. **CONNECT** signs in as the
player account with the local key (wallets can't reach a local node), and your bids are real
transactions. Bids, bells and strikes from the bots and keeper show up as they land.

`FAST=1 pnpm sandbox` uses a 10 s sun, 10% per bell and a 2 minute hard cap. More in
[keeper/README.md](keeper/README.md).

## How a hill works

- **The hill** (round) opens empty. The first bid costs 1 NEAR.
- **A bid** (deposit) plants your flag on top: you are the **flag on top** (leader). The next
  minimum grows 5%, capped at 5 NEAR.
- **The sun** (grace) is reset to noon by every bid. While it is up, nobody can win.
- **The storm** (armed) starts at sunset. Anyone may **ring the bell** (`tick()`) once per
  block. Each bell rolls block randomness, with a 5% chance of a strike.
- **The strike** (round end): the flag on top wins. Five minutes after the last bid the hill
  ends on the next bell regardless.
- **Your tent** (principal) holds 96% of each bid. **Pack up** (withdraw) any time you are not on
  top, or after the hill.
- **The tower** (prize) gets 3% of each bid. **The banner** (trophy NFT, NEP-171) holds it.
- **The chest** (royalty) under the previous banner gets 1% of each bid.
- **The ringer** whose bell strikes gets 0.05 NEAR from the tower (keeper reward), at most 10%
  of it.

## Why it isn't a Ponzi

Principal is never spent. 96% of every bid sits in the bidder's own tent in the contract ledger
and goes back to that bidder only. Later players never pay earlier ones. The prize is the 3% fee
from bids in that hill (less storage), and the chest is 1% of bids in the next one. Nobody is
promised a return: a player who doesn't win pays 4% per bid for the chance to win, and gets the
rest back.

## Threat model

- **Block producer bias.** The roll uses `env::random_seed()`, hashed with the round id and bell
  count. The validator producing a block knows its seed before anyone else and can choose to
  include or skip a `tick()` (or produce no block), nudging the strike by a block or so. This
  matters only if that validator, or someone colluding with it, is on top. It is a real, bounded
  bias, not removed. A VRF (OutLayer) would remove it; that is not built.
- **No last second.** There is no deadline in state to snipe and no final block to stuff. After
  the sun sets, every block is equally likely to end the hill.
- **Bell spam.** One roll per block, and who rings doesn't change the roll. Calling `tick()` more
  often wastes gas.
- **Nobody rings.** Anyone can. At the hard cap bids are refused and the next bell ends the hill.
- **Dust spam to keep the sun up.** The minimum grows 5% per bid and every bid pays 4% in fees.
- **Minimum pushed out of reach.** It is capped at 5 NEAR.
- **Leader walks away with the flag.** The leader can't pack up while leading.
- **Late bid after the strike.** `deposit(round_id)` panics if the round moved on, refunding the
  whole bid.
- **Double payout.** Ledger entries are zeroed before the transfer; a callback restores them if
  the transfer fails. No test covers the restore path yet (see the contract README).
- **Draining a banner mid-sale.** `claim_prize` is refused while the token has approvals.
- **Storage eating principal.** Storage is paid from the 3% fee; `new` refuses params whose first
  bid can't cover it.
- **Owner rug.** The contract has no owner, no admin method and no upgrade method. `new` is
  private and runs in the deploy transaction. This holds only after the contract account's
  full-access keys are deleted; until then, whoever holds a key can redeploy.
- **Unaudited.** This is hackathon code.

## Repo layout

```
contracts/lastflag/   Rust game contract (near-sdk 5): rounds, bids, bell, banners (NEP-171)
  src/lib.rs          game logic and Params::demo()
  src/nft.rs          NEP-171 core, approval, enumeration, metadata
  src/tests.rs        unit tests
keeper/               Node 24 scripts: sandbox, keeper, bots, testnet deploy, e2e tests
web/                  Vite + React frontend: simulator and live mode
  src/game/           simulator store, types, formatting
  src/chain/          live mode: RPC views, signer, contract calls
  src/ui/, src/scene/ HUD, Hall of Banners, rules; the hill scene
RULES.md              player rules with the demo numbers
```

Each part has its own README: [contracts/lastflag](contracts/lastflag/README.md) (methods,
events, differences from the design, what's not done), [keeper](keeper/README.md),
[web](web/README.md).

## Tests

```bash
cd contracts/lastflag && cargo test
```

Unit tests of the contract.

```bash
cd keeper && pnpm wasm && pnpm e2e
```

Starts its own sandbox and checks on a real node: `new` refuses other callers, refunds of the
excess, early pack-up, a strike from real block randomness, the keeper reward cap, withdraw and
claim transfers, the hard cap, and the refund of a late bid.

## Deploy to testnet

Not deployed yet. These are the steps:

```bash
cd keeper
pnpm install && pnpm wasm
DEPLOY_ACCOUNT=lastflag.you.testnet pnpm deploy-game        # deploy + init in one tx
KEEPER_ACCOUNT=you.testnet LASTFLAG_CONTRACT=lastflag.you.testnet pnpm keeper
FUNDER_ACCOUNT=you.testnet LASTFLAG_CONTRACT=lastflag.you.testnet pnpm bots setup
LASTFLAG_CONTRACT=lastflag.you.testnet pnpm bots
```

Keys come from `<ROLE>_KEY` or from `~/.near-credentials/testnet/<account>.json`. `deploy-game`
must be signed by the contract account itself. `bots setup` creates six funded sub-accounts and
saves their keys to `keeper/.bots.testnet.json` (git-ignored).

Then delete the contract account's full-access keys, so nobody can redeploy it.

Point the web app at it with `VITE_CONTRACT_ID=lastflag.you.testnet` in `web/.env.local`, then
`pnpm dev` or `pnpm build`. Players sign with a NEAR wallet through near-connect.

## Tracks

- **NFTs That Do Something**: the banner holds the prize, earns a royalty, and carries its
  hill's history in its metadata.
- **Games With Real Economies**: the fees, the growing minimum and the chest are the game loop.
- **Unstoppable DeFi**: no-loss, no owner, no admin key; nobody can stop or change a hill.
- **Open Innovation**: a hidden hazard-rate end instead of a countdown.

## License

MIT. See [LICENSE](LICENSE).
