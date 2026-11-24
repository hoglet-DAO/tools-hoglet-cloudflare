import { isVaultNetwork, normalizeAddress } from "@/lib/vault/metadata";
import { envOr503, json } from "@/lib/verify/http";
import { fetchRegistry } from "@/lib/verify/rpc";
import { getBundle, getVerification } from "@/lib/verify/store";

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
  const env = envResult.env;

  try {
    const packages = await fetchRegistry(network, normalized);
    const pkg = packages.find((p) => p.name === packageName);
    if (!pkg) return json({ ok: false, error: "package not found" }, 404);

    const verification = await getVerification(env, {
      network,
      address: normalized,
      packageName,
      upgradeNumber: pkg.upgradeNumber,
    });

    if (verification?.bundleSha256) {
      const bundle = await getBundle(env, verification.bundleSha256);
      if (bundle) {
        return json({
          ok: true,
          origin: "bundle",
          files: bundle.files,
          manifest: bundle.manifest,
          verification,
        });
      }
    }

    if (pkg.modules.length > 0 && pkg.modules.every((m) => m.source !== null)) {
      const files = Object.fromEntries(
        pkg.modules.map((m) => [`sources/${m.name}.move`, m.source as string])
      );
      return json({ ok: true, origin: "chain", files, manifest: pkg.manifest, verification });
    }

    return json({ ok: false, error: "no source for this package" }, 404);
  } catch {
    return json({ ok: false, error: "could not read the source" }, 502);
  }
}
