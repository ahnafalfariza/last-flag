import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { Account, actions, JsonRpcProvider } from 'near-api-js';
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
