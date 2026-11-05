import { create } from 'zustand';
import type { Banner, Deposit, FeedEvent, Params, Round, Strike, ThunderEvent } from './types';

/**
 * Local simulator of the Last Flag game contract. Same state machine, same fee split,
 * same hazard tick; wall clock replaced by a game clock that can run faster.
 * Swap this for the real contract (view: get_round, change: deposit/tick/withdraw) later.
 */

export const PARAMS: Params = {
  minDepositStart: 1,
  growthBps: 500,
  minDepositCap: 100,
  potFeeBps: 300,
  royaltyFeeBps: 100,
  graceMs: 60_000,
  hazardBps: 500,
  hardCapMs: 5 * 60_000,
  yieldPerSec: 0.000004,
  keeperReward: 0.05,
};

export const ME = 'ahnaf.testnet';
export const BOTS = ['whale.testnet', 'sniper.testnet', 'dibs.testnet', 'moss.testnet', 'pip.testnet', 'rook.testnet'];

/** Stable color per account, for tents, flags and tags. */
export const accountColor = (account: string) => {
  if (account === ME) return '#2E6FD8';
  const palette = ['#C8362B', '#2F8F5B', '#D98A2B', '#7A4FBF', '#C8A028', '#8C2828', '#1F8F9F'];
  let h = 0;
  for (const c of account) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
};

export type Page = 'hill' | 'hall' | 'rules';

/** `sim` runs the local simulator; `live` reads and writes the deployed contract. */
export type Mode = 'sim' | 'live';

/** Live actions resolve once the transaction lands; the simulator answers at once. */
type Result<T> = T | Promise<T>;

interface Store {
  mode: Mode;
  /** What the wallet is busy with, so buttons can wait. */
  pending: string | null;
  params: Params;
  now: number;
  speed: number;
  botsOn: boolean;
  keeperOn: boolean;
  page: Page;
  me: string;
  balance: number;
  connected: boolean;

  round: Round;
  settled: Round[];
  banners: Banner[];
  thunder: ThunderEvent[];
  feed: FeedEvent[];
  strike: Strike | null;
  flash: number;
  whaleThreshold: number;
  nextTickAt: number;

  connect: () => void;
  setPage: (p: Page) => void;
  setSpeed: (s: number) => void;
  toggleBots: () => void;
  toggleKeeper: () => void;
  skipGrace: () => void;
  dismissStrike: () => void;

  disconnect: () => void;
  deposit: (account: string, amount: number) => Result<string | null>;
  tick: (by: string) => Result<void>;
  withdraw: (roundId: number, account: string) => Result<number>;
  claimTower: (bannerId: number) => Result<void>;
  emptyChest: (bannerId: number) => Result<void>;
  /** Give the banner, tower and chest included, to another account. Resolves to an error or null. */
  handOver: (bannerId: number, to: string) => Result<string | null>;
  /** Approve a marketplace to sell the banner at `price` NEAR. */
  listBanner: (bannerId: number, market: string, price: number) => Result<string | null>;
  /** Revoke every marketplace approval, so the tower and chest can be claimed again. */
  unlistBanner: (bannerId: number) => Result<string | null>;
  advance: (dtMs: number) => void;
}

let nextId = 1000;
const id = () => ++nextId;

const openRound = (roundId: number, now: number, params: Params): Round => ({
  id: roundId,
  state: 'Open',
  leader: null,
  prize: 0,
  principalTotal: 0,
  deposits: [],
  minDeposit: params.minDepositStart,
  lastDepositAt: null,
  graceUntil: null,
  hardCapAt: null,
  openedAt: now,
  ticks: 0,
});

const seed = () => {
  const now = 0;
  const owners = ['dibs.testnet', 'whale.testnet', ME, 'moss.testnet', 'rook.testnet', 'pip.testnet', 'dibs.testnet', 'whale.testnet', 'sniper.testnet', 'moss.testnet', 'dibs.testnet'];
  const banners: Banner[] = owners.map((owner, i) => {
    const n = i + 1;
    const blocks = 18 + ((n * 7) % 30);
    const principal = blocks * 2.1 + n * 3;
    return {
      id: n,
      owner,
      prize: 1.8 + n * 0.37 + (n % 3) * 0.3,
      claimed: n < 11,
      chest: n < 11 ? 1.1 + (n % 4) * 0.35 : 0,
      chestTaken: n < 10 ? 1.1 + (n % 4) * 0.35 : 0,
      blocks,
      principal,
      durationMs: (2 + n * 1.3) * 3_600_000,
      wonAt: -(12 - n) * 86_400_000,
      endedBy: n % 4 === 0 ? 'hard cap' : 'strike',
    };
  });

  const round = openRound(12, now - 40 * 60_000, PARAMS);
  const seedAccounts = ['moss.testnet', 'rook.testnet', 'dibs.testnet', ME, 'pip.testnet', 'whale.testnet', 'moss.testnet', 'sniper.testnet', ME, 'dibs.testnet', 'rook.testnet', 'pip.testnet', 'whale.testnet', 'moss.testnet', 'dibs.testnet', 'sniper.testnet', 'rook.testnet', 'whale.testnet'];
  let t = round.openedAt;
  const lastBanner = banners[banners.length - 1];
  for (const account of seedAccounts) {
    t += 90_000 + Math.random() * 60_000;
    const amount = round.minDeposit * (account === 'whale.testnet' ? 2 : 1);
    const principal = amount * (1 - (PARAMS.potFeeBps + PARAMS.royaltyFeeBps) / 10_000);
    round.deposits.push({ id: id(), account, amount, principal, at: t, withdrawn: false });
    round.prize += amount * PARAMS.potFeeBps / 10_000;
    lastBanner.chest += amount * PARAMS.royaltyFeeBps / 10_000;
    round.principalTotal += principal;
    round.leader = account;
    round.minDeposit = Math.min(PARAMS.minDepositCap, round.minDeposit * (1 + PARAMS.growthBps / 10_000));
  }
  round.prize += round.principalTotal * PARAMS.yieldPerSec * 1800;
  round.state = 'Live';
  round.lastDepositAt = now - 12_000;
  round.graceUntil = round.lastDepositAt + PARAMS.graceMs;
  round.hardCapAt = round.lastDepositAt + PARAMS.hardCapMs;
  return { round, banners };
};

const seeded = seed();

export const useGame = create<Store>((set, get) => ({
  mode: 'sim',
  pending: null,
  params: PARAMS,
  now: 0,
  speed: 1,
  botsOn: true,
  keeperOn: true,
  page: 'rules',
  me: ME,
  balance: 25,
  connected: false,

  round: seeded.round,
  settled: [],
  banners: seeded.banners,
  thunder: [],
  feed: [{ id: id(), at: 0, kind: 'open' as const, text: 'Round 12 is on. Bid to take the lead.' }],
  strike: null,
  flash: 0,
  whaleThreshold: seeded.round.prize + 0.6,
  nextTickAt: 0,

  connect: () => set({ connected: true }),
  disconnect: () => set({ connected: false }),
  setPage: (page) => set({ page }),
  setSpeed: (speed) => set({ speed }),
  toggleBots: () => set((s) => ({ botsOn: !s.botsOn })),
  toggleKeeper: () => set((s) => ({ keeperOn: !s.keeperOn })),
  dismissStrike: () => set({ strike: null }),

  skipGrace: () => {
    const { round, now } = get();
    if (round.state !== 'Live' || round.graceUntil === null) return;
    set({ round: { ...round, graceUntil: now, lastDepositAt: now - get().params.graceMs } });
  },

  deposit: (account, amount) => {
    const s = get();
    const { round, params, now, banners } = s;
    if (round.state === 'Settled') return 'This round just ended. Wait a moment for the next one.';
    if (amount < round.minDeposit - 1e-9) return `Bids must be at least ${round.minDeposit.toFixed(2)} NEAR right now.`;
    if (account === s.me && amount > s.balance) return 'Not enough NEAR in your wallet.';

    const principal = amount * (1 - (params.potFeeBps + params.royaltyFeeBps) / 10_000);
    const toPot = amount * params.potFeeBps / 10_000;
    const royalty = amount * params.royaltyFeeBps / 10_000;
    const dep: Deposit = { id: id(), account, amount, principal, at: now, withdrawn: false };
    const prev = banners.find((b) => b.id === round.id - 1);
    const newBanners = prev
      ? banners.map((b) => (b.id === prev.id ? { ...b, chest: b.chest + royalty } : b))
      : banners;
    const calmed = round.state === 'Armed';
    const next: Round = {
      ...round,
      state: 'Live',
      leader: account,
      prize: round.prize + toPot + (prev ? 0 : royalty),
      principalTotal: round.principalTotal + principal,
      deposits: [...round.deposits, dep],
      minDeposit: Math.min(params.minDepositCap, round.minDeposit * (1 + params.growthBps / 10_000)),
      lastDepositAt: now,
      graceUntil: now + params.graceMs,
      hardCapAt: now + params.hardCapMs,
    };
    const who = account === s.me ? 'You' : account.replace('.testnet', '');
    const text = calmed
      ? `${who} bid ${amount.toFixed(2)} NEAR and took the lead. Bidding is open again.`
      : `${who} bid ${amount.toFixed(2)} NEAR and took the lead.`;
    set({
      round: next,
      banners: newBanners,
      balance: account === s.me ? s.balance - amount : s.balance,
      feed: [{ id: id(), at: now, kind: 'flag' as const, text }, ...s.feed].slice(0, 40),
    });
    return null;
  },

  tick: (by) => {
    const s = get();
    const { round, params, now } = s;
    if (round.state !== 'Armed' || round.hardCapAt === null) return;
    const roll = Math.floor(Math.random() * 10_000);
    const hardCap = now >= round.hardCapAt;
    const struck = hardCap || roll < params.hazardBps;
    const ev: ThunderEvent = { id: id(), at: now, roll, threshold: params.hazardBps, struck, by };
    const ticks = round.ticks + 1;
    if (!struck) {
      set({
        round: { ...round, ticks },
        thunder: [ev, ...s.thunder].slice(0, 30),
        flash: 1,
      });
      return;
    }
    // Settle: mint banner to the leader, credit the prize, open the next round.
    const winner = round.leader ?? by;
    const banner: Banner = {
      id: round.id,
      owner: winner,
      prize: round.prize,
      claimed: false,
      chest: 0,
      chestTaken: 0,
      blocks: round.deposits.length,
      principal: round.principalTotal,
      durationMs: now - round.openedAt,
      wonAt: now,
      endedBy: hardCap ? 'hard cap' : 'strike',
    };
    const settledRound: Round = { ...round, state: 'Settled', ticks };
    const who = winner === s.me ? 'You' : winner.replace('.testnet', '');
        set({
      round: openRound(round.id + 1, now, params),
      settled: [settledRound, ...s.settled].slice(0, 5),
      banners: [...s.banners, banner],
      thunder: [ev, ...s.thunder].slice(0, 30),
      strike: { round: round.id, winner, prize: round.prize, blocks: round.deposits.length, by, at: now },
      flash: 1,
      balance: by === s.me ? s.balance + params.keeperReward : s.balance,
      whaleThreshold: 0.6,
      feed: [
        { id: id(), at: now, kind: 'open' as const, text: `Round ${round.id + 1} is open. Bid to take the lead.` },
        { id: id(), at: now, kind: 'strike' as const, text: `Round ${round.id} is over. ${who} won ${round.prize.toFixed(2)} NEAR.` },
        ...s.feed,
      ].slice(0, 40),
    });
  },

  withdraw: (roundId, account) => {
    const s = get();
    let got = 0;
    const take = (r: Round): Round => {
      if (r.id !== roundId) return r;
      if (r.state !== 'Settled' && r.leader === account) return r;
      const deposits = r.deposits.map((d) => {
        if (d.account !== account || d.withdrawn) return d;
        got += d.principal;
        return { ...d, withdrawn: true };
      });
      return { ...r, deposits, principalTotal: r.state === 'Settled' ? r.principalTotal : r.principalTotal - got };
    };
    const round = take(s.round);
    const settled = s.settled.map(take);
    if (got === 0) return 0;
    const who = account === s.me ? 'You' : account.replace('.testnet', '');
    set({
      round,
      settled,
      balance: account === s.me ? s.balance + got : s.balance,
      feed: [{ id: id(), at: s.now, kind: 'tent' as const, text: `${who} withdrew ${got.toFixed(2)} NEAR from round ${roundId}.` }, ...s.feed].slice(0, 40),
    });
    return got;
  },

  claimTower: (bannerId) => {
    const s = get();
    const b = s.banners.find((x) => x.id === bannerId);
    if (!b || b.claimed || b.owner !== s.me) return;
    set({
      banners: s.banners.map((x) => (x.id === bannerId ? { ...x, claimed: true } : x)),
      balance: s.balance + b.prize,
      feed: [{ id: id(), at: s.now, kind: 'info' as const, text: `You collected the round ${bannerId} prize: ${b.prize.toFixed(2)} NEAR.` }, ...s.feed].slice(0, 40),
    });
  },

  emptyChest: (bannerId) => {
    const s = get();
    const b = s.banners.find((x) => x.id === bannerId);
    if (!b || b.owner !== s.me) return;
    const take = b.chest - b.chestTaken;
    if (take <= 0) return;
    set({
      banners: s.banners.map((x) => (x.id === bannerId ? { ...x, chestTaken: x.chest } : x)),
      balance: s.balance + take,
      feed: [{ id: id(), at: s.now, kind: 'info' as const, text: `You emptied the chest under Banner ${bannerId}: ${take.toFixed(3)} NEAR.` }, ...s.feed].slice(0, 40),
    });
  },

  handOver: (bannerId, to) => {
    const s = get();
    const b = s.banners.find((x) => x.id === bannerId);
    if (!b || b.owner !== s.me) return 'Not your banner.';
    if (!/^[a-z0-9._-]{2,64}$/.test(to)) return 'That is not a NEAR account name.';
    set({
      banners: s.banners.map((x) => (x.id === bannerId ? { ...x, owner: to, listedWith: [] } : x)),
      feed: [{ id: id(), at: s.now, kind: 'info' as const, text: `You handed Banner ${bannerId} to ${to}.` }, ...s.feed].slice(0, 40),
    });
    return null;
  },

  listBanner: (bannerId, market, price) => {
    const s = get();
    const b = s.banners.find((x) => x.id === bannerId);
    if (!b || b.owner !== s.me) return 'Not your banner.';
    if (!(price > 0)) return 'Set a price above 0.';
    set({
      banners: s.banners.map((x) => (x.id === bannerId ? { ...x, listedWith: [market] } : x)),
      feed: [{ id: id(), at: s.now, kind: 'info' as const, text: `You listed Banner ${bannerId} on ${market} for ${price} NEAR.` }, ...s.feed].slice(0, 40),
    });
    return null;
  },

  unlistBanner: (bannerId) => {
    const s = get();
    set({ banners: s.banners.map((x) => (x.id === bannerId ? { ...x, listedWith: [] } : x)) });
    return null;
  },

  advance: (dtMs) => {
    const s = get();
    const now = s.now + dtMs;
    const dt = dtMs / 1000;
    let round = s.round;
    const patch: Partial<Store> = { now, flash: Math.max(0, s.flash - dt * 4) };

    // Yield accrues to the prize while principal is staked.
    if (round.principalTotal > 0 && round.state !== 'Settled') {
      round = { ...round, prize: round.prize + round.principalTotal * s.params.yieldPerSec * dt };
    }
    // Grace runs out: the storm rolls in.
    if (round.state === 'Live' && round.graceUntil !== null && now >= round.graceUntil) {
      round = { ...round, state: 'Armed' };
      patch.nextTickAt = now + 1000;
      patch.feed = [{ id: id(), at: now, kind: 'storm' as const, text: `Sudden death. Every second there's a ${s.params.hazardBps / 100}% chance round ${round.id} ends.` }, ...s.feed].slice(0, 40);
    }
    patch.round = round;
    set(patch);

    // Keeper: one tick per block (1s of game time) while the storm is up.
    if (round.state === 'Armed' && s.keeperOn && now >= (patch.nextTickAt ?? s.nextTickAt)) {
      set({ nextTickAt: now + 1000 });
      get().tick('keeper.lastflag.testnet');
    }

    if (!s.botsOn) return;
    const r = get().round;
    if (r.state === 'Settled') return;
    const quiet = r.deposits.length > 45 ? 0.3 : 1; // bots run out of money, round converges
    const roll = Math.random();
    const graceLeft = r.graceUntil !== null ? r.graceUntil - now : Infinity;

    if (r.state === 'Open') {
      if (roll < 0.25 * dt) get().deposit(BOTS[2 + Math.floor(Math.random() * 4)], r.minDeposit);
      return;
    }
    // sniper: lets the storm roll for a while, then raises a flag
    const stormAge = r.graceUntil !== null ? now - r.graceUntil : 0;
    if (r.state === 'Armed' && stormAge > 12_000 && r.leader !== 'sniper.testnet' && roll < 0.03 * dt * quiet) {
      get().deposit('sniper.testnet', r.minDeposit);
      return;
    }
    // whale: 3x the minimum once the tower passes a threshold
    if (r.prize > get().whaleThreshold && r.leader !== 'whale.testnet' && roll < 0.5 * dt * quiet) {
      get().deposit('whale.testnet', Math.min(r.minDeposit * 3, 100));
      set({ whaleThreshold: get().round.prize + 0.8 });
      return;
    }
    // random crowd: Poisson arrivals, quieter when the sun is still high
    const rate = (r.state === 'Armed' ? 0.008 : graceLeft < 15_000 ? 0.05 : 0.025) * quiet;
    if (roll < rate * dt) {
      const who = BOTS[2 + Math.floor(Math.random() * 4)];
      if (r.leader !== who) get().deposit(who, r.minDeposit * (Math.random() < 0.3 ? 1.5 : 1));
    }
  },
}));

/** Drives the game clock. Returns a stop function. */
export const startClock = () => {
  let last = performance.now();
  const h = setInterval(() => {
    const t = performance.now();
    const dt = Math.min(250, t - last);
    last = t;
    const { speed, advance } = useGame.getState();
    advance(dt * speed);
  }, 100);
  return () => clearInterval(h);
};

/** Selectors shared by HUD and scene. */
export const graceFraction = (round: Round, now: number, params: Params) => {
  if (round.state !== 'Live' || round.graceUntil === null) return round.state === 'Open' ? 1 : 0;
  return Math.max(0, Math.min(1, (round.graceUntil - now) / params.graceMs));
};

export const myStake = (round: Round, me: string) =>
  round.tents
    ? round.tents.filter((t) => t.account === me).reduce((a, t) => a + t.principal, 0)
    : round.deposits.filter((d) => d.account === me && !d.withdrawn).reduce((a, d) => a + d.principal, 0);

export const campers = (round: Round) => {
  if (round.tents) return round.tents.map((t) => ({ ...t }));
  const m = new Map<string, number>();
  for (const d of round.deposits) if (!d.withdrawn) m.set(d.account, (m.get(d.account) ?? 0) + d.principal);
  return [...m.entries()].map(([account, principal]) => ({ account, principal }));
};
