import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Account, KeyPair, type KeyPairString } from 'near-api-js';
import { CONTRACT, env, NETWORK, nearStr, provider, reason, role, sleep, view, yocto, type RoundView } from './lib.ts';

/**
 * Demo players for a live round, the same cast as the simulator: whale bids big when the tower
 * passes a threshold, sniper waits for the storm, the crowd arrives at random. They go quiet after
 * ~45 blocks so the round converges. When a new round opens they withdraw their principal from
 * every finished one, so they can keep playing.
 *
 *   pnpm bots setup   create whale/sniper/dibs/moss/pip/rook as sub-accounts of FUNDER_ACCOUNT,
 *                     BOT_FUND NEAR each (default 15), keys saved to .bots.<network>.json
 *   pnpm bots         play
 *
 * On the sandbox, `pnpm sandbox` creates the bots and this needs no setup.
 */

const NAMES = ['whale', 'sniper', 'dibs', 'moss', 'pip', 'rook'];
const FILE = new URL(`../.bots.${NETWORK}.json`, import.meta.url);

interface BotKey { account: string; key: string }

const loadBots = (): BotKey[] => {
  if (env.BOTS) return JSON.parse(env.BOTS) as BotKey[];
  if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, 'utf8')) as BotKey[];
  throw new Error(`No bots yet. Run \`pnpm bots setup\` with FUNDER_ACCOUNT set.`);
};

async function setup() {
  const funder = role('FUNDER');
  const fund = yocto(Number(env.BOT_FUND ?? 15));
  const bots: BotKey[] = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : [];
  for (const name of NAMES) {
    const account = `${name}.${funder.accountId}`;
    if (bots.some((b) => b.account === account)) continue;
    const kp = KeyPair.fromRandom('ed25519');
    await funder.createAccount({ newAccountId: account, publicKey: kp.getPublicKey().toString(), nearToTransfer: fund });
    bots.push({ account, key: kp.toString() });
    writeFileSync(FILE, JSON.stringify(bots, null, 2));
    console.log(`created ${account} with ${nearStr(fund)} NEAR`);
  }
  console.log(`bots saved to ${FILE.pathname}`);
}

async function play() {
  const bots = loadBots().map((b) => ({ name: b.account.split('.')[0], acc: new Account(b.account, provider, b.key as KeyPairString) }));
  const byName = (n: string) => bots.find((b) => b.name === n);
  const crowd = bots.filter((b) => !['whale', 'sniper'].includes(b.name));
  console.log(`${bots.length} bots on ${NETWORK}, contract ${CONTRACT()}`);

  let whaleAt = 0;
  let round = 0;
  let bids = 0;
  let lastBeat = 0;
  const STEP_MS = 1000;
  const HEARTBEAT_MS = Number(env.HEARTBEAT_MS ?? 60_000);

  const bid = async (bot: (typeof bots)[number], r: RoundView['round']) => {
    // Attach 3x for the whale: the contract still charges the minimum and refunds the rest.
    const attach = (BigInt(r.min_deposit) * (bot.name === 'whale' ? 300n : 110n)) / 100n;
    try {
      await bot.acc.callFunction({ contractId: CONTRACT(), methodName: 'deposit', args: { round_id: r.id }, deposit: attach, gas: 100n * 10n ** 12n });
      bids++;
      console.log(`round ${r.id}: ${bot.name} bid ${nearStr(r.min_deposit)} (block ${r.blocks + 1})`);
    } catch (e) {
      console.warn(`${bot.name} bid failed: ${reason(e)}`);
    }
  };

  // A failed withdrawal leaves the tent listed, so the next round's sweep retries it. The first
  // sweep runs at startup and collects anything left from before a restart.
  const packUp = async (current: number) => {
    for (const bot of bots) {
      try {
        const tents = await view<{ round_id: number; amount: string }[]>('get_tents_of', { account_id: bot.acc.accountId, rounds: 20 });
        for (const t of tents.filter((tent) => tent.round_id < current)) {
          await bot.acc.callFunction({ contractId: CONTRACT(), methodName: 'withdraw', args: { round_id: t.round_id }, gas: 100n * 10n ** 12n });
          console.log(`round ${t.round_id}: ${bot.name} withdrew ${nearStr(t.amount)}`);
        }
      } catch (e) {
        console.warn(`${bot.name} withdraw failed: ${reason(e)}`);
      }
    }
  };

  for (;;) {
    await sleep(STEP_MS);
    let v: RoundView;
    try { v = await view<RoundView>('get_round'); } catch (e) { console.warn(reason(e)); continue; }
    const r = v.round;
    if (r.id !== round) {
      round = r.id;
      whaleAt = 0.05;
      console.log(`round ${r.id}: ${v.status}`);
      await packUp(r.id);
      continue; // the sweep takes a while, so read the round again before bidding
    }
    if (Date.now() - lastBeat >= HEARTBEAT_MS) {
      console.log(`alive: round ${r.id} ${v.status}, leader ${r.leader ?? 'none'}, ${bids} bids so far`);
      lastBeat = Date.now();
    }
    if (v.hard_cap_reached) continue;
    const dt = STEP_MS / 1000;
    const quiet = r.blocks > 45 ? 0.3 : 1;
    const roll = Math.random();
    const prize = Number(BigInt(r.prize) / 10n ** 18n) / 1e6;
    const leaderName = r.leader?.split('.')[0];
    const pick = () => crowd[Math.floor(Math.random() * crowd.length)];

    if (v.status === 'Open') {
      if (roll < 0.25 * dt) await bid(pick(), r);
      continue;
    }
    const stormAge = v.now_ms - r.grace_until_ms;
    const sniper = byName('sniper');
    if (sniper && v.status === 'Armed' && stormAge > 12_000 && leaderName !== 'sniper' && roll < 0.03 * dt * quiet) {
      await bid(sniper, r);
      continue;
    }
    const whale = byName('whale');
    if (whale && prize > whaleAt && leaderName !== 'whale' && roll < 0.5 * dt * quiet) {
      await bid(whale, r);
      whaleAt = prize + 0.08;
      continue;
    }
    const graceLeft = r.grace_until_ms - v.now_ms;
    const rate = (v.status === 'Armed' ? 0.008 : graceLeft < 15_000 ? 0.05 : 0.025) * quiet;
    if (roll < rate * dt) {
      const b = pick();
      if (b.name !== leaderName) await bid(b, r);
    }
  }
}

// As PID 1 in a container, node ignores SIGTERM unless it has a handler.
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(0));

if (process.argv[2] === 'setup') await setup();
else await play();
