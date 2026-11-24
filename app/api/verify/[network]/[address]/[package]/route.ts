import { isVaultNetwork, normalizeAddress } from "@/lib/vault/metadata";
import { envOr503, json } from "@/lib/verify/http";
import { fetchRegistry } from "@/lib/verify/rpc";
import { getVerification } from "@/lib/verify/store";

const PACKAGE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ network: string; address: string; package: string }> }
) {
  const { network, address, package: packageName } = await params;
  if (!isVaultNetwork(network)) return json({ ok: false, error: "invalid network" }, 400);
  const normalized = normalizeAddress(address);
  if (!normalized) return json({ ok: false, error: "invalid address" }, 400);
  if (!PACKAGE_NAME.test(packageName)) return json({ ok: false, error: "invalid package name" }, 400);

  const envResult = envOr503();
  if (!envResult.ok) return envResult.response;

  try {
    const packages = await fetchRegistry(network, normalized);
    const pkg = packages.find((p) => p.name === packageName);
    if (!pkg) return json({ ok: false, error: "package not found" }, 404);

    const verification = await getVerification(envResult.env, {
      network,
      address: normalized,
      packageName,
      upgradeNumber: pkg.upgradeNumber,
    });
    const hasChainSource =
      pkg.modules.length > 0 && pkg.modules.every((m) => m.source !== null);

    return json({
      ok: true,
      network,
      address: normalized,
      package: {
        name: pkg.name,
        upgradeNumber: pkg.upgradeNumber,
        modules: pkg.modules.map((m) => m.name),
        manifest: pkg.manifest,
        sourceDigest: pkg.sourceDigest,
        hasChainSource,
        hasSource: Boolean(verification?.bundleSha256) || hasChainSource,
        verification,
      },
    });
  } catch {
    return json({ ok: false, error: "could not read the chain" }, 502);
  }
}
