import { CONTRACT, NETWORK, nearStr, reason, role, RPC_URL, sleep, view, type RoundView, type TickResult } from './lib.ts';

/**
 * Rings the bell: calls tick() once per block while the storm is up. Anyone can run one; the
 * ringer whose roll brings the strike gets the keeper reward. The contract allows one roll per
 * block, so a faster loop only wastes gas.
 *
 *   KEEPER_ACCOUNT=me.testnet LASTFLAG_CONTRACT=lastflag.testnet pnpm keeper
 */

const keeper = role('KEEPER');
const BLOCK_MS = Number(process.env.KEEPER_INTERVAL_MS ?? 1100);
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 60_000);

// As PID 1 in a container, node ignores SIGTERM unless it has a handler.
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(0));

console.log(`keeper ${keeper.accountId} on ${NETWORK}, contract ${CONTRACT()}, rpc ${RPC_URL}`);

let lastRound = 0;
let lastBeat = 0;
let bells = 0;
for (;;) {
  try {
    const v = await view<RoundView>('get_round');
    const r = v.round;
    if (r.id !== lastRound) {
      console.log(`round ${r.id}: ${v.status}`);
      lastRound = r.id;
    }
    if (Date.now() - lastBeat >= HEARTBEAT_MS) {
      // One line a minute even when nothing happens, so the host's logs show the keeper is alive.
      console.log(`alive: round ${r.id} ${v.status}, ${r.ticks} bells, prize ${nearStr(r.prize)} NEAR, ${bells} rung by us`);
      lastBeat = Date.now();
    }
    if (v.status !== 'Armed' && !v.hard_cap_reached) {
      // Sleep until the sun sets, but wake up for new rounds and bids.
      const wait = r.leader ? Math.min(5000, Math.max(250, r.grace_until_ms - v.now_ms)) : 3000;
      await sleep(wait);
      continue;
    }
    const res = (await keeper.callFunction({ contractId: CONTRACT(), methodName: 'tick', args: {}, gas: 150n * 10n ** 12n })) as TickResult;
    bells++;
    if ('Ended' in res) {
      console.log(`STRIKE round ${res.Ended.round_id}: ${res.Ended.winner} wins ${nearStr(res.Ended.prize)} NEAR`);
    } else {
      console.log(`bell ${r.ticks + 1}: roll ${res.Continue.roll}`);
    }
  } catch (e) {
    const why = reason(e);
    // Races with other keepers and bids are normal; anything else is worth printing.
    if (!/already rang|sun is still up|no flag/.test(why)) console.warn(`tick failed: ${why}`);
  }
  await sleep(BLOCK_MS);
}
