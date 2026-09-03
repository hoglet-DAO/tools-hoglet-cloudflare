import { NextResponse } from 'next/server';

// Follows the llms.txt standard: https://llmstxt.org/
const llmsText = `# Hoglet Tools

> Open-source toolkit for the Supra Blockchain (Move VM), built by Hoglet DAO. It provides a smart contract Interactor that dynamically fetches and parses any Move ABI into a human- and AI-friendly form, and a Token Inspector that scans tokens and wallets on-chain to detect admin Master Keys (Mint/Burn/Freeze/Transfer refs) and flag rug-pull risk.

The platform is free to use, requires no API key, and exposes cached RPC proxies to the Supra mainnet and testnet. Official documentation lives at docs.hoglet.xyz.

## Tools

- [Smart Contract Interactor](https://tools.hoglet.xyz/en/interactor): Load any deployed Move module by address, inspect its entry/view/internal functions with typed argument hints, preview the raw transaction payload, execute entry functions via wallet (Starkey/Ribbit) or query view functions read-only. Includes an "Export for AI" button that copies a structured JSON ABI per function.
- [Token Inspector](https://tools.hoglet.xyz/en/inspector): On-chain X-ray for tokens on Supra/Aptos-style Move networks. Scans wallets and token metadata objects in paginated chunks to detect MintRef, BurnRef, TransferRef and FreezeRef capabilities, awarding a "100% Verified Safe" badge only when keys are mathematically destroyed (Option::none) inside an FA Metadata object.
- [Legacy LLM guide](https://tools.hoglet.xyz/llm.txt): The original plain-text LLM guide for this platform (kept for backward compatibility).

## APIs & Endpoints

- [Testnet Faucet](https://tools.hoglet.xyz/api/faucet?address={address}): GET endpoint that funds a testnet address with SUPRA. Returns JSON; proxies rpc-testnet.supra.com/rpc/v1/wallet/faucet.
- [Mainnet RPC proxy v1](https://tools.hoglet.xyz/api/rpc/mainnet/{path}): Cached passthrough to https://rpc-mainnet.supra.com/rpc/v1/{path} (e.g. accounts, modules, view).
- [Mainnet RPC proxy v2](https://tools.hoglet.xyz/api/rpc-v2/mainnet/{path}): Cached passthrough to https://rpc-mainnet.supra.com/rpc/v2/{path}.
- [Mainnet RPC proxy v3](https://tools.hoglet.xyz/api/rpc-v3/mainnet/{path}): Cached passthrough to https://rpc-mainnet.supra.com/rpc/v3/{path}.
- [Testnet RPC proxy v1](https://tools.hoglet.xyz/api/rpc/testnet/{path}): Cached passthrough to https://rpc-testnet.supra.com/rpc/v1/{path}.
- [Testnet RPC proxy v2/v3](https://tools.hoglet.xyz/api/rpc-v2/testnet/{path}): Same pattern for v2 and v3 under /api/rpc-v2/testnet and /api/rpc-v3/testnet.

Caching: module/ABI reads are cached 1 hour (s-maxage=3600), account resources 10 seconds (s-maxage=10), everything else ~2 seconds.

## Docs

- [Token Inspector documentation](https://docs.hoglet.xyz/docs/products/inspector): Full explanation of Master Keys (Refs/Capabilities), the difference between Legacy Coins (0x1::coin::CoinInfo) and modern Fungible Assets (0x1::fungible_asset::Metadata), and why Option::none refs are mathematical proof of safety.
- [Hoglet DAO](https://hoglet.xyz): Parent project and community.
- [Source code](https://github.com/hoglet-DAO/tools-hoglet-cloudflare): This repository (MIT license).

## Optional

- [Full guide for LLMs](https://tools.hoglet.xyz/llms-full.txt): Complete reference including the "Export for AI" JSON schema, Move security nuances (Master Keys), supra-l1-sdk TypeScript examples, raw payload format and curl recipes for the RPC endpoints.
`;

export async function GET() {
  return new NextResponse(llmsText, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
