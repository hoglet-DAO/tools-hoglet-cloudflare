/**
 * Browser-side caller for the Move compile proxy.
 *
 * Points at our own `/api/move/compile`, never at the VPS directly, so the bearer token stays on the
 * server. Everything here is UI-layer concern: the same sources compiled twice return the same result,
 * so repeated presses should not queue another 180-second compile.
 */

import type { CompileResponse, IncludedArtifacts } from "./compileService";
import { hashFiles } from "./compileService";
import { STORAGE_KEYS, readJson, writeJson } from "@/lib/storage";

export interface BrowserCompileResult {
  ok: boolean;
  modules: string[];
  /** Hex of `package-metadata.bcs`, `0x`-prefixed, or null when the service omitted the artifacts. */
  metadata: string | null;
  /** Hex of each module, `0x`-prefixed, in the same order as `modules`. */
  bytecode: string[];
  /** Move Script names compiled in the package. */
  scriptNames?: string[];
  /** Hex of each compiled script bytecode, `0x`-prefixed. */
  scripts?: string[];
  /** True when the artifacts were too large for the service to return. */
  artifactsOmitted: boolean;
  /** Artifact size the service reported, when it sends one. */
  sizeBytes?: number;
  /** The service's note about a large package, passed through untouched. */
  hint?: string;
  /** The service's note about the choices made, passed through untouched. */
  note?: string;
  /**
   * True when this answer came from the local cache rather than the service.
   *
   * Separate from `ms`, which used to be zeroed to signal a hit. "1 module(s) in 0 ms" reads as a
   * suspiciously fast compile rather than as no compile at all, which is exactly how it was reported.
   */
  cached: boolean;
  stdout: string;
  stderr: string;
  ms: number;
  error?: string;
  /** HTTP status from the proxy, so the UI can tell "busy, retry" from "your code is broken". */
  status?: number;
  /** Compiler exit code, present when the sources were rejected. */
  code?: number;
}

/** Every failure carries the same empty shape, so a caller never has to guard for a missing field. */
function emptyResult(overrides: Partial<BrowserCompileResult>): BrowserCompileResult {
  return {
    ok: false,
    modules: [],
    metadata: null,
    bytecode: [],
    scriptNames: [],
    scripts: [],
    artifactsOmitted: false,
    cached: false,
    stdout: "",
    stderr: "",
    ms: 0,
    ...overrides,
  };
}

const CACHE = new Map<string, CompileResponse>();
const CACHE_LIMIT = 40;

/** The options that change what the service returns, in the shape the callers actually pass them. */
type CacheOpts = { includedArtifacts?: IncludedArtifacts; overrideSizeCheck?: boolean };

/**
 * The cache key: the content of the sources plus the options that change the artifacts.
 *
 * Single source of truth for both the in-memory cache and the persisted size memory, so a size can never be
 * filed under a key the cache would not have used.
 */
function compileKey(files: Record<string, string>, opts: CacheOpts): string {
  return `${hashFiles(files)}|${opts.includedArtifacts ?? "default"}|${opts.overrideSizeCheck ?? false}`;
}

/** How many measured sizes to keep. Each entry is a hash and a number, so this costs a few kilobytes. */
const SIZE_LIMIT = 50;

/**
 * Package sizes the service has already reported, keyed by compile key.
 *
 * `CACHE` above dies with the tab, and before any compile the workspace can only show the source size —
 * which runs roughly three times the compiled artifact size and reads like the real number anyway. The
 * compiler is deterministic, so a size measured once still holds; recording it turns "208 KB of source"
 * into "63 KB, measured" without estimating anything.
 *
 * Malformed or non-numeric entries are dropped on read rather than trusted, since a hand-edited value here
 * would be shown to the user as a measurement.
 */
function readSizeMemory(): Record<string, number> {
  const raw = readJson<Record<string, unknown>>(STORAGE_KEYS.compileSizes, {});
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) out[key] = value;
  }
  return out;
}

/**
 * The last measured package size for exactly these sources and options, or null if never compiled.
 *
 * A miss is the normal case, not an error: it means this content has not been built yet, and the caller
 * falls back to the source-size readout.
 */
export function rememberedCompileSize(
  files: Record<string, string>,
  opts: CacheOpts = {}
): number | null {
  return readSizeMemory()[compileKey(files, opts)] ?? null;
}

function rememberCompileSize(key: string, bytes: number): void {
  const all = readSizeMemory();
  // Re-insert so the key moves to the tail of the insertion order eviction walks from.
  delete all[key];
  all[key] = bytes;
  const keys = Object.keys(all);
  for (const stale of keys.slice(0, Math.max(0, keys.length - SIZE_LIMIT))) delete all[stale];
  writeJson(STORAGE_KEYS.compileSizes, all);
}

export function cachedResult(hash: string): CompileResponse | undefined {
  return CACHE.get(hash);
}

export async function compileInBrowser(
  files: Record<string, string>,
  opts: { signal?: AbortSignal; includedArtifacts?: IncludedArtifacts; overrideSizeCheck?: boolean } = {}
): Promise<BrowserCompileResult> {
  return postToProxy("/api/move/compile", files, opts, true);
}

/**
 * Runs the package's `#[test]` functions.
 *
 * Deliberately not cached: tests are run to see the result now, and a cached verdict would hide a change
 * the user just made. The compile cache exists because the artifacts are expensive and reusable; a test
 * summary is neither.
 */
export async function testInBrowser(
  files: Record<string, string>,
  opts: { signal?: AbortSignal } = {}
): Promise<BrowserCompileResult> {
  return postToProxy("/api/move/test", files, opts, false);
}

async function postToProxy(
  url: string,
  files: Record<string, string>,
  opts: { signal?: AbortSignal; includedArtifacts?: IncludedArtifacts; overrideSizeCheck?: boolean } = {},
  cacheResult = false
): Promise<BrowserCompileResult> {
  // The options change the metadata the service returns, so the same sources compiled with different
  // options are different results and must not share a cache entry. Unset options are the normal path.
  const hash = compileKey(files, opts);
  if (cacheResult) {
    const hit = CACHE.get(hash);
    // `cached: true` rather than a zeroed `ms`, so the caller can say "already compiled" instead of
    // showing an impossibly fast compile.
    if (hit) return { ...hit, cached: true, ms: 0 };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files,
        ...(opts.includedArtifacts ? { included_artifacts: opts.includedArtifacts } : {}),
        ...(opts.overrideSizeCheck ? { override_size_check: true } : {}),
      }),
      signal: opts.signal,
    });
  } catch (e: any) {
    return emptyResult({ error: e?.message || "network error" });
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    return emptyResult({
      error: `unexpected response (HTTP ${res.status})`,
      status: res.status,
    });
  }

  /**
   * Branch on the payload, not the status.
   *
   * A rejected compile comes back as **HTTP 200 with `ok: false`** — the request was fine, the code was
   * not. The previous condition required an HTTP error AND `ok: false` at once, so it never matched and
   * the failure fell through to the success branch below: every compiler error was reported to the user
   * as a successful build.
   */
  if (json?.ok === false) {
    return emptyResult({
      stdout: json.stdout ?? "",
      stderr: json.stderr ?? "",
      ms: json.ms ?? 0,
      error: json.error || "the compiler rejected these sources",
      status: res.status,
      code: json.code,
    });
  }

  if (!res.ok) {
    return emptyResult({
      error: json?.error || `compile service returned HTTP ${res.status}`,
      status: res.status,
    });
  }

  const result: CompileResponse = {
    // Both failure paths return above, so reaching here means the compiler produced output.
    ok: true,
    code: json.code ?? 0,
    modules: json.modules ?? [],
    metadata: json.metadata ?? null,
    bytecode: json.bytecode ?? [],
    scriptNames: json.scriptNames ?? [],
    scripts: json.scripts ?? [],
    artifactsOmitted: json.artifactsOmitted === true,
    sizeBytes: json.sizeBytes,
    hint: json.hint,
    note: json.note,
    ms: json.ms ?? 0,
    stdout: json.stdout ?? "",
    stderr: json.stderr ?? "",
  };

  // Only successful compiles are cached, and only when the caller asked for it. A failure depends on our
  // sources, which the user is about to edit, and caching it would make a fix look like it had no effect
  // until the text changed and changed back. The artifacts ride along, which is what makes a repeated
  // deploy cost nothing.
  if (cacheResult) {
    if (CACHE.size >= CACHE_LIMIT) {
      const oldest = CACHE.keys().next().value;
      if (oldest !== undefined) CACHE.delete(oldest);
    }
    CACHE.set(hash, result);
    // Survives the reload that empties the artifact cache above, which is the point: the expensive part of
    // knowing the package size is the compile, and that is exactly what a reload makes us pay again.
    if (typeof json.sizeBytes === "number") rememberCompileSize(hash, json.sizeBytes);
  }

  return { ...result, cached: false };
}

export function clearCompileCache(): void {
  CACHE.clear();
}