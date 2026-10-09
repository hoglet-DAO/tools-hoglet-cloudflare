module dao_contracts_vault::publisher {
    use std::signer;
    use std::vector;
    use std::error;
    use supra_framework::account;
    use supra_framework::code;
    use supra_framework::event;
    use supra_framework::resource_account;

    // Error codes
    const E_NOT_ADMIN: u64 = 1;
    const E_ALREADY_RENOUNCED: u64 = 2;
    const E_ZERO_ADMIN: u64 = 11;
    const E_SAME_ADMIN: u64 = 12;
    const E_MODULE_HAS_NO_CODE: u64 = 15;
    const E_SELF_ADMIN: u64 = 17;

    /// Stores the SignerCapability of the package Resource Account (@dao_contracts_vault).
    /// Kept strictly isolated in this module to protect root authority.
    struct PackageAdmin has key {
        admin: address,
        cap: account::SignerCapability,
    }

    #[event]
    struct PackageUpgradedEvent has store, drop {
        by: address,
    }

    #[event]
    struct PackageAdminTransferredEvent has store, drop {
        old_admin: address,
        new_admin: address,
    }

    #[event]
    struct PackageRenouncedEvent has store, drop {
        by: address,
    }

    /// Automatically invoked upon package publication via `create_resource_account_and_publish_package`.
    /// Claims the Resource Account SignerCapability and installs PackageAdmin.
    fun init_module(package_signer: &signer) {
        let cap = resource_account::retrieve_resource_account_cap(package_signer, @admin);
        move_to(package_signer, PackageAdmin {
            admin: @admin,
            cap,
        });
    }

    /// Upgrades the package bytecode using the stored SignerCapability.
    /// Only callable by the registered admin while PackageAdmin exists.
    public entry fun upgrade_package(
        caller: &signer,
        metadata_serialized: vector<u8>,
        code: vector<vector<u8>>,
    ) acquires PackageAdmin {
        assert!(exists<PackageAdmin>(@dao_contracts_vault), error::invalid_state(E_ALREADY_RENOUNCED));
        let admin_record = borrow_global<PackageAdmin>(@dao_contracts_vault);
        assert!(signer::address_of(caller) == admin_record.admin, error::permission_denied(E_NOT_ADMIN));
        assert!(!vector::is_empty(&code), error::invalid_argument(E_MODULE_HAS_NO_CODE));

        let package_signer = account::create_signer_with_capability(&admin_record.cap);
        code::publish_package_txn(&package_signer, metadata_serialized, code);

        event::emit(PackageUpgradedEvent {
            by: signer::address_of(caller),
        });
    }

    /// Transfers package administration to a new address.
    public entry fun transfer_package_admin(
        caller: &signer,
        new_admin: address,
    ) acquires PackageAdmin {
        assert!(new_admin != @0x0, error::invalid_argument(E_ZERO_ADMIN));
        assert!(new_admin != @dao_contracts_vault, error::invalid_argument(E_SELF_ADMIN));
        assert!(exists<PackageAdmin>(@dao_contracts_vault), error::invalid_state(E_ALREADY_RENOUNCED));

        let admin_record = borrow_global_mut<PackageAdmin>(@dao_contracts_vault);
        let old_admin = admin_record.admin;
        assert!(signer::address_of(caller) == old_admin, error::permission_denied(E_NOT_ADMIN));
        assert!(new_admin != old_admin, error::invalid_argument(E_SAME_ADMIN));

        admin_record.admin = new_admin;

        event::emit(PackageAdminTransferredEvent {
            old_admin,
            new_admin,
        });
    }

    /// Permanently renounces governance of the package.
    /// Destroys PackageAdmin, drops its SignerCapability, and revokes the Resource Account self-offer,
    /// making the package permanently and irreversibly immutable.
    public entry fun renounce_package_admin(
        caller: &signer,
    ) acquires PackageAdmin {
        assert!(exists<PackageAdmin>(@dao_contracts_vault), error::invalid_state(E_ALREADY_RENOUNCED));
        let PackageAdmin { admin, cap } = move_from<PackageAdmin>(@dao_contracts_vault);
        assert!(signer::address_of(caller) == admin, error::permission_denied(E_NOT_ADMIN));

        // Revoke the Resource Account self-offer to seal the address completely.
        let package_signer = account::create_signer_with_capability(&cap);
        if (account::is_signer_capability_offered(@dao_contracts_vault)
            && account::get_signer_capability_offer_for(@dao_contracts_vault) == @dao_contracts_vault) {
            account::revoke_signer_capability(&package_signer, @dao_contracts_vault);
        };

        // `cap` falls out of scope and is destroyed (SignerCapability has `drop`).

        event::emit(PackageRenouncedEvent {
            by: signer::address_of(caller),
        });
    }

    #[test_only]
    public fun initialize_package_admin_for_test(
        package_signer: &signer,
        admin: address,
        cap: account::SignerCapability,
    ) {
        move_to(package_signer, PackageAdmin { admin, cap });
    }

    /// Returns the active admin of the package, or @0x0 if renounced / immutable.
    #[view]
    public fun get_package_admin(): address acquires PackageAdmin {
        if (exists<PackageAdmin>(@dao_contracts_vault)) {
            borrow_global<PackageAdmin>(@dao_contracts_vault).admin
        } else {
            @0x0
        }
    }

    /// Returns true if the package is permanently and irreversibly renounced (immutable).
    #[view]
    public fun is_package_renounced(): bool {
        !exists<PackageAdmin>(@dao_contracts_vault)
    }
}
