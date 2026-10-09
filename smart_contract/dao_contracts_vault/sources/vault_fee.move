module dao_contracts_vault::vault_fee {
    use std::signer;
    use std::error;
    use supra_framework::coin;
    use supra_framework::supra_coin::SupraCoin;
    use supra_framework::event;

    friend dao_contracts_vault::vault;

    // =========================================================================
    // CONSTANTS & FEE LIMITS
    // =========================================================================

    /// 1 SUPRA = 10^8 octas (8 decimals).
    const OCTAS_PER_SUPRA: u64 = 100_000_000;

    /// Minimum non-zero fee: 1 SUPRA (100_000_000 octas).
    /// Prevents setting trivial micro-fees when fee collection is active.
    /// Note: fee = 0 is always allowed to enable free deployments (e.g. testnet / promos).
    const MIN_FEE_OCTAS: u64 = 100_000_000;

    /// Maximum fee safety cap: 1,370,000 SUPRA (137,000,000,000,000 octas).
    /// Hard protocol limit: guarantees no admin can ever set an exorbitant fee.
    const MAX_FEE_OCTAS: u64 = 137_000_000_000_000;

    // Error Codes
    const E_NOT_FEE_ADMIN: u64 = 1;
    const E_INVALID_RECIPIENT: u64 = 2;
    const E_FEE_BELOW_MINIMUM: u64 = 3;
    const E_FEE_EXCEEDS_MAXIMUM: u64 = 4;
    const E_NOT_FACTORY: u64 = 5;
    const E_ZERO_ADMIN: u64 = 6;
    const E_SAME_ADMIN: u64 = 7;
    const E_SELF_ADMIN: u64 = 8;

    // =========================================================================
    // STORAGE
    // =========================================================================

    /// Platform deployment fee settings stored under @dao_contracts_vault.
    struct FeeConfig has key {
        /// Dedicated admin with permission only to manage fee amount, recipient, and transfer admin.
        fee_admin: address,
        /// Wallet that receives the deployment fees.
        fee_recipient: address,
        /// Fee amount in octas (1 SUPRA = 10^8 octas). 0 = free.
        fee_amount: u64,
    }

    // =========================================================================
    // EVENTS
    // =========================================================================

    #[event]
    struct FeeConfigUpdatedEvent has store, drop {
        admin: address,
        recipient: address,
        fee_amount: u64,
    }

    #[event]
    struct FeeAdminTransferredEvent has store, drop {
        old_admin: address,
        new_admin: address,
    }

    #[event]
    struct DeployFeePaidEvent has store, drop {
        payer: address,
        recipient: address,
        amount: u64,
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    /// Initializes fee configuration. Callable by factory during setup.
    public fun initialize(
        factory_signer: &signer,
        initial_admin: address,
        recipient: address,
        initial_fee: u64,
    ) {
        let factory_addr = signer::address_of(factory_signer);
        assert!(factory_addr == @dao_contracts_vault, error::permission_denied(E_NOT_FACTORY));
        if (initial_fee > 0) {
            assert!(initial_fee >= MIN_FEE_OCTAS, error::invalid_argument(E_FEE_BELOW_MINIMUM));
            assert!(initial_fee <= MAX_FEE_OCTAS, error::invalid_argument(E_FEE_EXCEEDS_MAXIMUM));
            assert!(recipient != @0x0, error::invalid_argument(E_INVALID_RECIPIENT));
        };

        if (!exists<FeeConfig>(@dao_contracts_vault)) {
            let admin = if (initial_admin != @0x0) { initial_admin } else { factory_addr };
            let recip = if (recipient != @0x0) { recipient } else { factory_addr };
            move_to(factory_signer, FeeConfig {
                fee_admin: admin,
                fee_recipient: recip,
                fee_amount: initial_fee,
            });
        };
    }

    // =========================================================================
    // FEE ADMIN ACTIONS (Only fee_admin can call)
    // =========================================================================

    /// Updates the deployment fee amount and recipient.
    /// Can set fee to 0 (free), or between [MIN_FEE_OCTAS, MAX_FEE_OCTAS].
    public entry fun set_fee_config(
        caller: &signer,
        new_recipient: address,
        new_fee: u64,
    ) acquires FeeConfig {
        assert!(exists<FeeConfig>(@dao_contracts_vault), error::not_found(E_NOT_FEE_ADMIN));
        let config = borrow_global_mut<FeeConfig>(@dao_contracts_vault);
        assert!(signer::address_of(caller) == config.fee_admin, error::permission_denied(E_NOT_FEE_ADMIN));

        if (new_fee > 0) {
            assert!(new_fee >= MIN_FEE_OCTAS, error::invalid_argument(E_FEE_BELOW_MINIMUM));
            assert!(new_fee <= MAX_FEE_OCTAS, error::invalid_argument(E_FEE_EXCEEDS_MAXIMUM));
            assert!(new_recipient != @0x0, error::invalid_argument(E_INVALID_RECIPIENT));
            config.fee_recipient = new_recipient;
        } else if (new_recipient != @0x0) {
            config.fee_recipient = new_recipient;
        };

        config.fee_amount = new_fee;

        event::emit(FeeConfigUpdatedEvent {
            admin: config.fee_admin,
            recipient: config.fee_recipient,
            fee_amount: new_fee,
        });
    }

    /// Transfers the fee administration authority to a new wallet.
    public entry fun transfer_fee_admin(
        caller: &signer,
        new_admin: address,
    ) acquires FeeConfig {
        assert!(new_admin != @0x0, error::invalid_argument(E_ZERO_ADMIN));
        assert!(new_admin != @dao_contracts_vault, error::invalid_argument(E_SELF_ADMIN));
        assert!(exists<FeeConfig>(@dao_contracts_vault), error::not_found(E_NOT_FEE_ADMIN));
        let config = borrow_global_mut<FeeConfig>(@dao_contracts_vault);
        let old_admin = config.fee_admin;
        assert!(signer::address_of(caller) == old_admin, error::permission_denied(E_NOT_FEE_ADMIN));
        assert!(new_admin != old_admin, error::invalid_argument(E_SAME_ADMIN));

        config.fee_admin = new_admin;

        event::emit(FeeAdminTransferredEvent {
            old_admin,
            new_admin,
        });
    }

    // =========================================================================
    // INTERNAL SETTLEMENT (Called by friend dao_contracts_vault::vault)
    // =========================================================================

    /// Transfers the deployment fee from payer to fee_recipient.
    public(friend) fun collect_deploy_fee(payer: &signer) acquires FeeConfig {
        if (!exists<FeeConfig>(@dao_contracts_vault)) {
            return
        };

        let config = borrow_global<FeeConfig>(@dao_contracts_vault);
        if (config.fee_amount > 0 && config.fee_recipient != @0x0) {
            coin::transfer<SupraCoin>(payer, config.fee_recipient, config.fee_amount);
            event::emit(DeployFeePaidEvent {
                payer: signer::address_of(payer),
                recipient: config.fee_recipient,
                amount: config.fee_amount,
            });
        };
    }

    // =========================================================================
    // PUBLIC VIEW FUNCTIONS
    // =========================================================================

    /// Returns the fee configuration: (fee_amount_in_octas, fee_recipient, fee_admin).
    #[view]
    public fun get_fee_info(): (u64, address, address) acquires FeeConfig {
        if (exists<FeeConfig>(@dao_contracts_vault)) {
            let config = borrow_global<FeeConfig>(@dao_contracts_vault);
            (config.fee_amount, config.fee_recipient, config.fee_admin)
        } else {
            (0, @0x0, @0x0)
        }
    }

    /// Returns the minimum and maximum allowed non-zero fees in octas: (min_fee, max_fee).
    #[view]
    public fun get_fee_limits(): (u64, u64) {
        (MIN_FEE_OCTAS, MAX_FEE_OCTAS)
    }

    /// Returns the active fee admin wallet.
    #[view]
    public fun get_fee_admin(): address acquires FeeConfig {
        if (exists<FeeConfig>(@dao_contracts_vault)) {
            borrow_global<FeeConfig>(@dao_contracts_vault).fee_admin
        } else {
            @0x0
        }
    }

    #[test_only]
    public fun initialize_for_test(factory: &signer, admin: address, recipient: address, fee: u64) {
        initialize(factory, admin, recipient, fee);
    }
}
