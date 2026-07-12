import { NextResponse } from 'next/server';

const llmText = `# Supra Smart Contract Interactor - LLM Guide

## Overview
This platform is a generic UI interactor for Move smart contracts deployed on the Supra Blockchain. 
It dynamically fetches the ABI of any Supra contract, parses the functions (Entry, View, and Internal), and provides a user-friendly way for humans to construct and send transactions to their Web3 wallets (e.g., Starkey).

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
`;

export async function GET() {
  return new NextResponse(llmText, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
