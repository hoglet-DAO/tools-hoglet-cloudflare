import { isVaultNetwork, normalizeAddress } from "@/lib/vault/metadata";
import { json, tryVerifyEnv } from "@/lib/verify/http";
import { fetchRegistry } from "@/lib/verify/rpc";
import { listVerifications } from "@/lib/verify/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ network: string; address: string }> }
) {
  const { network, address } = await params;
  if (!isVaultNetwork(network)) return json({ ok: false, error: "invalid network" }, 400);
  const normalized = normalizeAddress(address);
  if (!normalized) return json({ ok: false, error: "invalid address" }, 400);

  const env = tryVerifyEnv();

  try {
    const [packages, records] = await Promise.all([
      fetchRegistry(network, normalized),
      env ? listVerifications(env, network, normalized) : Promise.resolve([]),
    ]);

    return json({
      ok: true,
      network,
      address: normalized,
      packages: packages.map((pkg) => {
        const verification =
          records.find(
            (r) => r.packageName === pkg.name && r.upgradeNumber === pkg.upgradeNumber
          ) ?? null;
        return {
          name: pkg.name,
          upgradeNumber: pkg.upgradeNumber,
          moduleCount: pkg.modules.length,
          modules: pkg.modules.map((m) => m.name),
          sourceDigest: pkg.sourceDigest,
          hasChainSource:
            pkg.modules.length > 0 && pkg.modules.every((m) => m.source !== null),
          verification,
          stale: !verification && records.some((r) => r.packageName === pkg.name),
        };
      }),
    });
  } catch {
    return json({ ok: false, error: "could not read the chain" }, 502);
  }
}
