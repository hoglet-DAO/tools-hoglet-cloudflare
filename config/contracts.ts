export const CURRENCY = "0x1::supra_coin::SupraCoin";

// Direcciones de Contratos
export const CONTRACT_PUMP = "0x543d8dbe69622068d314026f43d967070158b9ace8c3b2f40d92d1229c65b970";
export const CONTRACT_FAUCET = "0x0fec116479f1fd3cb9732cc768e6061b0e45b178a610b9bc23c2143a6493e794";
export const CONTRACT_CROWD = "0x6e3e09ab7fd0145d7befc0c68d6944ddc1a90fd45b8a6d28c76d8c48bed676b0";
export const CONTRACT_COLLECTION = "0x1a2142d9232c1fcae433e864ee7dbd90246b85682fbbcd2a4f0b2a0ddaae76a0";
export const CONTRACT_SWAP = "0x0dc694898dff98a1b0447e0992d0413e123ea80da1021d464a4fbaf0265870d8";

// Ejemplo de token (puedes añadir más)
export const MEME_TOKEN_ADDRESS = `${CONTRACT_FAUCET}::memecoins::SPIKE`;

// DAO Contracts Vault: deploys decentralized modules into Resource Accounts and drives renouncement and
// EOA delegation. The module lives at this address under `dao_contracts_vault::vault`.
//
// Falls back to `0x1` (a bare EOA with no modules published) when unset, which makes the audit report
// "no factory record" rather than failing — the same behaviour as an address the vault does not know.
export const DAO_CONTRACTS_VAULT =
  process.env.NEXT_PUBLIC_DAO_CONTRACTS_VAULT || "0x1";

/** Module inside the vault package that exposes every view and entry point this app calls. */
export const VAULT_MODULE = "vault";
