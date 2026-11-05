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

## Hosting the keeper

Rounds only end when someone calls `tick()`, so during a demo the keeper has to stay up. The
keeper and the bots are long-running processes configured by env vars only, so they run on a
small VPS or any container host. Every variable is documented in [`.env.example`](.env.example).

Keys: `KEEPER_KEY` and `BOTS` are secrets. Use throwaway testnet accounts. On a container host,
put them in the host's secret store; on a VPS, in `keeper/.env` (git-ignored, never commit it).
For containers the bots read their keys from `BOTS`, a one-line JSON array of `{account, key}`.
Run `pnpm bots setup` locally first, then copy the content of `.bots.testnet.json` into `BOTS`.
Locally, `pnpm bots` still reads `.bots.<network>.json` when `BOTS` is unset.

Both processes catch RPC errors in their loop and retry, so an RPC hiccup only prints a warning.
Missing config or anything else fatal exits non-zero, so the restart policy brings them back.
Each logs a line per new round and an `alive:` line every minute (`HEARTBEAT_MS`).

### Docker Compose (VPS with Docker)

From the repo root:

```bash
cp keeper/.env.example keeper/.env      # fill in the contract, keeper and bot keys
docker compose up -d --build            # keeper + bots, restart: unless-stopped
docker compose up -d --build keeper     # or the keeper alone
docker compose logs -f                  # watch the bells
docker compose down                     # stop
```

### Any container host (Fly.io, Railway, Render, ...)

Build `keeper/Dockerfile` with `keeper/` as the context. The image runs the keeper by default;
for the bots, run a second service from the same image with the command `node src/bots.ts`.

```bash
docker build -t lastflag-keeper keeper
docker run -d --restart unless-stopped --env-file keeper/.env --name lastflag-keeper lastflag-keeper
docker run -d --restart unless-stopped --env-file keeper/.env --name lastflag-bots lastflag-keeper node src/bots.ts
```

On a managed host, point it at the Dockerfile, set `NEAR_NETWORK`, `LASTFLAG_CONTRACT` and
`KEEPER_ACCOUNT` as env vars, set `KEEPER_KEY` (and `BOTS` for the bots service) as secrets,
and run one instance of each. No port or health check is needed: neither process serves HTTP,
so configure it as a worker or background service.

### pm2 (VPS without Docker)

Needs Node 24 and pnpm. Node loads `keeper/.env` itself.

```bash
cd keeper
pnpm install --prod
cp .env.example .env                    # fill in
pm2 start ecosystem.config.cjs          # lastflag-keeper + lastflag-bots
pm2 logs
pm2 save && pm2 startup                 # survive reboots
```
