# Keyless Contract Vault: deploy keyless, delegate control, renounce forever

A Move (Supra / Aptos) vault that deploys, governs, upgrades and permanently renounces smart contracts for both **Autonomous Resource Accounts** and **Migrated EOAs** (via a per-EOA proxy Resource Account).

The admin it records is an **address, not a DAO**: whoever it is holds a single signing key over the contract. A multisig, timelock or DAO only decentralises control when that address actually *is* one — which is why the interface asks for an admin rather than promising collective governance.

> **On-chain identity:** the published package is `dao_contracts_vault`, and the module that owns all
> state is `dao_contracts_vault::vault` (plus `publisher` and `vault_fee`). Every live state record
> (`ManagedContract`, `RenouncedRecord`, `FactoryCatalog`) is typed to that module, so renaming it would
> orphan every existing deployment. "Keyless Contract Vault" is the package's name in these docs; in the
> app the surfaces are **Deploy Contract** (deploy and govern) and **My Contracts** (manage what this
> wallet deployed). The module keeps its name.

---

## 🤖 Machine-readable surfaces (for agents and scanners)

| Surface | What it is |
| :--- | :--- |
| `/vault.txt` | The full machine guide: seeds, derivation, status gates, risk-tagged entries, error codes, invariants. Generated from `config/vault.ts`. |
| **"Copy AI pack"** | Button on the governance / my-contracts pages. Copies the JSON context pack (`hoglet.vault-context.v1`) with catalog, lifecycle and a ready operator prompt. |
| `GET /api/metadata/{address}?network={testnet\|mainnet}` | Live per-address metadata (`hoglet.contract-metadata.v1`): status 0–3, frozen flags, offers, admin, fee — read straight from the chain. |
| Interactor **"Export for AI"** | Per-function JSON ABI. For vault functions it is enriched with `permission_level`, `risk_level`, `effects`, `common_failures` and the `irreversible` flag, pulled from the same catalog. |
| `npm run check:vault` | Pins this README, the whitepaper, the catalog and the generated guide to the Move sources. A stale seed fails the check instead of shipping. |

---

## 🛡️ Solved: The "Dual-Master / Hot-Potato" Hazard

Previous naive migration approaches created a dangerous illusion: an EOA offered governance to a DAO, but because the EOA retained its private key, the creator could still execute unauthorized upgrades or revoke the capability.

This factory enforces **On-Chain Cryptographic Proof of Key Annihilation**:
* **The vault refuses to upgrade** (`E_EOA_KEY_NOT_BURNED`) unless the EOA's authentication key is mathematically verified to equal `ZERO_AUTH_KEY`.
* **Public Security Verifier**: `get_eoa_security_status(eoa_addr)` derives the status from on-chain cryptographic facts (never from an intent flag):
  * `0`: `STATUS_UNMANAGED`
  * `1`: `STATUS_PERMANENTLY_RENOUNCED` — key annihilated **and** no signer-capability offer (truly 100% immutable)
  * `2`: `STATUS_VERIFIED_DAO_GOVERNED` — key annihilated, capability offered to the proxy (DAO-governed)
  * `3`: `STATUS_HAZARD_KEY_STILL_ACTIVE` (⚠️ the private key is still alive — renounce is NOT effective yet)
* **Immutable check**: `is_eoa_permanently_immutable(eoa_addr)` returns a definitive, unambiguous answer.
* **On-chain events**: every deploy / upgrade / renounce / admin transfer emits an event.

---

## ⚠️ CRITICAL DANGER WARNING: EOA BURNING & ASSET LOSS

> [!CAUTION]
> **IRREVERSIBLE PRIVATE KEY DESTRUCTION**:
> When an EOA burns its private key by rotating its authentication key to `ZERO_AUTH_KEY`:
> 1. **The private key is annihilated forever.** No wallet or software will EVER be able to sign transactions with that wallet's seed phrase again.
> 2. **ALL ASSETS REMAINING IN THE WALLET ARE LOCKED FOREVER.** Any native tokens (`SUPRA`), custom coins, or NFTs residing in that EOA address that were not transferred out or governed by contracts before the burn **WILL BE PERMANENTLY UNRECOVERABLE**.
> 3. **SWEEP ASSETS FIRST:** Always withdraw all funds and NFTs from the personal EOA before initiating the burn sequence!

---

## 🏛️ Architectural Pathways

### Path 1: Autonomous Resource Accounts (Recommended for New Deployments)

Zero private keys from genesis. The address is derived from the creator **and a label** using the
canonical domain seed `AUTONOMOUS_SEED` (`b"dao_contracts_vault::autonomous_v1"`), so it is predictable
before compilation and one creator can host several deployments:

    address = sha3_256( bcs(creator) || "dao_contracts_vault::autonomous_v1" || label || 0xFF )

1. **Predict Address** (pure view — never re-derive this off-chain):
   ```move
   predict_next_contract_address(creator_addr, label)   // label = the package name, 1..=64 bytes
   ```
2. **Bind it and deploy** in 1 atomic step — the label namespaces the address, and the compiled
   `Move.toml` must use the predicted address as the package's named address:
   ```move
   deploy_autonomous_contract(&creator, label, metadata_serialized, code, owner)
   ```
   * Installs `ManagedContract` on the Resource Account, storing its `SignerCapability`.
   * Only the registered `owner` can trigger `upgrade_contract` / `transfer_admin` / `renounce_contract`.
   * `owner = @0x0` publishes and **cryptographically freezes in the same transaction**: no admin is
     recorded, the self-offer is revoked, the capability is dropped and the account is tombstoned as
     renounced.

### Path 2: EOA Self-Renounce (burn the key)

For an EOA there is no factory record to clear: the freeze is pure framework state. The owner burns the private key while **no signer-capability offer is active** (if one exists, revoke it first while the key is still alive).

1. **Burn the key (point of no return, owner-signed tx):**
   ```move
   supra_framework::account::rotate_authentication_key_call(&eoa, ZERO_AUTH_KEY)
   ```
2. **Verify:** `is_eoa_permanently_immutable(eoa_addr)` is now `true` and `get_eoa_security_status` returns `1`.

### Path 3: EOA Migration to DAO (Donation + Key Burn)

For converting existing personal wallet deployments into verified DAO-governed contracts. The EOA is bound to a deterministic **proxy Resource Account** (`predict_eoa_proxy_address`) that holds the delegated signer capability, so the vault can later revoke it (real freeze) and re-point admin safely.

1. **Sweep all remaining wallet assets to a safe external address.**
2. **Donate to the DAO in 1 atomic self-signed tx** (creates the proxy, offers the EOA's signer capability to the proxy, revokes any rotation-capability offer, registers the governance record):
   ```move
   donate_eoa_to_dao(&eoa, dao_admin, signer_capability_sig_bytes, account_scheme, account_public_key_bytes)
   ```
3. **⚠️ Complete the donation — Burn Private Key (point of no return, owner-signed tx):**
   ```move
   supra_framework::account::rotate_authentication_key_call(&eoa, ZERO_AUTH_KEY)
   ```
   The key burn cannot be atomic with the donation: the framework's rotation entry point is **not `public`**, so only the EOA itself can call it. Until this tx lands, `get_eoa_security_status` returns `3` (hazard) and both upgrade and renouncement refuse with `E_EOA_KEY_NOT_BURNED`.
4. **Verify:** `is_eoa_donation_complete(eoa_addr)` is `true` and `get_eoa_security_status` returns `2`.
5. **DAO Sovereign Governance:**
   * DAO updates contract: `upgrade_contract` (verifies `ZERO_AUTH_KEY`, no rotation offer and that the capability is offered to the proxy).
   * DAO permanently renounces: `renounce_contract` — for a donated EOA this **revokes** the delegated capability through the proxy, producing a real, on-chain freeze (`is_eoa_permanently_immutable == true`).
   * DAO transfers governance: `transfer_admin` — safe at any time, because the delegated capability always points to the proxy (not to the admin).
6. **Recovery before the burn:** `cancel_eoa_delegation` (self-signed) revokes both offers and frees the EOA to donate again. Once the key is annihilated the delegation is committed (`E_DELEGATION_COMMITTED`) and only renouncement remains.

---

## 🔁 Proxy Lifecycle (donated EOAs)

Each donated EOA is bound to a deterministic **proxy Resource Account**:

```
predict_eoa_proxy_address(eoa) = sha3_256( bcs(eoa) ‖ EOA_PROXY_SEED ‖ 0xFF )
EOA_PROXY_SEED = "dao_contracts_vault::eoa_proxy_v1"
```

The address is **derived on demand** (never stored). Full lifecycle:

| Phase | Trigger | What happens |
| :--- | :--- | :--- |
| **0 · Derive** | `predict_eoa_proxy_address(eoa)` | Address computed deterministically; nothing on-chain yet. |
| **1 · Create + delegate** | `donate_eoa_to_dao` (tx1) | `create_resource_account(eoa, EOA_PROXY_SEED)` creates the proxy (its own auth key is `ZERO`); its `SignerCapability` is stored in `ManagedContract{is_eoa: true, cap}` on the EOA; `offer_signer_capability(eoa, …, proxy)` makes the proxy the offer recipient. |
| **2 · Burn** | `rotate_authentication_key_call(&eoa, ZERO)` (tx2) | EOA auth key → `ZERO`; the proxy becomes the *only* address able to mint an EOA signer. |
| **3 · Govern** | `upgrade_contract(&dao, eoa, …)` | Vault mints `proxy_signer` from `cap` → `account::create_authorized_signer(proxy, eoa)` → `code::publish_package_txn`. Gated by `admin`, `!is_renounced`, key `ZERO`, no rotation offer, and offer → proxy. |
| **4 · Transfer** | `transfer_admin(&dao, eoa, new)` | Re-points `admin`; the offer still points to the proxy, so governance is never stranded. |
| **5 · Freeze** | `renounce_contract(&dao, eoa)` | Vault mints `eoa_signer` via the proxy and calls `account::revoke_signer_capability(&eoa_signer, proxy)`. Combined with the dead key → `is_eoa_permanently_immutable == true`. |

**Invariants**
* The proxy **never publishes directly**; it only lends its offer-recipient role + the stored capability. The actual publisher is the authorized `eoa_signer`.
* The proxy address is **not stored** — only exposed via `predict_eoa_proxy_address`, `get_eoa_proxy`, `is_eoa_contract`, and the `EoaGovernanceRegisteredEvent`.
* A mismatch between `get_offer_target` and `get_eoa_proxy` means the delegation was redirected: burning the key in that state would be irreversible while control sits elsewhere. The audit surfaces this before the burn.
* **Trust anchor:** the `cap` (both the per-EOA proxy cap and the package cap) is usable only by the vault/publisher modules. Publishing the package as immutable makes every freeze unconditional.

---

## 🏛️ Package Self-Governance & Final Renounce (`publisher`)

The vault package itself is launched via `supra_framework::resource_account::create_resource_account_and_publish_package`:

1. **Publication:** In `init_module`, the package claims its own `SignerCapability` from `resource_account::retrieve_resource_account_cap(package_signer, @admin)` and stores `PackageAdmin { admin, cap }`.
2. **Testing & Staging:** While in active monitoring, the registered package admin can execute:
   * `upgrade_package(&admin, metadata, code)`: updates the **vault package bytecode itself** — a future version could rewrite the governance logic, which is why the next step matters.
   * `transfer_package_admin(&admin, new_admin)`: transfers package administration.
3. **Permanent Cryptographic Renounce (Zero Admin):** Once verified in production:
   * `renounce_package_admin(&admin)`: destroys `PackageAdmin`, drops the package's `SignerCapability`, and revokes the Resource Account self-offer.
   * `is_package_renounced()` returns `true` and `get_package_admin()` returns `@0x0`.
   * The package becomes **100% immutable and autonomous forever**.
4. **What renouncing the package does (and does not) freeze:**
   * It freezes the **code**. No future module version can ever change the rules — including the rules that govern children, which is what makes every downstream guarantee permanent.
   * It does **not** freeze governed children: a child that was not renounced stays upgradeable by its own admin. That is the intended lifecycle: "immutable" is a property of a renounced child, not of the factory.

---

## 💸 Fee Module (`vault_fee`)

* Charged **only** on new deployments/donations (`deploy_autonomous_contract`, `donate_eoa_to_dao`). Upgrades, transfers and renouncements are never charged.
* Allowed values, hard-coded: `0` (free) or `[1 SUPRA .. 1,370,000 SUPRA]` (`MIN_FEE_OCTAS` / `MAX_FEE_OCTAS`). Not even the fee admin can exceed them.
* Admin entries: `set_fee_config(&fee_admin, new_recipient, new_fee)`, `transfer_fee_admin(&fee_admin, new_admin)`.
* **There is no `renounce_fee_admin`.** `fee = 0` is the only way to make the fee inert; a live fee admin can raise it again within the caps, and it only affects new deploys. Read `get_fee_info()` before advising a deploy.

---

## 🧪 Testnet notes

* In the **testnet** tree, `deploy_autonomous_contract` has the `owner != creator` self-admin guard **commented out** (marked `ONLY IN TESTNET IS COMMENTED` in `vault.move`). Re-enable it before a mainnet deployment.
* `deploy_autonomous_contract` still refuses `owner == self` (the derived account) and `owner == vault` at all times.

---

## 📦 Repo layout & verification

```
sources/vault.move        factory: deploy / donate / upgrade / transfer / renounce + catalog + views
sources/publisher.move    package-level admin: upgrade_package / transfer_package_admin / renounce_package_admin
sources/vault_fee.move    deploy fee with compiled-in bounds
tests/governance_tests.move
Move.toml                 named addresses (dao_contracts_vault, admin, RENOUNCE)
```

From the app repository (one level up):

```bash
npm run check:vault   # seeds, status codes, fee bounds, entry/view/error catalogs and all docs vs the Move sources
```
