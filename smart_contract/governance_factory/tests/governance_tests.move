#[test_only]
module governance_factory::governance_tests {
    use std::signer;
    use std::vector;
    use std::bcs;
        use supra_framework::account;
    use aptos_std::ed25519;
    use governance_factory::governance;
    use governance_factory::publisher;

    // Status constants (mirrors governance) for readable assertions.
    const STATUS_UNMANAGED: u8 = 0;
    const STATUS_PERMANENTLY_RENOUNCED: u8 = 1;
    const STATUS_VERIFIED_DAO_GOVERNED: u8 = 2;
    const STATUS_HAZARD_KEY_STILL_ACTIVE: u8 = 3;

    // Abort codes mapped through std::error (category << 16 | reason):
    // E_NOT_ADMIN (1): error::permission_denied -> 0x50001
    // E_CONTRACT_NOT_FOUND (3): error::not_found -> 0x60003
    // E_EOA_KEY_NOT_BURNED (5): error::invalid_state -> 0x30005
    // E_CODE_ON_RENOUNCE (7): error::invalid_argument -> 0x10007
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
            governance::predict_eoa_proxy_address(eoa_addr),
        );
        let sig_bytes = ed25519::signature_to_bytes(&ed25519::sign_struct(sk, challenge));
        governance::donate_eoa_to_dao(&eoa, dao, sig_bytes, 0, pk_bytes);
        eoa
    }

    fun new_ed25519_eoa(): (vector<u8>, ed25519::SecretKey) {
        let (sk, pk) = ed25519::generate_keys();
        (ed25519::validated_public_key_to_bytes(&pk), sk)
    }

    /// Deploys an Autonomous Resource Account and returns (ra_address, dao).
    fun deploy_ra(creator: &signer, dao: address): address {
        let predicted = governance::predict_next_contract_address(signer::address_of(creator));
        governance::deploy_autonomous_contract(
            creator,
            vector::empty<u8>(),
            vector::empty<vector<u8>>(),
            dao,
        );
        predicted
    }

    #[test]
    fun test_status_unmanaged_for_unknown_address() {
        assert!(governance::get_eoa_security_status(@0xDEAD) == STATUS_UNMANAGED, 0);
        assert!(!governance::is_eoa_key_annihilated(@0xDEAD), 1);
        assert!(!governance::is_eoa_permanently_immutable(@0xDEAD), 2);
        assert!(!governance::is_eoa_donation_complete(@0xDEAD), 3);
    }

    #[test]
    fun test_plain_eoa_is_unmanaged() {
        let eoa = account::create_account_for_test(@0x100A);
        // A plain EOA has a live key and no capability offer.
        assert!(governance::get_eoa_security_status(signer::address_of(&eoa)) == STATUS_UNMANAGED, 0);
    }

    #[test]
    fun test_unmanaged_resource_account_is_not_dao_governed() {
        let creator = account::create_account_for_test(@0x1009);
        // External Resource accounts are created with ZERO_AUTH_KEY and self-offer their capability.
        let (ra_signer, _cap) = account::create_resource_account(&creator, b"status-check");
        let ra_addr = signer::address_of(&ra_signer);

        assert!(governance::is_eoa_key_annihilated(ra_addr), 0);
        assert!(account::is_signer_capability_offered(ra_addr), 1);
        // H2 FIX VERIFICATION: Must return STATUS_UNMANAGED, NOT STATUS_VERIFIED_DAO_GOVERNED!
        assert!(governance::get_eoa_security_status(ra_addr) == STATUS_UNMANAGED, 2);
        assert!(!governance::is_eoa_donation_complete(ra_addr), 3);
        assert!(!governance::is_eoa_permanently_immutable(ra_addr), 4);
        assert!(!governance::is_factory_managed(ra_addr), 5);
    }

    #[test]
    fun test_factory_resource_account_is_dao_governed() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);
        let creator = account::create_account_for_test(@0x1010);
        let dao = @0x9010;
        let predicted = deploy_ra(&creator, dao);

        assert!(governance::is_factory_managed(predicted), 0);
        assert!(governance::get_eoa_security_status(predicted) == STATUS_VERIFIED_DAO_GOVERNED, 1);
    }

    #[test]
    fun test_predict_matches_framework_derivation() {
        let creator = @0x1001;
        let predicted = governance::predict_next_contract_address(creator);
        assert!(predicted == account::create_resource_address(&creator, b"governance_factory::autonomous_v1"), 1);
    }

    #[test]
    fun test_predict_is_stable_for_same_creator() {
        let creator = account::create_account_for_test(@0x100F);
        let a = governance::predict_next_contract_address(signer::address_of(&creator));
        deploy_ra(&creator, @0x9001);
        let b = governance::predict_next_contract_address(signer::address_of(&creator));
        // A fixed seed keeps the RA address stable across deployments for the same creator.
        assert!(a == b, 0);
    }

    #[test]
    fun test_deploy_and_renounce_resource_account() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);

        let creator = account::create_account_for_test(@0x1002);
        let dao = @0x9001;
        let predicted = deploy_ra(&creator, dao);

        assert!(governance::get_contract_admin(predicted) == dao, 0);
        assert!(!governance::is_contract_renounced(predicted), 1);
        assert!(governance::get_total_contracts() == 1, 2);

        // Only the DAO admin can renounce the autonomous contract.
        let dao_signer = account::create_account_for_test(dao);
        governance::renounce_contract(&dao_signer, predicted, vector::empty<vector<u8>>());

        assert!(governance::is_contract_renounced(predicted), 3);
        assert!(governance::get_contract_admin(predicted) == @0x0, 4);
        // The freeze is cryptographic and survives any future module version.
        assert!(governance::is_cryptographically_frozen(predicted), 5);
        assert!(!account::is_signer_capability_offered(predicted), 6);
    }

    #[test]
    #[expected_failure(abort_code = 0x10007, location = governance_factory::governance)]
    fun test_renounce_with_code_aborts_explicitly() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);
        let creator = account::create_account_for_test(@0x1013);
        let dao = @0x9013;
        let predicted = deploy_ra(&creator, dao);

        let dao_signer = account::create_account_for_test(dao);
        governance::renounce_contract(&dao_signer, predicted, vector[vector::empty<u8>()]);
    }

    #[test]
    #[expected_failure(abort_code = 0x1000d, location = governance_factory::governance)]
    fun test_deep_freeze_rejects_donated_eoa() {
        let (pk_bytes, sk) = new_ed25519_eoa();
        let dao = @0x9014;
        let _dao_signer = account::create_account_for_test(dao);
        let eoa = donate(pk_bytes, &sk, dao);
        let eoa_addr = signer::address_of(&eoa);

        let dao_signer = account::create_account_for_test(dao);
        governance::renounce_resource_account(
            &dao_signer,
            eoa_addr,
            vector::empty<u8>(),
            vector[vector::empty<u8>()],
        );
    }

    #[test]
    fun test_donate_eoa_to_dao_creates_proxy_and_sets_admin() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);

        let dao = @0x9100;
        let _dao_signer = account::create_account_for_test(dao);

        let (pk_bytes, sk) = new_ed25519_eoa();
        let eoa = donate(pk_bytes, &sk, dao);
        let eoa_addr = signer::address_of(&eoa);

        let proxy = governance::predict_eoa_proxy_address(eoa_addr);

        // The capability is delegated to the proxy and the factory record is set.
        assert!(account::is_signer_capability_offered(eoa_addr), 0);
        assert!(account::get_signer_capability_offer_for(eoa_addr) == proxy, 1);
        assert!(governance::get_eoa_proxy(eoa_addr) == proxy, 2);
        assert!(governance::get_contract_admin(eoa_addr) == dao, 3);
        assert!(governance::get_total_contracts() == 1, 4);

        // The donation is not complete until the owner burns the key in a second tx.
        assert!(governance::get_eoa_security_status(eoa_addr) == STATUS_HAZARD_KEY_STILL_ACTIVE, 5);
        assert!(!governance::is_eoa_donation_complete(eoa_addr), 6);
    }

    #[test]
    fun test_admin_transfer() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);

        let creator = account::create_account_for_test(@0x1020);
        let dao = @0x9020;
        let predicted = deploy_ra(&creator, dao);

        let dao_signer = account::create_account_for_test(dao);
        let new_admin = @0x9021;

        // Direct 1-step transfer
        governance::transfer_admin(&dao_signer, predicted, new_admin);
        assert!(governance::get_contract_admin(predicted) == new_admin, 0);
    }

    #[test]
    #[expected_failure(abort_code = 0x1000b, location = governance_factory::governance)]
    fun test_cannot_transfer_to_zero_admin() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);
        let creator = account::create_account_for_test(@0x1025);
        let dao = @0x9025;
        let predicted = deploy_ra(&creator, dao);
        let dao_signer = account::create_account_for_test(dao);
        // Transferring to @0x0 would permanently brick the contract.
        governance::transfer_admin(&dao_signer, predicted, @0x0);
    }

    #[test]
    #[expected_failure(abort_code = 0x1000b, location = governance_factory::governance)]
    fun test_cannot_deploy_with_zero_admin() {
        let creator = account::create_account_for_test(@0x1026);
        governance::deploy_autonomous_contract(
            &creator,
            vector::empty<u8>(),
            vector::empty<vector<u8>>(),
            @0x0,
        );
    }

    #[test]
    fun test_renounce_donated_eoa_revokes_capability() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);

        let creator = account::create_account_for_test(@0x2001);

        // Simulated key-dead EOA (a resource account is created with ZERO_AUTH_KEY).
        let (eoa_signer, _eoa_cap) = account::create_resource_account(&creator, b"fake-eoa");
        let eoa_addr = signer::address_of(&eoa_signer);
        assert!(governance::is_eoa_key_annihilated(eoa_addr), 0);

        // Create the deterministic proxy and capture its SignerCapability.
        let proxy_cap = governance::create_eoa_proxy_for_test(&eoa_signer);
        let proxy_addr = governance::predict_eoa_proxy_address(eoa_addr);

        // Simulate the delegated capability offer to the proxy and install the factory record.
        governance::set_signer_capability_offer_for_test(eoa_addr, proxy_addr);
        let dao = @0x9200;
        let _dao_signer = account::create_account_for_test(dao);
        governance::install_managed_eoa_for_test(&eoa_signer, dao, proxy_cap);

        assert!(!governance::is_contract_renounced(eoa_addr), 1);
        assert!(governance::get_contract_admin(eoa_addr) == dao, 2);

        // DAO renounces -> proxy revokes the EOA capability -> true on-chain freeze.
        let dao_signer = account::create_account_for_test(dao);
        governance::renounce_contract(&dao_signer, eoa_addr, vector::empty<vector<u8>>());

        assert!(!account::is_signer_capability_offered(eoa_addr), 3);
        assert!(governance::is_eoa_permanently_immutable(eoa_addr), 4);
        assert!(governance::get_eoa_security_status(eoa_addr) == STATUS_PERMANENTLY_RENOUNCED, 5);
        assert!(governance::is_contract_renounced(eoa_addr), 6);
        assert!(governance::get_contract_admin(eoa_addr) == @0x0, 7);
        assert!(governance::is_cryptographically_frozen(eoa_addr), 8);
    }

    #[test]
    #[expected_failure(abort_code = 0x30005, location = governance_factory::governance)]
    fun test_upgrade_eoa_without_key_burn_aborts() {
        let dao = @0x9006;
        let _dao_signer = account::create_account_for_test(dao);

        let (pk_bytes, sk) = new_ed25519_eoa();
        let eoa = donate(pk_bytes, &sk, dao);
        let eoa_addr = signer::address_of(&eoa);

        // Key is still alive, so the cryptographic safety lock must abort before publishing.
        let dao_signer = account::create_account_for_test(dao);
        governance::upgrade_contract(
            &dao_signer,
            eoa_addr,
            vector::empty<u8>(),
            vector::empty<vector<u8>>(),
        );
    }

    #[test]
    #[expected_failure(abort_code = 0x60003, location = governance_factory::governance)]
    fun test_upgrade_unknown_contract_aborts() {
        let caller = account::create_account_for_test(@0x1008);
        governance::upgrade_contract(
            &caller,
            @0xABCE,
            vector::empty<u8>(),
            vector::empty<vector<u8>>(),
        );
    }

    #[test]
    #[expected_failure(abort_code = 0x60003, location = governance_factory::governance)]
    fun test_transfer_unknown_contract_aborts() {
        let caller = account::create_account_for_test(@0x1005);
        governance::transfer_admin(&caller, @0xABCD, @0x9004);
    }

    #[test]
    #[expected_failure(abort_code = 0x50001, location = governance_factory::governance)]
    fun test_stranger_cannot_renounce() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);
        let creator = account::create_account_for_test(@0x1030);
        let dao = @0x9030;
        let predicted = deploy_ra(&creator, dao);

        let stranger = account::create_account_for_test(@0x9031);
        governance::renounce_contract(&stranger, predicted, vector::empty<vector<u8>>());
    }

    #[test]
    fun test_catalog_pagination() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);

        let c1 = account::create_account_for_test(@0x1101);
        let c2 = account::create_account_for_test(@0x1102);
        let c3 = account::create_account_for_test(@0x1103);
        deploy_ra(&c1, @0x9101);
        deploy_ra(&c2, @0x9102);
        deploy_ra(&c3, @0x9103);

        assert!(governance::get_total_contracts() == 3, 0);
        assert!(governance::predict_next_contract_index() == 3, 1);

        let first = governance::get_contracts_page(0, 2);
        assert!(vector::length(&first) == 2, 2);

        let rest = governance::get_contracts_page(2, 50);
        assert!(vector::length(&rest) == 1, 3);

        // Out-of-range offset yields an empty page instead of aborting.
        assert!(vector::is_empty(&governance::get_contracts_page(99, 50)), 4);
    }

    #[test]
    fun test_get_admin_and_kind_reports_path() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);

        let creator = account::create_account_for_test(@0x1040);
        let dao = @0x9040;
        let _dao_signer = account::create_account_for_test(dao);
        let predicted = deploy_ra(&creator, dao);

        // An Autonomous Resource Account reports the DAO admin and is_eoa == false.
        let (admin, is_eoa) = governance::get_admin_and_kind(predicted);
        assert!(admin == dao, 0);
        assert!(!is_eoa, 1);
        assert!(governance::get_contract_creator(predicted) == signer::address_of(&creator), 2);
    }

    #[test]
    fun test_get_admin_and_kind_reports_donated_eoa() {
        let dao = @0x9041;
        let _dao_signer = account::create_account_for_test(dao);
        let (pk_bytes, sk) = new_ed25519_eoa();
        let eoa = donate(pk_bytes, &sk, dao);
        let eoa_addr = signer::address_of(&eoa);

        let (admin, is_eoa) = governance::get_admin_and_kind(eoa_addr);
        assert!(admin == dao, 0);
        assert!(is_eoa, 1);
        assert!(governance::get_contract_creator(eoa_addr) == eoa_addr, 2);
    }

    #[test]
    #[expected_failure(abort_code = 0x60003, location = governance_factory::governance)]
    fun test_get_admin_and_kind_unknown_contract_aborts() {
        governance::get_admin_and_kind(@0xABCD);
    }

    #[test]
    #[expected_failure(abort_code = 0x10011, location = governance_factory::governance)]
    fun test_cannot_deploy_with_self_admin() {
        let creator = account::create_account_for_test(@0x1027);
        let creator_addr = signer::address_of(&creator);
        // Setting dao_admin == creator_addr is blocked (H1 fix)
        governance::deploy_autonomous_contract(
            &creator,
            vector::empty<u8>(),
            vector::empty<vector<u8>>(),
            creator_addr,
        );
    }

    #[test]
    #[expected_failure(abort_code = 0x10011, location = governance_factory::governance)]
    fun test_cannot_donate_with_self_admin() {
        let (pk_bytes, sk) = new_ed25519_eoa();
        let eoa = account::create_account_from_ed25519_public_key(pk_bytes);
        let eoa_addr = signer::address_of(&eoa);
        let challenge = account::get_signer_capability_offer_proof_challenge_v2(
            eoa_addr,
            governance::predict_eoa_proxy_address(eoa_addr),
        );
        let sig_bytes = ed25519::signature_to_bytes(&ed25519::sign_struct(&sk, challenge));
        // Donating with dao_admin == eoa_addr is blocked (H1 fix)
        governance::donate_eoa_to_dao(&eoa, eoa_addr, sig_bytes, 0, pk_bytes);
    }

    #[test]
    #[expected_failure(abort_code = 0x10011, location = governance_factory::governance)]
    fun test_cannot_transfer_admin_to_contract_itself() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);
        let creator = account::create_account_for_test(@0x1028);
        let dao = @0x9028;
        let predicted = deploy_ra(&creator, dao);
        let dao_signer = account::create_account_for_test(dao);
        // Transferring admin to contract address itself is blocked (H1 fix)
        governance::transfer_admin(&dao_signer, predicted, predicted);
    }

    #[test]
    #[expected_failure(abort_code = 0x50001, location = governance_factory::governance)]
    fun test_stranger_cannot_initialize_factory() {
        let stranger = account::create_account_for_test(@0x9999);
        governance::initialize(&stranger);
    }

    #[test]
    fun test_package_admin_lifecycle_and_renounce() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);

        let initial_admin = @0x9501;
        let admin_signer = account::create_account_for_test(initial_admin);
        let cap = governance::create_autonomous_ra_for_test(&factory);

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
    #[expected_failure(abort_code = 0x50001, location = governance_factory::publisher)]
    fun test_stranger_cannot_renounce_package() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);

        let real_admin = @0x9503;
        let cap = governance::create_autonomous_ra_for_test(&factory);
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
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);

        // A normal test account: `create_account_unchecked` sets the auth key to the address bytes,
        // so this EOA counts as key-alive.
        let eoa = account::create_account_for_test(@0x3101);
        let eoa_addr = signer::address_of(&eoa);
        let proxy_addr = governance::predict_eoa_proxy_address(eoa_addr);

        let proxy_cap = governance::create_eoa_proxy_for_test(&eoa);
        governance::set_signer_capability_offer_for_test(eoa_addr, proxy_addr);
        let dao = @0x9401;
        let _dao_signer = account::create_account_for_test(dao);
        governance::install_managed_eoa_for_test(&eoa, dao, proxy_cap);

        assert!(governance::is_eoa_contract(eoa_addr), 0);
        assert!(account::get_signer_capability_offer_for(eoa_addr) == proxy_addr, 1);

        governance::cancel_eoa_delegation(&eoa, eoa_addr);

        // Record gone, and neither the EOA nor the proxy still offers its capability.
        assert!(!governance::is_eoa_contract(eoa_addr), 2);
        assert!(!governance::is_contract_renounced(eoa_addr), 3);
        assert!(!account::is_signer_capability_offered(eoa_addr), 4);
        assert!(!account::is_signer_capability_offered(proxy_addr), 5);

        // The derived proxy must be reusable: `create_resource_account` aborts when the account still
        // self-offers, so this is what proves a second donation is possible.
        let _reusable = governance::create_eoa_proxy_for_test(&eoa);
    }

    #[test]
    #[expected_failure(abort_code = 0x30012, location = governance_factory::governance)]
    fun test_cancel_after_key_annihilation_aborts() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);

        let creator = account::create_account_for_test(@0x3102);
        // A Resource Account is created with ZERO_AUTH_KEY, which is exactly the "committed" state.
        let (eoa_signer, _eoa_cap) = account::create_resource_account(&creator, b"cancel-committed");
        let eoa_addr = signer::address_of(&eoa_signer);
        let proxy_addr = governance::predict_eoa_proxy_address(eoa_addr);

        let proxy_cap = governance::create_eoa_proxy_for_test(&eoa_signer);
        governance::set_signer_capability_offer_for_test(eoa_addr, proxy_addr);
        governance::install_managed_eoa_for_test(&eoa_signer, @0x9402, proxy_cap);

        assert!(governance::is_eoa_key_annihilated(eoa_addr), 0);

        // Once the key is gone the delegation is final: only the DAO's renounce applies.
        governance::cancel_eoa_delegation(&eoa_signer, eoa_addr);
    }

    #[test]
    #[expected_failure(abort_code = 0x50001, location = governance_factory::governance)]
    fun test_cancel_by_non_owner_aborts() {
        let factory = account::create_account_for_test(@governance_factory);
        governance::initialize(&factory);

        let eoa = account::create_account_for_test(@0x3103);
        let eoa_addr = signer::address_of(&eoa);
        let proxy_addr = governance::predict_eoa_proxy_address(eoa_addr);

        let proxy_cap = governance::create_eoa_proxy_for_test(&eoa);
        governance::set_signer_capability_offer_for_test(eoa_addr, proxy_addr);
        governance::install_managed_eoa_for_test(&eoa, @0x9403, proxy_cap);

        // A different signer cannot cancel someone else's delegation.
        let stranger = account::create_account_for_test(@0x9404);
        governance::cancel_eoa_delegation(&stranger, eoa_addr);
    }
}