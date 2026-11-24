/**
 * Server-side collector for the per-address metadata endpoint (`GET /api/metadata/{address}`).
 *
 * The whole point is that every field is a live on-chain read — the same views the governance audit
 * uses — rather than a stored copy that can go stale. On the vault package itself the rename is the
 * danger (a front-end can claim anything); here the claims ARE the chain's answers.
 *
 * Server-only by construction: it reads `process.env` RPC URLs and performs fetches. The browser twin of
 * this data is `useGovernanceAudit`, which reads through the cached app proxies instead.
 */

import { VAULT_STATUS, type VaultStatusCode } from "@/config/vault";

export const METADATA_SCHEMA = "hoglet.contract-metadata.v1";

export type VaultNetwork = "testnet" | "mainnet";

const RPC_BASE: Record<VaultNetwork, string> = {
  testnet: (process.env.NEXT_PUBLIC_RPC_URL_TESTNET || "https://rpc-testnet.supra.com").replace(/\/+$/, ""),
  mainnet: (process.env.NEXT_PUBLIC_RPC_URL_MAINNET || "https://rpc-mainnet.supra.com").replace(/\/+$/, ""),
};

/** Per-view timeout. A view that hangs must degrade to `null`, not hold the whole response. */
const VIEW_TIMEOUT_MS = 8_000;

export function isVaultNetwork(value: unknown): value is VaultNetwork {
  return value === "testnet" || value === "mainnet";
}

/** 1..=64 hex digits, `0x`-prefixed. The chain trims leading zeros, so shorter values are legitimate. */
export function isMoveAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(value);
}

/** Pads to the canonical 64-digit form for stable output and comparisons. */
export function normalizeAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{1,64}$/.test(body)) return null;
  return `0x${body.padStart(64, "0").toLowerCase()}`;
}

const ZERO_ADDRESS = "0x" + "0".repeat(64);

/**
 * One `view` call against the fullnode. Returns the raw result array, or `null` when the view aborts,
 * times out or the transport fails — an aborted view is a normal answer for an unmanaged address.
 */
export async function readView(
  network: VaultNetwork,
  moduleAddress: string,
  moduleName: string,
  functionName: string,
  args: unknown[] = []
): Promise<unknown[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VIEW_TIMEOUT_MS);
  try {
    const res = await fetch(`${RPC_BASE[network]}/rpc/v1/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        function: `${moduleAddress}::${moduleName}::${functionName}`,
        type_arguments: [],
        arguments: args,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return Array.isArray(data?.result) ? data.result : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function first(result: unknown[] | null): unknown {
  return Array.isArray(result) && result.length > 0 ? result[0] : null;
}

/** Does the address host at least one published module? Supra's `code` exposes no has_code, so it is resolved off-chain. */
async function addressHostsModules(network: VaultNetwork, address: string): Promise<boolean> {
  if (!address || address === ZERO_ADDRESS) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VIEW_TIMEOUT_MS);
  try {
    const res = await fetch(`${RPC_BASE[network]}/rpc/v3/accounts/${address}/modules?count=1`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as any;
    const modules = Array.isArray(data) ? data : data?.data;
    return Array.isArray(modules) && modules.length > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface VaultAddressMetadata {
  schema: string;
  network: VaultNetwork;
  address: string;
  vault: { address: string; module: string };
  known_to_factory: boolean;
  kind: "vault_package" | "autonomous_resource_account" | "donated_eoa" | "unmanaged";
  governance: {
    status: number;
    status_name: string;
    stage: string;
    meaning: string;
    admin: string;
    creator: string;
    proxy: string;
    offer_target: string;
    rotation_offer_target: string;
    offer_redirected: boolean;
    key_annihilated: boolean;
    donation_complete: boolean;
    renounced: boolean;
    cryptographically_frozen: boolean;
    permanently_immutable: boolean;
    factory_managed: boolean;
    admin_is_contract: boolean;
  };
  package: { renounced: boolean; admin: string } | null;
  fee: { amount_octas: number; recipient: string; admin: string } | null;
  read_at_unix: number;
  rpc_error: boolean;
}

/**
 * Reads everything the endpoint publishes, concurrently. One failing view becomes `null` in the
 * response, never a failed request: "unknown" must stay distinguishable from "false", and a partial
 * answer beats a 500 for a scanner that just wants one field.
 */
export async function collectAddressMetadata(
  network: VaultNetwork,
  vaultAddress: string,
  subject: string
): Promise<VaultAddressMetadata> {
  const isVaultItself = subject === vaultAddress;

  const [
    rawStatus,
    rawKeyAnnihilated,
    rawImmutable,
    rawDonation,
    rawRenounced,
    rawFrozen,
    rawManaged,
    rawIsEoa,
    rawAdmin,
    rawCreator,
    rawProxy,
    rawOfferTarget,
    rawRotationOffer,
    rawPackageRenounced,
    rawPackageAdmin,
    rawFeeInfo,
  ] = await Promise.all([
    readView(network, vaultAddress, "vault", "get_eoa_security_status", [subject]),
    readView(network, vaultAddress, "vault", "is_eoa_key_annihilated", [subject]),
    readView(network, vaultAddress, "vault", "is_eoa_permanently_immutable", [subject]),
    readView(network, vaultAddress, "vault", "is_eoa_donation_complete", [subject]),
    readView(network, vaultAddress, "vault", "is_contract_renounced", [subject]),
    readView(network, vaultAddress, "vault", "is_cryptographically_frozen", [subject]),
    readView(network, vaultAddress, "vault", "is_factory_managed", [subject]),
    readView(network, vaultAddress, "vault", "is_eoa_contract", [subject]),
    readView(network, vaultAddress, "vault", "get_contract_admin", [subject]),
    readView(network, vaultAddress, "vault", "get_contract_creator", [subject]),
    readView(network, vaultAddress, "vault", "get_eoa_proxy", [subject]),
    readView(network, vaultAddress, "vault", "get_offer_target", [subject]),
    readView(network, vaultAddress, "vault", "get_rotation_offer_target", [subject]),
    readView(network, vaultAddress, "publisher", "is_package_renounced", []),
    readView(network, vaultAddress, "publisher", "get_package_admin", []),
    readView(network, vaultAddress, "vault_fee", "get_fee_info", []),
  ]);

  // Every view above talks to the same node; all six core reads failing means the RPC is down, not that
  // the address is unmanaged (a real unmanaged address still answers 0/false to several of them).
  const allCoreNull =
    rawStatus === null && rawManaged === null && rawRenounced === null && rawAdmin === null && rawProxy === null;
  const rpcError = allCoreNull;

  const status = typeof first(rawStatus) === "number" ? (first(rawStatus) as number) : 0;
  const statusDoc = VAULT_STATUS[status as VaultStatusCode] ?? VAULT_STATUS[0];

  const admin = normalizeAddress(first(rawAdmin)) ?? ZERO_ADDRESS;
  const creator = normalizeAddress(first(rawCreator)) ?? ZERO_ADDRESS;
  const proxy = normalizeAddress(first(rawProxy)) ?? ZERO_ADDRESS;
  const offerTarget = normalizeAddress(first(rawOfferTarget)) ?? ZERO_ADDRESS;
  const rotationOffer = normalizeAddress(first(rawRotationOffer)) ?? ZERO_ADDRESS;

  const isEoa = first(rawIsEoa) === true;
  const renounced = first(rawRenounced) === true;
  const frozen = first(rawFrozen) === true || renounced;
  const factoryManaged = first(rawManaged) === true || renounced || admin !== ZERO_ADDRESS;

  const offerRedirected = !isVaultItself && proxy !== ZERO_ADDRESS && offerTarget !== ZERO_ADDRESS && offerTarget !== proxy;

  const adminIsContract = admin !== ZERO_ADDRESS ? await addressHostsModules(network, admin) : false;

  const kind: VaultAddressMetadata["kind"] = isVaultItself
    ? "vault_package"
    : isEoa
      ? "donated_eoa"
      : factoryManaged
        ? "autonomous_resource_account"
        : "unmanaged";

  let fee: VaultAddressMetadata["fee"] = null;
  if (isVaultItself && Array.isArray(rawFeeInfo) && rawFeeInfo.length >= 3) {
    fee = {
      amount_octas: typeof rawFeeInfo[0] === "number" ? rawFeeInfo[0] : 0,
      recipient: normalizeAddress(rawFeeInfo[1]) ?? ZERO_ADDRESS,
      admin: normalizeAddress(rawFeeInfo[2]) ?? ZERO_ADDRESS,
    };
  }

  return {
    schema: METADATA_SCHEMA,
    network,
    address: subject,
    vault: { address: vaultAddress, module: "dao_contracts_vault::vault" },
    known_to_factory: factoryManaged,
    kind,
    governance: {
      status,
      status_name: statusDoc.name,
      stage: statusDoc.stage,
      meaning: statusDoc.meaning,
      admin,
      creator,
      proxy,
      offer_target: offerTarget,
      rotation_offer_target: rotationOffer,
      offer_redirected: offerRedirected,
      key_annihilated: first(rawKeyAnnihilated) === true,
      donation_complete: first(rawDonation) === true,
      renounced,
      cryptographically_frozen: frozen,
      permanently_immutable: first(rawImmutable) === true,
      factory_managed: factoryManaged,
      admin_is_contract: adminIsContract,
    },
    package: isVaultItself
      ? {
          renounced: first(rawPackageRenounced) === true,
          admin: normalizeAddress(first(rawPackageAdmin)) ?? ZERO_ADDRESS,
        }
      : null,
    fee,
    read_at_unix: Math.floor(Date.now() / 1000),
    rpc_error: rpcError,
  };
}
