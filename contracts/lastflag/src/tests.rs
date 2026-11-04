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
