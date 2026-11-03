# Last Flag web · King of the Hill

Playable prototype of the Last Flag frontend. The whole game runs in the browser against a
local simulator (`src/game/store.ts`) that mirrors the contract's state machine: Open → Live →
Armed → Settled, the 96 / 3 / 1 split, the growing minimum, the grace sun, the hazard bell,
the hard cap, banners (trophies) and the chest (royalty). No chain calls yet.

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5173.

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

- `src/game/` simulator, types, formatting. Replace `store.ts` actions with contract calls
  (`deposit`, `tick`, `withdraw`, `claim_prize`) and the view `get_round` to go live.
- `src/scene/` React Three Fiber: terrain, instanced tower, waving flag, tents, sky bound to
  grace, storm (rain, torches, lightning bolts), camera rig.
- `src/ui/` header, HUD plaques, action tray, side panel, Hall of Banners, rules, demo panel,
  strike modal. Fredoka for display, Nunito for body.

## Params (demo)

Minimum 1 NEAR +5% per block, grace 60 s, hazard 5% per bell, hard cap 5 min, mock yield
accrues to the prize while principal is staked. All in `PARAMS` in `src/game/store.ts`.
