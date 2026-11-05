import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Account, actions, KeyPair, type KeyPairString } from 'near-api-js';
import { keyFor, need, NETWORK, provider, yocto, env } from './lib.ts';

/**
 * `pnpm wasm` builds it here. It needs `--cfg near`, which `cargo near build` also sets: without
 * it near-sdk compiles its off-chain code paths and every panic message becomes a bare trap.
 * Override with LASTFLAG_WASM.
 */
export const WASM = process.env.LASTFLAG_WASM
  ?? fileURLToPath(new URL('../../contracts/lastflag/target/near-cfg/wasm32-unknown-unknown/release/lastflag.wasm', import.meta.url));

/** Contract params as `new` takes them. Omit to use the contract's demo defaults. */
export type GameParams = Record<string, string | number>;

/**
 * Deploy and initialise in one transaction signed by the contract account itself, because `new`
 * is #[private]: nobody else can call it, so nobody can initialise first with their own params.
 */
export async function deployGame(game: Account, wasmPath = WASM, params?: GameParams) {
  const code = readFileSync(wasmPath);
  return game.signAndSendTransaction({
    receiverId: game.accountId,
    actions: [
      actions.deployContract(code),
      actions.functionCall('new', { params: params ?? null }, 100n * 10n ** 12n, 0n),
    ],
  });
}

/** Adds `near` NEAR to the game's mock-yield reserve. Anyone can; it only ever pays yield. */
export async function fundYield(from: Account, contractId: string, near: number) {
  return from.callFunction({ contractId, methodName: 'fund_yield', args: {}, deposit: yocto(near), gas: 30n * 10n ** 12n });
}

/** Creates `<prefix>.<parent>` with a fresh full-access key and returns it ready to sign. */
export async function createSub(parent: Account, prefix: string, near: number) {
  const accountId = `${prefix}.${parent.accountId}`;
  const kp = KeyPair.fromRandom('ed25519');
  await parent.createAccount({ newAccountId: accountId, publicKey: kp.getPublicKey().toString(), nearToTransfer: yocto(near) });
  const key = kp.toString() as KeyPairString;
  return { account: new Account(accountId, parent.provider, key), key };
}

// `pnpm deploy-game`: deploy to an account you already hold a key for (e.g. made with near-cli).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const accountId = need('DEPLOY_ACCOUNT');
  const game = new Account(accountId, provider, keyFor(accountId, 'DEPLOY_KEY'));
  const params = env.LASTFLAG_PARAMS ? (JSON.parse(env.LASTFLAG_PARAMS) as GameParams) : undefined;
  console.log(`deploying ${WASM} to ${accountId} on ${NETWORK}`);
  await deployGame(game, WASM, params);
  if (env.LASTFLAG_YIELD_FUND) {
    await fundYield(game, accountId, Number(env.LASTFLAG_YIELD_FUND));
    console.log(`yield reserve funded with ${env.LASTFLAG_YIELD_FUND} NEAR`);
  }
  console.log(await provider.callFunction({ contractId: accountId, method: 'get_round', args: {} }));
  console.log('done. Delete its full-access keys when you are happy, so nobody holds an upgrade key.');
}
