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
  "type_arguments": [],
  "arguments": [
    {
      "index": 0,
      "type": "vector<0x1::string::String>",
      "example_value_format": "0x1::supra_coin::SupraCoin"
    }
  ]
}
\`\`\`

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
