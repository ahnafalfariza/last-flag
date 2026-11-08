/**
 * Where the live game lives. Set VITE_CONTRACT_ID to play against a deployed contract; leave it
 * unset (or open the page with ?sim) to run the local simulator.
 *
 * VITE_NETWORK: testnet (default) | mainnet | sandbox. Sandbox is a local node started by
 * `keeper/sandbox.ts`; wallets can't reach it, so it signs with VITE_DEV_ACCOUNT and VITE_DEV_KEY,
 * a key that only exists on that local node.
 */
export type ChainNetwork = 'testnet' | 'mainnet' | 'sandbox';

const env = import.meta.env;

export const CONTRACT_ID: string | undefined = env.VITE_CONTRACT_ID || undefined;
export const NETWORK: ChainNetwork = (env.VITE_NETWORK as ChainNetwork) || 'testnet';

const DEFAULT_RPC: Record<ChainNetwork, string> = {
  testnet: 'https://test.rpc.fastnear.com',
  mainnet: 'https://rpc.mainnet.fastnear.com',
  sandbox: 'http://127.0.0.1:3030',
};
export const RPC_URL: string = env.VITE_RPC_URL || DEFAULT_RPC[NETWORK];

export const DEV_ACCOUNT: string | undefined = env.VITE_DEV_ACCOUNT || undefined;
export const DEV_KEY: string | undefined = env.VITE_DEV_KEY || undefined;

export const EXPLORER: string | null =
  NETWORK === 'testnet' ? 'https://testnet.nearblocks.io' : NETWORK === 'mainnet' ? 'https://nearblocks.io' : null;

/**
 * Where "Sell" lists a banner: a marketplace contract that takes NEP-178 approvals and settles
 * through NEP-199 `nft_transfer_payout`. The message template's {price} is the price in yocto.
 * The default message is the one the NEAR examples marketplace reads.
 */
export const MARKETPLACE_ID: string = env.VITE_MARKETPLACE_ID || '';
export const MARKETPLACE_MSG: string = env.VITE_MARKETPLACE_MSG || '{"sale_conditions":"{price}"}';

/**
 * Extra attached to a bid, as a percent of the minimum, so it still lands if someone else bids
 * first. The contract charges the minimum and refunds the rest.
 */
export const BID_HEADROOM_PCT = 10;

/** Live when a contract is configured, unless the page asks for the simulator. */
export const LIVE = !!CONTRACT_ID && !new URLSearchParams(location.search).has('sim');
