import { NextResponse } from "next/server";
import { DAO_CONTRACTS_VAULT } from "@/config/contracts";
import { collectAddressMetadata, isMoveAddress, isVaultNetwork, normalizeAddress } from "@/lib/vault/metadata";

/**
 * Per-address metadata, read live from the chain.
 *
 *   GET /api/metadata/{address}?network=testnet|mainnet
 *
 * Everything it returns is a view result (governance status 0..3, frozen flags, offers, fee), so a
 * scanner or an agent never has to trust this app's database — there is none. The endpoint exists to
 * save callers the eleven-view fan-out and to give the vault surfaces a stable, versioned shape
 * (`hoglet.contract-metadata.v1`).
 *
 * Unknown addresses are NOT a 404: "unmanaged" is an answer (status 0). Only a malformed address is
 * rejected, and an unconfigured vault is reported explicitly rather than answered with a 0x1 read.
 */
export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;

  if (!isMoveAddress(address)) {
    return NextResponse.json(
      { ok: false, error: "invalid address: expected 0x followed by 1..64 hex digits" },
      { status: 400 }
    );
  }

  const vaultAddress = normalizeAddress(DAO_CONTRACTS_VAULT);
  if (!vaultAddress) {
    // The config fallback (`0x1`) means "no vault deployed in this environment" — the same fact the
    // governance UI surfaces as `factoryNotPublished`. Answering with a fabricated read would be worse.
    return NextResponse.json(
      { ok: false, error: "vault is not configured in this environment (NEXT_PUBLIC_DAO_CONTRACTS_VAULT)" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const networkParam = url.searchParams.get("network") ?? "testnet";
  if (!isVaultNetwork(networkParam)) {
    return NextResponse.json({ ok: false, error: "invalid network: expected testnet or mainnet" }, { status: 400 });
  }

  const subject = normalizeAddress(address)!;
  const metadata = await collectAddressMetadata(networkParam, vaultAddress, subject);

  return NextResponse.json(metadata, {
    status: 200,
    headers: {
      // Status facts change only when someone signs a transaction; a minute of cache keeps a scanning
      // agent from hammering the fullnode while staying fresh enough to see a renounce right after it lands.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
