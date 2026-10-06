# Whitepaper: Autonomous Governance & Trustless Renunciation in MoveVM

**A Formal Specification for Sequential Resource Account Factories, Contract Delegation, and Cryptographic Key Annihilation on Supra & Aptos**

---

## 1. Abstract

Decentralized applications (dApps) in Web3 face a persistent existential challenge: the **centralized administrator dilemma**. In traditional smart contract systems, deployer addresses retain administrative privileges or upgrade keys, leaving users vulnerable to malicious updates, key compromises, and rug-pull exploits. 

In Diem-derived Move Virtual Machines (such as Supra and Aptos), the linear type system prohibits storing or copying `signer` instances, introducing structural hurdles for delegating and renouncing contracts. Furthermore, naive EOA delegation patterns introduce a hazardous **"Dual-Master / Hot-Potato"** dilemma where an EOA creator claims to delegate authority to a DAO while secretly retaining their private key, creating an illusion of decentralization.

This paper specifies a three-path operational framework built on a dual architectural base (new deployments vs. legacy EOAs):
1. **Deterministic Autonomous Factory (Path 1)**: An automated factory deploying autonomous Resource Accounts with zero private keys from inception, utilizing a canonical domain-separated seed (`b"governance_factory::autonomous_v1"`) to eliminate manual salt hazards and provide stable, predictable compilation targets.
2. **EOA Self-Renounce (Path 2)**: The owner burns the private key while no signer-capability offer is active, yielding cryptographically verifiable immutability (`is_eoa_permanently_immutable`) with no factory-side record.
3. **Cryptographically Verified EOA Migration to DAO (Path 3)**: A trustless migration protocol that binds each legacy EOA to a proxy Resource Account holding its delegated signer capability, giving the EOA the same managed lifecycle as a Resource Account and enabling a real, on-chain renounce via capability revocation.

---

## 2. Motivation & Problem Statement

### 2.1 The Rug-Pull Dilemma
In decentralized finance (DeFi) and on-chain gaming, trust minimization requires that no single entity holds the unilateral ability to modify deployed contract logic or seize user collateral.

### 2.2 The Move Signer Invariant
In Move, the `signer` primitive represents authenticated authority:
```move
// INVALID IN MOVE - Compilation Error:
struct MaliciousTrap has key {
    stolen_signer: signer // Error: 'signer' lacks 'store' and 'copy' abilities
}
```
Because a `signer` cannot be captured in storage without explicit framework-level capability structures (`SignerCapability`), protocols cannot simply "save" an account's signature for automated governance without architectural encapsulation.

### 2.3 The "Dual-Master / Hot-Potato" Hazard
When an EOA delegates its signer capability to a DAO without destroying its private key:
1. **Race Conditions**: The original creator can execute upgrades directly via wallet signature, bypassing DAO governance proposals.
2. **Revocation Vector**: The creator can unilaterally invoke `account::revoke_signer_capability`, seizing back exclusive control.
3. **False Security**: The community believes a DAO governs the protocol, while the original deployer retains a cryptographic backdoor.

---

## 3. System Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │       governance (@governance_factory)       │
                    └───────┬──────────────────────────────┬───────┘
                            │                              │
                 [Path 1: New Deployments]       [Path 3: Legacy Migration]
                            │                              │
                            ▼                              ▼
                 ┌──────────────────────┐       ┌──────────────────────┐
                 │   Resource Account   │       │     Migrated EOA     │
                 │   (Zero Private Key) │       │  (Burned Private Key)│
                 ├──────────────────────┤       ├──────────────────────┤
                 │ ManagedContract:     │       │ ManagedContract:     │
                 │ - admin: @DAO        │       │ - admin: @DAO        │
                 │ - cap: SignerCap     │       │ - is_eoa + proxy cap │
                 └──────────┬───────────┘       └──────────┬───────────┘
                            │                              │
              ┌─────────────┴─────────────┐                │
              ▼                           ▼                │
     upgrade_contract            renounce_contract         │
     (DAO updates code)          (admin = @0x0, FROZEN)    │
                                                           │
                        ┌──────────────────────────────────┴───────────────────────┐
                        ▼                                                          ▼
             [Direct Creator Action]                                      [DAO Governance]
                        │                                                          │
                  burn key (no offer)                                    upgrade_contract
             (freeze = ZERO_AUTH_KEY;                            (Enforces AuthKey == ZERO_AUTH_KEY
              owner-signed framework tx)                          + offer recipient == caller)
```

### 3.1 Path 1: Canonical Deterministic Seed Derivation
Instead of requiring manual seed inputs, the factory utilizes a canonical domain-separated seed (`AUTONOMOUS_SEED = b"governance_factory::autonomous_v1"`):

$$\text{Seed} = \texttt{"governance\_factory::autonomous\_v1"}$$
$$\text{ResourceAddress} = \text{SHA3-256}(\text{BCS}(\text{CreatorAddress}) \mathbin{\Vert} \text{Seed} \mathbin{\Vert} \text{0xFF})$$

Because the target address is deterministic and queryable via `predict_next_contract_address(creator)`, automated CI/CD pipelines can pre-compile Move packages with the exact target address before transmitting the deployment transaction, while preventing front-running address squatting.

### 3.2 Path 2: EOA Self-Renounce
For creators who wish to permanently freeze their contract without a DAO intermediary, no factory call is required: the freeze is pure framework state. The owner burns the private key while ensuring that no signer-capability offer is active. Because the Move framework's key-rotation entry point (`account::rotate_authentication_key_call`) is **not `public`**, no module can annihilate the key on the owner's behalf; the burn must be an owner-signed transaction:

$$\text{AuthKey} \leftarrow \text{ZERO\_AUTH\_KEY}, \quad \text{no active capability offer}$$

Only after this second step does `is_eoa_permanently_immutable(eoa) == true` hold.

### 3.3 Path 3: Cryptographically Verified EOA Migration to DAO (Proxy)
To eliminate the dual-master hazard while keeping revocability, the EOA delegates its signer capability to a per-EOA **proxy Resource Account** (derived deterministically as `sha3_256(bcs(eoa) || EOA_PROXY_SEED || 0xFF)`). A Resource Account can hold a storable `SignerCapability`, unlike an EOA, which is what makes a real freeze possible.

1. **Atomic Donation**: `donate_eoa_to_dao` (one self-signed tx) (a) creates the proxy Resource Account, (b) delegates the EOA's signer capability to it (`account::offer_signer_capability`), and (c) stores a unified `ManagedContract{is_eoa: true, cap: proxy_cap}`. The donation is *not* yet effective: the key is still alive.
2. **Cryptographic Key Annihilation**: In a second, owner-signed transaction the EOA rotates its key to a dead state (the framework routine is not `public`, so it cannot be composed atomically):
   $$\text{AuthKey}_{\text{new}} = \text{ZERO\_AUTH\_KEY} = \text{0x000...000}_{32}$$
3. **On-Chain Enforcement**: The DAO upgrade routine (`upgrade_contract`) enforces:
   $$\text{assert}!(\text{account::get\_authentication\_key}(\text{eoa}) == \text{ZERO\_AUTH\_KEY})$$
   $$\text{assert}!(\text{account::get\_signer\_capability\_offer\_for}(\text{eoa}) == \text{proxy})$$
4. **Real Renounce**: `renounce_contract` drives the proxy's authorized signer to invoke `account::revoke_signer_capability`, permanently removing the delegated capability. Combined with the dead key, `is_eoa_permanently_immutable(eoa) == true`.

If the private key is not dead, the DAO cannot execute upgrades, preventing premature or simulated decentralization. `is_eoa_donation_complete(eoa)` reports whether the donation (key dead + capability delegated) has landed.

### 3.4 Proxy Lifecycle and Invariants
The proxy is a Resource Account derived from the EOA and the fixed domain seed, never stored:

$$\text{proxy}(e) = \text{SHA3-256}(\text{BCS}(e) \mathbin{\Vert} \texttt{"governance\_factory::eoa\_proxy\_v1"} \mathbin{\Vert} \text{0xFF})$$

Its state machine:
1. **Derive** — `predict_eoa_proxy_address(e)` (pure).
2. **Create + delegate** — `donate_eoa_to_dao`: the proxy is created (auth key `ZERO`), its `SignerCapability` is stored in `ManagedContract{is_eoa: true, cap}`, and the EOA offers its capability to the proxy.
3. **Burn** — owner-signed key rotation to `ZERO`.
4. **Govern** — `upgrade_contract` mints the proxy signer from `cap` and then an authorized EOA signer.
5. **Transfer** — `transfer_admin` re-points `admin`; the offer still targets the proxy, so control is never stranded.
6. **Freeze** — `renounce_contract` uses the proxy's authorized EOA signer to `account::revoke_signer_capability`, yielding a cryptographically complete freeze.

Invariants: the proxy never publishes directly (only supplies the offer-recipient role and the stored capability); its address is never stored; after renounce the capability is inert. The `cap` is usable only by the `governance` module, which is the system's trust anchor — publishing the module as immutable makes freezes unconditional.

---

## 4. Security & Threat Analysis

### 4.1 Dual-Master Elimination
By querying `get_eoa_security_status(eoa_addr)`, external entities receive an unambiguous state evaluation **derived from on-chain cryptographic facts, never from an intent flag**:
* `STATUS_UNMANAGED (0)`
* `STATUS_PERMANENTLY_RENOUNCED (1)`: Key annihilated **and** no signer-capability offer — code is truly frozen.
* `STATUS_VERIFIED_DAO_GOVERNED (2)`: Key is `ZERO_AUTH_KEY` and a capability offer exists; the receiving DAO possesses exclusive sovereignty.
* `STATUS_HAZARD_KEY_STILL_ACTIVE (3)`: Dangerous state; the private key is still alive (a managed EOA or an active signer-capability offer keeps factory governance reachable while the key can still sign).

### 4.2 Collision Probability
Resource address derivation utilizes domain separation (`0xFF`) and the SHA3-256 cryptographic hash function. The collision probability is:
$$P(\text{Collision}) < 2^{-256}$$

### 4.3 Key Annihilation Irreversibility
Finding a private key $k$ such that $\text{SHA3-256}(\text{PubKey}(k)) = \mathbf{0}^{256}$ violates the one-way preimage resistance of SHA3-256. Once rotated to `ZERO_AUTH_KEY`, private key access is mathematically destroyed.

---

## 5. Critical Operational Hazard: Asset Trapping

> [!CAUTION]
> **PERMANENT ASSET DESTRUCTION IN EOA BURN**:
> When an EOA undergoes key annihilation (`rotate_authentication_key_call` to `ZERO_AUTH_KEY`), **all native coins, fungible assets, and NFTs remaining in that account become permanently untransferable**. Developers must execute a complete wallet sweep prior to initiating EOA annihilation.

---

## 6. Comparative Paradigm Matrix

| Feature | Ethereum (EVM) | Sui Move | Supra / Aptos (This Architecture) |
| :--- | :--- | :--- | :--- |
| **Account Model** | EOA vs Contract | Object-Centric | Account & Resource Model |
| **Upgrade Control** | Proxy Admin / Multisig | `UpgradeCap` Object | `SignerCapability` & `code::publish_package_txn` |
| **Dual-Master Hazard** | Multisig vs EOA owner | Transferable Cap | **Solved: Enforced on-chain `ZERO_AUTH_KEY`** |
| **Renounce Mechanism** | Burn proxy admin / renounce | Delete/Burn `UpgradeCap` | `renounce_contract` (`admin = @0x0`) + proxy capability revocation |
| **Self-Renounce** | `renounceOwnership()` | Destroy `UpgradeCap` | Owner-signed key burn (no active offer) |
| **Address Derivation** | `CREATE2` (Salt + Bytecode) | Object ID on Tx | `SHA3-256(BCS(Creator) \| Seed \| 0xFF)` |

---

## 7. Conclusion

The `governance_factory` architecture guarantees that smart contracts in MoveVM can transition from developer-controlled prototypes to mathematically immutable or sovereign DAO-governed institutions with zero possibility of residual backdoors or false decentralization.
