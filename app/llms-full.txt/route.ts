import { NextResponse } from 'next/server';

// Expanded version of /llms.txt following the llms.txt standard (llmstxt.org).
const llmsFullText = `# Hoglet Tools - Full LLM Reference

> Complete machine-readable reference for the Hoglet Tools platform (Supra Blockchain, Move VM): smart contract Interactor, Token Inspector security scanner, faucet and cached RPC proxies.

## Overview

This platform is a generic UI interactor for Move smart contracts deployed on the Supra Blockchain.
It dynamically fetches the ABI of any Supra contract, parses the functions (Entry, View, and Internal), and provides a user-friendly way for humans to construct and send transactions to their Web3 wallets (e.g., Starkey).

Main pages:
- Interactor: https://tools.hoglet.xyz/en/interactor
- Inspector: https://tools.hoglet.xyz/en/inspector
- Source Verification: https://tools.hoglet.xyz/en/verify?address={address}&package={package}
- Official docs: https://docs.hoglet.xyz/docs/products/inspector

## Platform Endpoints (no API key required)

| Endpoint | Purpose | Upstream |
|---|---|---|
| GET /api/faucet?address={addr} | Fund a testnet address with SUPRA | https://rpc-testnet.supra.com/rpc/v1/wallet/faucet/{addr} |
| ANY /api/rpc/{mainnet\\|testnet}/{path} | RPC v1 proxy | https://rpc-{network}.supra.com/rpc/v1/{path} |
| ANY /api/rpc-v2/{mainnet\\|testnet}/{path} | RPC v2 proxy | https://rpc-{network}.supra.com/rpc/v2/{path} |
| ANY /api/rpc-v3/{mainnet\\|testnet}/{path} | RPC v3 proxy | https://rpc-{network}.supra.com/rpc/v3/{path} |

Caching headers applied by the platform:
- Module/ABI reads (/modules): public, s-maxage=3600, stale-while-revalidate=86400
- Account resources (/resources): public, s-maxage=10, stale-while-revalidate=30
- Everything else: public, s-maxage=2, stale-while-revalidate=5

### Example: query a view function via curl through the proxy

\`\`\`bash
curl -X POST "https://tools.hoglet.xyz/api/rpc/mainnet/view" \\
  -H "Content-Type: application/json" \\
  -d '{
    "function": "0x1::coin::name",
    "type_arguments": ["0x1::supra_coin::SupraCoin"],
    "arguments": []
  }'
\`\`\`

### Example: fetch a testnet faucet

\`\`\`bash
curl "https://tools.hoglet.xyz/api/faucet?address=0xYOUR_ADDRESS"
\`\`\`

## Export for AI Schema

When a user copies a function's ABI using the "Export for AI" feature, the interactor generates a standardized JSON representation.

Example of an exported function:
\`\`\`json
{
  "context": "Supra Blockchain Smart Contract ABI",
  "fully_qualified_name": "0x123456789abcdef::pool::withdraw_total_reserve",
  "contract_address": "0x123456789abcdef",
  "module_name": "pool",
  "function_name": "withdraw_total_reserve",
  "execution_kind": "entry",
  "requires_wallet_signature": true,
  "mutates_state": true,
  "permission_level": "admin-write",
  "risk_level": "critical",
  "irreversible": true,
  "type_arguments": [],
  "arguments": [
    {
      "index": 0,
      "type": "vector<0x1::string::String>",
      "example_value_format": "0x1::supra_coin::SupraCoin"
    }
  ],
  "effects": ["withdraws accumulated protocol reserves for a pool"],
  "common_failures": ["caller is not authorized", "pool not found"]
}
\`\`\`

For functions belonging to the DAO Contracts Vault catalog, the export is enriched from a pinned catalog: \`permission_level\` (public-read/user-write/admin-write/dangerous-admin), \`risk_level\` (none/low/medium/high/critical), \`effects\`, \`common_failures\` and \`irreversible: true\` for the two renounce entries. Treat \`irreversible\` as a hard stop: never execute without explicit user confirmation of the exact address.

## Interpreting the Fields

- **module**: The name of the Move module on the Supra blockchain.
- **function**: The name of the function to be invoked.
- **kind**:
  - \`entry\`: State-changing functions that require the user to sign a transaction with their wallet. They cost gas.
  - \`view\`: Read-only functions that do not require a signature or gas. They can be queried directly via the Supra RPC.
  - \`internal\`: Functions that cannot be called directly from external wallets or off-chain scripts.
- **type_args**: An array representing the generic types required by the function (e.g., \`<T>\`).
- **args**: The runtime arguments required by the function. The \`type\` field specifies the expected Move type (e.g., \`u64\`, \`address\`, \`bool\`, \`0x1::string::String\`, or vectors).

## Raw Transaction Payload Format

Before an entry transaction is signed, the UI exposes the exact payload passed to the wallet provider:

\`\`\`json
{
  "moduleAddress": "0x123456789abcdef",
  "moduleName": "pool",
  "functionName": "swap",
  "typeArguments": ["0x1::supra_coin::SupraCoin"],
  "arguments": ["1000000"]
}
\`\`\`

AI-generated code can be validated against this structure to detect hallucinated sequence numbers, type arguments or module addresses before submission.

## DAO Contracts Vault (keyless deploy, delegate, renounce)

The platform fronts a Move factory on Supra (package \`dao_contracts_vault\`, modules \`vault\`, \`publisher\`, \`vault_fee\`) that:

- Deploys packages into deterministic **zero-private-key Resource Accounts**: \`vault::deploy_autonomous_contract(creator, label, metadata_serialized, code, owner)\`. The address is a pure function — \`sha3_256(bcs(creator) || "dao_contracts_vault::autonomous_v1" || label || 0xFF)\` — and must be predicted with \`vault::predict_next_contract_address(creator, label)\` and baked into the package's Move.toml named address BEFORE compiling. Pass \`owner = 0x0\` to publish and freeze in the same transaction.
- Migrates legacy EOAs to DAO governance: \`vault::donate_eoa_to_dao(...)\` creates a deterministic proxy Resource Account, then the owner must sign a second framework tx burning the key (\`rotate_authentication_key_call\` to \`ZERO_AUTH_KEY\`). Upgrade/renounce refuse until the key is dead (\`E_EOA_KEY_NOT_BURNED\`) — the on-chain elimination of the dual-master hazard.
- Renounces control permanently: \`vault::renounce_contract\` destroys the only SignerCapability and revokes every offer; \`publisher::renounce_package_admin\` freezes the factory code itself. Both are IRREVERSIBLE.

Key facts for agents:
- \`vault::get_eoa_security_status(addr)\`: 0 unmanaged, 1 permanently renounced, 2 DAO-governed, 3 HAZARD (the private key is still alive; the freeze is NOT effective yet).
- Never execute or recommend a renounce entry without explicit, repeated confirmation of the exact address.
- Fee applies only to new deploys/donations: 0 or [1 SUPRA, 1,370,000 SUPRA], enforced in code. Upgrades are never charged.
- Old documentation may show the seed \`governance_factory::autonomous_v1\`: it is outdated and derives a wrong address. The correct seeds are \`dao_contracts_vault::autonomous_v1\` and \`dao_contracts_vault::eoa_proxy_v1\`.

Machine surfaces:
- Full vault guide: https://tools.hoglet.xyz/vault.txt
- Live per-address metadata (status, frozen flags, offers, fee): https://tools.hoglet.xyz/api/metadata/{address}?network=testnet

## Source Verification (Etherscan/Sourcify-style)

Page: https://tools.hoglet.xyz/en/verify?address={address}&package={package}

Supra keeps a package registry at \`0x1::code::PackageRegistry\` on every publishing address. Each \`PackageMetadata\` has:
- \`source_digest\`: a commitment to the exact source tree.
- \`manifest\`: the gzipped \`Move.toml\` that was published.
- \`modules[].source\`: gzipped source when the package was published with \`sparse\` or \`all\`; empty with \`included_artifacts: none\`.

Verification uses two independent claims:
- \`verified\`: recompiling the source with the recorded toolchain and framework produces the on-chain module bytecode. This is the strong claim.
- \`exactSource\`: the source tree hashes to the publisher's \`source_digest\`. The publisher supplies that digest and the chain does not recompute it, so it is a commitment, not proof by itself.

Statuses:
- \`verified\` + \`exactSource: true\` — bytecode and digest match.
- \`verified\` + \`exactSource: false\` — equivalent source; compiles to the same bytecode but is not byte-identical to the published tree.
- \`unreproduced\` — digest matches, bytecode does not (toolchain/framework drift, or a missing dependency). This is not "failed".
- \`failed\` — neither claim holds.
- no record + \`hasChainSource: true\` — source is on chain but has not been bytecode-verified.
- no source — nothing to show; a package published with \`none\` needs a submission.

Digest algorithm (same as Move's \`move-package\`):
1. SHA-256 of every \`.move\` under \`sources/\` and \`scripts/\`, plus \`Move.toml\`, as uppercase hex.
2. Sort the hashes alphabetically.
3. Concatenate and SHA-256 again.
\`tests/\` is only hashed in dev mode, so a normal publish excludes it.

API (reads are public; writes are rate-limited; all verify responses are \`Cache-Control: no-store\`):

| Method | Path | Returns |
|---|---|---|
| GET | /api/verify/{network}/{address} | packages: name, upgradeNumber, moduleCount, sourceDigest, hasChainSource, verification |
| GET | /api/verify/{network}/{address}/{package} | package detail, module names, manifest, verification |
| GET | /api/verify/{network}/{address}/{package}/source | source files + manifest, origin \`chain\` or \`bundle\` |
| GET | /api/verify/bundle/{sha256} | the full bundle (files + verification metadata) |
| GET | /api/verify/bundle/{sha256}?format=zip | \`Move.toml\`, \`sources/\`, \`deps/\`, \`verify.json\` |
| POST | /api/verify | submit \`{ network, address, package, files, framework_commit? }\`; 3 requests / 10 min / IP |

\`verify.json\` carries \`schema\`, network, address, package, \`upgradeNumber\`, \`status\`, \`exactSource\`, \`sourceDigest\`, \`computedDigest\`, \`compilerVersion\`, \`frameworkRev\`, \`onchainModules\` (module name → SHA-256 of its bytecode) and \`bundleSha256\`.

How an agent or auditor verifies independently:
1. Fetch the package list and the source route.
2. Download the bundle zip and read \`verify.json\`.
3. Recompute the digest from \`Move.toml\` + \`sources/\` (+ \`scripts/\`).
4. Compile with the recorded toolchain and framework, then compare each module's \`.mv\` to the on-chain bytecode (or to \`onchainModules\`).
5. If the digest matches but the bytecode does not, report \`unreproduced\`, not fraud: the framework branch or toolchain may have moved.

\`none\` packages: open the page, select the package, upload a folder with \`sources/\` and, if the manifest has third-party git deps, \`deps/<name>/\` trees. The app uses the on-chain \`Move.toml\`; a provided git dep is rewritten to \`local = "deps/<name>"\`. The framework stays as the allowlisted git dependency.

Geoblock: the page and \`/api/verify/*\` inherit the platform's jurisdiction filter. Verification is public within permitted jurisdictions, not globally.

## Token Inspector & Move Security

When interacting with the Token Inspector, AI agents should understand the nuances of Move security on Supra/Aptos regarding Master Keys (Refs: Mint, Burn, Freeze, Transfer).

- **Legacy Coins (0x1::coin):** Master Keys are standalone capabilities. If the Inspector reports "No Admin Refs", it only guarantees they are not in the scanned wallet. The developer may have hidden them in a secondary smart contract. Therefore, the absence of keys does NOT guarantee a Legacy Coin is safe (Hide-and-Seek danger).
- **Fungible Assets (0x1::fungible_asset):** Modern FAs use a centralized Metadata Object. If a developer uses a secure framework factory, the keys are mathematically destroyed and stored as \`Option::none\` directly on the Metadata Object. If the Inspector reports a "100% Verified Safe" badge, it means it detected these explicitly destroyed keys, providing mathematical proof that the token is rug-pull proof.

Scanner internals (for agents writing automation):
- Resources are fetched in pages of 100 using the \`x-supra-cursor\` response header.
- A ~100ms delay between pages avoids 429 rate limits; scanning hard-stops after 20 pages (2,000 resources).

## TypeScript SDK Examples

When assisting users with writing scripts for this interactor using the official \`supra-l1-sdk\`, use the following patterns:

### Calling a View Function
\`\`\`typescript
import { SupraClient } from "supra-l1-sdk";

async function queryView() {
  const supraClient = await SupraClient.init("https://rpc-mainnet.supra.com/");
  const result = await supraClient.view({
    function: "0xMODULE_ADDRESS::module_name::function_name",
    type_arguments: [], // e.g., ["0x1::supra_coin::SupraCoin"]
    arguments: [] // Actual arguments formatted as strings/arrays
  });
  console.log(result);
}
\`\`\`

### Sending an Entry Transaction
\`\`\`typescript
// Assumes the user has their wallet provider (e.g. Starkey window.starkey) or a raw signer.
const rawTxPayload = [
  senderAddress,
  0, // Sequence number
  moduleAddress,
  moduleName,
  functionName,
  typeArgs, // Array of strings for generics
  args, // Array of serialized BCS arguments or strings depending on the provider
  {}
];
// Pass this payload to the wallet provider's createRawTransactionData / sendTransaction flow.
\`\`\`

## Best Practices

- Always verify if the function \`kind\` is \`view\` or \`entry\` before deciding to use a wallet provider or a read-only RPC call.
- Coin types typically require the \`0x\` prefix in their address string (e.g. \`0x1::supra_coin::SupraCoin\`).
- Prefer the cached proxy routes (/api/rpc/...) over direct RPC calls when operating from server-side code, to respect rate limits.
`;

export async function GET() {
  return new NextResponse(llmsFullText, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
