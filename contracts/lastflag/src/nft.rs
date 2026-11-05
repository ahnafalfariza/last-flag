//! NEP-171 core, approval, enumeration and metadata for the banners, delegated to
//! `near-contract-standards`, plus NEP-199 payouts so marketplaces can sell them. Token id N is
//! the banner of round N. Only `settle` mints.

use std::collections::HashMap;

use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::json_types::U128;
use near_sdk::{assert_one_yocto, env, near, require, AccountId, Promise, PromiseOrValue};

use crate::{Contract, ContractExt};

#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.nft.nft_transfer(receiver_id, token_id, approval_id, memo);
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.nft.nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.nft.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.nft.nft_resolve_transfer(previous_owner_id, receiver_id, token_id, approved_account_ids)
    }
}

#[near]
impl NonFungibleTokenApproval for Contract {
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        self.nft.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.nft.nft_revoke(token_id, account_id);
    }

    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.nft.nft_revoke_all(token_id);
    }

    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.nft.nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 {
        self.nft.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.nft.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.nft.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.nft.nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Last Flag Banners".to_string(),
            symbol: "BANNER".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }
}

/// NEP-199 payout: who gets what share of a sale's `balance`.
#[near(serializers = [json])]
pub struct NftPayout {
    pub payout: HashMap<AccountId, U128>,
}

/// A banner has no creator royalty (its chest is the royalty, paid by the next round), so the
/// seller gets the whole sale price.
fn seller_takes_all(owner: AccountId, balance: U128, max_len_payout: Option<u32>) -> NftPayout {
    if let Some(max) = max_len_payout {
        require!(max >= 1, "max_len_payout must allow the seller");
    }
    NftPayout { payout: HashMap::from([(owner, balance)]) }
}

#[near]
impl Contract {
    /// NEP-199: how a sale of `balance` would be split. All of it goes to the current owner.
    pub fn nft_payout(&self, token_id: TokenId, balance: U128, max_len_payout: Option<u32>) -> NftPayout {
        let owner = self.nft.owner_by_id.get(&token_id).unwrap_or_else(|| env::panic_str("no such banner"));
        seller_takes_all(owner, balance, max_len_payout)
    }

    /// NEP-199: transfer for a sale and return the split. Called by an approved marketplace with
    /// 1 yocto; the transfer clears every approval, so the buyer can claim right away.
    #[payable]
    pub fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> NftPayout {
        assert_one_yocto();
        let owner = self.nft.owner_by_id.get(&token_id).unwrap_or_else(|| env::panic_str("no such banner"));
        let payout = seller_takes_all(owner, balance, max_len_payout);
        self.nft.nft_transfer(receiver_id, token_id, approval_id, memo);
        payout
    }
}
