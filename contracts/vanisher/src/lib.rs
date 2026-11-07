//! Test helper for the lastflag e2e tests, never deployed outside a sandbox.
//!
//! The game pays a tent or a banner to the caller, so the only way to make that transfer fail
//! is for the caller to be gone when it lands. `call_and_vanish` calls the game and, from the
//! same receipt, deletes this account:
//!
//! - block N: this receipt runs and sends two receipts, the game call and our own deletion.
//! - block N+1: the deletion runs; the game call runs and sends the transfer back to us.
//! - block N+2 or later: the transfer reaches an account that no longer exists and fails.
//!
//! The transfer can only be created after the game call has run, so it always lands after the
//! deletion, which leaves no race. The deletion is not chained on the game call: a `then` would
//! wait for the game's whole promise chain, payout included.

use near_sdk::{env, near, AccountId, Gas, NearToken, Promise};

const CALL_GAS: Gas = Gas::from_tgas(60);

#[near(contract_state)]
#[derive(Default)]
pub struct Vanisher {}

#[near]
impl Vanisher {
    /// Calls `receiver_id.method_name(args)` as this account, forwarding the attached deposit.
    /// `args` is the JSON argument string.
    #[payable]
    pub fn call(&mut self, receiver_id: AccountId, method_name: String, args: String) -> Promise {
        Promise::new(receiver_id).function_call(
            method_name,
            args.into_bytes(),
            env::attached_deposit(),
            CALL_GAS,
        )
    }

    /// Calls `receiver_id.method_name(args)` as this account and deletes this account in the
    /// same receipt, sending what is left to `beneficiary_id`. Returns the call's result.
    pub fn call_and_vanish(
        &mut self,
        receiver_id: AccountId,
        method_name: String,
        args: String,
        beneficiary_id: AccountId,
    ) -> Promise {
        Promise::new(env::current_account_id()).delete_account(beneficiary_id).detach();
        Promise::new(receiver_id).function_call(
            method_name,
            args.into_bytes(),
            NearToken::from_yoctonear(0),
            CALL_GAS,
        )
    }
}
