import { sha256Hex } from "./sha";
import type { Bundle, VerificationRecord } from "./types";

export interface VerifyEnv {
  MOVE_VERIFY_DB: D1Database;
  MOVE_SOURCES: R2Bucket;
}

/** Stable JSON: sorted object keys at every depth, so the bundle hash does not depend on insertion order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function bundleSha(bundle: Bundle): Promise<string> {
  return sha256Hex(stableStringify(bundle));
}

export async function putBundle(env: VerifyEnv, bundle: Bundle): Promise<string> {
  const sha = await bundleSha(bundle);
  await env.MOVE_SOURCES.put(`bundles/${sha}.json`, JSON.stringify(bundle), {
    httpMetadata: { contentType: "application/json" },
  });
  return sha;
}

export async function getBundle(env: VerifyEnv, sha: string): Promise<Bundle | null> {
  if (!/^[0-9a-f]{64}$/.test(sha)) return null;
  const object = await env.MOVE_SOURCES.get(`bundles/${sha}.json`);
  if (!object) return null;
  try {
    return JSON.parse(await object.text()) as Bundle;
  } catch {
    return null;
  }
}

export const STALE_PENDING_MS = 15 * 60 * 1000;

/** A `pending` row that outlived its request is a crashed job, not a running one. */
export function isStalePending(record: VerificationRecord, now = Date.now()): boolean {
  return record.status === "pending" && now - record.updatedAt > STALE_PENDING_MS;
}

function withStale(record: VerificationRecord): VerificationRecord {
  return isStalePending(record)
    ? { ...record, status: "failed", error: "verification did not finish" }
    : record;
}

/**
 * Which result may overwrite which.
 *
 * A verified exact row is final. A stuck `pending` row must be allowed to
 * become `failed`. Everything else may be replaced by a better or newer result.
 */
export function shouldReplace(
  existing: VerificationRecord | null,
  next: VerificationRecord
): boolean {
  if (!existing) return true;
  if (existing.status === "verified" && existing.exactSource) return false;
  if (next.status === "pending" && existing.status !== "failed" && existing.status !== "pending") {
    return false;
  }
  if (next.status === "failed" && existing.status !== "pending") return false;
  if (next.status === "unreproduced" && existing.status === "verified") return false;
  return true;
}

const COLUMNS =
  "network, address, package_name, upgrade_number, status, exact_source, source_digest, " +
  "computed_digest, bundle_sha256, compiler_version, framework_rev, onchain_modules, error, " +
  "submitted_by, created_at, updated_at";

type Row = Record<string, any>;

function rowToRecord(row: Row): VerificationRecord {
  return {
    network: row.network,
    address: row.address,
    packageName: row.package_name,
    upgradeNumber: Number(row.upgrade_number),
    status: row.status,
    exactSource: Boolean(row.exact_source),
    sourceDigest: row.source_digest,
    computedDigest: row.computed_digest ?? null,
    bundleSha256: row.bundle_sha256 ?? null,
    compilerVersion: row.compiler_version ?? null,
    frameworkRev: row.framework_rev ?? null,
    onchainModules: JSON.parse(row.onchain_modules || "{}"),
    error: row.error ?? null,
    submittedBy: row.submitted_by ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

type Key = Pick<VerificationRecord, "network" | "address" | "packageName" | "upgradeNumber">;

export async function getVerification(
  env: VerifyEnv,
  key: Key
): Promise<VerificationRecord | null> {
  const row = await env.MOVE_VERIFY_DB.prepare(
    `SELECT ${COLUMNS} FROM package_verifications
     WHERE network = ? AND address = ? AND package_name = ? AND upgrade_number = ?`
  )
    .bind(key.network, key.address, key.packageName, key.upgradeNumber)
    .first();
  return row ? withStale(rowToRecord(row as Row)) : null;
}

export async function listVerifications(
  env: VerifyEnv,
  network: VerificationRecord["network"],
  address: string
): Promise<VerificationRecord[]> {
  const { results } = await env.MOVE_VERIFY_DB.prepare(
    `SELECT ${COLUMNS} FROM package_verifications WHERE network = ? AND address = ?`
  )
    .bind(network, address)
    .all();
  return (results ?? []).map((row) => withStale(rowToRecord(row as Row)));
}

export async function putVerification(env: VerifyEnv, record: VerificationRecord): Promise<void> {
  const existing = await getVerification(env, record);
  if (!shouldReplace(existing, record)) return;

  await env.MOVE_VERIFY_DB.prepare(
    `INSERT INTO package_verifications (${COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(network, address, package_name, upgrade_number) DO UPDATE SET
       status = excluded.status,
       exact_source = excluded.exact_source,
       source_digest = excluded.source_digest,
       computed_digest = excluded.computed_digest,
       bundle_sha256 = excluded.bundle_sha256,
       compiler_version = excluded.compiler_version,
       framework_rev = excluded.framework_rev,
       onchain_modules = excluded.onchain_modules,
       error = excluded.error,
       submitted_by = excluded.submitted_by,
       updated_at = excluded.updated_at`
  )
    .bind(
      record.network,
      record.address,
      record.packageName,
      record.upgradeNumber,
      record.status,
      record.exactSource ? 1 : 0,
      record.sourceDigest,
      record.computedDigest,
      record.bundleSha256,
      record.compilerVersion,
      record.frameworkRev,
      JSON.stringify(record.onchainModules),
      record.error,
      record.submittedBy,
      record.createdAt,
      record.updatedAt
    )
    .run();
}
