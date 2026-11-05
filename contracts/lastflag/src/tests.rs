use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, AccountId, NearToken};

use super::*;

const NS_PER_MS: u64 = 1_000_000;

fn milli(n: u128) -> NearToken {
    NearToken::from_millinear(n)
}

fn near(n: u128) -> NearToken {
    NearToken::from_near(n)
}

fn zero() -> NearToken {
    NearToken::from_yoctonear(0)
}

/// Set the next call: who calls, what they attach, when (ms) and at which block.
fn call(who: &AccountId, deposit: NearToken, ms: u64, height: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id("lastflag.testnet".parse().unwrap())
        .predecessor_account_id(who.clone())
        .signer_account_id(who.clone())
        .attached_deposit(deposit)
        .block_timestamp(ms * NS_PER_MS)
        .block_height(height)
        .build());
}

fn game() -> AccountId {
    "lastflag.testnet".parse().unwrap()
}

fn setup(hazard_bps: u32) -> Contract {
    call(&game(), zero(), 0, 1);
    Contract::new(Some(Params { hazard_bps, ..Params::demo() }))
}

#[test]
#[should_panic(expected = "first block's pot fee must cover")]
fn params_must_cover_first_block_storage() {
    call(&game(), zero(), 0, 1);
    Contract::new(Some(Params { min_deposit_start: milli(100), ..Params::demo() }));
}

#[test]
#[should_panic(expected = "first block's pot fee must cover")]
fn zero_minimum_is_refused() {
    call(&game(), zero(), 0, 1);
    Contract::new(Some(Params { min_deposit_start: zero(), ..Params::demo() }));
}

#[test]
#[should_panic(expected = "hard cap above 7 days")]
fn hard_cap_must_be_bounded() {
    call(&game(), zero(), 0, 1);
    Contract::new(Some(Params { hard_cap_ms: u64::MAX, ..Params::demo() }));
}

#[test]
fn one_minimum_block_round_pays_its_storage_from_fees() {
    let mut c = setup(10_000);
    // Longest account id: the most storage a tent and a banner can take.
    let long: AccountId = "a".repeat(64).parse().unwrap();
    let before = env::storage_usage();
    call(&long, near(1), 0, 2);
    c.deposit(1);
    call(&long, zero(), 31_000, 3);
    assert!(matches!(c.tick(), TickResult::Ended { .. }));
    let storage = storage_cost(before);

    let b = c.get_banner("1".to_string()).unwrap().banner;
    let fees = milli(40); // 3% pot + 1% royalty, which goes to the tower in round 1
    assert!(b.prize > zero());
    assert!(b.prize.saturating_add(storage) <= fees, "storage was paid from principal");
    assert_eq!(c.get_tent(1, long), Some(milli(960)));
}

/// Alice plants at t=0 and the strike lands right after grace.
fn settle_round_one(c: &mut Contract) {
    call(&accounts(1), near(1), 0, 2);
    c.deposit(1);
    call(&accounts(2), zero(), 31_000, 3);
    assert!(matches!(c.tick(), TickResult::Ended { round_id: 1, .. }));
}

#[test]
fn deposit_charges_current_minimum_and_refunds_the_rest() {
    let mut c = setup(0);
    call(&accounts(1), NearToken::from_near(5), 0, 2);
    assert_eq!(c.deposit(1), near(1));
    let r = c.get_round().round;
    assert_eq!(r.leader, Some(accounts(1)));
    assert_eq!(r.min_deposit, milli(1050));
    assert_eq!(c.get_tent(1, accounts(1)), Some(milli(960)));
}

#[test]
#[should_panic(expected = "round moved on")]
fn deposit_for_a_settled_round_is_refused() {
    let mut c = setup(10_000);
    settle_round_one(&mut c);
    call(&accounts(3), near(1), 32_000, 4);
    c.deposit(1);
}

#[test]
#[should_panic(expected = "below current minimum")]
fn deposit_below_minimum_is_refused() {
    let mut c = setup(0);
    call(&accounts(1), near(1), 0, 2);
    c.deposit(1);
    call(&accounts(2), near(1), 1_000, 3);
    c.deposit(1);
}

#[test]
fn last_deposit_in_a_block_leads() {
    let mut c = setup(0);
    call(&accounts(1), near(2), 0, 2);
    c.deposit(1);
    call(&accounts(2), near(2), 0, 2);
    c.deposit(1);
    assert_eq!(c.get_round().round.leader, Some(accounts(2)));
}

#[test]
#[should_panic(expected = "the sun is still up")]
fn tick_during_grace_is_refused() {
    let mut c = setup(10_000);
    call(&accounts(1), near(1), 0, 2);
    c.deposit(1);
    call(&accounts(2), zero(), 29_000, 3);
    c.tick();
}

#[test]
#[should_panic(expected = "the bell already rang this block")]
fn one_roll_per_block() {
    let mut c = setup(0);
    call(&accounts(1), near(1), 0, 2);
    c.deposit(1);
    call(&accounts(2), zero(), 31_000, 3);
    assert!(matches!(c.tick(), TickResult::Continue { .. }));
    call(&accounts(3), zero(), 31_000, 3);
    c.tick();
}

#[test]
fn strike_mints_banner_to_leader_and_opens_next_round() {
    let mut c = setup(10_000);
    settle_round_one(&mut c);
    let r = c.get_round();
    assert_eq!(r.round.id, 2);
    assert_eq!(r.status, "Open");
    let b = c.get_banner("1".to_string()).unwrap();
    assert_eq!(b.owner_id, accounts(1));
    assert!(b.banner.prize > zero() && b.banner.prize <= milli(40));
    assert_eq!(c.nft_token("1".to_string()).unwrap().owner_id, accounts(1));
}

#[test]
fn hard_cap_ends_the_round_even_with_zero_hazard() {
    let mut c = setup(0);
    call(&accounts(1), near(1), 0, 2);
    c.deposit(1);
    call(&accounts(2), zero(), 300_000, 3);
    assert!(matches!(c.tick(), TickResult::Ended { .. }));
}

#[test]
#[should_panic(expected = "hard cap reached")]
fn deposit_after_hard_cap_is_refused() {
    let mut c = setup(0);
    call(&accounts(1), near(1), 0, 2);
    c.deposit(1);
    call(&accounts(2), near(2), 300_000, 3);
    c.deposit(1);
}

#[test]
#[should_panic(expected = "your flag stays")]
fn leader_cannot_pack_up() {
    let mut c = setup(0);
    call(&accounts(1), near(1), 0, 2);
    c.deposit(1);
    let _ = c.withdraw(1);
}

#[test]
fn outbid_player_packs_up_mid_round() {
    let mut c = setup(0);
    call(&accounts(1), near(1), 0, 2);
    c.deposit(1);
    call(&accounts(2), near(2), 1_000, 3);
    c.deposit(1);
    call(&accounts(1), zero(), 2_000, 4);
    let _ = c.withdraw(1);
    assert_eq!(c.get_tent(1, accounts(1)), None);
    assert_eq!(c.get_round().round.principal_total, milli(1008));
}

#[test]
fn winner_packs_up_after_settlement() {
    let mut c = setup(10_000);
    settle_round_one(&mut c);
    call(&accounts(1), zero(), 32_000, 4);
    let _ = c.withdraw(1);
    assert_eq!(c.get_tent(1, accounts(1)), None);
}

#[test]
fn next_round_fills_previous_banner_chest() {
    let mut c = setup(10_000);
    settle_round_one(&mut c);
    call(&accounts(3), near(1), 32_000, 4);
    c.deposit(2);
    assert_eq!(c.get_banner("1".to_string()).unwrap().banner.chest, milli(10));
}

#[test]
#[should_panic(expected = "banner is listed")]
fn claim_waits_while_banner_is_listed() {
    let mut c = setup(10_000);
    settle_round_one(&mut c);
    call(&accounts(1), near(1), 32_000, 4);
    let _ = c.nft_approve("1".to_string(), accounts(4), None);
    call(&accounts(1), zero(), 33_000, 5);
    let _ = c.claim_prize("1".to_string());
}

#[test]
#[should_panic(expected = "nothing to claim")]
fn tower_pays_once() {
    let mut c = setup(10_000);
    settle_round_one(&mut c);
    call(&accounts(1), zero(), 32_000, 4);
    let _ = c.claim_prize("1".to_string());
    assert!(c.get_banner("1".to_string()).unwrap().banner.claimed);
    let _ = c.claim_prize("1".to_string());
}

#[test]
fn claim_rights_follow_the_banner() {
    let mut c = setup(10_000);
    settle_round_one(&mut c);
    call(&accounts(1), NearToken::from_yoctonear(1), 32_000, 4);
    c.nft_transfer(accounts(4), "1".to_string(), None, None);
    call(&accounts(4), zero(), 33_000, 5);
    let _ = c.claim_prize("1".to_string());
    assert!(c.get_banner("1".to_string()).unwrap().banner.claimed);
}

#[test]
#[should_panic(expected = "not your banner")]
fn seller_cannot_claim_after_transfer() {
    let mut c = setup(10_000);
    settle_round_one(&mut c);
    call(&accounts(1), NearToken::from_yoctonear(1), 32_000, 4);
    c.nft_transfer(accounts(4), "1".to_string(), None, None);
    call(&accounts(1), zero(), 33_000, 5);
    let _ = c.claim_prize("1".to_string());
}

#[test]
fn tent_storage_fits_its_budget() {
    let mut c = setup(0);
    let long: AccountId = "a".repeat(64).parse().unwrap();
    let before = env::storage_usage();
    call(&long, near(1), 0, 2);
    c.deposit(1);
    let used = env::storage_usage() - before;
    assert!(used <= TENT_STORAGE_BYTES, "tent took {used} bytes");
}

#[test]
fn banner_storage_fits_its_budget() {
    let mut c = setup(10_000);
    let long: AccountId = "a".repeat(64).parse().unwrap();
    let ringer: AccountId = "b".repeat(64).parse().unwrap();
    call(&long, near(1), 0, 2);
    c.deposit(1);
    let before = env::storage_usage();
    call(&ringer, zero(), 31_000, 3);
    c.tick();
    // Settle also opens the next round, which is smaller than the one it replaces.
    let used = env::storage_usage().saturating_sub(before);
    assert!(used <= BANNER_STORAGE_BYTES, "banner took {used} bytes");
    let b = c.get_banner("1".to_string()).unwrap().banner;
    assert_eq!(b.struck_by, ringer);
    assert_eq!(b.ticks, 1);
}

#[test]
fn tents_list_in_pitch_order_and_skip_packed_ones() {
    let mut c = setup(0);
    call(&accounts(1), near(1), 0, 2);
    c.deposit(1);
    call(&accounts(2), near(2), 1_000, 3);
    c.deposit(1);
    call(&accounts(3), near(2), 2_000, 4);
    c.deposit(1);
    call(&accounts(1), zero(), 3_000, 5);
    let _ = c.withdraw(1);
    let names = |c: &Contract| -> Vec<AccountId> {
        c.get_tents(1, None, None).into_iter().map(|t| t.account_id).collect()
    };
    assert_eq!(names(&c), vec![accounts(2), accounts(3)]);

    // A re-pitch after packing up shows once, at its first position.
    call(&accounts(1), near(2), 4_000, 6);
    c.deposit(1);
    call(&accounts(2), near(2), 5_000, 7);
    c.deposit(1);
    assert_eq!(names(&c), vec![accounts(1), accounts(2), accounts(3)]);
    assert_eq!(c.get_round().round.tents_pitched, 4);
    assert_eq!(c.get_tents(1, Some(1), Some(1)).len(), 1);
}

#[test]
fn tents_of_lists_rounds_newest_first() {
    let mut c = setup(10_000);
    settle_round_one(&mut c);
    call(&accounts(1), near(1), 32_000, 4);
    c.deposit(2);
    let mine = c.get_tents_of(accounts(1), None);
    assert_eq!(mine.iter().map(|t| t.round_id).collect::<Vec<_>>(), vec![2, 1]);
    assert_eq!(mine[1].amount, milli(960));
    assert!(c.get_tents_of(accounts(2), None).is_empty());
}

#[test]
fn round_view_carries_the_last_roll() {
    let mut c = setup(0);
    call(&accounts(1), near(1), 0, 2);
    c.deposit(1);
    call(&accounts(2), zero(), 31_000, 3);
    let TickResult::Continue { roll } = c.tick() else { panic!("hazard 0 never strikes") };
    let r = c.get_round().round;
    assert_eq!((r.ticks, r.last_roll), (1, roll));
}

/// Yield on 0.96 NEAR of principal at the demo rate (20,000 ppb a second), in yocto per second.
const YIELD_PER_SEC: u128 = 960_000_000_000_000_000_000_000 * 20_000 / 1_000_000_000;

fn fund(c: &mut Contract, amount: NearToken, ms: u64, height: u64) {
    call(&accounts(5), amount, ms, height);
    c.fund_yield();
}

#[test]
fn yield_accrues_from_the_reserve_while_a_flag_is_up() {
    let mut c = setup(0);
    fund(&mut c, near(10), 0, 2);
    call(&accounts(1), near(1), 0, 3);
    c.deposit(1);
    let prize_at_bid = c.get_round().round.prize;

    call(&accounts(2), zero(), 10_000, 4);
    let v = c.get_round();
    let owed = NearToken::from_yoctonear(YIELD_PER_SEC * 10);
    assert_eq!(v.round.prize, prize_at_bid.saturating_add(owed));
    assert_eq!(v.round.yield_paid, owed);
    assert_eq!(v.yield_reserve, near(10).saturating_sub(owed));
}

#[test]
fn no_reserve_no_yield() {
    let mut c = setup(0);
    call(&accounts(1), near(1), 0, 2);
    c.deposit(1);
    let prize = c.get_round().round.prize;
    call(&accounts(2), zero(), 60_000, 3);
    assert_eq!(c.get_round().round.prize, prize);
}

#[test]
fn yield_never_exceeds_the_reserve() {
    let mut c = setup(0);
    fund(&mut c, NearToken::from_yoctonear(1_000), 0, 2);
    call(&accounts(1), near(1), 0, 3);
    c.deposit(1);
    call(&accounts(2), zero(), 60_000, 4);
    let v = c.get_round();
    assert_eq!(v.round.yield_paid, NearToken::from_yoctonear(1_000));
    assert_eq!(v.yield_reserve, zero());
}

#[test]
fn yield_stops_at_the_hard_cap() {
    let mut c = setup(0);
    fund(&mut c, near(10), 0, 2);
    call(&accounts(1), near(1), 0, 3);
    c.deposit(1);
    // Hard cap is 5 minutes; an hour later nobody has rung the bell.
    call(&accounts(2), zero(), 3_600_000, 4);
    assert_eq!(c.get_round().round.yield_paid, NearToken::from_yoctonear(YIELD_PER_SEC * 300));
}

#[test]
fn banner_keeps_the_yield_its_round_earned() {
    let mut c = setup(10_000);
    fund(&mut c, near(10), 0, 2);
    call(&accounts(1), near(1), 0, 3);
    c.deposit(1);
    call(&accounts(2), zero(), 31_000, 4);
    assert!(matches!(c.tick(), TickResult::Ended { .. }));
    let b = c.get_banner("1".to_string()).unwrap().banner;
    assert_eq!(b.yield_earned, NearToken::from_yoctonear(YIELD_PER_SEC * 31));
    // The next round starts its own clock: nothing owed until a flag goes up.
    call(&accounts(2), zero(), 90_000, 5);
    assert_eq!(c.get_round().round.yield_paid, zero());
}

#[test]
fn packing_up_settles_yield_before_principal_leaves() {
    let mut c = setup(0);
    fund(&mut c, near(10), 0, 2);
    call(&accounts(1), near(1), 0, 3);
    c.deposit(1);
    call(&accounts(2), near(2), 0, 4);
    c.deposit(1);
    // Two tents camped for 10 s, then one leaves.
    call(&accounts(1), zero(), 10_000, 5);
    let _ = c.withdraw(1);
    let both = 960_000_000_000_000_000_000_000u128 + 1_008_000_000_000_000_000_000_000;
    let paid = c.get_round().round.yield_paid.as_yoctonear();
    assert_eq!(paid, both * 20_000 / 1_000_000_000 * 10);
}

#[test]
#[should_panic(expected = "attach the NEAR to add")]
fn funding_needs_a_deposit() {
    let mut c = setup(0);
    fund(&mut c, zero(), 0, 2);
}

#[test]
#[should_panic(expected = "yield above 0.1% a second")]
fn yield_rate_is_bounded() {
    call(&game(), zero(), 0, 1);
    Contract::new(Some(Params { yield_ppb_per_sec: 2_000_000, ..Params::demo() }));
}
