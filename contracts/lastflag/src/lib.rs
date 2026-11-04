//! Last Flag game contract: rounds, deposits, the hazard tick, settlement, withdrawals, and the
//! banner (trophy) NFTs. The NFT lives in this contract so prize claims can check the owner
//! synchronously; see `nft.rs` for the NEP-171 surface.
//!
//! There is no owner and no upgrade key. Parameters are fixed at `new` and readable by anyone.

use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
use near_contract_standards::non_fungible_token::{NonFungibleToken, TokenId};
use near_sdk::collections::LookupMap;
use near_sdk::serde_json::json;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError,
};

mod nft;
#[cfg(test)]
mod tests;

const BPS: u128 = 10_000;
const CALLBACK_GAS: Gas = Gas::from_tgas(10);
/// The bell ringer never takes more than this share of the tower.
const KEEPER_MAX_SHARE_BPS: u128 = 1_000;

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Tents,
    Banners,
    NftOwners,
    NftMetadata,
    NftEnumeration,
    NftApprovals,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Params {
    /// First deposit minimum of every round.
    pub min_deposit_start: NearToken,
    /// The minimum grows by this after every deposit.
    pub growth_bps: u32,
    /// Growth stops here.
    pub min_deposit_cap: NearToken,
    /// Share of each deposit added to the tower.
    pub pot_fee_bps: u32,
    /// Share of each deposit sent to the previous round's banner chest.
    pub royalty_fee_bps: u32,
    /// After a deposit the round cannot end for this long (the sun).
    pub grace_ms: u64,
    /// Chance that one roll ends the round once grace is over. One roll per block.
    pub hazard_bps: u32,
    /// The round always ends this long after the last deposit.
    pub hard_cap_ms: u64,
    /// Paid from the tower to whoever rings the bell that brings the strike.
    pub keeper_reward: NearToken,
}

impl Params {
    /// Testnet demo defaults from the design doc.
    fn demo() -> Self {
        Self {
            min_deposit_start: NearToken::from_millinear(100),
            growth_bps: 500,
            min_deposit_cap: NearToken::from_near(5),
            pot_fee_bps: 300,
            royalty_fee_bps: 100,
            grace_ms: 30_000,
            hazard_bps: 500,
            hard_cap_ms: 5 * 60_000,
            keeper_reward: NearToken::from_millinear(50),
        }
    }

    fn check(&self) {
        require!(
            u128::from(self.pot_fee_bps + self.royalty_fee_bps) < BPS,
            "fees must leave principal"
        );
        require!(u128::from(self.hazard_bps) <= BPS, "hazard_bps above 10000");
        require!(self.hard_cap_ms > self.grace_ms, "hard cap must outlast grace");
        require!(self.min_deposit_cap >= self.min_deposit_start, "cap below start");
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Round {
    pub id: u64,
    pub opened_at_ms: u64,
    pub leader: Option<AccountId>,
    pub prize: NearToken,
    pub principal_total: NearToken,
    pub min_deposit: NearToken,
    pub blocks: u32,
    pub last_deposit_at_ms: u64,
    pub grace_until_ms: u64,
    pub hard_cap_at_ms: u64,
    pub last_roll_height: u64,
    pub ticks: u32,
}

impl Round {
    fn open(id: u64, now_ms: u64, params: &Params) -> Self {
        Self {
            id,
            opened_at_ms: now_ms,
            leader: None,
            prize: NearToken::from_yoctonear(0),
            principal_total: NearToken::from_yoctonear(0),
            min_deposit: params.min_deposit_start,
            blocks: 0,
            last_deposit_at_ms: 0,
            grace_until_ms: 0,
            hard_cap_at_ms: 0,
            last_roll_height: 0,
            ticks: 0,
        }
    }

    fn hard_cap_reached(&self, now_ms: u64) -> bool {
        self.leader.is_some() && now_ms >= self.hard_cap_at_ms
    }
}

/// Settled-round record behind banner N. The NFT says who owns it; this says what it holds.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Banner {
    pub prize: NearToken,
    pub claimed: bool,
    pub chest: NearToken,
    pub chest_taken: NearToken,
    pub blocks: u32,
    pub principal: NearToken,
    pub duration_ms: u64,
    pub won_at_ms: u64,
    pub ended_by_hard_cap: bool,
}

#[near(serializers = [json])]
pub struct RoundView {
    pub round: Round,
    /// Open (no flag yet), Live (sun is up) or Armed (storm: any roll may end it).
    pub status: String,
    pub hard_cap_reached: bool,
    pub now_ms: u64,
}

#[near(serializers = [json])]
pub struct BannerView {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub banner: Banner,
}

#[near(serializers = [json])]
pub enum TickResult {
    Continue { roll: u32 },
    Ended { round_id: u64, winner: AccountId, prize: NearToken },
}

/// What a payout pays for, so a failed transfer can be put back.
#[near(serializers = [json])]
pub enum Payout {
    Tent { round_id: u64 },
    Banner { round_id: u64, tower: NearToken, chest: NearToken },
}

#[near(event_json(standard = "lastflag"))]
pub enum Event {
    #[event_version("1.0.0")]
    FlagPlanted {
        round_id: u64,
        account_id: AccountId,
        charged: NearToken,
        min_deposit: NearToken,
        grace_until_ms: u64,
    },
    #[event_version("1.0.0")]
    Bell { round_id: u64, by: AccountId, roll: u32, threshold: u32, struck: bool },
    #[event_version("1.0.0")]
    Strike {
        round_id: u64,
        winner: AccountId,
        prize: NearToken,
        blocks: u32,
        by: AccountId,
        hard_cap: bool,
    },
    #[event_version("1.0.0")]
    TentPacked { round_id: u64, account_id: AccountId, amount: NearToken },
    #[event_version("1.0.0")]
    PrizeClaimed { token_id: TokenId, account_id: AccountId, tower: NearToken, chest: NearToken },
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    params: Params,
    round: Round,
    /// Principal per (round, account). Pulled back with `withdraw`.
    tents: LookupMap<(u64, AccountId), NearToken>,
    banners: LookupMap<u64, Banner>,
    nft: NonFungibleToken,
}

#[near]
impl Contract {
    #[init]
    pub fn new(params: Option<Params>) -> Self {
        let params = params.unwrap_or_else(Params::demo);
        params.check();
        let round = Round::open(1, env::block_timestamp_ms(), &params);
        Self {
            params,
            round,
            tents: LookupMap::new(StorageKey::Tents),
            banners: LookupMap::new(StorageKey::Banners),
            nft: NonFungibleToken::new(
                StorageKey::NftOwners,
                env::current_account_id(),
                Some(StorageKey::NftMetadata),
                Some(StorageKey::NftEnumeration),
                Some(StorageKey::NftApprovals),
            ),
        }
    }

    /// Plant a flag. Attach the most you are willing to pay: the contract charges the current
    /// minimum and refunds the rest, so a flag that lands one deposit late still goes up.
    /// Any panic refunds the whole attached deposit.
    #[payable]
    pub fn deposit(&mut self, round_id: u64) -> NearToken {
        let now = env::block_timestamp_ms();
        let account = env::predecessor_account_id();
        let attached = env::attached_deposit();
        require!(round_id == self.round.id, "round moved on");
        require!(!self.round.hard_cap_reached(now), "hard cap reached, the round is ending");
        let charge = self.round.min_deposit;
        require!(attached >= charge, format!("below current minimum of {charge}"));

        let p = &self.params;
        let to_pot = bps(charge, p.pot_fee_bps);
        let royalty = bps(charge, p.royalty_fee_bps);
        let principal = charge.saturating_sub(to_pot).saturating_sub(royalty);

        let key = (round_id, account.clone());
        let before = env::storage_usage();
        let tent = self.tents.get(&key).unwrap_or(NearToken::from_yoctonear(0));
        self.tents.insert(&key, &tent.saturating_add(principal));
        // The tower pays for the tent's storage.
        let mut to_prize = to_pot.saturating_sub(storage_cost(before));

        let prev = round_id - 1;
        match self.banners.get(&prev) {
            Some(mut b) => {
                b.chest = b.chest.saturating_add(royalty);
                self.banners.insert(&prev, &b);
            }
            None => to_prize = to_prize.saturating_add(royalty),
        }

        let r = &mut self.round;
        r.leader = Some(account.clone());
        r.prize = r.prize.saturating_add(to_prize);
        r.principal_total = r.principal_total.saturating_add(principal);
        r.blocks += 1;
        let grown = bps(r.min_deposit, p.growth_bps).saturating_add(r.min_deposit);
        r.min_deposit = grown.min(p.min_deposit_cap);
        r.last_deposit_at_ms = now;
        r.grace_until_ms = now + p.grace_ms;
        r.hard_cap_at_ms = now + p.hard_cap_ms;

        Event::FlagPlanted {
            round_id,
            account_id: account.clone(),
            charged: charge,
            min_deposit: r.min_deposit,
            grace_until_ms: r.grace_until_ms,
        }
        .emit();

        let refund = attached.saturating_sub(charge);
        if !refund.is_zero() {
            Promise::new(account).transfer(refund).detach();
        }
        charge
    }

    /// Ring the bell. Anyone may call it once the sun is down; one roll per block, so spamming
    /// calls in a block does not speed up the strike.
    pub fn tick(&mut self) -> TickResult {
        let now = env::block_timestamp_ms();
        let height = env::block_height();
        let by = env::predecessor_account_id();
        let r = &mut self.round;
        require!(r.leader.is_some(), "no flag on the hill");
        let hard_cap = r.hard_cap_reached(now);
        require!(hard_cap || now >= r.grace_until_ms, "the sun is still up");
        require!(height > r.last_roll_height, "the bell already rang this block");
        r.last_roll_height = height;
        r.ticks += 1;

        let roll = roll(r.id, r.ticks);
        let threshold = self.params.hazard_bps;
        let struck = hard_cap || roll < threshold;
        Event::Bell { round_id: r.id, by: by.clone(), roll, threshold, struck }.emit();
        if !struck {
            return TickResult::Continue { roll };
        }
        self.settle(by, hard_cap, now)
    }

    /// Pack up a tent. Past rounds any time; the current round only while someone else is on top.
    pub fn withdraw(&mut self, round_id: u64) -> Promise {
        let account = env::predecessor_account_id();
        let current = round_id == self.round.id;
        if current {
            require!(
                self.round.leader.as_ref() != Some(&account),
                "you are on top, your flag stays"
            );
        }
        let amount = self
            .tents
            .remove(&(round_id, account.clone()))
            .unwrap_or_else(|| env::panic_str("no tent in that round"));
        if current {
            self.round.principal_total = self.round.principal_total.saturating_sub(amount);
        }
        Event::TentPacked { round_id, account_id: account.clone(), amount }.emit();
        self.pay(account, Payout::Tent { round_id }, amount)
    }

    /// Pay the banner's owner everything it holds: the tower if unclaimed, plus the chest.
    pub fn claim_prize(&mut self, token_id: TokenId) -> Promise {
        let account = env::predecessor_account_id();
        let round_id: u64 = token_id.parse().unwrap_or_else(|_| env::panic_str("no such banner"));
        let owner = self
            .nft
            .owner_by_id
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("no such banner"));
        require!(owner == account, "not your banner");
        // A listed banner can't be drained mid-sale: claims wait until approvals are revoked.
        let listed = self
            .nft
            .approvals_by_id
            .as_ref()
            .and_then(|a| a.get(&token_id))
            .is_some_and(|m| !m.is_empty());
        require!(!listed, "banner is listed, revoke approvals before claiming");

        let mut b = self.banners.get(&round_id).unwrap_or_else(|| env::panic_str("no such banner"));
        let tower = if b.claimed { NearToken::from_yoctonear(0) } else { b.prize };
        let chest = b.chest.saturating_sub(b.chest_taken);
        let total = tower.saturating_add(chest);
        require!(!total.is_zero(), "nothing to claim");
        b.claimed = true;
        b.chest_taken = b.chest;
        self.banners.insert(&round_id, &b);

        Event::PrizeClaimed { token_id, account_id: account.clone(), tower, chest }.emit();
        self.pay(account, Payout::Banner { round_id, tower, chest }, total)
    }

    /// Puts a ledger entry back if its transfer failed. Entries are zeroed before paying.
    #[private]
    pub fn on_payout(
        &mut self,
        account_id: AccountId,
        payout: Payout,
        amount: NearToken,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            return true;
        }
        match payout {
            Payout::Tent { round_id } => {
                let key = (round_id, account_id);
                let tent = self.tents.get(&key).unwrap_or(NearToken::from_yoctonear(0));
                self.tents.insert(&key, &tent.saturating_add(amount));
                if round_id == self.round.id {
                    self.round.principal_total = self.round.principal_total.saturating_add(amount);
                }
            }
            Payout::Banner { round_id, tower, chest } => {
                if let Some(mut b) = self.banners.get(&round_id) {
                    if !tower.is_zero() {
                        b.claimed = false;
                    }
                    b.chest_taken = b.chest_taken.saturating_sub(chest);
                    self.banners.insert(&round_id, &b);
                }
            }
        }
        false
    }

    pub fn get_params(&self) -> Params {
        self.params.clone()
    }

    pub fn get_round(&self) -> RoundView {
        let now = env::block_timestamp_ms();
        let r = &self.round;
        let status = match r.leader {
            None => "Open",
            Some(_) if now < r.grace_until_ms => "Live",
            Some(_) => "Armed",
        };
        RoundView {
            round: r.clone(),
            status: status.to_string(),
            hard_cap_reached: r.hard_cap_reached(now),
            now_ms: now,
        }
    }

    pub fn get_tent(&self, round_id: u64, account_id: AccountId) -> Option<NearToken> {
        self.tents.get(&(round_id, account_id))
    }

    pub fn get_banner(&self, token_id: TokenId) -> Option<BannerView> {
        let round_id: u64 = token_id.parse().ok()?;
        let banner = self.banners.get(&round_id)?;
        let owner_id = self.nft.owner_by_id.get(&token_id)?;
        Some(BannerView { token_id, owner_id, banner })
    }

    /// Banners newest first, starting below `before` (exclusive, default: the current round).
    pub fn get_banners(&self, before: Option<u64>, limit: Option<u64>) -> Vec<BannerView> {
        let top = before.unwrap_or(self.round.id).min(self.round.id);
        (1..top)
            .rev()
            .take(limit.unwrap_or(20) as usize)
            .filter_map(|id| self.get_banner(id.to_string()))
            .collect()
    }
}

impl Contract {
    /// Mint banner N to the leader, pay the bell ringer, open round N+1. One receipt, no
    /// cross-contract step, so there is no half-settled state to retry.
    fn settle(&mut self, by: AccountId, hard_cap: bool, now: u64) -> TickResult {
        let round = self.round.clone();
        let winner = round.leader.clone().expect("leader checked in tick");
        let reward = self.params.keeper_reward.min(bps_u128(round.prize, KEEPER_MAX_SHARE_BPS));

        let token_id = round.id.to_string();
        let extra = json!({
            "round": round.id,
            "winner": winner,
            "blocks": round.blocks,
            "principal": round.principal_total,
            "duration_ms": now - round.opened_at_ms,
            "ended_by": if hard_cap { "hard cap" } else { "strike" },
        });
        let metadata = TokenMetadata {
            title: Some(format!("Banner {}", round.id)),
            description: Some(format!(
                "Last flag standing on hill {} after {} blocks.",
                round.id, round.blocks
            )),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(now.to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(extra.to_string()),
            reference: None,
            reference_hash: None,
        };

        let before = env::storage_usage();
        // No refund account: the tower pays the banner's storage below, not the ringer.
        self.nft.internal_mint_with_refund(token_id.clone(), winner.clone(), Some(metadata), None);
        let mut banner = Banner {
            prize: NearToken::from_yoctonear(0),
            claimed: false,
            chest: NearToken::from_yoctonear(0),
            chest_taken: NearToken::from_yoctonear(0),
            blocks: round.blocks,
            principal: round.principal_total,
            duration_ms: now - round.opened_at_ms,
            won_at_ms: now,
            ended_by_hard_cap: hard_cap,
        };
        self.banners.insert(&round.id, &banner);
        banner.prize = round.prize.saturating_sub(reward).saturating_sub(storage_cost(before));
        self.banners.insert(&round.id, &banner);

        NftMint { owner_id: &winner, token_ids: &[&token_id], memo: None }.emit();
        Event::Strike {
            round_id: round.id,
            winner: winner.clone(),
            prize: banner.prize,
            blocks: round.blocks,
            by: by.clone(),
            hard_cap,
        }
        .emit();

        if !reward.is_zero() {
            Promise::new(by).transfer(reward).detach();
        }
        self.round = Round::open(round.id + 1, now, &self.params);
        TickResult::Ended { round_id: round.id, winner, prize: banner.prize }
    }

    fn pay(&self, account: AccountId, payout: Payout, amount: NearToken) -> Promise {
        Promise::new(account.clone()).transfer(amount).then(
            Self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_payout(account, payout, amount),
        )
    }
}

fn bps(amount: NearToken, bps: u32) -> NearToken {
    bps_u128(amount, u128::from(bps))
}

fn bps_u128(amount: NearToken, bps: u128) -> NearToken {
    NearToken::from_yoctonear(amount.as_yoctonear() * bps / BPS)
}

fn storage_cost(before: u64) -> NearToken {
    let used = env::storage_usage().saturating_sub(before);
    env::storage_byte_cost().saturating_mul(u128::from(used))
}

/// Roll in [0, 10000). The block seed is the same for every call in a block, so it is hashed
/// with the round id and tick count.
fn roll(round_id: u64, tick: u32) -> u32 {
    let mut input = env::random_seed();
    input.extend_from_slice(&round_id.to_le_bytes());
    input.extend_from_slice(&tick.to_le_bytes());
    let h = env::sha256_array(&input);
    let n = u64::from_le_bytes(h[..8].try_into().unwrap());
    (n % BPS as u64) as u32
}
