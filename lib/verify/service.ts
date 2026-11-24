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

  if (pkg.modules.length === 0) {
    const record: VerificationRecord = {
      network,
      address,
      packageName,
      upgradeNumber: pkg.upgradeNumber,
      status: "failed",
      exactSource: false,
      sourceDigest: pkg.sourceDigest,
      computedDigest: null,
      bundleSha256: null,
      compilerVersion: null,
      frameworkRev: null,
      onchainModules: {},
      error: "package has no modules",
      submittedBy: submittedBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
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
    const record: VerificationRecord = {
      network,
      address,
      packageName,
      upgradeNumber: pkg.upgradeNumber,
      status: "failed",
      exactSource: exact,
      sourceDigest: pkg.sourceDigest,
      computedDigest,
      bundleSha256: null,
      compilerVersion: null,
      frameworkRev: null,
      onchainModules: {},
      error: sanitized.error,
      submittedBy: submittedBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await deps.putVerification(env, record);
    return { ok: false, errorCode: "failed", error: sanitized.error, record };
  }

  const compiled = await deps.compile(
    { "Move.toml": sanitized.manifest, ...sourceFiles, ...depFiles },
    token,
    { includedArtifacts: "none" }
  );
  if (!compiled.ok) {
    const record: VerificationRecord = {
      network,
      address,
      packageName,
      upgradeNumber: pkg.upgradeNumber,
      status: "failed",
      exactSource: exact,
      sourceDigest: pkg.sourceDigest,
      computedDigest,
      bundleSha256: null,
      compilerVersion: null,
      frameworkRev: sanitized.gitDeps.length ? JSON.stringify(sanitized.gitDeps) : null,
      onchainModules: {},
      error: compiled.error,
      submittedBy: submittedBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await deps.putVerification(env, record);
    return { ok: false, errorCode: "compile", error: compiled.error, upstreamStatus: compiled.status, record };
  }

  const onchain = await deps.fetchModuleBytecode(network, address);
  const comparison = compareModuleBytecode(compiled, onchain);
  const { status, exactSource } = classify(exact, comparison.ok);
  const onchainModules = await hashModules(onchain);
  const compilerVersion = compiled.compilerVersion ?? null;
  const frameworkRev = sanitized.gitDeps.length ? JSON.stringify(sanitized.gitDeps) : null;

  const error =
    status === "failed"
      ? comparison.missing.length
        ? `missing modules: ${comparison.missing.join(", ")}`
        : "bytecode does not match"
      : null;

  const record: VerificationRecord = {
    network,
    address,
    packageName,
    upgradeNumber: pkg.upgradeNumber,
    status,
    exactSource,
    sourceDigest: pkg.sourceDigest,
    computedDigest,
    bundleSha256: null,
    compilerVersion,
    frameworkRev,
    onchainModules,
    error,
    submittedBy: submittedBy ?? null,
    createdAt: now,
    updatedAt: now,
  };

  if (status !== "failed") {
    const bundle: Bundle = {
      version: 1,
      network,
      address,
      package: packageName,
      upgradeNumber: pkg.upgradeNumber,
      files: sourceFiles,
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
    record.bundleSha256 = await deps.putBundle(env, bundle);
  }

  await deps.putVerification(env, record);
  return {
    ok: status !== "failed",
    errorCode: status === "failed" ? "failed" : undefined,
    error: error ?? undefined,
    record,
    comparison,
  };
}
