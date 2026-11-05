import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Account, JsonRpcProvider, type KeyPairString } from 'near-api-js';

/**
 * Shared setup for the keeper and the bots. Configuration comes from the environment, or from
 * `.env.sandbox.json` that `pnpm sandbox` writes when you play locally.
 *
 *   NEAR_NETWORK      testnet | mainnet | sandbox      (default testnet)
 *   NEAR_RPC_URL      RPC endpoint                      (default per network)
 *   LASTFLAG_CONTRACT the game contract account
 *   <ROLE>_ACCOUNT    signer account, e.g. KEEPER_ACCOUNT
 *   <ROLE>_KEY        its private key, ed25519:...      (else ~/.near-credentials/<network>/<account>.json)
 */

export const SANDBOX_FILE = new URL('../.env.sandbox.json', import.meta.url);

type Env = Record<string, string | undefined>;

const fileEnv = (): Env => {
  if (process.env.NEAR_NETWORK && process.env.NEAR_NETWORK !== 'sandbox') return {};
  if (!existsSync(SANDBOX_FILE)) return {};
  return JSON.parse(readFileSync(SANDBOX_FILE, 'utf8')) as Env;
};

export const env: Env = { ...fileEnv(), ...process.env };

export const NETWORK = env.NEAR_NETWORK ?? 'testnet';
const DEFAULT_RPC: Record<string, string> = {
  testnet: 'https://test.rpc.fastnear.com',
  mainnet: 'https://rpc.mainnet.fastnear.com',
  sandbox: 'http://127.0.0.1:3030',
};
export const RPC_URL = env.NEAR_RPC_URL ?? DEFAULT_RPC[NETWORK];
export const provider = new JsonRpcProvider({ url: RPC_URL });

export const need = (name: string): string => {
  const v = env[name];
  if (!v) throw new Error(`Set ${name}.`);
  return v;
};

export const CONTRACT = () => need('LASTFLAG_CONTRACT');

/** Private key from env, else from the near-cli legacy keychain. */
export const keyFor = (accountId: string, envName?: string): KeyPairString => {
  const fromEnv = envName ? env[envName] : undefined;
  if (fromEnv) return fromEnv as KeyPairString;
  const file = join(homedir(), '.near-credentials', NETWORK, `${accountId}.json`);
  if (!existsSync(file)) throw new Error(`No key for ${accountId}: set ${envName ?? 'a key'} or add ${file}.`);
  const j = JSON.parse(readFileSync(file, 'utf8')) as { private_key?: string; secret_key?: string };
  return (j.private_key ?? j.secret_key) as KeyPairString;
};

/** Account for a role, e.g. role('KEEPER') reads KEEPER_ACCOUNT and KEEPER_KEY. */
export const role = (name: string) => {
  const accountId = need(`${name}_ACCOUNT`);
  return new Account(accountId, provider, keyFor(accountId, `${name}_KEY`));
};

export const view = <T>(method: string, args: Record<string, unknown> = {}) =>
  provider.callFunction({ contractId: CONTRACT(), method, args }) as Promise<T>;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const YOCTO = 10n ** 24n;
export const nearStr = (yocto: string | bigint) => {
  const y = BigInt(yocto);
  return `${y / YOCTO}.${(y % YOCTO).toString().padStart(24, '0').slice(0, 3)}`;
};
export const yocto = (near: number) => BigInt(Math.round(near * 1e6)) * 10n ** 18n;

/** The panic text of a failed call, without the RPC wrapping. */
export const reason = (e: unknown) => {
  const s = e instanceof Error ? e.message : String(e);
  return /Smart contract panicked: ([^"\\\n]+)/.exec(s)?.[1] ?? s.split('\n')[0];
};

export interface RoundJson {
  id: number;
  leader: string | null;
  prize: string;
  min_deposit: string;
  blocks: number;
  grace_until_ms: number;
  hard_cap_at_ms: number;
  ticks: number;
  last_roll: number;
}
export interface RoundView { round: RoundJson; status: 'Open' | 'Live' | 'Armed'; hard_cap_reached: boolean; now_ms: number }
export type TickResult = { Continue: { roll: number } } | { Ended: { round_id: number; winner: string; prize: string } };
