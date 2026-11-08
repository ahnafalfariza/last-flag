export type RoundState = 'Open' | 'Live' | 'Armed' | 'Settled';

export interface Params {
  minDepositStart: number;
  growthBps: number;
  minDepositCap: number;
  potFeeBps: number;
  royaltyFeeBps: number;
  graceMs: number;
  hazardBps: number;
  hardCapMs: number;
  /** Mock yield adapter: fraction of staked principal accrued to the prize per second. */
  yieldPerSec: number;
  keeperReward: number;
  /** Share of the tower split among the tents still standing at the strike. */
  campShareBps: number;
}

export interface Deposit {
  id: number;
  account: string;
  amount: number;
  principal: number;
  at: number;
  withdrawn: boolean;
}

export interface Round {
  id: number;
  state: RoundState;
  leader: string | null;
  prize: number;
  principalTotal: number;
  deposits: Deposit[];
  minDeposit: number;
  lastDepositAt: number | null;
  graceUntil: number | null;
  hardCapAt: number | null;
  openedAt: number;
  ticks: number;
  /**
   * Standing tents (principal per account). Live mode reads them from the contract, which
   * keeps tents, not individual blocks. When absent, tents are summed from `deposits`.
   */
  tents?: { account: string; principal: number }[];
  /** Settled rounds: what the standing tents split, pro rata against `principalTotal`. */
  campPool?: number;
}

/** A trophy NFT, in hill words. */
export interface Banner {
  id: number;
  owner: string;
  prize: number;
  claimed: boolean;
  /** Royalty received from the next round, total. */
  chest: number;
  chestTaken: number;
  /** Taken out of the tower at the strike for the tents still standing. */
  campPool?: number;
  blocks: number;
  principal: number;
  durationMs: number;
  wonAt: number;
  /** Chance that ended it, as shown in the log. */
  endedBy: 'strike' | 'hard cap';
  /** Checks run in the round, the last one included. */
  ticks?: number;
  /** Who ran the check that ended it. */
  struckBy?: string;
  /** Accounts approved to transfer it, i.e. marketplaces it is listed on. Claims wait while any. */
  listedWith?: string[];
}

export interface ThunderEvent {
  id: number;
  at: number;
  roll: number;
  threshold: number;
  struck: boolean;
  by: string;
}

export interface FeedEvent {
  id: number;
  at: number;
  kind: 'flag' | 'storm' | 'thunder' | 'strike' | 'tent' | 'open' | 'info';
  text: string;
}

export interface Strike {
  round: number;
  winner: string;
  prize: number;
  blocks: number;
  by: string;
  at: number;
}
