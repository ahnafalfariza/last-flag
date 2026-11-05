# Last Flag keeper, bots and local chain

Node 24 scripts (TypeScript run directly, no build) around the `lastflag` contract.

```bash
pnpm install
pnpm wasm      # build the contract wasm (needs --cfg near, the script sets it)
```

## Play the real contract locally

```bash
pnpm sandbox            # local NEAR node on :3030, contract deployed, accounts funded
pnpm keeper             # second terminal: rings the bell once per block in the storm
pnpm bots               # third terminal: whale, sniper and the crowd bid on their own
cd ../web && pnpm dev --mode sandbox
```

`pnpm sandbox` writes `web/.env.sandbox.local` and `keeper/.env.sandbox.json` (both git-ignored)
with the contract id and throwaway keys for `player.sandbox`, `keeper.sandbox` and the bots. The
browser signs as `player.sandbox` with that key, since wallets can't reach a local node.
`FAST=1 pnpm sandbox` uses a 10 s sun, 10% hazard and a 2 minute hard cap. Ctrl-C stops the node
and deletes its state.

## Tests on a real node

```bash
pnpm wasm && pnpm e2e
```

Starts its own sandbox and checks what unit tests can't: `new` refuses other callers, the
refund of the attached excess, early pack-up, a strike from real block randomness, the keeper
reward (capped at 10% of the tower), withdraw and claim transfers, the hard cap, and that a late
flag for a settled round is refunded.

## Testnet

```bash
DEPLOY_ACCOUNT=lastflag.you.testnet pnpm deploy-game        # deploy + init in one tx
KEEPER_ACCOUNT=you.testnet LASTFLAG_CONTRACT=lastflag.you.testnet pnpm keeper
FUNDER_ACCOUNT=you.testnet LASTFLAG_CONTRACT=lastflag.you.testnet pnpm bots setup
LASTFLAG_CONTRACT=lastflag.you.testnet pnpm bots
```

Keys come from `<ROLE>_KEY` or from near-cli's legacy keychain,
`~/.near-credentials/testnet/<account>.json`. `deploy-game` must be signed by the contract
account itself (`new` is private). Pass `LASTFLAG_PARAMS='{...}'` to override the demo params.
`bots setup` creates six sub-accounts of the funder with `BOT_FUND` NEAR each (default 15) and
saves their keys to `.bots.testnet.json`.

Then point the web app at it: `VITE_CONTRACT_ID=lastflag.you.testnet` in `web/.env.local`.
