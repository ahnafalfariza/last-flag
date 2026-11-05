# Last Flag web · King of the Hill

Playable prototype of the Last Flag frontend. The whole game runs in the browser against a
local simulator (`src/game/store.ts`) that mirrors the contract's state machine: Open → Live →
Armed → Settled, the 96 / 3 / 1 split, the growing minimum, the grace sun, the hazard bell,
the hard cap, banners (trophies) and the chest (royalty). Set a contract and it plays the real
one instead (live mode, below).

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5173.

## Live mode

With `VITE_CONTRACT_ID` set (in `.env.local`), the store is fed by the contract's views, polled
every second, and the actions become transactions signed through
[near-connect](https://github.com/hot-dao/near-connect) (HOT, Meteor, MyNearWallet and others).
`?sim` forces the simulator back. The demo panel becomes a badge with the contract id.

| Variable | Default | |
| --- | --- | --- |
| `VITE_CONTRACT_ID` | unset (simulator) | game contract |
| `VITE_NETWORK` | `testnet` | `testnet`, `mainnet` or `sandbox` |
| `VITE_RPC_URL` | FastNEAR for the network | |
| `VITE_DEV_ACCOUNT`, `VITE_DEV_KEY` | | sandbox only: wallets can't reach a local node |

To play the real contract on your machine: `cd ../keeper && pnpm sandbox`, then `pnpm keeper`,
`pnpm bots`, and here `pnpm dev --mode sandbox` (reads the `.env.sandbox.local` the sandbox
wrote).

What differs from the simulator, because the contract works that way:

- A bid always costs the current minimum. The tray shows one amount; 10% headroom is attached in
  case another bid lands first, and the contract refunds what it didn't charge.
- Claiming a banner pays the tower and the chest together.
- The tower grows from fees and from the contract's mock yield, paid from its funded reserve. Between
  polls the page adds the yield owed, so the prize keeps ticking up. It shows 4 decimals while yield is on.
- Blocks placed before the page opened are drawn with a camper's colour, since the contract keeps
  tents, not a block-by-block history.

## Demo flow (under two minutes)

1. Connect wallet (mock, `ahnaf.testnet`, 25 NEAR).
2. Pick a block, PLANT YOUR FLAG. Your block drops onto the tower, your flag goes up, the sun
   resets to noon.
3. Demo panel, bottom right: `skip to sunset`. Night falls, torches light, rain starts. The
   keeper rings the bell once a block; every bell is a lightning bolt that missed.
4. `5x` speed. Within a few seconds a bolt hits the tower: the strike. The tower scatters, the
   flag holder gets the banner, round N+1 opens.
5. SEE BANNER N: the Hall of Banners. CLAIM THE TOWER, EMPTY THE CHEST. Back on the hill:
   ROUND N SETTLED · TAKE x HOME returns your principal.

Bots (`whale`, `sniper`, `dibs`, `moss`, `pip`, `rook`) plant flags on their own and go quiet
after ~45 blocks so the round converges. Toggle them in the demo panel.

## Look

The hill is the gpt-image-2 render from the design canvas, full bleed, with the HUD over it and
the few things that move drawn on top: name tags anchored to the flag and the tents, a block
that drops onto the tower on every deposit, a lightning bolt per bell, the day/night crossfade,
rain, flash and shake on the strike. Landmark positions live in `src/ui/stage.ts` as fractions
of each render. The low-poly Three.js hill is still in `src/scene/` behind `?scene=3d`.

## Layout

- `src/game/` simulator, types, formatting.
- `src/chain/` live mode: config, a fetch-only RPC for views, the wallet / sandbox-key signer, and
  `live.ts`, which swaps the store's actions for contract calls and polls the views.
- `src/scene/` React Three Fiber: terrain, instanced tower, waving flag, tents, sky bound to
  grace, storm (rain, torches, lightning bolts), camera rig.
- `src/ui/` header, HUD plaques, action tray, side panel, Hall of Banners, rules, demo panel,
  strike modal. Fredoka for display, Nunito for body.

## Params (demo)

Minimum 1 NEAR +5% per block, grace 60 s, hazard 5% per bell, hard cap 5 min, mock yield
accrues to the prize while principal is staked. All in `PARAMS` in `src/game/store.ts`.
