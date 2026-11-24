import { COMPILE_MAX_BODY_BYTES, COMPILE_TOKEN, compileMove } from "@/lib/move/compileService";
import { clientKey, pruneBuckets, rateLimited } from "@/lib/move/rateLimit";
import { isMoveAddress, isVaultNetwork, normalizeAddress } from "@/lib/vault/metadata";
import { json, envOr503 } from "@/lib/verify/http";
import { fetchModuleBytecode, fetchRegistry } from "@/lib/verify/rpc";
import { verifyPackage } from "@/lib/verify/service";
import { getVerification, putBundle, putVerification } from "@/lib/verify/store";
import { validateVerifyFiles } from "@/lib/verify/validate";

export const maxDuration = 600;

const PACKAGE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function POST(request: Request) {
  if (!COMPILE_TOKEN) {
    return json({ ok: false, error: "compile service is not configured" }, 503);
  }

  pruneBuckets(Date.now());
  if (rateLimited(clientKey(request), "verify", 3, 10 * 60_000)) {
    return json({ ok: false, error: "too many verification requests, retry shortly" }, 429, {
      "Retry-After": "600",
    });
  }

  const raw = await request.text();
  if (raw.length > COMPILE_MAX_BODY_BYTES) return json({ ok: false, error: "payload too large" }, 413);

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  const network = parsed?.network;
  if (!isVaultNetwork(network)) return json({ ok: false, error: "invalid network" }, 400);

  const address = isMoveAddress(parsed?.address) ? normalizeAddress(parsed.address) : null;
  if (!address) return json({ ok: false, error: "invalid address" }, 400);

  const packageName = parsed?.package;
  if (typeof packageName !== "string" || !PACKAGE_NAME.test(packageName)) {
    return json({ ok: false, error: "invalid package name" }, 400);
  }

  const validated = validateVerifyFiles(parsed?.files);
  if (!validated.ok) return json({ ok: false, error: validated.error }, 400);

  const rawCommit = parsed?.framework_commit;
  if (rawCommit !== undefined && (typeof rawCommit !== "string" || !/^[0-9a-fA-F]{40}$/.test(rawCommit))) {
    return json({ ok: false, error: "invalid framework_commit" }, 400);
  }

  const envResult = envOr503();
  if (!envResult.ok) return envResult.response;
  const env = envResult.env;

  let upgradeNumber: number;
  let sourceDigest: string;
  try {
    const packages = await fetchRegistry(network, address);
    const pkg = packages.find((p) => p.name === packageName);
    if (!pkg) return json({ ok: false, error: "package not found" }, 404);
    upgradeNumber = pkg.upgradeNumber;
    sourceDigest = pkg.sourceDigest;
  } catch {
    return json({ ok: false, error: "could not read the chain" }, 502);
  }

  const now = Date.now();
  try {
    await putVerification(env, {
      network,
      address,
      packageName,
      upgradeNumber,
      status: "pending",
      exactSource: false,
      sourceDigest,
      computedDigest: null,
      bundleSha256: null,
      compilerVersion: null,
      frameworkRev: null,
      onchainModules: {},
      error: null,
      submittedBy: null,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    return json({ ok: false, error: "could not record the job" }, 503);
  }

  const outcome = await verifyPackage({
    env,
    token: COMPILE_TOKEN,
    network,
    address,
    packageName,
    files: validated.files,
    frameworkCommit: rawCommit,
    deps: {
      fetchRegistry,
      fetchModuleBytecode,
      compile: compileMove,
      getVerification,
      putVerification,
      putBundle,
    },
  });

  if (outcome.ok) return json(outcome);

  const status =
    outcome.upstreamStatus === 503 || outcome.upstreamStatus === 504
      ? 503
      : outcome.errorCode === "not_found"
        ? 404
        : outcome.errorCode === "source_missing"
          ? 400
          : outcome.errorCode === "compile"
            ? 422
            : 502;

  return json(outcome, status, status === 503 ? { "Retry-After": "60" } : {});
}
