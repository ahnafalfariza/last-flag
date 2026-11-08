import { useGame } from '../game/store';
import { near, short } from '../game/format';
import type { Banner, Deposit, FeedEvent, Params, Round, ThunderEvent } from '../game/types';
import { CONTRACT_ID, MARKETPLACE_MSG } from './config';
import { balanceOf, hasContract, toNear, view } from './rpc';
import { panicText, restore, signIn, type Signer } from './signer';

/**
 * Live mode: the store is fed by polling the contract's views and its actions become wallet
 * transactions. The UI doesn't know the difference, except that nothing here can run bots,
 * skip the sun or change speed.
 */

/* ---------- contract JSON ---------- */

type Yocto = string;

interface ParamsJson {
  min_deposit_start: Yocto; growth_bps: number; min_deposit_cap: Yocto; pot_fee_bps: number;
  royalty_fee_bps: number; grace_ms: number; hazard_bps: number; hard_cap_ms: number; keeper_reward: Yocto;
  yield_ppb_per_sec?: number; camp_share_bps?: number;
}
interface RoundJson {
  id: number; opened_at_ms: number; leader: string | null; prize: Yocto; principal_total: Yocto;
  min_deposit: Yocto; blocks: number; last_deposit_at_ms: number; grace_until_ms: number;
  hard_cap_at_ms: number; ticks: number; last_roll: number; tents_pitched: number;
}
interface RoundViewJson { round: RoundJson; status: string; hard_cap_reached: boolean; now_ms: number; yield_reserve?: Yocto }
interface BannerJson {
  token_id: string; owner_id: string;
  banner: {
    prize: Yocto; claimed: boolean; chest: Yocto; chest_taken: Yocto; blocks: number; principal: Yocto;
    duration_ms: number; won_at_ms: number; ended_by_hard_cap: boolean; ticks: number; struck_by: string;
    camp_pool?: Yocto;
  };
}
interface TentJson { account_id: string; amount: Yocto }
interface TokenJson { token_id: string; owner_id: string; approved_account_ids?: Record<string, number> | null }
interface MyTentJson { round_id: number; amount: Yocto }
type TickJson = { Continue: { roll: number } } | { Ended: { round_id: number; winner: string; prize: Yocto } };

const toParams = (p: ParamsJson): Params => ({
  minDepositStart: toNear(p.min_deposit_start),
  growthBps: p.growth_bps,
  minDepositCap: toNear(p.min_deposit_cap),
  potFeeBps: p.pot_fee_bps,
  royaltyFeeBps: p.royalty_fee_bps,
  graceMs: p.grace_ms,
  hazardBps: p.hazard_bps,
  hardCapMs: p.hard_cap_ms,
  // Mock yield, paid from a funded reserve. The UI only reads it to word the rules.
  yieldPerSec: (p.yield_ppb_per_sec ?? 0) / 1e9,
  keeperReward: toNear(p.keeper_reward),
  campShareBps: p.camp_share_bps ?? 0,
});

const toBanner = (b: BannerJson): Banner => ({
  id: Number(b.token_id),
  owner: b.owner_id,
  prize: toNear(b.banner.prize),
  claimed: b.banner.claimed,
  chest: toNear(b.banner.chest),
  chestTaken: toNear(b.banner.chest_taken),
  campPool: toNear(b.banner.camp_pool ?? '0'),
  blocks: b.banner.blocks,
  principal: toNear(b.banner.principal),
  durationMs: b.banner.duration_ms,
  wonAt: b.banner.won_at_ms,
  endedBy: b.banner.ended_by_hard_cap ? 'hard cap' : 'strike',
  ticks: b.banner.ticks,
  struckBy: b.banner.struck_by,
});

/* ---------- state kept between polls ---------- */

let signer: Signer | null = null;
let clockOffset = 0; // chain ms minus local ms
let last: RoundJson | null = null;
let lastView: RoundViewJson | null = null;
let yieldPpb = 0;
let tents: TentJson[] = [];
let myTents: MyTentJson[] = [];
let purseYocto = 0n;
/** Who planted each block we watched land, per round. Blocks from before the page opened are unknown. */
const seen = new Map<number, (string | null)[]>();
let nextId = 1;
const id = () => nextId++;

const chainNow = () => Date.now() + clockOffset;
const C = () => CONTRACT_ID!;
const set = useGame.setState;
const get = useGame.getState;

const pushFeed = (kind: FeedEvent['kind'], text: string) =>
  set((s) => ({ feed: [{ id: id(), at: chainNow(), kind, text }, ...s.feed].slice(0, 40) }));

const who = (account: string | null) => (account && account === get().me ? 'You' : short(account));

const stateOf = (r: RoundJson, now: number): Round['state'] =>
  !r.leader ? 'Open' : now < r.grace_until_ms ? 'Live' : 'Armed';

/**
 * The contract keeps tents, not individual blocks, so the block list the tower and the sounds
 * read is rebuilt: the blocks we saw land carry their planter, older ones borrow a tent owner.
 */
const blocksOf = (r: RoundJson): Deposit[] => {
  const known = seen.get(r.id) ?? [];
  const pool = tents.map((t) => t.account_id);
  const fallback = (i: number) => pool.length ? pool[i % pool.length] : r.leader ?? '';
  const offset = r.blocks - known.length;
  return Array.from({ length: r.blocks }, (_, i) => {
    const k = i - offset;
    const account = (k >= 0 ? known[k] : null) ?? (i === r.blocks - 1 ? r.leader ?? '' : fallback(i));
    return { id: r.id * 1_000_000 + i, account, amount: 0, principal: 0, at: r.opened_at_ms, withdrawn: false };
  });
};

const toRound = (r: RoundJson, now: number): Round => {
  const me = get().me;
  const list = tents.map((t) => ({ account: t.account_id, principal: toNear(t.amount) }));
  // The tent page holds the first 100 campers; make sure your own tent is never missing.
  const mine = myTents.find((t) => t.round_id === r.id);
  if (mine && get().connected && !list.some((t) => t.account === me)) list.push({ account: me, principal: toNear(mine.amount) });
  return {
    id: r.id,
    state: stateOf(r, now),
    leader: r.leader,
    prize: toNear(r.prize),
    principalTotal: toNear(r.principal_total),
    deposits: blocksOf(r),
    minDeposit: toNear(r.min_deposit),
    lastDepositAt: r.leader ? r.last_deposit_at_ms : null,
    graceUntil: r.leader ? r.grace_until_ms : null,
    hardCapAt: r.leader ? r.hard_cap_at_ms : null,
    openedAt: r.opened_at_ms,
    ticks: r.ticks,
    tents: list,
  };
};

/** Past rounds where you still have a tent, for the "take back" buttons. */
const settledRounds = (current: number): Round[] => {
  const me = get().me;
  const banners = get().banners;
  return myTents
    .filter((t) => t.round_id < current)
    .map((t) => {
      const b = banners.find((x) => x.id === t.round_id);
      return {
        id: t.round_id, state: 'Settled', leader: b?.owner ?? null, prize: b?.prize ?? 0, principalTotal: b?.principal ?? 0,
        deposits: [], minDeposit: 0, lastDepositAt: null, graceUntil: null, hardCapAt: null, openedAt: 0,
        ticks: b?.ticks ?? 0, tents: [{ account: me, principal: toNear(t.amount) }], campPool: b?.campPool ?? 0,
      };
    });
};

/* ---------- polling ---------- */

let busy = false;
let slowAt = 0;

async function refreshSlow() {
  const me = get().connected ? get().me : null;
  const [banners, tokens, bal, mine, purse] = await Promise.all([
    view<BannerJson[]>(C(), 'get_banners', { limit: 100 }),
    view<TokenJson[]>(C(), 'nft_tokens', { from_index: '0', limit: 100 }),
    me ? balanceOf(me) : Promise.resolve(null),
    me ? view<MyTentJson[]>(C(), 'get_tents_of', { account_id: me, rounds: 20 }) : Promise.resolve([]),
    // A build of the contract from before the purse doesn't have this view.
    me ? view<Yocto>(C(), 'get_purse', { account_id: me }).catch(() => '0') : Promise.resolve('0'),
  ]);
  myTents = mine;
  purseYocto = BigInt(purse);
  const listed = new Map(tokens.map((t) => [Number(t.token_id), Object.keys(t.approved_account_ids ?? {})]));
  set({
    banners: banners.map((b) => ({ ...toBanner(b), listedWith: listed.get(Number(b.token_id)) ?? [] })).sort((a, b) => a.id - b.id),
    ...(bal !== null ? { balance: toNear(bal) } : {}),
    purse: toNear(purseYocto),
    oneTap: signer?.oneTap() ?? false,
  });
}

async function poll(force = false) {
  if (busy) return;
  busy = true;
  try {
    const v = await view<RoundViewJson>(C(), 'get_round');
    clockOffset = v.now_ms - Date.now();
    lastView = v;
    const r = v.round;
    const prev = last;
    const changed = !prev || prev.id !== r.id || prev.blocks !== r.blocks || prev.tents_pitched !== r.tents_pitched;
    if (changed || force || Date.now() - slowAt > 5000) tents = await view<TentJson[]>(C(), 'get_tents', { round_id: r.id });
    if (force || !prev || prev.id !== r.id || Date.now() - slowAt > 5000) {
      slowAt = Date.now();
      await refreshSlow();
    }

    const now = chainNow();
    const p = get().params;
    const thunder: ThunderEvent[] = [];
    if (prev && prev.id === r.id) {
      if (r.blocks > prev.blocks) {
        const list = seen.get(r.id) ?? [];
        for (let i = prev.blocks; i < r.blocks - 1; i++) list.push(null);
        list.push(r.leader);
        seen.set(r.id, list);
        const n = r.blocks - prev.blocks;
        pushFeed('flag', n === 1
          ? `${who(r.leader)} bid ${near(toNear(prev.min_deposit))} NEAR and took the lead.`
          : `${n} bids landed. ${who(r.leader)} leads.`);
      }
      if (r.ticks > prev.ticks && r.blocks === prev.blocks) {
        thunder.push({ id: id(), at: now, roll: r.last_roll, threshold: p.hazardBps, struck: false, by: 'keeper' });
      }
    }
    if (prev && prev.id !== r.id) {
      const b = get().banners.find((x) => x.id === prev.id);
      thunder.push({ id: id(), at: now, roll: 0, threshold: p.hazardBps, struck: true, by: b?.struckBy ?? 'keeper' });
      if (b) {
        set({ strike: { round: b.id, winner: b.owner, prize: b.prize, blocks: b.blocks, by: b.struckBy ?? '', at: now } });
        pushFeed('strike', `Round ${b.id} is over. ${who(b.owner)} won ${near(b.prize)} NEAR.`);
      }
      pushFeed('open', `Round ${r.id} is open. Bid to take the lead.`);
    }

    last = r;
    set((s) => ({
      now,
      round: toRound(r, now),
      settled: settledRounds(r.id),
      ...(thunder.length ? { thunder: [...thunder.reverse(), ...s.thunder].slice(0, 30), flash: 1 } : {}),
    }));
  } catch (e) {
    console.warn('lastflag poll failed', e);
  } finally {
    busy = false;
  }
}

/**
 * The tower as it stands at `now`: the polled prize plus the mock yield owed since, mirroring
 * the contract's `yield_owed` (per-second rate, stops at the hard cap, capped by the reserve).
 */
const prizeAt = (v: RoundViewJson, now: number) => {
  const r = v.round;
  if (!r.leader || !yieldPpb) return toNear(r.prize);
  const ms = BigInt(Math.max(0, Math.min(now, r.hard_cap_at_ms) - v.now_ms));
  const perSec = (BigInt(r.principal_total) * BigInt(yieldPpb)) / 1_000_000_000n;
  let owed = (perSec * ms) / 1000n;
  const reserve = BigInt(v.yield_reserve ?? '0');
  if (owed > reserve) owed = reserve;
  return toNear(BigInt(r.prize) + owed);
};

/** Between polls: run the clock, grow the tower, fade the flash, and bring the storm in on time. */
function frame() {
  const s = get();
  if (!last) return;
  const now = chainNow();
  const state = stateOf(last, now);
  if (state === 'Armed' && s.round.state === 'Live' && s.round.id === last.id) {
    pushFeed('storm', `Sudden death. Every check has a ${s.params.hazardBps / 100}% chance to end round ${last.id}.`);
  }
  const prize = lastView && lastView.round.id === s.round.id ? prizeAt(lastView, now) : s.round.prize;
  const round = state === s.round.state && prize === s.round.prize ? s.round : { ...s.round, state, prize };
  set({ now, flash: Math.max(0, s.flash - 0.4), round });
}

/* ---------- actions ---------- */

async function send<T>(label: string, fn: (s: Signer) => Promise<T>): Promise<T> {
  if (!signer) throw new Error('Connect a wallet first.');
  set({ pending: label });
  try {
    return await fn(signer);
  } finally {
    set({ pending: null });
    void poll(true);
  }
}

const onSignedIn = (s: Signer) => {
  signer = s;
  set({ me: s.accountId, connected: true });
  void poll(true);
};

export function startLive() {
  set({
    mode: 'live',
    me: '',
    balance: 0,
    connected: false,
    speed: 1,
    botsOn: false,
    keeperOn: false,
    // Shown until the first poll answers.
    round: {
      id: 0, state: 'Open', leader: null, prize: 0, principalTotal: 0, deposits: [], minDeposit: 0,
      lastDepositAt: null, graceUntil: null, hardCapAt: null, openedAt: 0, ticks: 0, tents: [],
    },
    banners: [],
    settled: [],
    thunder: [],
    feed: [{ id: id(), at: 0, kind: 'info', text: `Live on ${CONTRACT_ID}.` }],

    connect: () => {
      signIn().then(onSignedIn, (e) => pushFeed('info', panicText(e)));
    },
    disconnect: () => {
      void signer?.signOut();
      signer = null;
      purseYocto = 0n;
      set({ me: '', connected: false, balance: 0, purse: 0, oneTap: false });
    },

    fundPurse: async (amount) => {
      if (!(amount > 0)) return 'Enter an amount above 0.';
      const yocto = BigInt(Math.round(amount * 1e6)) * 10n ** 18n;
      try {
        await send('purse', (s) => s.call('fund_purse', {}, yocto));
        pushFeed('info', `You put ${near(amount)} NEAR in your purse.`);
        return null;
      } catch (e) {
        return panicText(e);
      }
    },
    withdrawPurse: async () => {
      try {
        await send('purse', (s) => s.call('withdraw_purse', {}, 1n));
        pushFeed('info', 'Your purse went back to your wallet.');
        return null;
      } catch (e) {
        return panicText(e);
      }
    },
    setOneTap: async (on) => {
      try {
        await send('one-tap', (s) => (on ? s.enableOneTap() : s.disableOneTap()));
        set({ oneTap: on });
        pushFeed('info', on ? 'One-tap is on. Purse bids need no wallet popup.' : 'One-tap is off.');
        return null;
      } catch (e) {
        return panicText(e);
      }
    },

    deposit: async (_account, _amount) => {
      if (!last) return 'Still loading the hill.';
      // The contract charges the minimum when the bid lands and refunds the rest, so allow a
      // little headroom in case someone else's bid lands first.
      const minimum = BigInt(last.min_deposit);
      const headroom = (minimum * 110n) / 100n;
      try {
        const roundId = last.id;
        const held = purseYocto;
        const fromPurse = held >= minimum;
        const charged = fromPurse
          ? await send('deposit', (s) => s.bid(roundId, held < headroom ? held : headroom))
          : await send('deposit', (s) => s.call<Yocto>('deposit', { round_id: roundId }, headroom));
        if (fromPurse) {
          pushFeed('info', `Your flag is up. ${near(toNear(charged ?? minimum))} NEAR came out of your purse.`);
          return null;
        }
        pushFeed('info', `Your flag is up. You paid ${near(toNear(charged ?? last!.min_deposit))} NEAR; the rest came back.`);
        return null;
      } catch (e) {
        return panicText(e);
      }
    },
    tick: async () => {
      try {
        const r = await send('tick', (s) => s.call<TickJson>('tick', {}, 0n, 150));
        if (r && 'Continue' in r) pushFeed('thunder', `Your check rolled ${r.Continue.roll}. The round goes on.`);
        if (r && 'Ended' in r) pushFeed('info', `Your check ended round ${r.Ended.round_id}. You earned the keeper reward.`);
      } catch (e) {
        pushFeed('info', panicText(e));
      }
    },
    withdraw: async (roundId) => {
      const amount = roundId === last?.id
        ? toNear(tents.find((t) => t.account_id === get().me)?.amount ?? '0')
        : toNear(myTents.find((t) => t.round_id === roundId)?.amount ?? '0');
      try {
        const ok = await send('withdraw', (s) => s.call<boolean>('withdraw', { round_id: roundId }));
        if (ok === false) throw new Error('The transfer failed, your tent is still standing.');
        pushFeed('tent', `You took back ${near(amount)} NEAR from round ${roundId}.`);
        return amount;
      } catch (e) {
        pushFeed('info', panicText(e));
        return 0;
      }
    },
    // The contract pays the tower and the chest in one claim.
    claimTower: (bannerId) => claim(bannerId),
    emptyChest: (bannerId) => claim(bannerId),

    handOver: async (bannerId, to) => {
      try {
        await send('hand over', (s) => s.call('nft_transfer', { receiver_id: to, token_id: String(bannerId) }, 1n));
        pushFeed('info', `You handed Banner ${bannerId} to ${to}. Its tower and chest went with it.`);
        return null;
      } catch (e) {
        return panicText(e);
      }
    },
    listBanner: async (bannerId, market, price) => {
      const priceYocto = BigInt(Math.round(price * 1e6)) * 10n ** 18n;
      // The approval's storage is paid from this deposit; the contract refunds what it doesn't use.
      try {
        // Only a contract can receive nft_on_approve; a plain account is approved as an agent.
        const isMarket = await hasContract(market).catch(() => { throw new Error(`${market} doesn't exist.`); });
        await send('list', (s) => s.call('nft_approve', {
          token_id: String(bannerId),
          account_id: market,
          ...(isMarket ? { msg: MARKETPLACE_MSG.replace('{price}', priceYocto.toString()) } : {}),
        }, 10n ** 22n, 150));
        pushFeed('info', `Banner ${bannerId} is listed on ${market} for ${price} NEAR.`);
        return null;
      } catch (e) {
        return panicText(e);
      }
    },
    unlistBanner: async (bannerId) => {
      try {
        await send('unlist', (s) => s.call('nft_revoke_all', { token_id: String(bannerId) }, 1n));
        pushFeed('info', `Banner ${bannerId} is off the market. You can claim it again.`);
        return null;
      } catch (e) {
        return panicText(e);
      }
    },
  });

  const claim = async (bannerId: number) => {
    try {
      await send('claim', (s) => s.call<boolean>('claim_prize', { token_id: String(bannerId) }));
      pushFeed('info', `You collected what Banner ${bannerId} held.`);
    } catch (e) {
      pushFeed('info', panicText(e));
    }
  };

  view<ParamsJson>(C(), 'get_params').then((p) => { yieldPpb = p.yield_ppb_per_sec ?? 0; set({ params: toParams(p) }); }, (e) => console.warn(e));
  restore().then((s) => s && onSignedIn(s));
  void poll(true);
  const polling = setInterval(() => void poll(), 1000);
  const clock = setInterval(frame, 100);
  return () => { clearInterval(polling); clearInterval(clock); };
}
