/**
 * DAO Contracts Vault: machine-readable source of truth.
 *
 * Every value here is mirrored from `smart_contract/dao_contracts_vault/sources/*.move` and verified by
 * `npm run check:vault` (scripts/check-vault-drift.cjs). That check is what keeps this file honest: if the
 * Move source moves, the check fails instead of letting /vault.txt, the "Export for AI" enrichment and
 * /api/metadata teach every AI agent the wrong facts.
 *
 * The most dangerous drift this prevents is the address derivation: the seed strings below were renamed
 * once (the docs kept the old `governance_factory::...` prefix), and a seed that does not match the byte
 * string compiled into the module derives an address the deploy can never land on.
 *
 * Everything is in English on purpose: this catalog is consumed by agents and copied into prompts, not
 * rendered to users. UI copy lives in the i18n messages.
 */

/** Versioned identifier for the JSON packs built from this catalog. */
export const VAULT_CONTEXT_SCHEMA = "hoglet.vault-context.v1";

/** Byte-string seeds, exact and complete. Concatenated verbatim by the contract — no length prefix. */
export const VAULT_SEEDS = {
  /** `AUTONOMOUS_SEED` in vault.move. The label is appended verbatim: seed || label. */
  autonomous: "dao_contracts_vault::autonomous_v1",
  /** `EOA_PROXY_SEED` in vault.move. Fixed, takes no suffix. */
  eoaProxy: "dao_contracts_vault::eoa_proxy_v1",
} as const;

/** `MAX_LABEL_LEN` in vault.move. */
export const VAULT_MAX_LABEL_LEN = 64;

/**
 * `get_eoa_security_status` return values (vault.move). Derived from on-chain cryptographic facts,
 * never from an intent flag.
 */
export const VAULT_STATUS = {
  0: {
    name: "UNMANAGED",
    stage: "unmanaged",
    meaning:
      "No factory record. Either an external plain account or a Resource Account this factory does not govern.",
  },
  1: {
    name: "PERMANENTLY_RENOUNCED",
    stage: "frozen",
    meaning:
      "Key annihilated and no signer-capability offer anywhere: the code is truly frozen. Nothing can ever act for the address again.",
  },
  2: {
    name: "VERIFIED_DAO_GOVERNED",
    stage: "governed",
    meaning:
      "Factory-managed: a donated EOA with an annihilated key, or an autonomous Resource Account. The registered admin governs upgrades, transfers and renouncement.",
  },
  3: {
    name: "HAZARD_KEY_STILL_ACTIVE",
    stage: "dual_master",
    meaning:
      "DANGER: a registered EOA whose private key is still alive (or whose rotation capability is offered). The creator can bypass the admin. The freeze is NOT effective yet.",
  },
} as const;

export type VaultStatusCode = keyof typeof VAULT_STATUS;

/** Fee bounds compiled into vault_fee.move (`MIN_FEE_OCTAS`, `MAX_FEE_OCTAS`) — hard protocol limits. */
export const VAULT_FEE = {
  octasPerSupra: 100_000_000,
  minFeeOctas: 100_000_000,
  maxFeeOctas: 137_000_000_000_000,
  /** fee = 0 is always allowed and means free deployments (testnet / promos). */
  zeroMeansFree: true,
} as const;

export type VaultPermission = "public-read" | "user-write" | "admin-write" | "dangerous-admin";
export type VaultRisk = "none" | "low" | "medium" | "high" | "critical";

export interface VaultArgDoc {
  name: string;
  type: string;
  example?: string;
  note?: string;
}

export interface VaultEntryDoc {
  module: "vault" | "publisher" | "vault_fee";
  name: string;
  /** Who the `&signer` must be. */
  signer: string;
  permission: VaultPermission;
  risk: VaultRisk;
  mutates_state: true;
  irreversible?: boolean;
  args: VaultArgDoc[];
  effects: string[];
  common_failures: string[];
}

export interface VaultViewDoc {
  module: "vault" | "publisher" | "vault_fee";
  name: string;
  args: { name: string; type: string }[];
  returns: string;
  purpose: string;
}

export interface VaultErrorDoc {
  module: "vault" | "publisher" | "vault_fee";
  code: number;
  /** The Move constant name, verbatim, so it can be grepped in the source. */
  name: string;
  meaning: string;
}

/**
 * The nine lifecycle entry points of `vault`, plus the package-level and fee-level entries of
 * `publisher` / `vault_fee`. Arg order is the exact on-chain order minus `&signer`, which the SDK drops.
 */
export const VAULT_ENTRIES: VaultEntryDoc[] = [
  {
    module: "vault",
    name: "deploy_autonomous_contract",
    signer: "the creator; becomes the catalog owner of the new account",
    permission: "user-write",
    risk: "medium",
    mutates_state: true,
    args: [
      { name: "label", type: "vector<u8>", example: "0x6d795f7061636b616765 ('my_package' as UTF-8 bytes)", note: "Namespaces the address: (creator, label) -> one deterministic Resource Account, forever. 1..=64 bytes, non-empty. Use the package name so the compiled Move.toml self-address matches the deploy target." },
      { name: "metadata_serialized", type: "vector<u8>", example: "0x... (hex of package-metadata.bcs)", note: "May be empty ONLY together with empty code (pre-created empty account)." },
      { name: "code", type: "vector<vector<u8>>", example: "[\"0x...\", \"0x...\"] (hex of each .mv, order matters)", note: "The compiled module bytecode. Modules whose self-address differs from the derived account are rejected on-chain by the framework." },
      { name: "owner", type: "address", example: "0x1... (DAO, multisig, or your wallet)", note: "The admin recorded on-chain. Pass 0x0 to publish and cryptographically freeze in the same transaction: no admin, no capability, tombstoned as renounced." },
    ],
    effects: [
      "Collects the platform deploy fee in SupraCoin if vault_fee is configured with fee_amount > 0.",
      "Derives the Resource Account: sha3_256(bcs(creator) || 'dao_contracts_vault::autonomous_v1' || label || 0xFF).",
      "Publishes the package into that account when code is non-empty.",
      "owner != 0x0: stores ManagedContract{admin: owner, cap: SignerCapability}; owner == 0x0: revokes the self-offer, drops the capability and writes the RenouncedRecord tombstone.",
      "Appends the deployment to the public catalog (FactoryCatalog).",
    ],
    common_failures: [
      "E_ALREADY_INITIALIZED (4): the derived account already exists with state this factory cannot adopt (factory-managed, non-zero sequence number, or a signer-capability offer). Reusing a label aborts here.",
      "E_EMPTY_LABEL (21) / E_LABEL_TOO_LONG (22): label rules from MAX_LABEL_LEN.",
      "E_SELF_ADMIN (17): owner equals the derived account or the vault address.",
      "E_CATALOG_NOT_FOUND (19): factory catalog missing; refuses to record rather than aliasing slot 0.",
      "E_DERIVATION_MISMATCH (20): defensive; should be unreachable.",
    ],
  },
  {
    module: "vault",
    name: "donate_eoa_to_dao",
    signer: "the EOA being donated (self-signed)",
    permission: "user-write",
    risk: "high",
    mutates_state: true,
    args: [
      { name: "dao_admin", type: "address", example: "0x1... (DAO, multisig or wallet)" },
      { name: "signer_capability_sig_bytes", type: "vector<u8>", example: "0x... (Ed25519 signature of SignerCapabilityOfferProofChallengeV2)", note: "Commits to the account's current sequence number; a stale signature is rejected. Not exposed by the SDK RPC — build it with the BCS payload shown in /llm.txt-adjacent docs of this app." },
      { name: "account_scheme", type: "u8", example: "0 (ED25519)", note: "1 = MULTI_ED25519 also accepted by the framework." },
      { name: "account_public_key_bytes", type: "vector<u8>", example: "0x... (current public key of the EOA)" },
    ],
    effects: [
      "Creates the deterministic proxy Resource Account: sha3_256(bcs(eoa) || 'dao_contracts_vault::eoa_proxy_v1' || 0xFF).",
      "Offers the EOA's signer capability to the proxy (replaces any previous offer).",
      "Revokes any pre-existing rotation-capability offer so the future key burn cannot be bypassed.",
      "Stores ManagedContract{is_eoa: true, admin: dao_admin, cap: proxy_cap} on the EOA and catalogs it.",
    ],
    common_failures: [
      "E_ALREADY_INITIALIZED (4): the EOA already has a ManagedContract.",
      "E_ZERO_ADMIN (11) / E_SELF_ADMIN (17): dao_admin is 0x0, the EOA itself, or the vault.",
      "Framework EINVALID_PROOF_OF_KNOWLEDGE / EWRONG_CURRENT_PUBLIC_KEY: signature or key does not commit to the current sequence number and key.",
    ],
  },
  {
    module: "vault",
    name: "cancel_eoa_delegation",
    signer: "the donated EOA (self-signed)",
    permission: "user-write",
    risk: "low",
    mutates_state: true,
    args: [{ name: "eoa_addr", type: "address", example: "0x1... (must equal the signer)" }],
    effects: [
      "Revokes the EOA's signer-capability offer to the proxy (only if it still points at the proxy).",
      "Revokes the proxy's self-offer, making the derived proxy address reusable for a future donation.",
      "Destroys ManagedContract, freeing the EOA to donate again. Marks the catalog row inert.",
    ],
    common_failures: [
      "E_DELEGATION_COMMITTED (18): the key was already annihilated; only renounce_contract remains.",
      "E_NOT_RESOURCE_ACCOUNT (13): the record is not an EOA record.",
    ],
  },
  {
    module: "vault",
    name: "upgrade_contract",
    signer: "the registered admin of contract_addr",
    permission: "admin-write",
    risk: "critical",
    mutates_state: true,
    args: [
      { name: "contract_addr", type: "address", example: "0x1... (a factory-managed contract)" },
      { name: "metadata_serialized", type: "vector<u8>", example: "0x... (package-metadata.bcs)" },
      { name: "code", type: "vector<vector<u8>>", example: "[\"0x...\"] (every .mv in the package)" },
    ],
    effects: [
      "Publishes a new version of the package hosted on contract_addr (compatible policy applies on shortcut module compatibility).",
      "For a donated EOA it enforces: authentication key == ZERO_AUTH_KEY, no rotation offer, signer capability offered to the proxy — the dual-master guard.",
    ],
    common_failures: [
      "E_NOT_ADMIN (1): caller is not the recorded admin.",
      "E_ALREADY_RENOUNCED (2): the contract was renounced; nothing can act for it.",
      "E_EOA_KEY_NOT_BURNED (5): the EOA key is still alive; this is the anti-dual-master gate.",
      "E_ROTATION_CAPABILITY_ACTIVE (24): a rotation capability offer would let a third party bypass the burn.",
      "E_CAPABILITY_NOT_OFFERED_TO_PROXY (6): the delegation was redirected or revoked.",
    ],
  },
  {
    module: "vault",
    name: "renounce_contract",
    signer: "the registered admin of contract_addr",
    permission: "dangerous-admin",
    risk: "critical",
    mutates_state: true,
    irreversible: true,
    args: [{ name: "contract_addr", type: "address", example: "0x1... (a factory-managed contract)" }],
    effects: [
      "Destroys ManagedContract, dropping the only SignerCapability (its fields are private to the account module; nothing can reconstruct it).",
      "Resource Account: revokes the self-offer. Donated EOA: revokes the delegated offer to the proxy, plus the proxy's self-offer.",
      "Writes the permanent RenouncedRecord tombstone (survives the record being destroyed).",
      "IRREVERSIBLE. No signer, no capability and no offer remain: not even a future module version can publish to the address again.",
    ],
    common_failures: [
      "E_NOT_ADMIN (1) / E_CONTRACT_NOT_FOUND (3) / E_ALREADY_RENOUNCED (2).",
      "E_EOA_KEY_NOT_BURNED (5): a donated EOA must have its key annihilated before it can be renounced for real.",
      "E_CAPABILITY_NOT_OFFERED_TO_PROXY (6): the delegation moved; cancelling and re-donating is the recovery path while the key lives.",
    ],
  },
  {
    module: "vault",
    name: "transfer_admin",
    signer: "the current admin of contract_addr",
    permission: "admin-write",
    risk: "high",
    mutates_state: true,
    args: [
      { name: "contract_addr", type: "address", example: "0x1..." },
      { name: "new_admin", type: "address", example: "0x1... (DAO, multisig or wallet)", note: "Must not be 0x0, the contract itself, or the vault; must differ from the current admin." },
    ],
    effects: [
      "Re-points the on-chain admin. The capability keeps pointing at the proxy (for EOAs) or stays with the account (for Resource Accounts), so governance is never stranded.",
      "Updates the catalog row.",
    ],
    common_failures: ["E_ZERO_ADMIN (11) / E_SELF_ADMIN (17) / E_SAME_ADMIN (12) / E_NOT_ADMIN (1) / E_ALREADY_RENOUNCED (2)."],
  },
  {
    module: "publisher",
    name: "upgrade_package",
    signer: "the registered package admin (creator of the vault deployment)",
    permission: "dangerous-admin",
    risk: "critical",
    mutates_state: true,
    args: [
      { name: "metadata_serialized", type: "vector<u8>", example: "0x... (package-metadata.bcs of the vault package)" },
      { name: "code", type: "vector<vector<u8>>", example: "[\"0x...\"] (vault.mv, publisher.mv, vault_fee.mv)" },
    ],
    effects: [
      "Upgrades the vault package itself using the stored package SignerCapability.",
      "A future vault version could rewrite the logic that governs managed contracts, so this entry must be permanently disabled with renounce_package_admin for the immutability guarantees to hold.",
    ],
    common_failures: ["E_ALREADY_RENOUNCED (2): PackageAdmin was destroyed; the package is immutable.", "E_NOT_ADMIN (1)."],
  },
  {
    module: "publisher",
    name: "transfer_package_admin",
    signer: "the current package admin",
    permission: "dangerous-admin",
    risk: "high",
    mutates_state: true,
    args: [{ name: "new_admin", type: "address", example: "0x1..." }],
    effects: ["Re-points the package admin; the SignerCapability stays inside the module."],
    common_failures: ["E_ZERO_ADMIN (11) / E_SELF_ADMIN (17) / E_SAME_ADMIN (12) / E_ALREADY_RENOUNCED (2)."],
  },
  {
    module: "publisher",
    name: "renounce_package_admin",
    signer: "the current package admin",
    permission: "dangerous-admin",
    risk: "critical",
    mutates_state: true,
    irreversible: true,
    args: [],
    effects: [
      "Destroys PackageAdmin: the package's SignerCapability falls out of scope and is annihilated.",
      "Revokes the package Resource Account's self-offer, sealing the address.",
      "IRREVERSIBLE. is_package_renounced() returns true and the vault code can never change again. This is the switch that makes the factory (and every governed child) immune to future module versions.",
    ],
    common_failures: ["E_ALREADY_RENOUNCED (2) / E_NOT_ADMIN (1)."],
  },
  {
    module: "vault_fee",
    name: "set_fee_config",
    signer: "the fee admin",
    permission: "dangerous-admin",
    risk: "medium",
    mutates_state: true,
    args: [
      { name: "new_recipient", type: "address", example: "0x1... (ignored when 0x0 while the fee is already 0)" },
      { name: "new_fee", type: "u64", example: "0 (free) or 100000000..137000000000000 (octas)", note: "Hard caps in code: MIN_FEE_OCTAS..MAX_FEE_OCTAS. Any value in between is rejected. Only affects NEW deploy/donate transactions." },
    ],
    effects: ["Updates the deploy fee and recipient. Existing managed contracts and upgrades are never charged."],
    common_failures: [
      "E_NOT_FEE_ADMIN (1).",
      "E_FEE_BELOW_MINIMUM (3) / E_FEE_EXCEEDS_MAXIMUM (4): non-zero fees outside the hard caps.",
      "E_INVALID_RECIPIENT (2): non-zero fee with recipient 0x0.",
    ],
  },
  {
    module: "vault_fee",
    name: "transfer_fee_admin",
    signer: "the current fee admin",
    permission: "dangerous-admin",
    risk: "medium",
    mutates_state: true,
    args: [{ name: "new_admin", type: "address", example: "0x1..." }],
    effects: ["Re-points the fee admin. There is no on-chain renounce for the fee admin; fee=0 is the only way to make the fee inert."],
    common_failures: ["E_ZERO_ADMIN (6) / E_SELF_ADMIN (8) / E_SAME_ADMIN (7) / E_NOT_FEE_ADMIN (1)."],
  },
];

/** Every `#[view]` the vault package exposes, with what each one proves. */
export const VAULT_VIEWS: VaultViewDoc[] = [
  { module: "vault", name: "predict_next_contract_address", args: [{ name: "creator_addr", type: "address" }, { name: "label", type: "vector<u8>" }], returns: "address", purpose: "The exact Resource Account deploy_autonomous_contract will create for (creator, label). Compile the package against this address BEFORE deploying; it is a pure function and never changes." },
  { module: "vault", name: "predict_eoa_proxy_address", args: [{ name: "eoa_addr", type: "address" }], returns: "address", purpose: "The proxy Resource Account that will govern a donated EOA." },
  { module: "vault", name: "get_contract_admin", args: [{ name: "contract_addr", type: "address" }], returns: "address", purpose: "Active admin, or 0x0 when renounced/unknown." },
  { module: "vault", name: "get_contract_creator", args: [{ name: "contract_addr", type: "address" }], returns: "address", purpose: "Original deployer/donor; readable from the tombstone after renouncement." },
  { module: "vault", name: "get_admin_and_kind", args: [{ name: "contract_addr", type: "address" }], returns: "(address, bool)", purpose: "(admin, is_eoa). Aborts for unknown addresses." },
  { module: "vault", name: "get_eoa_security_status", args: [{ name: "eoa_addr", type: "address" }], returns: "u8 (0..3)", purpose: "The one-fact verdict: 0 unmanaged, 1 renounced, 2 DAO-governed, 3 key-still-alive hazard." },
  { module: "vault", name: "is_eoa_key_annihilated", args: [{ name: "eoa_addr", type: "address" }], returns: "bool", purpose: "Authentication key equals ZERO_AUTH_KEY (the key is mathematically dead)." },
  { module: "vault", name: "is_eoa_permanently_immutable", args: [{ name: "eoa_addr", type: "address" }], returns: "bool", purpose: "Tombstoned, or key dead with no signer/rotation offer anywhere — definitively frozen." },
  { module: "vault", name: "is_eoa_donation_complete", args: [{ name: "eoa_addr", type: "address" }], returns: "bool", purpose: "Donation finished: key dead, signer capability offered to the proxy, no rotation offer." },
  { module: "vault", name: "is_eoa_contract", args: [{ name: "contract_addr", type: "address" }], returns: "bool", purpose: "True when the managed address is a donated EOA (vs an autonomous Resource Account)." },
  { module: "vault", name: "get_eoa_proxy", args: [{ name: "contract_addr", type: "address" }], returns: "address", purpose: "The proxy this factory EXPECTS for a donated EOA, or 0x0." },
  { module: "vault", name: "get_offer_target", args: [{ name: "eoa_addr", type: "address" }], returns: "address", purpose: "Where the signer capability is actually offered right now (0x0 when none). Compare with get_eoa_proxy: a mismatch is a stripped delegation." },
  { module: "vault", name: "get_rotation_offer_target", args: [{ name: "eoa_addr", type: "address" }], returns: "address", purpose: "Active rotation-capability offer, if any. Anything other than 0x0 is a hazard before a key burn." },
  { module: "vault", name: "is_contract_renounced", args: [{ name: "contract_addr", type: "address" }], returns: "bool", purpose: "Reads the tombstone; survives the destruction of ManagedContract." },
  { module: "vault", name: "is_cryptographically_frozen", args: [{ name: "contract_addr", type: "address" }], returns: "bool", purpose: "The only state that proves the hosted package can never be upgraded again." },
  { module: "vault", name: "is_factory_managed", args: [{ name: "contract_addr", type: "address" }], returns: "bool", purpose: "Currently managed or renounced through this factory." },
  { module: "vault", name: "get_total_contracts", args: [], returns: "u64", purpose: "Catalog size (dense counter)." },
  { module: "vault", name: "get_contracts_page", args: [{ name: "offset", type: "u64" }, { name: "limit", type: "u64" }], returns: "vector<DeployedItem>", purpose: "Paginated catalog (max 50 per call)." },
  { module: "vault", name: "get_contracts_by_creator", args: [{ name: "creator_addr", type: "address" }, { name: "limit", type: "u64" }], returns: "vector<DeployedItem>", purpose: "One creator's deployments, newest first (max 50)." },
  { module: "vault", name: "get_all_contracts", args: [], returns: "vector<DeployedItem>", purpose: "Forwarder to get_contracts_page(0, 50)." },
  { module: "publisher", name: "get_package_admin", args: [], returns: "address", purpose: "Package admin, or 0x0 if renounced/immutable." },
  { module: "publisher", name: "is_package_renounced", args: [], returns: "bool", purpose: "True when the vault package itself can never be upgraded again." },
  { module: "vault_fee", name: "get_fee_info", args: [], returns: "(u64, address, address)", purpose: "(fee_amount_octas, fee_recipient, fee_admin)." },
  { module: "vault_fee", name: "get_fee_limits", args: [], returns: "(u64, u64)", purpose: "(MIN_FEE_OCTAS, MAX_FEE_OCTAS) — hard-coded bounds." },
  { module: "vault_fee", name: "get_fee_admin", args: [], returns: "address", purpose: "Active fee admin wallet." },
];

/** Error codes, verbatim from the Move sources, so an agent can act on an abort instead of guessing. */
export const VAULT_ERRORS: VaultErrorDoc[] = [
  { module: "vault", code: 1, name: "E_NOT_ADMIN", meaning: "Caller is not the recorded admin of the contract (or not the package admin)." },
  { module: "vault", code: 2, name: "E_ALREADY_RENOUNCED", meaning: "The contract was renounced; no entry can act on it anymore." },
  { module: "vault", code: 3, name: "E_CONTRACT_NOT_FOUND", meaning: "No ManagedContract for that address." },
  { module: "vault", code: 4, name: "E_ALREADY_INITIALIZED", meaning: "The address is already factory-managed, has executed transactions, or already has a signer offer. Reusing a (creator, label) lands here." },
  { module: "vault", code: 5, name: "E_EOA_KEY_NOT_BURNED", meaning: "The EOA still has a live authentication key; upgrades and renouncement refuse until it is ZERO_AUTH_KEY." },
  { module: "vault", code: 6, name: "E_CAPABILITY_NOT_OFFERED_TO_PROXY", meaning: "The signer capability is not currently offered to the expected proxy: the delegation was redirected or revoked elsewhere." },
  { module: "vault", code: 11, name: "E_ZERO_ADMIN", meaning: "Admin argument is 0x0 where a real admin is required." },
  { module: "vault", code: 12, name: "E_SAME_ADMIN", meaning: "New admin equals the current admin." },
  { module: "vault", code: 13, name: "E_NOT_RESOURCE_ACCOUNT", meaning: "The entry expected a Resource Account record but the address is a donated EOA." },
  { module: "vault", code: 14, name: "E_NO_SELF_OFFER", meaning: "Self-offer missing: the address is not a factory-managed Resource Account." },
  { module: "vault", code: 15, name: "E_MODULE_HAS_NO_CODE", meaning: "Empty code: rejecting an on-chain bytecode publish that could never be verified against a source tree." },
  { module: "vault", code: 16, name: "E_ALREADY_FROZEN", meaning: "Already frozen." },
  { module: "vault", code: 17, name: "E_SELF_ADMIN", meaning: "Admin cannot be the managed contract itself, the creator, or the vault (dead self-governance lock)." },
  { module: "vault", code: 18, name: "E_DELEGATION_COMMITTED", meaning: "The key is already annihilated: cancellation is no longer possible, only renouncement." },
  { module: "vault", code: 19, name: "E_CATALOG_NOT_FOUND", meaning: "Factory catalog missing; the contract refuses to record rather than corrupting slot 0." },
  { module: "vault", code: 20, name: "E_DERIVATION_MISMATCH", meaning: "Defensive check: the framework-derived address differs from the predicted one. Should be unreachable." },
  { module: "vault", code: 21, name: "E_EMPTY_LABEL", meaning: "Deploy label must not be empty." },
  { module: "vault", code: 22, name: "E_LABEL_TOO_LONG", meaning: "Label exceeds MAX_LABEL_LEN (64 bytes)." },
  { module: "vault", code: 24, name: "E_ROTATION_CAPABILITY_ACTIVE", meaning: "A rotation-capability offer is active on the EOA, creating a key-recovery backdoor; revoke it first." },
  { module: "publisher", code: 1, name: "E_NOT_ADMIN", meaning: "Caller is not the package admin." },
  { module: "publisher", code: 2, name: "E_ALREADY_RENOUNCED", meaning: "PackageAdmin is gone; the package is immutable." },
  { module: "vault_fee", code: 1, name: "E_NOT_FEE_ADMIN", meaning: "Caller is not the fee admin (or FeeConfig is missing)." },
  { module: "vault_fee", code: 2, name: "E_INVALID_RECIPIENT", meaning: "Non-zero fee with recipient 0x0." },
  { module: "vault_fee", code: 3, name: "E_FEE_BELOW_MINIMUM", meaning: "Non-zero fee below MIN_FEE_OCTAS (1 SUPRA)." },
  { module: "vault_fee", code: 4, name: "E_FEE_EXCEEDS_MAXIMUM", meaning: "Fee above MAX_FEE_OCTAS (1,370,000 SUPRA)." },
];

/**
 * The security claims, stated as invariants an agent can rely on (and cite) when advising.
 * Each one is enforced by the code, not by convention.
 */
export const VAULT_INVARIANTS: string[] = [
  "A renounced contract is cryptographically frozen: renounce_contract destroys the only SignerCapability (private fields, module-scoped) and revokes every offer. Neither the current nor any future version of the module can reconstruct it.",
  "A donated EOA cannot be upgraded until its authentication key equals ZERO_AUTH_KEY and no rotation capability is offered. This is the on-chain elimination of the dual-master hazard.",
  "The deploy address is a pure function of (creator, label): sha3_256(bcs(creator) || seed_autonomous || label || 0xFF). Third parties cannot squat it: creating the account requires the creator's signer, and an existing account with a sequence number or an active offer cannot be claimed again.",
  "The proxy of a donated EOA is a pure function: sha3_256(bcs(eoa) || seed_proxy || 0xFF). It is never stored; only derived on demand.",
  "governance state is read from cryptographic facts, never from intent flags: get_eoa_security_status derives 0..3 from the authentication key, the offers and the tombstones.",
  "A false renouncement is impossible by construction: E_EOA_KEY_NOT_BURNED refuses to freeze a donated EOA whose key still works.",
  "The catalog refuses to record without a catalog (E_CATALOG_NOT_FOUND): a missing catalog aborts instead of aliasing entries onto slot 0.",
  "Fee bounds are compiled in: fee is 0 (free) or within [1 SUPRA, 1,370,000 SUPRA]. Not even the fee admin can exceed them. Fees only apply to new deploys/donations, never to upgrades of existing contracts.",
  "Transferring the admin never strands control: for a donated EOA the capability always points at the proxy, not at the admin.",
  "Renouncing the PACKAGE is what freezes the code; renouncing a CHILD only freezes that child. A governed (non-renounced) child remains upgradeable by its admin — that is the intended lifecycle, not a vulnerability.",
];

/** Where a given (module, function) pair is documented, for the Export-for-AI enrichment. */
export function getVaultFunctionDocs(moduleName: string, functionName: string): VaultEntryDoc | undefined {
  return VAULT_ENTRIES.find((e) => e.module === moduleName && e.name === functionName);
}
