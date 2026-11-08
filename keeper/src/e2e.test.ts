import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Account, actions, JsonRpcProvider, KeyPair, type KeyPairString } from 'near-api-js';
import { DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY, Sandbox } from 'near-sandbox';
import { createSub, deployGame, fundYield, WASM } from './deploy.ts';
import { sleep, yocto } from './lib.ts';

/**
 * The contract on a real local node: real block heights, real randomness, real transfers and
 * refunds, and the #[private] init. Unit tests can't see any of these. Run `pnpm wasm` first.
 */

const NEAR = 10n ** 24n;
const TGAS = 10n ** 12n;
/** Gas a call costs us, generously. Balance checks allow for it. */
const GAS_SLACK = yocto(0.01);

const params = (over: Record<string, string | number>) => ({
  min_deposit_start: NEAR.toString(), growth_bps: 500, min_deposit_cap: (5n * NEAR).toString(),
  pot_fee_bps: 300, royalty_fee_bps: 100, grace_ms: 2_000, hazard_bps: 10_000, hard_cap_ms: 60_000,
  keeper_reward: (50n * NEAR / 1000n).toString(), yield_ppb_per_sec: 0, ...over,
});

let sandbox: Sandbox;
let provider: JsonRpcProvider;
let root: Account;

before(async () => {
  sandbox = await Sandbox.start({});
  provider = new JsonRpcProvider({ url: sandbox.rpcUrl });
  root = new Account(DEFAULT_ACCOUNT_ID, provider, DEFAULT_PRIVATE_KEY);
});
after(async () => { await sandbox?.tearDown(); });

const view = <T>(contractId: string, method: string, args: Record<string, unknown> = {}) =>
  provider.callFunction({ contractId, method, args }) as Promise<T>;

const call = <T>(who: Account, contractId: string, methodName: string, args: Record<string, unknown>, deposit = 0n) =>
  who.callFunction({ contractId, methodName, args, deposit, gas: 150n * TGAS }) as Promise<T>;

/** Balance once in-flight receipts land: refunds of unused gas arrive a block or two after the call returns. */
const balance = async (a: Account) => {
  await sleep(2_000);
  return a.getBalance();
};

const near = (y: bigint) => Number(y / 10n ** 18n) / 1e6;
const close = (got: bigint, want: bigint, msg: string) =>
  assert.ok(got >= want - GAS_SLACK && got <= want + GAS_SLACK, `${msg}: got ${near(got)}, want ~${near(want)}`);

interface RoundView { round: { id: number; leader: string | null; ticks: number; last_roll: number; blocks: number }; status: string }

let n = 0;
async function game(over: Record<string, string | number> = {}) {
  const g = await createSub(root, `game${++n}`, 20);
  await deployGame(g.account, WASM, params(over));
  return g.account.accountId;
}

/** `contracts/vanisher`, built by `pnpm wasm`: plays the game, then deletes itself mid-payout. */
const VANISHER = fileURLToPath(new URL('../../contracts/vanisher/target/near-cfg/wasm32-unknown-unknown/release/vanisher.wasm', import.meta.url));

async function vanisher(prefix: string) {
  const v = (await createSub(root, prefix, 20)).account;
  await v.signAndSendTransaction({ receiverId: v.accountId, actions: [actions.deployContract(readFileSync(VANISHER))] });
  return v.accountId;
}

/** `vanisherId` calls the game as itself, with `deposit` attached. */
const via = (vanisherId: string, contractId: string, method_name: string, args: Record<string, unknown>, deposit = 0n) =>
  call(root, vanisherId, 'call', { receiver_id: contractId, method_name, args: JSON.stringify(args) }, deposit);

/**
 * `vanisherId` calls the game and deletes itself in the same receipt, so the payout lands on a
 * missing account. Resolves to what `on_payout` returned and the failed transfer's outcome.
 */
async function vanish(vanisherId: string, contractId: string, method_name: string, args: Record<string, unknown>) {
  const raw = await root.callFunctionRaw({
    contractId: vanisherId,
    methodName: 'call_and_vanish',
    args: { receiver_id: contractId, method_name, args: JSON.stringify(args), beneficiary_id: root.accountId },
    gas: 150n * TGAS,
  });
  const status = raw.status as { SuccessValue?: string };
  assert.ok(status.SuccessValue !== undefined, `call_and_vanish failed: ${JSON.stringify(raw.status)}`);
  const paidOut = JSON.parse(Buffer.from(status.SuccessValue, 'base64').toString()) as boolean;
  // The game's transfer, landing on the deleted account.
  const failed = raw.receipts_outcome.some((o) =>
    o.outcome.executor_id === vanisherId && JSON.stringify(o.outcome.status).includes('AccountDoesNotExist'));
  await assert.rejects(provider.viewAccount({ accountId: vanisherId }), 'the vanisher is gone');
  return { paidOut, failed };
}

test('new refuses any caller but the contract itself', async () => {
  const raw = await createSub(root, 'raw', 10);
  await raw.account.signAndSendTransaction({ receiverId: raw.account.accountId, actions: [actions.deployContract(readFileSync(WASM))] });
  await assert.rejects(call(root, raw.account.accountId, 'new', { params: null }), /private/i);
});

test('a full round: refund, early pack-up, strike, keeper reward, withdraw, claim', async () => {
  const id = await game();
  const alice = (await createSub(root, 'alice', 20)).account;
  const bob = (await createSub(root, 'bob', 20)).account;
  const keeper = (await createSub(root, 'keeper', 5)).account;

  // Attach 1.5, pay the 1 NEAR minimum, get 0.5 back.
  let before = await balance(alice);
  const charged = await call<string>(alice, id, 'deposit', { round_id: 1 }, yocto(1.5));
  assert.equal(charged, NEAR.toString());
  close(await balance(alice), before - NEAR, 'alice paid only the minimum');

  await call(bob, id, 'deposit', { round_id: 1 }, yocto(1.2));
  await assert.rejects(call(keeper, id, 'tick', {}), /sun is still up/);

  // Outbid, alice packs up mid-round and gets her 96% back.
  before = await balance(alice);
  await call(alice, id, 'withdraw', { round_id: 1 });
  close(await balance(alice), before + yocto(0.96), 'alice got her tent back');
  const tents = await view<{ account_id: string }[]>(id, 'get_tents', { round_id: 1 });
  assert.deepEqual(tents.map((t) => t.account_id), [bob.accountId]);

  // Bob leads and can't leave.
  await assert.rejects(call(bob, id, 'withdraw', { round_id: 1 }), /your flag stays/);

  await sleep(2_500);
  before = await balance(keeper);
  const raw = await keeper.callFunctionRaw({ contractId: id, methodName: 'tick', args: {}, gas: 150n * TGAS });
  const status = raw.status as { SuccessValue: string };
  const res = JSON.parse(Buffer.from(status.SuccessValue, 'base64').toString()) as { Ended?: { winner: string; prize: string } };
  assert.equal(res.Ended?.winner, bob.accountId);
  // The ringer gets the keeper reward, capped at 10% of the tower: reward = min(0.05, prize / 9).
  const prize = BigInt(res.Ended!.prize);
  const reward = prize / 9n < yocto(0.05) ? prize / 9n : yocto(0.05);
  const burnt = [raw.transaction_outcome, ...raw.receipts_outcome].reduce((t, o) => t + BigInt(o.outcome.tokens_burnt), 0n);
  const got = (await balance(keeper)) - before + burnt;
  assert.ok(got > reward - yocto(0.001) && got < reward + yocto(0.001), `keeper reward: got ${near(got)}, want ${near(reward)}`);

  const r = await view<RoundView>(id, 'get_round');
  assert.equal(r.round.id, 2);
  assert.equal(r.status, 'Open');
  const nft = await view<{ owner_id: string }>(id, 'nft_token', { token_id: '1' });
  assert.equal(nft.owner_id, bob.accountId);
  const banner = await view<{ banner: { prize: string; struck_by: string; ticks: number } }>(id, 'get_banner', { token_id: '1' });
  assert.equal(banner.banner.struck_by, keeper.accountId);
  assert.equal(banner.banner.ticks, 1);

  // The tent from the settled round comes home; the banner pays its tower.
  before = await balance(bob);
  await call(bob, id, 'withdraw', { round_id: 1 });
  close(await balance(bob), before + (yocto(1.05) * 96n) / 100n, 'bob got his tent back');
  before = await balance(bob);
  await call(bob, id, 'claim_prize', { token_id: '1' });
  close(await balance(bob), before + BigInt(banner.banner.prize), 'bob claimed the tower');
  await assert.rejects(call(bob, id, 'claim_prize', { token_id: '1' }), /nothing to claim/);

  // A late flag for the old round is refunded in full, not planted in the new one.
  before = await balance(alice);
  await assert.rejects(call(alice, id, 'deposit', { round_id: 1 }, NEAR), /round moved on/);
  close(await balance(alice), before, 'late flag refunded');
});

test('bells roll with block randomness, one per block, and the hard cap ends it', async () => {
  const id = await game({ hazard_bps: 0, hard_cap_ms: 6_000 });
  const carol = (await createSub(root, 'carol', 20)).account;
  const keeper = (await createSub(root, 'ringer', 5)).account;
  await call(carol, id, 'deposit', { round_id: 1 }, NEAR);
  await sleep(2_500);

  const rolls = new Set<number>();
  for (let i = 0; i < 3; i++) {
    const res = await call<{ Continue?: { roll: number } }>(keeper, id, 'tick', {});
    assert.ok(res.Continue, 'hazard 0 never strikes before the hard cap');
    rolls.add(res.Continue.roll);
    const r = await view<RoundView>(id, 'get_round');
    assert.equal(r.round.last_roll, res.Continue.roll);
  }
  assert.ok(rolls.size > 1, `rolls should differ across blocks, got ${[...rolls]}`);

  await sleep(4_000);
  await assert.rejects(call(carol, id, 'deposit', { round_id: 1 }, yocto(2)), /hard cap reached/);
  const res = await call<{ Ended?: { winner: string } }>(keeper, id, 'tick', {});
  assert.equal(res.Ended?.winner, carol.accountId);
  const b = await view<{ banner: { ended_by_hard_cap: boolean } }>(id, 'get_banner', { token_id: '1' });
  assert.equal(b.banner.ended_by_hard_cap, true);
  const mine = await view<{ round_id: number }[]>(id, 'get_tents_of', { account_id: carol.accountId });
  assert.deepEqual(mine.map((t) => t.round_id), [1]);
});

test('mock yield is paid from the funded reserve into the tower', async () => {
  const id = await game({ hazard_bps: 10_000, grace_ms: 4_000, yield_ppb_per_sec: 100_000 });
  await fundYield(root, id, 1);
  const dave = (await createSub(root, 'dave', 20)).account;
  await call(dave, id, 'deposit', { round_id: 1 }, NEAR);
  const at = (await view<{ round: { prize: string } }>(id, 'get_round')).round.prize;
  await sleep(4_500);
  const v = await view<{ round: { prize: string; yield_paid: string }; yield_reserve: string }>(id, 'get_round');
  // 0.96 NEAR camped at 0.01% a second for ~4.5 s is about 0.00043 NEAR.
  const paid = BigInt(v.round.yield_paid);
  assert.ok(paid > yocto(0.0003) && paid < yocto(0.0007), `yield paid ${near(paid)}`);
  assert.equal(BigInt(v.round.prize) - BigInt(at), paid);
  assert.equal(BigInt(v.yield_reserve), NEAR - paid);

  const keeper = (await createSub(root, 'ringer2', 5)).account;
  await call(keeper, id, 'tick', {});
  const b = await view<{ banner: { yield_earned: string } }>(id, 'get_banner', { token_id: '1' });
  assert.ok(BigInt(b.banner.yield_earned) >= paid, 'banner keeps the round yield');
});

test('a marketplace sells a banner through NEP-199 and the buyer claims it', async () => {
  const id = await game();
  const seller = (await createSub(root, 'seller', 20)).account;
  const market = (await createSub(root, 'market', 5)).account;
  const buyer = (await createSub(root, 'buyer', 5)).account;
  await call(seller, id, 'deposit', { round_id: 1 }, NEAR);
  await sleep(2_500);
  await call(market, id, 'tick', {});

  // List: approve the marketplace (a plain account here, so no nft_on_approve message).
  await call(seller, id, 'nft_approve', { token_id: '1', account_id: market.accountId }, yocto(0.01));
  await assert.rejects(call(seller, id, 'claim_prize', { token_id: '1' }), /banner is listed/);
  const token = await view<{ approved_account_ids: Record<string, number> }>(id, 'nft_token', { token_id: '1' });
  const approvalId = token.approved_account_ids[market.accountId];

  const quote = await view<{ payout: Record<string, string> }>(id, 'nft_payout', { token_id: '1', balance: '3000', max_len_payout: 10 });
  assert.deepEqual(quote.payout, { [seller.accountId]: '3000' });

  const sold = await call<{ payout: Record<string, string> }>(market, id, 'nft_transfer_payout', {
    receiver_id: buyer.accountId, token_id: '1', approval_id: approvalId, balance: '3000', max_len_payout: 10,
  }, 1n);
  assert.deepEqual(sold.payout, { [seller.accountId]: '3000' });
  const after = await view<{ owner_id: string; approved_account_ids: Record<string, number> }>(id, 'nft_token', { token_id: '1' });
  assert.equal(after.owner_id, buyer.accountId);
  assert.deepEqual(after.approved_account_ids, {});

  // The tower went with the banner.
  await call(buyer, id, 'claim_prize', { token_id: '1' });
  await assert.rejects(call(seller, id, 'claim_prize', { token_id: '1' }), /not your banner/);
});

interface Totals { round: { principal_total: string } }

test('a tent paid to a vanished account is put back', async () => {
  const id = await game();
  const v = await vanisher('vanisher');
  const bob = (await createSub(root, 'bob2', 20)).account;

  await via(v, id, 'deposit', { round_id: 1 }, NEAR);
  await call(bob, id, 'deposit', { round_id: 1 }, yocto(1.2));
  const tent = await view<string>(id, 'get_tent', { round_id: 1, account_id: v });
  assert.equal(tent, (NEAR * 96n / 100n).toString());
  const principal = (await view<Totals>(id, 'get_round')).round.principal_total;

  // Outbid, so it may pack up. It does, and is gone before the 0.96 NEAR arrives.
  const { paidOut, failed } = await vanish(v, id, 'withdraw', { round_id: 1 });
  assert.ok(failed, 'the transfer to the vanished account failed');
  assert.equal(paidOut, false, 'on_payout saw the failure');

  assert.equal(await view<string>(id, 'get_tent', { round_id: 1, account_id: v }), tent);
  assert.equal((await view<Totals>(id, 'get_round')).round.principal_total, principal);
  const tents = await view<{ account_id: string }[]>(id, 'get_tents', { round_id: 1 });
  assert.deepEqual(tents.map((t) => t.account_id), [v, bob.accountId]);
});

test('a banner paid to a vanished owner is put back', async () => {
  const id = await game();
  const v = await vanisher('winner');
  const dave = (await createSub(root, 'challenger', 20)).account;
  const keeper = (await createSub(root, 'bell', 5)).account;

  await via(v, id, 'deposit', { round_id: 1 }, NEAR);
  await sleep(2_500);
  const res = await call<{ Ended?: { winner: string } }>(keeper, id, 'tick', {});
  assert.equal(res.Ended?.winner, v);
  // A block in round 2 drops its royalty in banner 1's chest.
  await call(dave, id, 'deposit', { round_id: 2 }, NEAR);

  type BannerJson = { banner: { prize: string; claimed: boolean; chest: string; chest_taken: string } };
  const before = (await view<BannerJson>(id, 'get_banner', { token_id: '1' })).banner;
  assert.equal(before.claimed, false);
  assert.equal(before.chest, (NEAR / 100n).toString());
  assert.equal(before.chest_taken, '0');

  const { paidOut, failed } = await vanish(v, id, 'claim_prize', { token_id: '1' });
  assert.ok(failed, 'the transfer to the vanished owner failed');
  assert.equal(paidOut, false, 'on_payout saw the failure');

  const after = (await view<BannerJson>(id, 'get_banner', { token_id: '1' })).banner;
  assert.deepEqual(after, before, 'tower unclaimed and chest untouched again');
});

/** Bids big enough that a camp share is well above the gas slack in the balance checks. */
const CAMP = { min_deposit_start: (5n * NEAR).toString(), min_deposit_cap: (20n * NEAR).toString(), camp_share_bps: 2_000 };
type CampJson = { banner: { principal: string; camp_pool: string; camp_paid: string } };

test('tents standing at the strike share the camp pool, an early leaver does not', async () => {
  const id = await game(CAMP);
  const leaver = (await createSub(root, 'leaver', 20)).account;
  const camper = (await createSub(root, 'camper', 20)).account;
  const top = (await createSub(root, 'top', 20)).account;
  const bell = (await createSub(root, 'bell2', 5)).account;

  await call(leaver, id, 'deposit', { round_id: 1 }, yocto(6));
  await call(camper, id, 'deposit', { round_id: 1 }, yocto(6));
  await call(top, id, 'deposit', { round_id: 1 }, yocto(6));

  let before = await balance(leaver);
  await call(leaver, id, 'withdraw', { round_id: 1 });
  close(await balance(leaver), before + yocto(4.8), 'the early leaver gets 96% and no share');

  await sleep(2_500);
  await call(bell, id, 'tick', {});
  const { banner } = await view<CampJson>(id, 'get_banner', { token_id: '1' });
  const tent = BigInt(await view<string>(id, 'get_tent', { round_id: 1, account_id: camper.accountId }));
  const share = (BigInt(banner.camp_pool) * tent) / BigInt(banner.principal);
  assert.ok(share > GAS_SLACK * 2n, `share ${near(share)} is big enough to see`);

  before = await balance(camper);
  await call(camper, id, 'withdraw', { round_id: 1 });
  close(await balance(camper), before + tent + share, 'the camper gets the tent and the share');
});

test('a camp share paid to a vanished account is put back', async () => {
  const id = await game(CAMP);
  const v = await vanisher('camper2');
  const top = (await createSub(root, 'top2', 20)).account;
  const bell = (await createSub(root, 'bell3', 5)).account;

  await via(v, id, 'deposit', { round_id: 1 }, yocto(5));
  await call(top, id, 'deposit', { round_id: 1 }, yocto(6));
  await sleep(2_500);
  await call(bell, id, 'tick', {});
  const tent = await view<string>(id, 'get_tent', { round_id: 1, account_id: v });

  const { paidOut, failed } = await vanish(v, id, 'withdraw', { round_id: 1 });
  assert.ok(failed, 'the transfer to the vanished account failed');
  assert.equal(paidOut, false, 'on_payout saw the failure');
  assert.equal(await view<string>(id, 'get_tent', { round_id: 1, account_id: v }), tent, 'principal only');
  assert.equal((await view<CampJson>(id, 'get_banner', { token_id: '1' })).banner.camp_paid, '0');
});

test('a function-call key can bid from the purse and do nothing else', async () => {
  const id = await game();
  const player = (await createSub(root, 'player', 20)).account;
  await call(player, id, 'fund_purse', {}, yocto(5));

  const kp = KeyPair.fromRandom('ed25519');
  await player.addFunctionCallAccessKey({ publicKey: kp.getPublicKey().toString(), contractId: id, methodNames: ['bid'], allowance: yocto(0.25) });
  const session = new Account(player.accountId, provider, kp.toString() as KeyPairString);

  const charged = await call<string>(session, id, 'bid', { round_id: 1, max: (2n * NEAR).toString() });
  assert.equal(charged, NEAR.toString());
  assert.equal((await view<RoundView>(id, 'get_round')).round.leader, player.accountId);

  await assert.rejects(call(session, id, 'withdraw', { round_id: 1 }));
  await assert.rejects(call(session, id, 'withdraw_purse', {}, 1n));
  await assert.rejects(call(session, id, 'deposit', { round_id: 1 }, yocto(2)));

  // The account's own key takes the rest out.
  const purse = BigInt(await view<string>(id, 'get_purse', { account_id: player.accountId }));
  const before = await balance(player);
  await call(player, id, 'withdraw_purse', {}, 1n);
  close(await balance(player), before + purse, 'the purse came home');
  assert.equal(await view<string>(id, 'get_purse', { account_id: player.accountId }), '0');
});
