module governance_factory::governance {
    use std::signer;
    use std::vector;
    use std::option;
    use std::error;
    use supra_framework::account;
    use supra_framework::code;
    use supra_framework::event;

    // =========================================================================
    // CONSTANTS & SECURITY ANCHORS
    // =========================================================================

    /// 32-byte zero authentication key representing an annihilated private key.
    /// Exactly mirrors `supra_framework::account::ZERO_AUTH_KEY`.
    const ZERO_AUTH_KEY: vector<u8> = x"0000000000000000000000000000000000000000000000000000000000000000";

    /// Deterministic seed used to derive, from an EOA, the proxy Resource Account that holds its
    /// delegated signer capability. Because the EOA address is the source, the proxy address is
    /// unique per EOA and needs no per-creator nonce.
    const EOA_PROXY_SEED: vector<u8> = b"governance_factory::eoa_proxy_v1";

    /// Canonical seed used for every Autonomous Resource Account deployment.
    ///
    /// Rationale (collision safety): the Resource Account derivation is
    /// `sha3_256(bcs(source) || seed || 0xFF)`. A per-creator monotonic nonce (previous design) is
    /// NOT required for uniqueness, because the source address already domains every account. Two
    /// different creators can therefore never collide, and the same creator always deploys to the
    /// *same* address, which safely blocks any third party from squatting or pre-creating the
    /// account (an existing account with a non-zero sequence number or an active capability offer
    /// makes `create_resource_account` abort). This keeps `predict_next_contract_address()` stable,
    /// so CI pipelines can pre-compile a package for a fixed target address forever.
    const AUTONOMOUS_SEED: vector<u8> = b"governance_factory::autonomous_v1";

    // Security Status Constants
    const STATUS_UNMANAGED: u8 = 0;
    const STATUS_PERMANENTLY_RENOUNCED: u8 = 1;
    const STATUS_VERIFIED_DAO_GOVERNED: u8 = 2;
    const STATUS_HAZARD_KEY_STILL_ACTIVE: u8 = 3;

    // Error Codes
    const E_NOT_ADMIN: u64 = 1;
    const E_ALREADY_RENOUNCED: u64 = 2;
    const E_CONTRACT_NOT_FOUND: u64 = 3;
    const E_ALREADY_INITIALIZED: u64 = 4;
    const E_EOA_KEY_NOT_BURNED: u64 = 5;
    const E_CAPABILITY_NOT_OFFERED_TO_PROXY: u64 = 6;
    /// Renouncing requires an empty payload: a renounce with `code` would deploy code the DAO could
    /// never remove, breaking the very immutability the caller is asking for.
    const E_CODE_ON_RENOUNCE: u64 = 7;
    const E_ZERO_ADMIN: u64 = 11;
    /// A transfer cannot be redirected to the current admin.
    const E_SAME_ADMIN: u64 = 12;
    /// Only a Resource Account can be frozen with this entry point.
    const E_NOT_RESOURCE_ACCOUNT: u64 = 13;
    /// Self-offer missing: the account is not a factory-managed Resource Account.
    const E_NO_SELF_OFFER: u64 = 14;
    /// Rejected on-chain bytecode; cannot be verified against a source tree.
    const E_MODULE_HAS_NO_CODE: u64 = 15;
    const E_ALREADY_FROZEN: u64 = 16;
    /// Admin cannot be set to the managed contract, creator, or EOA itself (prevents dead self-governance lock).
    const E_SELF_ADMIN: u64 = 17;
    /// A donation can only be cancelled while the EOA still holds its key. Once annihilated the
    /// delegation is final and only `renounce_contract` applies.
    const E_DELEGATION_COMMITTED: u64 = 18;

    // =========================================================================
    // GOVERNANCE STORAGE
    // =========================================================================

    /// Unified governance record, stored on the managed address itself.
    ///
    /// - Resource Account (`is_eoa == false`): `cap` is the account's own SignerCapability.
    /// - Donated EOA (`is_eoa == true`): `cap` is the SignerCapability of the EOA's proxy Resource
    ///   Account (derived via `predict_eoa_proxy_address`), which holds the EOA's delegated signer
    ///   capability and lets the factory / DAO revoke it for a real freeze.
    ///
    /// Using a single structure (instead of a separate `ManagedEoa`) removes duplicated
    /// admin/cap state and gives both account types one identical lifecycle.
    struct ManagedContract has key {
        creator: address,
        admin: address,
        cap: account::SignerCapability,
        is_eoa: bool,
        catalog_index: u64,
    }

    /// Permanent tombstone written when a contract is renounced. It outlives `ManagedContract`,
    /// which is destroyed on renounce so its `SignerCapability` is dropped and can never be used
    /// again. Keeping a minimal record preserves the public query surface (`is_contract_renounced`,
    /// `get_contract_admin`) and the audit trail.
    struct RenouncedRecord has key, store, drop {
        creator: address,
        is_eoa: bool,
        /// True when the freeze was cryptographic: the SignerCapability was destroyed and, for a
        /// Resource Account, its self-offer was revoked too.
        is_cryptographically_frozen: bool,
    }


    /// Metadata record for each managed contract in the public registry.
    struct DeployedItem has store, copy, drop {
        contract_address: address,
        creator: address,
        admin: address,
        is_resource_account: bool,
        is_renounced: bool,
    }

    /// Global public registry stored at the factory address (@governance_factory).
    ///
    /// The catalog is a `vector` because its length is needed for pagination and for
    /// `predict_next_contract_index`. Every read/write of a single entry goes through
    /// `find_index`, so cost is O(n) in the number of *registered contracts*  acceptable for the
    /// intended registry size, and it avoids coupling to a framework Table that may diverge between
    /// Supra and Aptos. Prefer one address per package: registering several modules of the same
    /// package inflates `n` without adding information.
    struct FactoryCatalog has key {
        contracts: vector<DeployedItem>,
    }

    // =========================================================================
    // EVENTS (on-chain observability)
    // =========================================================================

    #[event]
    struct ContractDeployedEvent has store, drop {
        contract_address: address,
        creator: address,
        admin: address,
        is_resource_account: bool,
    }

    #[event]
    struct EoaGovernanceRegisteredEvent has store, drop {
        eoa: address,
        admin: address,
        proxy: address,
    }

    #[event]
    struct ContractUpgradedEvent has store, drop {
        contract_address: address,
        by: address,
        is_resource_account: bool,
    }

    #[event]
    struct ContractRenouncedEvent has store, drop {
        contract_address: address,
        is_resource_account: bool,
        is_cryptographically_frozen: bool,
    }

    #[event]
    struct AdminTransferredEvent has store, drop {
        contract_address: address,
        old_admin: address,
        new_admin: address,
    }


    #[event]
    struct ResourceAccountFrozenEvent has store, drop {
        contract_address: address,
        /// Empty after a cryptographic freeze: no reference to the SignerCapability survives.
        code_hash: vector<u8>,
        self_offer_revoked: bool,
    }

    #[event]
    struct EoaDelegationCancelledEvent has store, drop {
        eoa: address,
        catalog_index: u64,
    }

    /// Automatic initialization upon module publication.
    fun init_module(factory_signer: &signer) {
        initialize(factory_signer);
    }

    /// Creates the factory catalog at the caller's address. Used by `init_module` and as a manual
    /// fallback (e.g. in unit tests, where `init_module` does not run).
    public entry fun initialize(account: &signer) {
        initialize_factory(account);
    }

    /// Initializes the catalog when it is not published yet. Idempotent by design, which lets it
    /// double as a safe repair entry point. Only meaningful when signed by the factory address,
    /// because that is the only account whose catalog `record_in_catalog` writes to.
    public entry fun ensure_initialized(factory: &signer) {
        initialize_factory(factory);
    }

    /// `create_signer` is `public(friend)` in the framework, so the catalog must be installed with
    /// a real signer for the target address rather than a fabricated one.
    ///
    /// No `acquires` clause: `move_to` only writes and is not an acquire in the borrow analysis
    /// (only `move_from` / `borrow_global` / `borrow_global_mut` are), and the caller inherits the
    /// burden of declaring whatever this function transitively acquires.
    fun initialize_factory(account: &signer) {
        let addr = signer::address_of(account);
        assert!(addr == @governance_factory, error::permission_denied(E_NOT_ADMIN));
        if (!exists<FactoryCatalog>(addr)) {
            move_to(account, FactoryCatalog {
                contracts: vector::empty<DeployedItem>(),
            });
        };
    }

    // =========================================================================
    // PATH 1: RESOURCE ACCOUNTS (AUTONOMOUS DEPLOYMENTS WITHOUT MANUAL SEED)
    // =========================================================================

    /// Deploys a new autonomous contract into a Resource Account in 1 atomic step:
    /// 1. Derives the deterministic Resource Account from the creator and the canonical seed.
    /// 2. Deploys the contract bytecode to the newly derived Resource Account.
    /// 3. Installs `ManagedContract` on the account, storing the SignerCapability and binding the DAO.
    /// 4. Registers the new deployment in the public factory catalog.
    public entry fun deploy_autonomous_contract(
        creator: &signer,
        metadata_serialized: vector<u8>,
        code: vector<vector<u8>>,
        dao_admin: address,
    ) acquires FactoryCatalog {
        let creator_addr = signer::address_of(creator);
        assert!(dao_admin != @0x0, error::invalid_argument(E_ZERO_ADMIN));
        assert!(dao_admin != creator_addr, error::invalid_argument(E_SELF_ADMIN));

        let (resource_signer, cap) = account::create_resource_account(creator, AUTONOMOUS_SEED);
        let resource_addr = signer::address_of(&resource_signer);

        if (!vector::is_empty(&code)) {
            code::publish_package_txn(&resource_signer, metadata_serialized, code);
        };

        let idx = record_in_catalog(resource_addr, creator_addr, dao_admin, true, false);

        move_to(
            &resource_signer,
            ManagedContract {
                creator: creator_addr,
                admin: dao_admin,
                cap,
                is_eoa: false,
                catalog_index: idx,
            },
        );

        event::emit(ContractDeployedEvent {
            contract_address: resource_addr,
            creator: creator_addr,
            admin: dao_admin,
            is_resource_account: true,
        });
    }

    // =========================================================================
    // PATH 2/3: EOA DONATION VIA PROXY RESOURCE ACCOUNT
    // =========================================================================

    /// Step 1: Atomically donate an EOA to a DAO through a deterministic proxy Resource Account.
    ///
    /// In one self-signed transaction this:
    /// 1. Creates the proxy Resource Account for the EOA (`predict_eoa_proxy_address`).
    /// 2. Delegates the EOA's signer capability to the proxy (`account::offer_signer_capability`).
    /// 3. Stores `ManagedContract{is_eoa: true, cap: proxy_cap}` on the EOA and catalogs it.
    ///
    /// Why a proxy instead of offering directly to the DAO: the offer recipient is the only one
    /// that can later revoke the delegated capability, and a Resource Account can be driven by the
    /// factory through its stored `SignerCapability`. This enables a *real* on-chain freeze
    /// (`renounce_contract` `account::revoke_signer_capability`).
    ///
    /// THE DONATION IS NOT COMPLETE YET. The private key still exists (dual-master hazard). The
    /// framework's key-rotation entry point is not `public`, so the owner MUST finish with a
    /// second, owner-signed tx:
    ///
    ///     supra_framework::account::rotate_authentication_key_call(&eoa, ZERO_AUTH_KEY)
    ///
    /// Use `is_eoa_donation_complete` / `get_eoa_security_status` to verify.
    public entry fun donate_eoa_to_dao(
        eoa: &signer,
        dao_admin: address,
        signer_capability_sig_bytes: vector<u8>,
        account_scheme: u8,
        account_public_key_bytes: vector<u8>,
    ) acquires FactoryCatalog {
        let eoa_addr = signer::address_of(eoa);
        assert!(!exists<ManagedContract>(eoa_addr), error::already_exists(E_ALREADY_INITIALIZED));
        assert!(dao_admin != @0x0, error::invalid_argument(E_ZERO_ADMIN));
        assert!(dao_admin != eoa_addr, error::invalid_argument(E_SELF_ADMIN));

        // 1. Create the deterministic proxy Resource Account controlled by the factory.
        let (proxy_signer, cap) = account::create_resource_account(eoa, EOA_PROXY_SEED);
        let proxy_addr = signer::address_of(&proxy_signer);

        // 2. Delegate the EOA's signer capability to the proxy (recipient exists: just created).
        account::offer_signer_capability(
            eoa,
            signer_capability_sig_bytes,
            account_scheme,
            account_public_key_bytes,
            proxy_addr,
        );

        let idx = record_in_catalog(eoa_addr, eoa_addr, dao_admin, false, false);

        // 3. Store the unified governance record on the EOA.
        move_to(eoa, ManagedContract {
            creator: eoa_addr,
            admin: dao_admin,
            cap,
            is_eoa: true,
            catalog_index: idx,
        });

        event::emit(EoaGovernanceRegisteredEvent {
            eoa: eoa_addr,
            admin: dao_admin,
            proxy: proxy_addr,
        });
    }

    /// Undoes a donation while the EOA still holds its private key.
    ///
    /// `donate_eoa_to_dao` binds an EOA to a DAO admin and hands its signer capability to the
    /// deterministic proxy. That is only reversible *before* the key is destroyed: the owner still
    /// holds the one signature that can revoke the offer, so a wrong DAO admin, or a donation sent
    /// from the wrong wallet, is recoverable instead of permanent.
    ///
    /// Once the key is annihilated the delegation is committed: `E_DELEGATION_COMMITTED` blocks this
    /// path and only `renounce_contract` (the DAO's action) remains.
    ///
    /// The proxy is left reusable on purpose. `create_resource_account` aborts if the account still
    /// self-offers its capability, so a cancel that only dropped the record would make the EOA
    /// impossible to donate again. Both offers are revoked before the capability is destroyed:
    ///   1. the EOA revokes its offer to the proxy,
    ///   2. the proxy revokes its own self-offer,
    ///   3. the stored capability is dropped with the record.
    public entry fun cancel_eoa_delegation(
        eoa: &signer,
        eoa_addr: address,
    ) acquires ManagedContract, FactoryCatalog {
        // The transaction must be signed by the account whose delegation is being undone.
        assert!(signer::address_of(eoa) == eoa_addr, error::permission_denied(E_NOT_ADMIN));
        assert!(exists<ManagedContract>(eoa_addr), error::not_found(E_CONTRACT_NOT_FOUND));

        let proxy_addr = eoa_proxy_address(eoa_addr);

        // Scope the borrow so it ends well before `move_from` at the end.
        let catalog_index = {
            let managed = borrow_global<ManagedContract>(eoa_addr);
            assert!(managed.is_eoa, error::invalid_argument(E_NOT_RESOURCE_ACCOUNT));
            // The whole point of this entry: only available while the key is alive. Afterwards the
            // delegation is final and only `renounce_contract` remains.
            assert!(
                account::get_authentication_key(eoa_addr) != ZERO_AUTH_KEY,
                error::invalid_state(E_DELEGATION_COMMITTED),
            );
            managed.catalog_index
        };

        // 1. The EOA revokes its own offer to the proxy. Only if it actually still points at our
        // proxy: the owner may have re-pointed it elsewhere, and then there is nothing to take back.
        if (account::is_signer_capability_offered(eoa_addr)
            && account::get_signer_capability_offer_for(eoa_addr) == proxy_addr) {
            account::revoke_signer_capability(eoa, proxy_addr);
        };

        // 2. The proxy revokes its self-offer, which is what lets `create_resource_account` accept
        // the same derived address again on a future donation.
        if (account::exists_at(proxy_addr)
            && account::is_signer_capability_offered(proxy_addr)
            && account::get_signer_capability_offer_for(proxy_addr) == proxy_addr) {
            let proxy_signer = {
                let managed = borrow_global<ManagedContract>(eoa_addr);
                account::create_signer_with_capability(&managed.cap)
            };
            let proxy_authorized = account::create_authorized_signer(&proxy_signer, proxy_addr);
            account::revoke_signer_capability(&proxy_authorized, proxy_addr);
        };

        // 3. Destroy the record. `SignerCapability` has `drop`, so this annihilates the last
        // reference to the proxy capability and frees the EOA to donate again.
        let ManagedContract {
            creator: _creator,
            admin: _admin,
            cap: _cap,
            is_eoa: _is_eoa,
            catalog_index: _catalog_index,
        } = move_from<ManagedContract>(eoa_addr);

        // The catalog entry is marked inert rather than removed: removing it would shift every later
        // entry and silently invalidate their stored `catalog_index`. The authoritative state is that
        // the EOA no longer has a record at all.
        update_catalog_at(catalog_index, @0x0, true);

        event::emit(EoaDelegationCancelledEvent { eoa: eoa_addr, catalog_index });
    }

    // =========================================================================
    // COMMON: UPGRADE, RENOUNCE & ADMIN TRANSFER (Resource Accounts + EOAs)
    // =========================================================================

    /// Upgrades the package hosted on any managed contract (Resource Account or donated EOA).
    /// Only the registered admin may call it. For a donated EOA, the private key must be dead and
    /// the delegated capability must still be offered to the proxy.
    public entry fun upgrade_contract(
        caller: &signer,
        contract_addr: address,
        metadata_serialized: vector<u8>,
        code: vector<vector<u8>>,
    ) acquires ManagedContract {
        assert!(!vector::is_empty(&code), error::invalid_argument(E_MODULE_HAS_NO_CODE));
        assert_authorized(caller, contract_addr);

        let managed = borrow_global<ManagedContract>(contract_addr);
        let contract_signer = resolve_publisher(managed, contract_addr);
        code::publish_package_txn(&contract_signer, metadata_serialized, code);

        event::emit(ContractUpgradedEvent {
            contract_address: contract_addr,
            by: signer::address_of(caller),
            is_resource_account: !managed.is_eoa,
        });
    }

    /// Permanently renounces governance of any managed contract, producing a **cryptographic**
    /// freeze: the stored `SignerCapability` is destroyed together with `ManagedContract`, and the
    /// self-offer of a Resource Account is revoked in the same transaction. After this call there
    /// is no signer, no capability and no offer pointing at the address, so no future code  not
    /// even a future version of this module  can publish to it again.
    ///
    /// For a donated EOA the delegated capability to the proxy is additionally revoked, which is
    /// what removes the last signer that could act for it.
    ///
    /// `code` must be empty: publishing code here would install bytes that can never be replaced.
    public entry fun renounce_contract(
        caller: &signer,
        contract_addr: address,
        code_blob: vector<vector<u8>>,
    ) acquires ManagedContract, FactoryCatalog {
        assert!(vector::is_empty(&code_blob), error::invalid_argument(E_CODE_ON_RENOUNCE));

        // Authorize before touching anything, and read the account type from the record.
        let is_eoa = load_is_eoa(caller, contract_addr);
        let is_resource_account = !is_eoa;
        let creator = borrow_global<ManagedContract>(contract_addr).creator;

        // Derive a signer for the managed address *while the capability still exists*, scoping the
        // borrow so it ends before `move_from` destroys `ManagedContract`. The signer is used both
        // to revoke the delegated offer (EOA path) and to install the tombstone, because
        // `create_signer` is `public(friend)` and cannot be fabricated here.
        let target_signer = {
            let managed = borrow_global<ManagedContract>(contract_addr);
            if (is_eoa) {
                let proxy = eoa_proxy_address(contract_addr);
                assert!(account::get_authentication_key(contract_addr) == ZERO_AUTH_KEY, error::invalid_state(E_EOA_KEY_NOT_BURNED));
                assert!(account::is_signer_capability_offered(contract_addr), error::invalid_state(E_CAPABILITY_NOT_OFFERED_TO_PROXY));
                assert!(account::get_signer_capability_offer_for(contract_addr) == proxy, error::invalid_state(E_CAPABILITY_NOT_OFFERED_TO_PROXY));

                let proxy_signer = account::create_signer_with_capability(&managed.cap);
                account::create_authorized_signer(&proxy_signer, contract_addr)
            } else {
                // A Resource Account's own SignerCapability is a signer for the account itself.
                account::create_signer_with_capability(&managed.cap)
            }
        };

        if (is_eoa) {
            // Real freeze: drop the EOA's signer-capability offer to the proxy, removing the last
            // signer that could ever act for this address.
            account::revoke_signer_capability(&target_signer, eoa_proxy_address(contract_addr));
        } else {
            // Real freeze for Resource Account: revoke self-offer so no capability offer remains open.
            if (account::is_signer_capability_offered(contract_addr)
                && account::get_signer_capability_offer_for(contract_addr) == contract_addr) {
                account::revoke_signer_capability(&target_signer, contract_addr);
            };
        };

        // Install the tombstone while we can still sign for the address.
        write_tombstone(&target_signer, creator, is_eoa, true);

        // Destroy the record. `SignerCapability` has the `drop` ability, so letting `cap` fall out
        // of scope permanently annihilates the only reference to it. Nothing can reconstruct it 
        // its fields are private to the `account` module  so the freeze is irreversible regardless
        // of future versions of this module.
        let ManagedContract {
            creator: _creator,
            admin: _admin,
            cap: _cap,
            is_eoa: _is_eoa,
            catalog_index: idx,
        } = move_from<ManagedContract>(contract_addr);

        update_catalog_at(idx, @0x0, true);

        event::emit(ContractRenouncedEvent {
            contract_address: contract_addr,
            is_resource_account,
            is_cryptographically_frozen: true,
        });
    }

    /// Deep-freezes an Autonomous Resource Account and publishes its final bytecode in the same
    /// transaction.
    ///
    /// Order matters and is deliberate: `publish_package_txn` runs *before* the self-offer is
    /// revoked, because it needs a signer, and the signer for a Resource Account can only be
    /// materialized from the offer or from the `SignerCapability`. Once both are gone the account
    /// is inert forever.
    ///
    /// Passing empty `code` is rejected: the point of this call is to seal a *final* version.
    public entry fun renounce_resource_account(
        caller: &signer,
        contract_addr: address,
        metadata_serialized: vector<u8>,
        code: vector<vector<u8>>,
    ) acquires ManagedContract, FactoryCatalog {
        assert!(!vector::is_empty(&code), error::invalid_argument(E_MODULE_HAS_NO_CODE));
        let is_eoa = load_is_eoa(caller, contract_addr);
        assert!(!is_eoa, error::invalid_argument(E_NOT_RESOURCE_ACCOUNT));
        assert!(account::exists_at(contract_addr), error::not_found(E_CONTRACT_NOT_FOUND));

        let creator = borrow_global<ManagedContract>(contract_addr).creator;

        // Scope the borrow so it ends before `move_from` destroys `ManagedContract`.
        let authorized = {
            let managed = borrow_global<ManagedContract>(contract_addr);
            let ra_signer = account::create_signer_with_capability(&managed.cap);
            account::create_authorized_signer(&ra_signer, contract_addr)
        };

        // 1. Seal the final bytecode while we still hold authority.
        code::publish_package_txn(&authorized, metadata_serialized, code);

        // 2. Drop the self-offer: nobody, including this module, can ever act for the address again.
        assert!(
            account::is_signer_capability_offered(contract_addr)
                && account::get_signer_capability_offer_for(contract_addr) == contract_addr,
            error::invalid_state(E_NO_SELF_OFFER)
        );
        account::revoke_signer_capability(&authorized, contract_addr);

        // 3. Install the tombstone, still holding a signer for the address.
        write_tombstone(&authorized, creator, false, true);

        // 4. Destroy the capability: it has the `drop` ability, so going out of scope annihilates
        // the only reference to it.
        let ManagedContract {
            creator: _creator,
            admin: _admin,
            cap: _cap,
            is_eoa: _is_eoa,
            catalog_index: idx,
        } = move_from<ManagedContract>(contract_addr);

        update_catalog_at(idx, @0x0, true);

        event::emit(ContractRenouncedEvent {
            contract_address: contract_addr,
            is_resource_account: true,
            is_cryptographically_frozen: true,
        });
        event::emit(ResourceAccountFrozenEvent {
            contract_address: contract_addr,
            code_hash: vector::empty<u8>(),
            self_offer_revoked: true,
        });
    }

    /// Transfers governance of a managed contract to a new admin in 1 direct atomic step.
    /// Only the registered admin may call it.
    public entry fun transfer_admin(
        caller: &signer,
        contract_addr: address,
        new_admin: address,
    ) acquires ManagedContract, FactoryCatalog {
        assert!(new_admin != @0x0, error::invalid_argument(E_ZERO_ADMIN));
        assert!(new_admin != contract_addr, error::invalid_argument(E_SELF_ADMIN));
        assert_authorized(caller, contract_addr);

        let managed = borrow_global_mut<ManagedContract>(contract_addr);
        let old_admin = managed.admin;
        assert!(new_admin != old_admin, error::invalid_argument(E_SAME_ADMIN));
        managed.admin = new_admin;
        let idx = managed.catalog_index;

        update_catalog_at(idx, new_admin, false);

        event::emit(AdminTransferredEvent {
            contract_address: contract_addr,
            old_admin,
            new_admin,
        });
    }

    /// Asserts that `caller` is the admin of `contract_addr` and that it is not renounced.
    ///
    /// This returns `unit` rather than `&ManagedContract` on purpose: Move forbids returning a
    /// reference that is still borrowed from global storage (E07004). Callers re-borrow with
    /// `borrow_global` after this returns, which also guarantees the earlier borrow has ended
    /// before any `move_from`.
    fun assert_authorized(caller: &signer, contract_addr: address) acquires ManagedContract {
        assert!(!exists<RenouncedRecord>(contract_addr), error::invalid_state(E_ALREADY_RENOUNCED));
        assert!(exists<ManagedContract>(contract_addr), error::not_found(E_CONTRACT_NOT_FOUND));
        let managed = borrow_global<ManagedContract>(contract_addr);
        assert!(signer::address_of(caller) == managed.admin, error::permission_denied(E_NOT_ADMIN));
    }

    /// Returns whether the managed address is a donated EOA, enforcing admin authorization.
    fun load_is_eoa(caller: &signer, contract_addr: address): bool acquires ManagedContract {
        assert_authorized(caller, contract_addr);
        borrow_global<ManagedContract>(contract_addr).is_eoa
    }

    /// Resolves the publisher signer for a managed contract, enforcing the type-specific proof.
    /// - Resource Account: the stored SignerCapability is the publisher.
    /// - Donated EOA: enforces key annihilation (`ZERO_AUTH_KEY`) and an active capability to the
    ///   proxy, then returns an authorized signer for the EOA.
    fun resolve_publisher(managed: &ManagedContract, contract_addr: address): signer {
        if (!managed.is_eoa) {
            account::create_signer_with_capability(&managed.cap)
        } else {
            assert!(account::get_authentication_key(contract_addr) == ZERO_AUTH_KEY, error::invalid_state(E_EOA_KEY_NOT_BURNED));
            let proxy = eoa_proxy_address(contract_addr);
            assert!(account::is_signer_capability_offered(contract_addr), error::invalid_state(E_CAPABILITY_NOT_OFFERED_TO_PROXY));
            assert!(account::get_signer_capability_offer_for(contract_addr) == proxy, error::invalid_state(E_CAPABILITY_NOT_OFFERED_TO_PROXY));

            let proxy_signer = account::create_signer_with_capability(&managed.cap);
            account::create_authorized_signer(&proxy_signer, contract_addr)
        }
    }

    /// Deterministic proxy Resource Account for a donated EOA.
    fun eoa_proxy_address(eoa_addr: address): address {
        account::create_resource_address(&eoa_addr, EOA_PROXY_SEED)
    }

    // =========================================================================
    // INTERNAL CATALOG HELPERS
    // =========================================================================

    /// Appends a new entry to the public factory registry and returns its index.
    /// Returns 0 if the catalog is not initialized.
    fun record_in_catalog(
        contract_address: address,
        creator: address,
        admin: address,
        is_resource_account: bool,
        is_renounced: bool,
    ): u64 acquires FactoryCatalog {
        if (exists<FactoryCatalog>(@governance_factory)) {
            let catalog = borrow_global_mut<FactoryCatalog>(@governance_factory);
            let idx = vector::length(&catalog.contracts);
            vector::push_back(&mut catalog.contracts, DeployedItem {
                contract_address,
                creator,
                admin,
                is_resource_account,
                is_renounced,
            });
            idx
        } else {
            0
        }
    }

    /// O(1) direct update of the registry entry at `idx` in the public factory catalog.
    /// No-op if the catalog is missing or index is out of bounds.
    fun update_catalog_at(idx: u64, new_admin: address, mark_renounced: bool) acquires FactoryCatalog {
        if (exists<FactoryCatalog>(@governance_factory)) {
            let catalog = borrow_global_mut<FactoryCatalog>(@governance_factory);
            if (idx < vector::length(&catalog.contracts)) {
                let item = vector::borrow_mut(&mut catalog.contracts, idx);
                item.admin = new_admin;
                item.is_renounced = mark_renounced;
            };
        };
    }

    /// Index of `contract_addr` inside the catalog, or `none` when absent.
    fun find_index(items: &vector<DeployedItem>, contract_addr: address): option::Option<u64> {
        let len = vector::length(items);
        let i = 0;
        while (i < len) {
            if (vector::borrow(items, i).contract_address == contract_addr) {
                return option::some(i)
            };
            i = i + 1;
        };
        option::none()
    }

    /// Writes the permanent tombstone for a renounced contract. Takes a signer for the target
    /// address because `create_signer` is `public(friend)` in the framework: the caller must derive
    /// it from the SignerCapability before destroying it.
    ///
    /// No `acquires` clause: `move_to` is not an acquire for the borrow analysis.
    fun write_tombstone(
        target: &signer,
        creator: address,
        is_eoa: bool,
        is_cryptographically_frozen: bool,
    ) {
        let contract_addr = signer::address_of(target);
        if (!exists<RenouncedRecord>(contract_addr)) {
            move_to(target, RenouncedRecord {
                creator,
                is_eoa,
                is_cryptographically_frozen,
            });
        };
    }

    // NOTE: Supra's `code` module exposes no way to ask "does this address host published code"
// (there is no `code::has_code`). Whether an admin is a real DAO therefore cannot be proven
// on-chain and is intentionally NOT asserted here: the cryptographic facts (key annihilation,
// capability delegation) are the trust anchor, and clients such as the Hoglet Token Inspector
// resolve "admin hosts code" off-chain via `GET /accounts/{admin}/modules`.

    // =========================================================================
    // TEST-ONLY HELPERS
    // =========================================================================

    /// Installs a key-dead donated-EOA `ManagedContract` without the donation flow, to exercise the
    /// capability-revocation renounce path.
    #[test_only]
    public fun install_managed_eoa_for_test(
        eoa: &signer,
        admin: address,
        cap: account::SignerCapability,
    ) acquires FactoryCatalog {
        let eoa_addr = signer::address_of(eoa);
        let idx = record_in_catalog(eoa_addr, eoa_addr, admin, false, false);
        move_to(eoa, ManagedContract {
            creator: eoa_addr,
            admin,
            cap,
            is_eoa: true,
            catalog_index: idx,
        });
    }

    /// Creates the deterministic proxy Resource Account for `eoa` and returns its SignerCapability.
    #[test_only]
    public fun create_eoa_proxy_for_test(eoa: &signer): account::SignerCapability {
        let (_proxy_signer, cap) = account::create_resource_account(eoa, EOA_PROXY_SEED);
        cap
    }

    /// Creates the canonical Autonomous Resource Account for `creator` and returns its capability.
    #[test_only]
    public fun create_autonomous_ra_for_test(creator: &signer): account::SignerCapability {
        let (_ra_signer, cap) = account::create_resource_account(creator, AUTONOMOUS_SEED);
        cap
    }

    #[test_only]
    public fun set_signer_capability_offer_for_test(offerer: address, receiver: address) {
        // The framework entry point declares its own `acquires`, so none is needed here.
        account::set_signer_capability_offer(offerer, receiver);
    }

    // =========================================================================
    // PUBLIC VIEW FUNCTIONS & SECURITY VERIFIERS
    // =========================================================================

    /// Predicts the exact Autonomous Resource Account address used by `deploy_autonomous_contract`.
    /// Constant per creator: `sha3_256(bcs(creator) || AUTONOMOUS_SEED || 0xFF)`.
    #[view]
    public fun predict_next_contract_address(creator_addr: address): address {
        account::create_resource_address(&creator_addr, AUTONOMOUS_SEED)
    }


    /// Total number of managed contracts recorded in the catalog.
    #[view]
    public fun get_total_contracts(): u64 acquires FactoryCatalog {
        if (!exists<FactoryCatalog>(@governance_factory)) {
            0
        } else {
            vector::length(&borrow_global<FactoryCatalog>(@governance_factory).contracts)
        }
    }

    /// Returns one page of the public catalog, starting at `offset`, capped at 50 entries per call.
    /// Pagination keeps the response bounded as the registry grows.
    #[view]
    public fun get_contracts_page(offset: u64, limit: u64): vector<DeployedItem> acquires FactoryCatalog {
        if (!exists<FactoryCatalog>(@governance_factory)) {
            return vector::empty<DeployedItem>()
        };
        let all = &borrow_global<FactoryCatalog>(@governance_factory).contracts;
        let total = vector::length(all);
        if (offset >= total) {
            return vector::empty<DeployedItem>()
        };
        let max_limit: u64 = 50;
        let count = if (limit == 0 || limit > max_limit) { max_limit } else { limit };
        let end = if (offset + count > total) { total } else { offset + count };
        vector::slice(all, offset, end)
    }

    /// Predicts the catalog index the next registration will occupy.
    #[view]
    public fun predict_next_contract_index(): u64 acquires FactoryCatalog {
        get_total_contracts()
    }

    /// Predicts the proxy Resource Account that will govern a donated EOA.
    /// Formula: sha3_256(bcs(eoa) || EOA_PROXY_SEED || 0xFF)
    #[view]
    public fun predict_eoa_proxy_address(eoa_addr: address): address {
        eoa_proxy_address(eoa_addr)
    }

    /// Returns the active admin for any managed contract, or @0x0 when renounced / unknown.
    #[view]
    public fun get_contract_admin(contract_addr: address): address acquires ManagedContract {
        if (exists<ManagedContract>(contract_addr)) {
            borrow_global<ManagedContract>(contract_addr).admin
        } else {
            @0x0
        }
    }

    /// Returns true if `contract_addr` is a donated EOA.
    #[view]
    public fun is_eoa_contract(contract_addr: address): bool acquires ManagedContract {
        exists<ManagedContract>(contract_addr) && borrow_global<ManagedContract>(contract_addr).is_eoa
    }

    /// Returns the proxy Resource Account governing a donated EOA (or @0x0 if not a donated EOA)
    #[view]
    public fun get_eoa_proxy(contract_addr: address): address acquires ManagedContract {
        if (exists<ManagedContract>(contract_addr) && borrow_global<ManagedContract>(contract_addr).is_eoa) {
            eoa_proxy_address(contract_addr)
        } else {
            @0x0
        }
    }

    /// Returns true when the contract has been permanently renounced through the factory.
    /// Survives the destruction of `ManagedContract` by reading the tombstone. `exists` does not
    /// count as an acquire, so no `acquires` clause is needed here.
    #[view]
    public fun is_contract_renounced(contract_addr: address): bool {
        exists<RenouncedRecord>(contract_addr)
    }

    /// Returns true when a frozen contract's freeze was cryptographic (capability destroyed, and for
    /// a Resource Account its self-offer revoked). This is the only state that proves the hosted
    /// package can never be upgraded again, no matter what future code exists.
    #[view]
    public fun is_cryptographically_frozen(contract_addr: address): bool acquires RenouncedRecord {
        exists<RenouncedRecord>(contract_addr)
            && borrow_global<RenouncedRecord>(contract_addr).is_cryptographically_frozen
    }

    /// Returns the admin and its creation-time kind, so clients can render the governance path.
    /// `is_eoa == true` means the address is a legacy EOA migrated to DAO governance; `false` means
    /// it is an Autonomous Resource Account created by this factory.
    #[view]
    public fun get_admin_and_kind(contract_addr: address): (address, bool) acquires ManagedContract {
        assert!(exists<ManagedContract>(contract_addr), error::not_found(E_CONTRACT_NOT_FOUND));
        let managed = borrow_global<ManagedContract>(contract_addr);
        (managed.admin, managed.is_eoa)
    }

    /// Returns the creator that originally deployed or donated the address.
    #[view]
    public fun get_contract_creator(contract_addr: address): address acquires ManagedContract, RenouncedRecord {
        if (exists<ManagedContract>(contract_addr)) {
            borrow_global<ManagedContract>(contract_addr).creator
        } else if (exists<RenouncedRecord>(contract_addr)) {
            borrow_global<RenouncedRecord>(contract_addr).creator
        } else {
            @0x0
        }
    }


    /// Checks if an EOA's private key has been 100% annihilated on-chain
    #[view]
    public fun is_eoa_key_annihilated(eoa_addr: address): bool {
        account::exists_at(eoa_addr) && account::get_authentication_key(eoa_addr) == ZERO_AUTH_KEY
    }

    /// Returns true if the address is currently managed by the factory or was renounced through it.
    #[view]
    public fun is_factory_managed(contract_addr: address): bool {
        exists<ManagedContract>(contract_addr) || exists<RenouncedRecord>(contract_addr)
    }

    /// True only when the address is cryptographically frozen: either marked by a factory tombstone,
    /// or its authentication key is ZERO_AUTH_KEY and no signer capability is offered anywhere.
    #[view]
    public fun is_eoa_permanently_immutable(eoa_addr: address): bool {
        if (exists<RenouncedRecord>(eoa_addr)) {
            true
        } else {
            account::exists_at(eoa_addr)
                && account::get_authentication_key(eoa_addr) == ZERO_AUTH_KEY
                && !account::is_signer_capability_offered(eoa_addr)
        }
    }

    /// True when an EOA donation is fully finalized on-chain: the address is registered in the
    /// factory, the private key is annihilated (`ZERO_AUTH_KEY`), and the signer capability is
    /// offered to the factory proxy.
    #[view]
    public fun is_eoa_donation_complete(eoa_addr: address): bool acquires ManagedContract {
        if (!account::exists_at(eoa_addr) || !exists<ManagedContract>(eoa_addr)) {
            false
        } else {
            let managed = borrow_global<ManagedContract>(eoa_addr);
            if (!managed.is_eoa) {
                false
            } else {
                let proxy = eoa_proxy_address(eoa_addr);
                account::get_authentication_key(eoa_addr) == ZERO_AUTH_KEY
                    && account::is_signer_capability_offered(eoa_addr)
                    && account::get_signer_capability_offer_for(eoa_addr) == proxy
            }
        }
    }

    /// Returns the security status of an address, derived from on-chain cryptographic facts
    /// and factory governance records:
    /// - 0: STATUS_UNMANAGED (unmanaged address, or third-party RA not governed by this factory)
    /// - 1: STATUS_PERMANENTLY_RENOUNCED (renounced through factory / key annihilated + no capability offer)
    /// - 2: STATUS_VERIFIED_DAO_GOVERNED (managed by factory with annihilated key + verified proxy/RA authority)
    /// - 3: STATUS_HAZARD_KEY_STILL_ACTIVE (DANGER: registered EOA whose private key is still alive)
    #[view]
    public fun get_eoa_security_status(eoa_addr: address): u8 acquires ManagedContract {
        if (!account::exists_at(eoa_addr)) {
            STATUS_UNMANAGED
        } else if (exists<RenouncedRecord>(eoa_addr)) {
            STATUS_PERMANENTLY_RENOUNCED
        } else if (exists<ManagedContract>(eoa_addr)) {
            let managed = borrow_global<ManagedContract>(eoa_addr);
            if (managed.is_eoa) {
                let proxy = eoa_proxy_address(eoa_addr);
                let key_annihilated = account::get_authentication_key(eoa_addr) == ZERO_AUTH_KEY;
                let offer_to_proxy = account::is_signer_capability_offered(eoa_addr)
                    && account::get_signer_capability_offer_for(eoa_addr) == proxy;

                if (key_annihilated) {
                    if (offer_to_proxy) {
                        STATUS_VERIFIED_DAO_GOVERNED
                    } else {
                        STATUS_PERMANENTLY_RENOUNCED
                    }
                } else if (offer_to_proxy) {
                    STATUS_HAZARD_KEY_STILL_ACTIVE
                } else {
                    STATUS_UNMANAGED
                }
            } else {
                // Autonomous Resource Account managed by this factory
                STATUS_VERIFIED_DAO_GOVERNED
            }
        } else {
            // Unmanaged: external plain EOA or external Resource Account
            STATUS_UNMANAGED
        }
    }

    /// Returns all registered contracts in the public catalog (bounded by `get_total_contracts`).
    /// Prefer `get_contracts_page` for large registries.
    #[view]
    public fun get_all_contracts(): vector<DeployedItem> acquires FactoryCatalog {
        if (!exists<FactoryCatalog>(@governance_factory)) {
            vector::empty<DeployedItem>()
        } else {
            borrow_global<FactoryCatalog>(@governance_factory).contracts
        }
    }
}