# Token Inspector Technical Architecture & Security Guide

This document is intended for technical writers and developers to understand the core logic, security nuances, and architectural decisions behind the **Hoglet Token Inspector**. It serves as a foundational guide for writing official documentation, GitBook wikis, or blog posts.

## 1. Core Purpose
The Token Inspector is a specialized on-chain X-ray tool designed to audit tokens on the Supra/Aptos (Move VM) networks. Its primary goal is to extract metadata (decimals, supply, etc.) and, most importantly, detect the presence or absence of **Administrative Capabilities (Master Keys)** that could pose a risk to users (e.g., rug-pulls, infinite minting, or account freezing).

## 2. How the Scanner Works (RPC & Network Layer)
To prevent network abuse and ensure UI stability when scanning massive "whale" wallets or giant smart contracts, the scanner implements a "Firewall Pagination" strategy:
- **Pagination via Cursors:** It fetches resources in chunks of 100 using the `x-supra-cursor` header.
- **Throttling:** It introduces a purposeful 100ms delay between requests to avoid triggering `429 Too Many Requests` bans from the RPC provider.
- **Hard Limits:** It stops scanning after 20 pages (2,000 resources) to prevent browser memory crashes (stack overflows) or permanent RPC bans.
- **Deep JSON Parsing:** It uses pre-compiled Regex (e.g., `/mint_?ref/i`) and depth-limited recursion (max depth of 10) to traverse massive nested JSON objects at lightning speed.

## 3. The Master Keys (Refs & Capabilities)
In the Move ecosystem, administrative powers are represented by physical digital objects called `Refs` or `Capabilities`. The "Big Four" are:
1. `MintRef`: Can create new tokens out of thin air.
2. `BurnRef`: Can destroy tokens from any user's wallet.
3. `TransferRef`: Can bypass standard transfer rules (or forcefully move funds).
4. `FreezeRef`: Can freeze a user's account, preventing them from selling or moving the token.

If a developer holds any of these active keys, the token is technically centralized and poses a high risk to investors.

## 4. The Two Paths of Security (Crucial Distinction)

The most important concept for users to understand is the architectural difference between **Legacy Coins** and modern **Fungible Assets (FA)**. The Inspector handles them differently due to how the Move Framework treats their Master Keys.

### A. Legacy Coins (`0x1::coin::CoinInfo`) - "The Hide-and-Seek Danger"
In the older Legacy Coin standard, the Master Keys are standalone variables. When a token is deployed, the network hands these keys to the creator. 
- **The Problem:** The creator can store these keys in *any* wallet or inside a secret, proxy smart contract. 
- **Inspector Behavior:** If the Inspector scans a wallet and reports **"No Admin Refs"**, it strictly means the keys are not in *that specific wallet*. 
- **The Danger:** It does NOT mean the keys are destroyed. The creator could be hiding them in another address. Therefore, the absence of keys in a Legacy Coin scan is **never a 100% guarantee of safety**.

### B. Fungible Assets (`0x1::fungible_asset::Metadata`) - "The Absolute Proof"
Fungible Assets are the modern, secure standard. Every FA has a centralized "Metadata Object" that acts as its core identity.
- **The Trusted Factory:** When a developer uses a secure framework launchpad to renounce a token, the network forces the Master Keys to remain glued inside the Metadata Object itself, but they are mathematically destroyed and converted to a null state known as `Option::none`.
- **Inspector Behavior:** The Inspector actively hunts for these keys. If it scans the Metadata Object and finds the `Mint`, `Burn`, and `Transfer` refs physically present but explicitly set to `Option::none`, it triggers a mathematical proof of safety.
- **The Verification:** Because `Option::none` is a permanent, irreversible state on the blockchain, the Inspector awards the FA a glowing green **"✅ 100% Verified Safe"** badge. This is absolute, mathematical proof that the token is rug-pull proof and cannot be manipulated.

*(Note: If an FA is created manually by a hacker, they might not attach the keys to the Metadata Object. If the Inspector doesn't find the `Option::none` keys, the FA reverts to the same "Hide-and-Seek" danger as a Legacy Coin).*

## 5. Summary for Documentation
When writing the public documentation, emphasize the following to users:
1. Always trust the **Green Badge (100% Verified Safe)**. It is mathematically impossible to fake.
2. Be cautious with clean scans that don't have the green badge. "Not finding a weapon doesn't mean the weapon doesn't exist; it just means it might be hidden."

---

*For complete official documentation, visit: [https://docs.hoglet.xyz/docs/products/inspector](https://docs.hoglet.xyz/docs/products/inspector)*
