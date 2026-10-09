# Governance Factory: Universal Governance & Cryptographic Renounce Engine

A Move (Supra / Aptos) factory and governance hub for deploying, managing, upgrading, and permanently renouncing smart contracts for both **Autonomous Resource Accounts** and **Migrated EOAs** (via a per-EOA proxy Resource Account).

---

## 🛡️ Solved: The "Dual-Master / Hot-Potato" Hazard

Previous naive migration approaches created a dangerous illusion: an EOA offered governance to a DAO, but because the EOA retained its private key, the creator could still execute unauthorized upgrades or revoke the capability.

This factory enforces **On-Chain Cryptographic Proof of Key Annihilation**:
* **The DAO refuses to upgrade** (`E_EOA_KEY_NOT_BURNED`) unless the EOA's authentication key is mathematically verified to equal `ZERO_AUTH_KEY`.
* **Public Security Verifier**: `get_eoa_security_status(eoa_addr)` derives the status from on-chain cryptographic facts (never from an intent flag):
  * `0`: `STATUS_UNMANAGED`
  * `1`: `STATUS_PERMANENTLY_RENOUNCED` — key annihilated **and** no signer-capability offer (truly 100% immutable)
  * `2`: `STATUS_VERIFIED_DAO_GOVERNED` — key annihilated, capability offered (DAO-governed)
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
Zero private keys from genesis. Uses a deterministic canonical domain seed `AUTONOMOUS_SEED` (`b"governance_factory::autonomous_v1"`) allowing predictable on-chain address pre-calculation for CI/CD compilation without manual salt hazards.

1. **Predict Address:**
   ```move
   predict_next_contract_address(creator_addr)
   ```
2. **Deploy in 1 Atomic Step:**
   ```move
   deploy_autonomous_contract(&creator, metadata, code, dao_address)
   ```
   * Installs `ManagedContract` directly on the Resource Account, storing its `SignerCapability`.
   * Only `dao_address` can trigger `upgrade_contract`.
   * The DAO can permanently freeze the contract with `renounce_contract` (`admin = @0x0`).

---

### Path 2: EOA Self-Renounce (burn the key)
For an EOA there is no factory record to clear: the freeze is pure framework state. The owner burns the private key while **no signer-capability offer is active** (if one exists, revoke it first while the key is still alive).

1. **Burn the key (point of no return, owner-signed tx):**
   ```move
   supra_framework::account::rotate_authentication_key_call(&eoa, ZERO_AUTH_KEY)
   ```
2. **Verify:** `is_eoa_permanently_immutable(eoa_addr)` is now `true` and `get_eoa_security_status` returns `1`.

---

### Path 3: EOA Migration to DAO (Donation + Key Burn)
For converting existing personal wallet deployments into verified DAO-governed contracts. The EOA is bound to a deterministic **proxy Resource Account** (`predict_eoa_proxy_address`) that holds the delegated signer capability, so the factory can later revoke it (real freeze) and re-point admin safely.

1. **Sweep all remaining wallet assets to a safe external address.**
2. **Donate to the DAO in 1 atomic self-signed tx** (creates the proxy, offers the EOA's signer capability to the proxy, registers the governance record):
   ```move
   donate_eoa_to_dao(&eoa, dao_address, signer_capability_sig_bytes, account_scheme, account_public_key_bytes)
   ```
3. **⚠️ Complete the donation — Burn Private Key (Point of No Return, owner-signed tx):**
   ```move
   supra_framework::account::rotate_authentication_key_call(&eoa, ZERO_AUTH_KEY)
   ```
   The key burn cannot be atomic with the donation: the framework's rotation entry point is **not `public`**, so only the EOA itself can call it. Until this tx lands, `get_eoa_security_status` returns `3` (hazard).
4. **Verify:** `is_eoa_donation_complete(eoa_addr)` is `true` and `get_eoa_security_status` returns `2`.
5. **DAO Sovereign Governance:**
   * DAO updates contract: `upgrade_contract` (verifies `ZERO_AUTH_KEY` and that the capability is offered to the proxy).
   * DAO permanently renounces: `renounce_contract` — for a donated EOA this **revokes** the delegated capability through the proxy, producing a real, on-chain freeze (`is_eoa_permanently_immutable == true`).
   * DAO transfers governance: `transfer_admin` — safe at any time, because the delegated capability always points to the proxy (not to the admin).

---

## 🔁 Proxy Lifecycle (donated EOAs)

Each donated EOA is bound to a deterministic **proxy Resource Account**:

```
predict_eoa_proxy_address(eoa) = sha3_256( bcs(eoa) ‖ EOA_PROXY_SEED ‖ 0xFF )
EOA_PROXY_SEED = "governance_factory::eoa_proxy_v1"
```

The address is **derived on demand** (never stored). Full lifecycle:

| Phase | Trigger | What happens |
| :--- | :--- | :--- |
| **0 · Derive** | `predict_eoa_proxy_address(eoa)` | Address computed deterministically; nothing on-chain yet. |
| **1 · Create + delegate** | `donate_eoa_to_dao` (tx1) | `create_resource_account(eoa, EOA_PROXY_SEED)` creates the proxy (its own auth key is `ZERO`); its `SignerCapability` is stored in `ManagedContract{is_eoa: true, cap}` on the EOA; `offer_signer_capability(eoa, …, proxy)` makes the proxy the offer recipient. |
| **2 · Burn** | `rotate_authentication_key_call(&eoa, ZERO)` (tx2) | EOA auth key → `ZERO`; the proxy becomes the *only* address able to mint an EOA signer. |
| **3 · Govern** | `upgrade_contract(&dao, eoa, …)` | Factory mints `proxy_signer` from `cap` → `account::create_authorized_signer(proxy, eoa)` → `code::publish_package_txn`. Gated by `admin`, `!is_renounced`, key `ZERO`, and offer → proxy. |
| **4 · Transfer** | `transfer_admin(&dao, eoa, new)` | Re-points `admin`; the offer still points to the proxy, so governance is never stranded. |
| **5 · Freeze** | `renounce_contract(&dao, eoa)` | Factory mints `eoa_signer` via the proxy and calls `account::revoke_signer_capability(&eoa_signer, proxy)`. Combined with the dead key → `is_eoa_permanently_immutable == true`. |

**Invariants**
* The proxy **never publishes directly**; it only lends its offer-recipient role + the stored capability. The actual publisher is the authorized `eoa_signer`.
* The proxy address is **not stored** — only exposed via `predict_eoa_proxy_address`, `get_eoa_proxy`, `is_eoa_contract`, and the `EoaGovernanceRegisteredEvent`.
* After `renounce_contract`, the proxy `cap` remains in storage but is **inert** (no offer to authorize) → the EOA is frozen.
* **Trust anchor:** the `cap` is usable only by the `governance` module.

---

## 🏛️ Factory Self-Governance & Final Renounce

The `governance_factory` itself is launched via `supra_framework::resource_account::create_resource_account_and_publish_package`:

1. **Publication:** In `init_module`, the factory claims its own `SignerCapability` from `resource_account::retrieve_resource_account_cap(factory_signer, @admin)` and stores `FactoryAdmin { admin: @admin, cap }`.
2. **Testing & Staging:** While in active monitoring, the registered `@admin` can execute:
   * `upgrade_factory(&admin, metadata, code)`: updates the factory package bytecode.
   * `transfer_factory_admin(&admin, new_admin)`: transfers factory administration.
3. **Permanent Cryptographic Renounce (Zero Admin):** Once verified in production:
   * `renounce_factory_admin(&admin)`: destroys `FactoryAdmin`, drops the factory's `SignerCapability`, and revokes the Resource Account self-offer.
   * `is_factory_renounced()` returns `true` and `get_factory_admin()` returns `@0x0`.
   * The factory becomes **100% immutable and autonomous forever**.
