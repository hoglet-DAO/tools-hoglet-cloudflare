#[test_only]
module dao_contracts_vault::vault_tests {
    use std::signer;
    use std::vector;
    use std::bcs;
        use supra_framework::account;
    use aptos_std::ed25519;
    use dao_contracts_vault::vault;
    use dao_contracts_vault::publisher;
    use dao_contracts_vault::vault_fee;

    // Status constants (mirrors governance) for readable assertions.
    const STATUS_UNMANAGED: u8 = 0;
    const STATUS_PERMANENTLY_RENOUNCED: u8 = 1;
    const STATUS_VERIFIED_DAO_GOVERNED: u8 = 2;
    const STATUS_HAZARD_KEY_STILL_ACTIVE: u8 = 3;

    // Abort codes mapped through std::error (category << 16 | reason):
    // E_NOT_ADMIN (1): error::permission_denied -> 0x50001
    // E_CONTRACT_NOT_FOUND (3): error::not_found -> 0x60003
    // E_EOA_KEY_NOT_BURNED (5): error::invalid_state -> 0x30005
    // E_ZERO_ADMIN (11): error::invalid_argument -> 0x1000B
    // E_NOT_RESOURCE_ACCOUNT (13): error::invalid_argument -> 0x1000D
    // E_SELF_ADMIN (17): error::invalid_argument -> 0x10011

    /// Creates a real Ed25519-controlled EOA and performs the atomic donation
    /// (create proxy + offer signer capability to the proxy + register the governance record).
    fun donate(pk_bytes: vector<u8>, sk: &ed25519::SecretKey, dao: address): signer {
        let eoa = account::create_account_from_ed25519_public_key(pk_bytes);
        let eoa_addr = signer::address_of(&eoa);
        let challenge = account::get_signer_capability_offer_proof_challenge_v2(
            eoa_addr,
            vault::predict_eoa_proxy_address(eoa_addr),
        );
        let sig_bytes = ed25519::signature_to_bytes(&ed25519::sign_struct(sk, challenge));
        vault::donate_eoa_to_dao(&eoa, dao, sig_bytes, 0, pk_bytes);
        eoa
    }

    fun new_ed25519_eoa(): (vector<u8>, ed25519::SecretKey) {
        let (sk, pk) = ed25519::generate_keys();
        (ed25519::validated_public_key_to_bytes(&pk), sk)
    }

    /// The label most tests use. One deployment per creator is no longer the rule, so tests that only need
    /// a single contract pick a fixed label and ignore the rest.
    fun default_label(): vector<u8> {
        b"default"
    }

    /// Deploys an Autonomous Resource Account and returns its address.
    fun deploy_ra(creator: &signer, dao: address): address {
        deploy_ra_labelled(creator, default_label(), dao)
    }

    /// Deploys under a chosen label, which is what separates several contracts of one creator.
    fun deploy_ra_labelled(creator: &signer, label: vector<u8>, dao: address): address {
        let predicted = vault::predict_next_contract_address(signer::address_of(creator), label);
        vault::deploy_autonomous_contract(
            creator,
            label,
            vector::empty<u8>(),
            vector::empty<vector<u8>>(),
            dao,
        );
        predicted
    }

    #[test]
    fun test_status_unmanaged_for_unknown_address() {
        assert!(vault::get_eoa_security_status(@0xDEAD) == STATUS_UNMANAGED, 0);
        assert!(!vault::is_eoa_key_annihilated(@0xDEAD), 1);
        assert!(!vault::is_eoa_permanently_immutable(@0xDEAD), 2);
        assert!(!vault::is_eoa_donation_complete(@0xDEAD), 3);
    }

    #[test]
    fun test_plain_eoa_is_unmanaged() {
        let eoa = account::create_account_for_test(@0x100A);
        // A plain EOA has a live key and no capability offer.
        assert!(vault::get_eoa_security_status(signer::address_of(&eoa)) == STATUS_UNMANAGED, 0);
    }

    #[test]
    fun test_unmanaged_resource_account_is_not_dao_governed() {
        let creator = account::create_account_for_test(@0x1009);
        // External Resource accounts are created with ZERO_AUTH_KEY and self-offer their capability.
        let (ra_signer, _cap) = account::create_resource_account(&creator, b"status-check");
        let ra_addr = signer::address_of(&ra_signer);

        assert!(vault::is_eoa_key_annihilated(ra_addr), 0);
        assert!(account::is_signer_capability_offered(ra_addr), 1);
        // H2 FIX VERIFICATION: Must return STATUS_UNMANAGED, NOT STATUS_VERIFIED_DAO_GOVERNED!
        assert!(vault::get_eoa_security_status(ra_addr) == STATUS_UNMANAGED, 2);
        assert!(!vault::is_eoa_donation_complete(ra_addr), 3);
        assert!(!vault::is_eoa_permanently_immutable(ra_addr), 4);
        assert!(!vault::is_factory_managed(ra_addr), 5);
    }

    #[test]
    fun test_factory_resource_account_is_dao_governed() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);
        let creator = account::create_account_for_test(@0x1010);
        let dao = @0x9010;
        let predicted = deploy_ra(&creator, dao);

        assert!(vault::is_factory_managed(predicted), 0);
        assert!(vault::get_eoa_security_status(predicted) == STATUS_VERIFIED_DAO_GOVERNED, 1);
    }

    /// The prediction must match what the framework derives, seed included. The expected seed is spelled
    /// out rather than imported so this fails if the derivation changes shape - it previously asserted
    /// against `dao_contracts_vault::autonomous_v1`, a prefix the module had already stopped using, and
    /// passed for as long as nobody ran it.
    #[test]
    fun test_predict_matches_framework_derivation() {
        let creator = @0x1001;
        let label = default_label();
        let expected_seed = b"dao_contracts_vault::autonomous_v1";
        vector::append(&mut expected_seed, label);

        let predicted = vault::predict_next_contract_address(creator, label);
        assert!(predicted == account::create_resource_address(&creator, expected_seed), 1);
    }

    #[test]
    fun test_predict_is_stable_for_same_creator() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let creator = account::create_account_for_test(@0x100F);
        let a = vault::predict_next_contract_address(signer::address_of(&creator), default_label());
        deploy_ra(&creator, @0x9001);
        let b = vault::predict_next_contract_address(signer::address_of(&creator), default_label());
        // A fixed seed keeps the RA address stable across deployments for the same creator.
        assert!(a == b, 0);
    }

/// A creator gets exactly one Autonomous Resource Account, forever. Re-running the deploy must fail with
/// the factory's own guard rather than the framework's ERESOURCE_ACCCOUNT_EXISTS, which reads like an
/// unrelated collision and gives no hint that `upgrade_contract` is the way forward.
#[test]
#[expected_failure(abort_code = 0x80004, location = dao_contracts_vault::vault)]
fun test_redeploy_for_same_creator_aborts() {
    let factory = account::create_account_for_test(@dao_contracts_vault);
    vault::initialize(&factory);

    let creator = account::create_account_for_test(@0x1A01);
    deploy_ra(&creator, @0x91A1);

    // Same creator, same derived address. The upgrade path is the only way to publish again.
    deploy_ra(&creator, @0x91A1);
}

/// The derived address must be stable across calls: it is what makes the address predictable before the
/// account exists, and what lets a client tell "re-deploy" apart from "first deploy".
#[test]
fun test_derived_address_is_stable_per_creator() {
    let a = vault::predict_next_contract_address(@0x1A02, default_label());
    let b = vault::predict_next_contract_address(@0x1A02, default_label());
    let other = vault::predict_next_contract_address(@0x1A03, default_label());

    assert!(a == b, 0);
    assert!(a != other, 1);
}

/// The point of the label: one creator can hold several deployments, and each stays predictable from
/// `(creator, label)` alone.
#[test]
    fun test_label_separates_deployments_of_one_creator() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let creator = account::create_account_for_test(@0x1A20);
    let creator_addr = signer::address_of(&creator);

    let first = deploy_ra_labelled(&creator, b"alpha", @0x91B1);
    let second = deploy_ra_labelled(&creator, b"beta", @0x91B2);

    // Both exist, and they are different accounts rather than one address reused.
    assert!(account::exists_at(first), 0);
    assert!(account::exists_at(second), 1);
    assert!(first != second, 2);

    // Each is still exactly what the prediction says, which is what lets a package be compiled against
    // its final address before the account exists.
    assert!(first == vault::predict_next_contract_address(creator_addr, b"alpha"), 3);
    assert!(second == vault::predict_next_contract_address(creator_addr, b"beta"), 4);

    // And the label is what separates them, not the order: predicting again changes nothing.
    assert!(vault::predict_next_contract_address(creator_addr, b"alpha") == first, 5);
}

/// A label is required. An empty one would silently reuse the unlabelled address, which is exactly the
/// ambiguity the label exists to remove.
#[test]
#[expected_failure(abort_code = 0x10015, location = dao_contracts_vault::vault)]
fun test_deploy_with_empty_label_aborts() {
    let factory = account::create_account_for_test(@dao_contracts_vault);
    vault::initialize(&factory);

    let creator = account::create_account_for_test(@0x1A21);
    vault::deploy_autonomous_contract(
        &creator,
        vector::empty<u8>(),
        vector::empty<u8>(),
        vector::empty<vector<u8>>(),
        @0x91B3,
    );
}

/// An oversized label is refused so the seed cannot be inflated into something costlier to hash than the
/// deployment it names.
#[test]
#[expected_failure(abort_code = 0x10016, location = dao_contracts_vault::vault)]
fun test_deploy_with_oversized_label_aborts() {
    let factory = account::create_account_for_test(@dao_contracts_vault);
    vault::initialize(&factory);

    let creator = account::create_account_for_test(@0x1A22);
    let label = b"x";
    let i = 0;
    while (i < 64) {
        vector::push_back(&mut label, 120);
        i = i + 1;
    };

    vault::deploy_autonomous_contract(
        &creator,
        label,
        vector::empty<u8>(),
        vector::empty<vector<u8>>(),
        @0x91B4,
    );
}

/// A module that administers itself can never be administered again, so it must be refused at deploy.
///
/// `assert_authorized` requires the caller to BE the admin, and the only signer that ever exists for an
/// Autonomous Resource Account is the factory's own SignerCapability. Nobody can sign as the module, so
/// upgrade, transfer and renounce would all be unreachable forever. `transfer_admin` already guards the
/// same case on reassignment; this pins deploy to the same rule.
#[test]
#[expected_failure(abort_code = 0x10011, location = dao_contracts_vault::vault)]
fun test_cannot_deploy_with_module_as_own_admin() {
    let factory = account::create_account_for_test(@dao_contracts_vault);
    vault::initialize(&factory);

    let creator = account::create_account_for_test(@0x1A10);
    // The address the module is about to be published to, used as its own admin.
    let self_addr = vault::predict_next_contract_address(signer::address_of(&creator), default_label());

    vault::deploy_autonomous_contract(
        &creator,
        default_label(),
        vector::empty<u8>(),
        vector::empty<vector<u8>>(),
        self_addr,
    );
}

#[test]
fun test_deploy_and_renounce_contract_ra() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let creator = account::create_account_for_test(@0x1002);
        let dao = @0x9001;
        let predicted = deploy_ra(&creator, dao);

        assert!(vault::get_contract_admin(predicted) == dao, 0);
        assert!(!vault::is_contract_renounced(predicted), 1);
        assert!(vault::get_total_contracts() == 1, 2);

        // Only the DAO admin can renounce the autonomous contract.
        let dao_signer = account::create_account_for_test(dao);
        vault::renounce_contract(&dao_signer, predicted);

        assert!(vault::is_contract_renounced(predicted), 3);
        assert!(vault::get_contract_admin(predicted) == @0x0, 4);
        // The freeze is cryptographic and survives any future module version.
        assert!(vault::is_cryptographically_frozen(predicted), 5);
        assert!(!account::is_signer_capability_offered(predicted), 6);
    }

    #[test]
    fun test_deploy_immutable_from_genesis() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let creator = account::create_account_for_test(@0x1040);
        // No owner: the package is published and frozen in the same transaction.
        let predicted = deploy_ra_labelled(&creator, b"immutable", @0x0);

        assert!(vault::is_contract_renounced(predicted), 0);
        assert!(vault::is_cryptographically_frozen(predicted), 1);
        assert!(vault::get_contract_admin(predicted) == @0x0, 2);
        assert!(!account::is_signer_capability_offered(predicted), 3);
        // Not governed: there is no ManagedContract, only the tombstone.
        assert!(!vault::is_eoa_contract(predicted), 4);
        assert!(vault::get_eoa_security_status(predicted) == STATUS_PERMANENTLY_RENOUNCED, 5);
    }


    #[test]
    fun test_donate_eoa_to_dao_creates_proxy_and_sets_admin() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let dao = @0x9100;
        let _dao_signer = account::create_account_for_test(dao);

        let (pk_bytes, sk) = new_ed25519_eoa();
        let eoa = donate(pk_bytes, &sk, dao);
        let eoa_addr = signer::address_of(&eoa);

        let proxy = vault::predict_eoa_proxy_address(eoa_addr);

        // The capability is delegated to the proxy and the factory record is set.
        assert!(account::is_signer_capability_offered(eoa_addr), 0);
        assert!(account::get_signer_capability_offer_for(eoa_addr) == proxy, 1);
        assert!(vault::get_eoa_proxy(eoa_addr) == proxy, 2);
        assert!(vault::get_contract_admin(eoa_addr) == dao, 3);
        assert!(vault::get_total_contracts() == 1, 4);

        // The donation is not complete until the owner burns the key in a second tx.
        assert!(vault::get_eoa_security_status(eoa_addr) == STATUS_HAZARD_KEY_STILL_ACTIVE, 5);
        assert!(!vault::is_eoa_donation_complete(eoa_addr), 6);
    }

    #[test]
    fun test_admin_transfer() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let creator = account::create_account_for_test(@0x1020);
        let dao = @0x9020;
        let predicted = deploy_ra(&creator, dao);

        let dao_signer = account::create_account_for_test(dao);
        let new_admin = @0x9021;

        // Direct 1-step transfer
        vault::transfer_admin(&dao_signer, predicted, new_admin);
        assert!(vault::get_contract_admin(predicted) == new_admin, 0);
    }

    #[test]
    #[expected_failure(abort_code = 0x1000b, location = dao_contracts_vault::vault)]
    fun test_cannot_transfer_to_zero_admin() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);
        let creator = account::create_account_for_test(@0x1025);
        let dao = @0x9025;
        let predicted = deploy_ra(&creator, dao);
        let dao_signer = account::create_account_for_test(dao);
        // Transferring to @0x0 would permanently brick the contract.
        vault::transfer_admin(&dao_signer, predicted, @0x0);
    }

    #[test]
    #[expected_failure(abort_code = 0x10011, location = dao_contracts_vault::vault)]
    fun test_cannot_deploy_with_factory_as_admin() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);
        let creator = account::create_account_for_test(@0x1026);
        vault::deploy_autonomous_contract(
            &creator,
        default_label(),
            vector::empty<u8>(),
            vector::empty<vector<u8>>(),
            @dao_contracts_vault,
        );
    }

    #[test]
    fun test_renounce_donated_eoa_revokes_capability() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let creator = account::create_account_for_test(@0x2001);

        // Simulated key-dead EOA (a resource account is created with ZERO_AUTH_KEY).
        let (eoa_signer, _eoa_cap) = account::create_resource_account(&creator, b"fake-eoa");
        let eoa_addr = signer::address_of(&eoa_signer);
        assert!(vault::is_eoa_key_annihilated(eoa_addr), 0);

        // Create the deterministic proxy and capture its SignerCapability.
        let proxy_cap = vault::create_eoa_proxy_for_test(&eoa_signer);
        let proxy_addr = vault::predict_eoa_proxy_address(eoa_addr);

        // Simulate the delegated capability offer to the proxy and install the factory record.
        vault::set_signer_capability_offer_for_test(eoa_addr, proxy_addr);
        let dao = @0x9200;
        let _dao_signer = account::create_account_for_test(dao);
        vault::install_managed_eoa_for_test(&eoa_signer, dao, proxy_cap);

        assert!(!vault::is_contract_renounced(eoa_addr), 1);
        assert!(vault::get_contract_admin(eoa_addr) == dao, 2);

        // DAO renounces -> proxy revokes the EOA capability -> true on-chain freeze.
        let dao_signer = account::create_account_for_test(dao);
        vault::renounce_contract(&dao_signer, eoa_addr);

        assert!(!account::is_signer_capability_offered(eoa_addr), 3);
        assert!(vault::is_eoa_permanently_immutable(eoa_addr), 4);
        assert!(vault::get_eoa_security_status(eoa_addr) == STATUS_PERMANENTLY_RENOUNCED, 5);
        assert!(vault::is_contract_renounced(eoa_addr), 6);
        assert!(vault::get_contract_admin(eoa_addr) == @0x0, 7);
        assert!(vault::is_cryptographically_frozen(eoa_addr), 8);
    }

    #[test]
    #[expected_failure(abort_code = 0x30005, location = dao_contracts_vault::vault)]
    fun test_upgrade_eoa_without_key_burn_aborts() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let dao = @0x9006;
        let _dao_signer = account::create_account_for_test(dao);

        let (pk_bytes, sk) = new_ed25519_eoa();
        let eoa = donate(pk_bytes, &sk, dao);
        let eoa_addr = signer::address_of(&eoa);

        // Key is still alive, so the cryptographic safety lock must abort before publishing.
        let dao_signer = account::create_account_for_test(dao);
        vault::upgrade_contract(
            &dao_signer,
            eoa_addr,
            vector::empty<u8>(),
            vector::empty<vector<u8>>(),
        );
    }

    #[test]
    #[expected_failure(abort_code = 0x60003, location = dao_contracts_vault::vault)]
    fun test_upgrade_unknown_contract_aborts() {
        let caller = account::create_account_for_test(@0x1008);
        vault::upgrade_contract(
            &caller,
            @0xABCE,
            vector::empty<u8>(),
            vector::empty<vector<u8>>(),
        );
    }

    #[test]
    #[expected_failure(abort_code = 0x60003, location = dao_contracts_vault::vault)]
    fun test_transfer_unknown_contract_aborts() {
        let caller = account::create_account_for_test(@0x1005);
        vault::transfer_admin(&caller, @0xABCD, @0x9004);
    }

    #[test]
    #[expected_failure(abort_code = 0x50001, location = dao_contracts_vault::vault)]
    fun test_stranger_cannot_renounce() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);
        let creator = account::create_account_for_test(@0x1030);
        let dao = @0x9030;
        let predicted = deploy_ra(&creator, dao);

        let stranger = account::create_account_for_test(@0x9031);
        vault::renounce_contract(&stranger, predicted);
    }

    #[test]
    fun test_catalog_pagination() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let c1 = account::create_account_for_test(@0x1101);
        let c2 = account::create_account_for_test(@0x1102);
        let c3 = account::create_account_for_test(@0x1103);
        deploy_ra(&c1, @0x9101);
        deploy_ra(&c2, @0x9102);
        deploy_ra(&c3, @0x9103);

        assert!(vault::get_total_contracts() == 3, 0);

        let first = vault::get_contracts_page(0, 2);
        assert!(vector::length(&first) == 2, 2);

        let rest = vault::get_contracts_page(2, 50);
        assert!(vector::length(&rest) == 1, 3);

        // Out-of-range offset yields an empty page instead of aborting.
        assert!(vector::is_empty(&vault::get_contracts_page(99, 50)), 4);

        // An offset near u64::MAX used to abort the whole view, because `offset + count` overflowed.
        // A caller asking for an absurd page should get an empty one.
        assert!(vector::is_empty(&vault::get_contracts_page(18446744073709551615, 50)), 5);

        // `get_all_contracts` used to serialize the whole registry in one response. It now forwards
        // to the paginated view, so it stays bounded and remains readable.
        assert!(vector::length(&vault::get_all_contracts()) == 3, 6);
    }

    /// One creator's own deployments, which is what the client needs to answer "which labels have I used?"
    /// without paging the whole registry and filtering it itself.
    #[test]
    fun test_contracts_by_creator() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let mine = account::create_account_for_test(@0x1301);
        let theirs = account::create_account_for_test(@0x1302);
        let mine_addr = signer::address_of(&mine);

        deploy_ra_labelled(&mine, b"alpha", @0x9201);
        deploy_ra_labelled(&theirs, b"beta", @0x9202);
        deploy_ra_labelled(&mine, b"gamma", @0x9203);

        let found = vault::get_contracts_by_creator(mine_addr, 50);
        assert!(vector::length(&found) == 2, 0);
        // Newest first, so the most recent deployment is the one the caller sees without scrolling.
        assert!(vector::borrow(&found, 0).contract_address
            == vault::predict_next_contract_address(mine_addr, b"gamma"), 1);
        assert!(vector::borrow(&found, 1).contract_address
            == vault::predict_next_contract_address(mine_addr, b"alpha"), 2);
        // Every entry is the creator's own, never a neighbour's.
        assert!(vector::borrow(&found, 0).creator == mine_addr, 3);
        assert!(vector::borrow(&found, 1).creator == mine_addr, 4);

        // A creator with nothing registered gets an empty vector, not an abort.
        assert!(vector::is_empty(&vault::get_contracts_by_creator(@0x9999, 50)), 5);

        // The limit is honoured, and takes the newest entries rather than the oldest.
        let limited = vault::get_contracts_by_creator(mine_addr, 1);
        assert!(vector::length(&limited) == 1, 6);
        assert!(vector::borrow(&limited, 0).contract_address
            == vault::predict_next_contract_address(mine_addr, b"gamma"), 7);

        // Absurd limits are clamped rather than trusted.
        assert!(vector::length(&vault::get_contracts_by_creator(mine_addr, 18446744073709551615)) == 2, 8);
    }

    /// A creator who has never deployed is not an error case, and neither is asking before the catalog
    /// exists at all - both must return an empty list rather than aborting a view.
    #[test]
    fun test_contracts_by_creator_without_catalog() {
        assert!(vector::is_empty(&vault::get_contracts_by_creator(@0x1301, 50)), 0);
    }

    /// A registration must never be aliased onto slot 0. `record_in_catalog` used to return 0 when
    /// the catalog was missing, which meant a later `update_catalog_at(0, ...)` rewrote whichever
    /// contract legitimately owned that slot. Now it aborts instead.
    #[test]
    #[expected_failure(abort_code = 0x60013, location = dao_contracts_vault::vault)]
    fun test_registration_without_catalog_aborts() {
        let creator = account::create_account_for_test(@0x1201);
        // Deliberately no `initialize`, so no FactoryCatalog exists at @dao_contracts_vault.
        deploy_ra(&creator, @0x9101);
    }

    /// The threat `get_offer_target` exists to expose: the delegation was handed to someone else,
    /// so the factory record's `admin` no longer controls the account even though nothing about the
    /// record changed.
    #[test]
    fun test_offer_target_detects_redirected_delegation() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let eoa = account::create_account_for_test(@0x3301);
        let eoa_addr = signer::address_of(&eoa);
        let proxy_addr = vault::predict_eoa_proxy_address(eoa_addr);

        let proxy_cap = vault::create_eoa_proxy_for_test(&eoa);
        vault::set_signer_capability_offer_for_test(eoa_addr, proxy_addr);
        vault::install_managed_eoa_for_test(&eoa, @0x9401, proxy_cap);

        // Intact: the view reports our own proxy, which is what makes it comparable.
        assert!(vault::get_offer_target(eoa_addr) == proxy_addr, 0);
        // Key alive + offer pointing at our proxy is the dual-master hazard, as reported today.
        assert!(vault::get_eoa_security_status(eoa_addr) == 3, 1);

        // An unrelated address takes the delegation. `account::offer_signer_capability` is
        // `public entry` and ends in `option::swap_or_fill`, so any signed offer replaces the
        // previous recipient. Simulated with the framework's own test hook.
        let attacker = account::create_account_for_test(@0xBAD1);
        vault::set_signer_capability_offer_for_test(eoa_addr, signer::address_of(&attacker));

        assert!(vault::get_offer_target(eoa_addr) == signer::address_of(&attacker), 2);

        // The record still claims the original admin: this is exactly why comparing the two views is
        // the only way to notice, since the admin field is not consulted by the redirect at all.
        assert!(vault::get_contract_admin(eoa_addr) == @0x9401, 3);

        // The status collapses to UNMANAGED. The account is no longer governed by anyone in the
        // factory, yet nothing in the record shows it - this is the state the UI has to surface as a
        // hijack warning rather than as an untouched account.
        assert!(vault::get_eoa_security_status(eoa_addr) == 0, 4);
    }

    #[test]
    fun test_offer_target_is_zero_without_any_offer() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let eoa = account::create_account_for_test(@0x3401);
        let eoa_addr = signer::address_of(&eoa);

        // The view must answer for an account that exists but has never offered anything, rather
        // than aborting the way the raw framework helper does.
        assert!(vault::get_offer_target(eoa_addr) == @0x0, 0);
    }

    #[test]
    fun test_offer_target_is_zero_for_unknown_address() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        // Never created on chain. `borrow_global<Account>` aborts for this, so the view has to guard
        // for existence before touching the account resource.
        assert!(vault::get_offer_target(@0xDEAD1) == @0x0, 0);
    }

    #[test]
    fun test_get_admin_and_kind_reports_path() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let creator = account::create_account_for_test(@0x1040);
        let dao = @0x9040;
        let _dao_signer = account::create_account_for_test(dao);
        let predicted = deploy_ra(&creator, dao);

        // An Autonomous Resource Account reports the DAO admin and is_eoa == false.
        let (admin, is_eoa) = vault::get_admin_and_kind(predicted);
        assert!(admin == dao, 0);
        assert!(!is_eoa, 1);
        assert!(vault::get_contract_creator(predicted) == signer::address_of(&creator), 2);
    }

    #[test]
    fun test_get_admin_and_kind_reports_donated_eoa() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let dao = @0x9041;
        let _dao_signer = account::create_account_for_test(dao);
        let (pk_bytes, sk) = new_ed25519_eoa();
        let eoa = donate(pk_bytes, &sk, dao);
        let eoa_addr = signer::address_of(&eoa);

        let (admin, is_eoa) = vault::get_admin_and_kind(eoa_addr);
        assert!(admin == dao, 0);
        assert!(is_eoa, 1);
        assert!(vault::get_contract_creator(eoa_addr) == eoa_addr, 2);
    }

    #[test]
    #[expected_failure(abort_code = 0x60003, location = dao_contracts_vault::vault)]
    fun test_get_admin_and_kind_unknown_contract_aborts() {
        vault::get_admin_and_kind(@0xABCD);
    }

    /// On testnet the creator may be their own admin. `deploy_autonomous_contract` has the
    /// `dao_admin != creator_addr` guard commented out, so a solo deployer does not have to name a second
    /// address just to get a module published.
    ///
    /// This test pins that choice rather than the guard: re-enabling the guard makes it fail, which is the
    /// signal that the test, the client's admin validation and the error translation all move together.
    #[test]
    fun test_deploy_with_creator_as_own_admin_succeeds_on_testnet() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let creator = account::create_account_for_test(@0x1027);
        let creator_addr = signer::address_of(&creator);
        let predicted = vault::predict_next_contract_address(creator_addr, default_label());

        vault::deploy_autonomous_contract(
            &creator,
            default_label(),
            vector::empty<u8>(),
            vector::empty<vector<u8>>(),
            creator_addr,
        );

        assert!(account::exists_at(predicted), 0);
        assert!(vault::get_contract_admin(predicted) == creator_addr, 1);
    }

    #[test]
    #[expected_failure(abort_code = 0x10011, location = dao_contracts_vault::vault)]
    fun test_cannot_donate_with_self_admin() {
        let (pk_bytes, sk) = new_ed25519_eoa();
        let eoa = account::create_account_from_ed25519_public_key(pk_bytes);
        let eoa_addr = signer::address_of(&eoa);
        let challenge = account::get_signer_capability_offer_proof_challenge_v2(
            eoa_addr,
            vault::predict_eoa_proxy_address(eoa_addr),
        );
        let sig_bytes = ed25519::signature_to_bytes(&ed25519::sign_struct(&sk, challenge));
        // Donating with dao_admin == eoa_addr is blocked (H1 fix)
        vault::donate_eoa_to_dao(&eoa, eoa_addr, sig_bytes, 0, pk_bytes);
    }

    #[test]
    #[expected_failure(abort_code = 0x10011, location = dao_contracts_vault::vault)]
    fun test_cannot_transfer_admin_to_contract_itself() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);
        let creator = account::create_account_for_test(@0x1028);
        let dao = @0x9028;
        let predicted = deploy_ra(&creator, dao);
        let dao_signer = account::create_account_for_test(dao);
        // Transferring admin to contract address itself is blocked (H1 fix)
        vault::transfer_admin(&dao_signer, predicted, predicted);
    }

    #[test]
    #[expected_failure(abort_code = 0x50001, location = dao_contracts_vault::vault)]
    fun test_stranger_cannot_initialize_factory() {
        let stranger = account::create_account_for_test(@0x9999);
        vault::initialize(&stranger);
    }

    #[test]
    fun test_package_admin_lifecycle_and_renounce() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let initial_admin = @0x9501;
        let admin_signer = account::create_account_for_test(initial_admin);
        let cap = vault::create_autonomous_ra_for_test(&factory, default_label());

        publisher::initialize_package_admin_for_test(&factory, initial_admin, cap);

        assert!(!publisher::is_package_renounced(), 0);
        assert!(publisher::get_package_admin() == initial_admin, 1);

        // Transfer admin to new admin
        let next_admin = @0x9502;
        publisher::transfer_package_admin(&admin_signer, next_admin);
        assert!(publisher::get_package_admin() == next_admin, 2);

        // Next admin permanently renounces factory governance
        let next_admin_signer = account::create_account_for_test(next_admin);
        publisher::renounce_package_admin(&next_admin_signer);

        // Factory is now permanently and irreversibly immutable
        assert!(publisher::is_package_renounced(), 3);
        assert!(publisher::get_package_admin() == @0x0, 4);
    }

    #[test]
    #[expected_failure(abort_code = 0x50001, location = dao_contracts_vault::publisher)]
    fun test_stranger_cannot_renounce_package() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let real_admin = @0x9503;
        let cap = vault::create_autonomous_ra_for_test(&factory, default_label());
        publisher::initialize_package_admin_for_test(&factory, real_admin, cap);

        let stranger = account::create_account_for_test(@0x9999);
        publisher::renounce_package_admin(&stranger);
    }

    // =========================================================================
    // Cancelling a donation (available only while the EOA still holds its key)
    // =========================================================================

    /// A wrong DAO admin, or a donation sent from the wrong wallet, must be recoverable while the
    /// key is alive. Cancelling has to leave the EOA able to donate again, which means both offers
    /// are cleared before the capability is destroyed.
    #[test]
    fun test_cancel_eoa_delegation_restores_account() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        // A normal test account: `create_account_unchecked` sets the auth key to the address bytes,
        // so this EOA counts as key-alive.
        let eoa = account::create_account_for_test(@0x3101);
        let eoa_addr = signer::address_of(&eoa);
        let proxy_addr = vault::predict_eoa_proxy_address(eoa_addr);

        let proxy_cap = vault::create_eoa_proxy_for_test(&eoa);
        vault::set_signer_capability_offer_for_test(eoa_addr, proxy_addr);
        let dao = @0x9401;
        let _dao_signer = account::create_account_for_test(dao);
        vault::install_managed_eoa_for_test(&eoa, dao, proxy_cap);

        assert!(vault::is_eoa_contract(eoa_addr), 0);
        assert!(account::get_signer_capability_offer_for(eoa_addr) == proxy_addr, 1);

        vault::cancel_eoa_delegation(&eoa, eoa_addr);

        // Record gone, and neither the EOA nor the proxy still offers its capability.
        assert!(!vault::is_eoa_contract(eoa_addr), 2);
        assert!(!vault::is_contract_renounced(eoa_addr), 3);
        assert!(!account::is_signer_capability_offered(eoa_addr), 4);
        assert!(!account::is_signer_capability_offered(proxy_addr), 5);

        // The derived proxy must be reusable: `create_resource_account` aborts when the account still
        // self-offers, so this is what proves a second donation is possible.
        let _reusable = vault::create_eoa_proxy_for_test(&eoa);
    }

    #[test]
    #[expected_failure(abort_code = 0x30012, location = dao_contracts_vault::vault)]
    fun test_cancel_after_key_annihilation_aborts() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let creator = account::create_account_for_test(@0x3102);
        // A Resource Account is created with ZERO_AUTH_KEY, which is exactly the "committed" state.
        let (eoa_signer, _eoa_cap) = account::create_resource_account(&creator, b"cancel-committed");
        let eoa_addr = signer::address_of(&eoa_signer);
        let proxy_addr = vault::predict_eoa_proxy_address(eoa_addr);

        let proxy_cap = vault::create_eoa_proxy_for_test(&eoa_signer);
        vault::set_signer_capability_offer_for_test(eoa_addr, proxy_addr);
        vault::install_managed_eoa_for_test(&eoa_signer, @0x9402, proxy_cap);

        assert!(vault::is_eoa_key_annihilated(eoa_addr), 0);

        // Once the key is gone the delegation is final: only the DAO's renounce applies.
        vault::cancel_eoa_delegation(&eoa_signer, eoa_addr);
    }

    #[test]
    #[expected_failure(abort_code = 0x50001, location = dao_contracts_vault::vault)]
    fun test_cancel_by_non_owner_aborts() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let eoa = account::create_account_for_test(@0x3103);
        let eoa_addr = signer::address_of(&eoa);
        let proxy_addr = vault::predict_eoa_proxy_address(eoa_addr);

        let proxy_cap = vault::create_eoa_proxy_for_test(&eoa);
        vault::set_signer_capability_offer_for_test(eoa_addr, proxy_addr);
        vault::install_managed_eoa_for_test(&eoa, @0x9403, proxy_cap);

        // A different signer cannot cancel someone else's delegation.
        let stranger = account::create_account_for_test(@0x9404);
        vault::cancel_eoa_delegation(&stranger, eoa_addr);
    }

    #[test]
    #[expected_failure(abort_code = 0x10011, location = dao_contracts_vault::vault)]
    fun test_cannot_transfer_to_factory_as_admin() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);
        let creator = account::create_account_for_test(@0x1029);
        let dao = @0x9029;
        let predicted = deploy_ra(&creator, dao);
        let dao_signer = account::create_account_for_test(dao);
        vault::transfer_admin(&dao_signer, predicted, @dao_contracts_vault);
    }

    #[test]
    #[expected_failure(abort_code = 0x10011, location = dao_contracts_vault::vault)]
    fun test_cannot_donate_with_factory_as_dao_admin() {
        let (pk_bytes, sk) = new_ed25519_eoa();
        let eoa = account::create_account_from_ed25519_public_key(pk_bytes);
        let eoa_addr = signer::address_of(&eoa);
        let challenge = account::get_signer_capability_offer_proof_challenge_v2(
            eoa_addr,
            vault::predict_eoa_proxy_address(eoa_addr),
        );
        let sig_bytes = ed25519::signature_to_bytes(&ed25519::sign_struct(&sk, challenge));
        vault::donate_eoa_to_dao(&eoa, @dao_contracts_vault, sig_bytes, 0, pk_bytes);
    }

    #[test]
    fun test_vault_fee_config_and_transfer_admin() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let (initial_fee, initial_recip, initial_admin) = vault_fee::get_fee_info();
        assert!(initial_fee == 0, 0);
        assert!(initial_admin == @admin, 1);
        assert!(initial_recip == @admin, 2);

        let (min_fee, max_fee) = vault_fee::get_fee_limits();
        assert!(min_fee == 100_000_000, 3); // 1 SUPRA
        assert!(max_fee == 137_000_000_000_000, 4); // 1.37M SUPRA

        // Fee admin updates config: 10 SUPRA fee
        let admin_signer = account::create_account_for_test(initial_admin);
        let new_recipient = @0x8888;
        vault_fee::set_fee_config(&admin_signer, new_recipient, 1_000_000_000);

        let (fee_amount, recipient, fee_admin) = vault_fee::get_fee_info();
        assert!(fee_amount == 1_000_000_000, 5);
        assert!(recipient == new_recipient, 6);
        assert!(fee_admin == initial_admin, 7);

        // Transfer fee admin authority
        let new_fee_admin = @0x9991;
        vault_fee::transfer_fee_admin(&admin_signer, new_fee_admin);
        assert!(vault_fee::get_fee_admin() == new_fee_admin, 8);

        // New fee admin sets fee to 0 (free promo)
        let new_admin_signer = account::create_account_for_test(new_fee_admin);
        vault_fee::set_fee_config(&new_admin_signer, @0x0, 0);
        let (updated_fee, _, _) = vault_fee::get_fee_info();
        assert!(updated_fee == 0, 9);
    }

    #[test]
    #[expected_failure(abort_code = 0x10003, location = dao_contracts_vault::vault_fee)]
    fun test_vault_fee_below_minimum_aborts() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);
        let admin_signer = account::create_account_for_test(@admin);
        // Fee of 50_000_000 octas is below 1 SUPRA minimum
        vault_fee::set_fee_config(&admin_signer, @0x8888, 50_000_000);
    }

    #[test]
    #[expected_failure(abort_code = 0x10004, location = dao_contracts_vault::vault_fee)]
    fun test_vault_fee_exceeds_maximum_aborts() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);
        let admin_signer = account::create_account_for_test(@admin);
        // Fee exceeding 137_000_000_000_000 octas safety cap
        vault_fee::set_fee_config(&admin_signer, @0x8888, 137_000_000_000_001);
    }

    #[test]
    fun test_dust_griefing_resilience() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let creator = account::create_account_for_test(@0x7001);
        let creator_addr = signer::address_of(&creator);
        let label = b"dust-test";
        let predicted = vault::predict_next_contract_address(creator_addr, label);

        // Simulate dust transfer: the account is pre-created by receiving a coin
        let _prefunded = account::create_account_for_test(predicted);
        assert!(account::exists_at(predicted), 0);
        assert!(!vault::is_factory_managed(predicted), 1);

        // Factory deployment still succeeds because seq_num == 0 and no signer cap is offered!
        vault::deploy_autonomous_contract(
            &creator,
            label,
            vector::empty<u8>(),
            vector::empty<vector<u8>>(),
            @0x9001,
        );

        assert!(vault::is_factory_managed(predicted), 2);
        assert!(vault::get_contract_admin(predicted) == @0x9001, 3);
    }

    #[test]
    fun test_rotation_capability_revocation_and_views() {
        let factory = account::create_account_for_test(@dao_contracts_vault);
        vault::initialize(&factory);

        let (pk_bytes, sk) = new_ed25519_eoa();
        let eoa = account::create_account_from_ed25519_public_key(pk_bytes);
        let eoa_addr = signer::address_of(&eoa);

        // Pre-offer a rotation capability to simulate a key-recovery backdoor setup
        account::set_rotation_capability_offer(eoa_addr, @0xBAD1);
        assert!(account::is_rotation_capability_offered(eoa_addr), 0);
        assert!(vault::get_rotation_offer_target(eoa_addr) == @0xBAD1, 1);

        // Donating to DAO automatically revokes any existing rotation capability!
        let challenge = account::get_signer_capability_offer_proof_challenge_v2(
            eoa_addr,
            vault::predict_eoa_proxy_address(eoa_addr),
        );
        let sig_bytes = ed25519::signature_to_bytes(&ed25519::sign_struct(&sk, challenge));
        vault::donate_eoa_to_dao(&eoa, @0x9100, sig_bytes, 0, pk_bytes);

        // Verification: rotation capability offer was wiped clean!
        assert!(!account::is_rotation_capability_offered(eoa_addr), 2);
        assert!(vault::get_rotation_offer_target(eoa_addr) == @0x0, 3);
    }
}