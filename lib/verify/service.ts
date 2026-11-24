import type { CompileResult } from "@/lib/move/compileService";
import { classify, compareModuleBytecode } from "./compare";
import { sourceDigest } from "./digest";
import { sanitizeManifest } from "./manifest";
import { fetchModuleBytecode, fetchRegistry } from "./rpc";
import { sha256Hex } from "./sha";
import { getVerification, putBundle, putVerification } from "./store";
import type { VerifyEnv } from "./store";
import type { Bundle, VerificationRecord, VerifyNetwork } from "./types";

export interface VerifyDeps {
  fetchRegistry: typeof fetchRegistry;
  fetchModuleBytecode: typeof fetchModuleBytecode;
  compile: (
    files: Record<string, string>,
    token: string,
    opts: { includedArtifacts?: "none" }
  ) => Promise<CompileResult>;
  getVerification: typeof getVerification;
  putVerification: typeof putVerification;
  putBundle: typeof putBundle;
}

export interface VerifyArgs {
  env: VerifyEnv;
  token: string;
  network: VerifyNetwork;
  address: string;
  packageName: string;
  files: Record<string, string>;
  submittedBy?: string;
  frameworkCommit?: string;
  deps: VerifyDeps;
}

export type VerifyErrorCode = "not_found" | "source_missing" | "compile" | "failed";

export interface VerifyOutcome {
  ok: boolean;
  error?: string;
  errorCode?: VerifyErrorCode;
  /** The compile service's HTTP status when it failed, so a busy upstream can map to 503. */
  upstreamStatus?: number;
  record?: VerificationRecord;
  comparison?: ReturnType<typeof compareModuleBytecode>;
}

function pick(files: Record<string, string>, re: RegExp): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (re.test(path)) out[path] = content;
  }
  return out;
}

async function hashModules(onchain: Record<string, string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, hex] of Object.entries(onchain)) {
    out[name] = await sha256Hex(hex.replace(/^0x/i, "").toLowerCase());
  }
  return out;
}

/**
 * One verification pass.
 *
 * Dependencies are injected so the orchestration is testable without a Worker,
 * D1, R2 or the compile VPS. The route supplies the real ones.
 */
export async function verifyPackage(args: VerifyArgs): Promise<VerifyOutcome> {
  const { env, token, network, address, packageName, files, submittedBy, frameworkCommit, deps } = args;

  const packages = await deps.fetchRegistry(network, address);
  const pkg = packages.find((p) => p.name === packageName);
  if (!pkg) return { ok: false, errorCode: "not_found", error: "package not found" };

  const now = Date.now();
  const key = { network, address, packageName, upgradeNumber: pkg.upgradeNumber };

  const recordFor = (
    status: VerificationRecord["status"],
    exactSource: boolean,
    computedDigest: string | null,
    error: string | null,
    extra: Partial<VerificationRecord> = {}
  ): VerificationRecord => ({
    network,
    address,
    packageName,
    upgradeNumber: pkg.upgradeNumber,
    status,
    exactSource,
    sourceDigest: pkg.sourceDigest,
    computedDigest,
    bundleSha256: null,
    compilerVersion: null,
    frameworkRev: null,
    onchainModules: {},
    error,
    submittedBy: submittedBy ?? null,
    createdAt: now,
    updatedAt: now,
    ...extra,
  });

  if (pkg.modules.length === 0) {
    const record = recordFor("failed", false, null, "package has no modules");
    await deps.putVerification(env, record);
    return { ok: false, errorCode: "failed", error: record.error!, record };
  }

  const cached = await deps.getVerification(env, key);
  if (cached?.status === "verified" && cached.upgradeNumber === pkg.upgradeNumber) {
    return { ok: true, record: cached };
  }

  const uploaded = pick(files, /^(sources|scripts)\/.+\.move$/);
  const depFiles = pick(files, /^deps\//);
  let sourceFiles = uploaded;
  if (Object.keys(sourceFiles).length === 0) {
    if (!pkg.modules.every((m) => m.source !== null)) {
      return { ok: false, errorCode: "source_missing", error: "source not supplied" };
    }
    sourceFiles = Object.fromEntries(pkg.modules.map((m) => [`sources/${m.name}.move`, m.source as string]));
  }

  const computedDigest = await sourceDigest(pkg.manifest, sourceFiles);
  const exact = computedDigest === pkg.sourceDigest;

  const sanitized = sanitizeManifest(pkg.manifest, { frameworkCommit });
  if (!sanitized.ok) {
    const record = recordFor("failed", exact, computedDigest, sanitized.error);
    await deps.putVerification(env, record);
    return { ok: false, errorCode: "failed", error: sanitized.error, record };
  }

  // A dependency manifest is as untrusted as the root one. Nested `local` deps
  // are rejected in v1 because they would need a second rewrite base.
  for (const [path, content] of Object.entries(depFiles)) {
    if (!path.endsWith("/Move.toml")) continue;
    const dep = sanitizeManifest(content);
    if (!dep.ok) {
      const error = `dependency manifest ${path}: ${dep.error}`;
      const record = recordFor("failed", exact, computedDigest, error);
      await deps.putVerification(env, record);
      return { ok: false, errorCode: "failed", error, record };
    }
    if (dep.localDeps.length > 0) {
      const error = `dependency manifest ${path}: nested local dependencies are not supported`;
      const record = recordFor("failed", exact, computedDigest, error);
      await deps.putVerification(env, record);
      return { ok: false, errorCode: "failed", error, record };
    }
    depFiles[path] = dep.manifest;
  }

  const frameworkRev = sanitized.gitDeps.length ? JSON.stringify(sanitized.gitDeps) : null;

  const storeBundle = async (
    status: VerificationRecord["status"],
    exactSource: boolean,
    compilerVersion: string | null,
    onchainModules: Record<string, string>
  ): Promise<string> => {
    const bundle: Bundle = {
      version: 1,
      network,
      address,
      package: packageName,
      upgradeNumber: pkg.upgradeNumber,
      files: { ...sourceFiles, ...depFiles },
      manifest: sanitized.manifest,
      verification: {
        status,
        exactSource,
        sourceDigest: pkg.sourceDigest,
        computedDigest,
        compilerVersion,
        frameworkRev,
        onchainModules,
      },
    };
    return deps.putBundle(env, bundle);
  };

  const compiled = await deps.compile(
    { "Move.toml": sanitized.manifest, ...sourceFiles, ...depFiles },
    token,
    { includedArtifacts: "none" }
  );
  if (!compiled.ok) {
    const detail = (compiled.stderr || compiled.stdout || "").trim();
    const error = detail ? `${compiled.error}\n${detail.slice(0, 2000)}` : compiled.error;
    const status = exact ? "unreproduced" : "failed";
    const record = recordFor(status, exact, computedDigest, error, {
      compilerVersion: compiled.compilerVersion ?? null,
      frameworkRev,
    });
    if (exact) {
      record.bundleSha256 = await storeBundle(status, true, record.compilerVersion, {});
    }
    await deps.putVerification(env, record);
    return {
      ok: exact,
      errorCode: exact ? undefined : "compile",
      error,
      upstreamStatus: compiled.status,
      record,
    };
  }

  const onchain = await deps.fetchModuleBytecode(network, address);
  const scoped: Record<string, string> = {};
  const missingFromRpc: string[] = [];
  for (const mod of pkg.modules) {
    if (onchain[mod.name] === undefined) missingFromRpc.push(mod.name);
    else scoped[mod.name] = onchain[mod.name];
  }

  const comparison = compareModuleBytecode(compiled, scoped);
  if (missingFromRpc.length > 0) {
    comparison.ok = false;
    for (const name of missingFromRpc) {
      if (!comparison.missing.includes(name)) comparison.missing.push(name);
    }
  }

  const { status, exactSource } = classify(exact, comparison.ok);
  const onchainModules = await hashModules(scoped);
  const compilerVersion = compiled.compilerVersion ?? null;

  const firstMismatch = comparison.modules.find((m) => !m.ok);
  const mismatch = comparison.missing.length
    ? `missing modules: ${comparison.missing.join(", ")}`
    : firstMismatch
      ? `module ${firstMismatch.name} differs at byte ${firstMismatch.firstDiff ?? 0}`
      : comparison.extra.length
        ? `unexpected modules: ${comparison.extra.join(", ")}`
        : null;

  const record = recordFor(status, exactSource, computedDigest, status === "verified" ? null : mismatch, {
    compilerVersion,
    frameworkRev,
    onchainModules,
  });

  if (status !== "failed") {
    record.bundleSha256 = await storeBundle(status, exactSource, compilerVersion, onchainModules);
  }

  await deps.putVerification(env, record);
  return {
    ok: status !== "failed",
    errorCode: status === "failed" ? "failed" : undefined,
    error: record.error ?? undefined,
    record,
    comparison,
  };
}
