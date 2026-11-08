import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Account, JsonRpcProvider } from 'near-api-js';
import { DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY, Sandbox } from 'near-sandbox';
import { SANDBOX_FILE } from './lib.ts';
import { createSub, deployGame, fundYield, WASM } from './deploy.ts';

/**
 * A whole Last Flag world on your machine: a local NEAR node on :3030, the game contract,
 * a player for the browser, a keeper and six bots. Writes the env files the web app, keeper and
 * bots read, then keeps the node running until Ctrl-C.
 *
 *   pnpm sandbox            demo params (30 s grace, 5% hazard, 5 min hard cap)
 *   FAST=1 pnpm sandbox     10 s grace, 10% hazard, 2 min hard cap, faster mock yield
 *
 * The yield reserve starts with 50 NEAR from the sandbox root account.
 */

/** Run a second world next to the first with SANDBOX_PORT=3031 SANDBOX_MODE=sandbox2 (then `pnpm dev --mode sandbox2`). */
const PORT = Number(process.env.SANDBOX_PORT ?? 3030);
const MODE = process.env.SANDBOX_MODE ?? 'sandbox';
const WEB_ENV = fileURLToPath(new URL(`../../web/.env.${MODE}.local`, import.meta.url));
const SCRIPT_ENV = MODE === 'sandbox' ? SANDBOX_FILE : new URL(`../.env.${MODE}.json`, import.meta.url);

const sandbox = await Sandbox.start({ config: { rpcPort: PORT } });
const stop = async () => { await sandbox.tearDown(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

try {
  const provider = new JsonRpcProvider({ url: sandbox.rpcUrl });
  const root = new Account(DEFAULT_ACCOUNT_ID, provider, DEFAULT_PRIVATE_KEY);

  const game = await createSub(root, 'lastflag', 30);
  const params = process.env.FAST
    ? {
        min_deposit_start: '1000000000000000000000000', growth_bps: 500, min_deposit_cap: '5000000000000000000000000',
        pot_fee_bps: 300, royalty_fee_bps: 100, grace_ms: 10_000, hazard_bps: 1000, hard_cap_ms: 120_000,
        keeper_reward: '50000000000000000000000', yield_ppb_per_sec: 50_000, camp_share_bps: 2_000,
      }
    : undefined;
  await deployGame(game.account, WASM, params);
  // Mock yield is paid from a reserve of real NEAR; fund it so the tower grows while players camp.
  await fundYield(root, game.account.accountId, 50);

  const player = await createSub(root, 'player', 100);
  const keeper = await createSub(root, 'keeper', 20);
  const bots = [];
  for (const name of ['whale', 'sniper', 'dibs', 'moss', 'pip', 'rook']) {
    const b = await createSub(root, name, 200);
    bots.push({ account: b.account.accountId, key: b.key });
  }

  writeFileSync(WEB_ENV, [
    '# Written by keeper/src/sandbox.ts. Local-only keys for a throwaway sandbox node.',
    'VITE_NETWORK=sandbox',
    `VITE_RPC_URL=${sandbox.rpcUrl}`,
    `VITE_CONTRACT_ID=${game.account.accountId}`,
    `VITE_DEV_ACCOUNT=${player.account.accountId}`,
    `VITE_DEV_KEY=${player.key}`,
    '',
  ].join('\n'));
  writeFileSync(SCRIPT_ENV, JSON.stringify({
    NEAR_NETWORK: 'sandbox',
    NEAR_RPC_URL: sandbox.rpcUrl,
    LASTFLAG_CONTRACT: game.account.accountId,
    KEEPER_ACCOUNT: keeper.account.accountId,
    KEEPER_KEY: keeper.key,
    BOTS: JSON.stringify(bots),
  }, null, 2));

  console.log(`sandbox up at ${sandbox.rpcUrl}`);
  console.log(`game     ${game.account.accountId}`);
  console.log(`player   ${player.account.accountId} (the browser signs as this account)`);
  console.log(`next:    pnpm keeper · pnpm bots · cd ../web && pnpm dev --mode ${MODE}`);
} catch (e) {
  console.error(e);
  await stop();
}
