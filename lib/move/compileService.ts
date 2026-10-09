/**
 * Types and helpers for the Move compile service.
 *
 * The service (`supra move tool compile`, compile-only) is hosted on a VPS and is serialised: one
 * compile at a time, 503 while busy. Everything here treats that as the normal case rather than an
 * error, because it is the normal case whenever anyone else is compiling.
 */

export const COMPILE_BASE_URL =
  process.env.MOVE_COMPILE_URL || "https://move-compile.hoglet.xyz";

/**
 * Adds the `0x` prefix Supra's CLI omits when printing a ModuleID.
 *
 * Duplicated rather than imported because `utils/hex.ts` is a client module and this file is imported by
 * the server route; pulling it in here would drag client-only code into the server bundle. The rule is
 * one line, so the duplication is cheaper than the coupling.
 */
function normalizeHexBytes(value: string): string | null {
  if (!value) return null;
  const body = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]*$/.test(body)) return null;
  const padded = body.length % 2 === 0 ? body : "0" + body;
  return "0x" + padded.toLowerCase();
}

/** Server-side only. Never prefix with NEXT_PUBLIC_: the token must not reach the browser. */
export const COMPILE_TOKEN = process.env.MOVE_COMPILE_TOKEN || "";

/** Mirrors the upstream limit so we can reject oversized payloads before spending an upstream round trip. */
export const COMPILE_MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * The service answers `504` after **300 s**, so the client must wait longer than that or it aborts first
 * and replaces a real "this took too long" answer with a local timeout of our own making. The margin is
 * small on purpose: it exists to let the upstream 504 arrive, not to extend the wait.
 */
export const COMPILE_UPSTREAM_TIMEOUT_MS = 300_000;
export const COMPILE_TIMEOUT_MS = COMPILE_UPSTREAM_TIMEOUT_MS + 10_000;

/**
 * Ceiling on all attempts combined.
 *
 * Retries exist for `503`, which the serial host returns **immediately** while a compile is running — so
 * the useful case costs nothing. A `504`, by contrast, has already burned 300 s, and three of those in a
 * row would hold a request for a quarter of an hour and outlive any serverless execution limit. The
 * budget keeps the cheap retries and drops the expensive ones.
 */
export const COMPILE_TOTAL_BUDGET_MS = 330_000;

/**
 * Only 503 and 504 are retried.
 *
 * 503 means a compile is already running, which is contention and not a verdict. 504 means it ran out
 * of time. Everything else — 400 malformed, 401 bad token, 413 too large — is deterministic: retrying
 * would spend another 180 seconds to arrive at the same answer.
 */
const RETRYABLE_STATUS = new Set([503, 504]);

export interface CompileRequest {
  files: Record<string, string>;
}

/** What the service embeds in the on-chain package metadata. `none` is the smallest. */
export type IncludedArtifacts = "none" | "sparse" | "all";

/** Transport options shared by the compile and test calls. */
export interface ServiceCallOptions {
  attempts?: number;
  timeoutMs?: number;
  totalBudgetMs?: number;
  signal?: AbortSignal;
  /** What the on-chain package metadata carries. `none` (the default) keeps the artifacts small. */
  includedArtifacts?: IncludedArtifacts;
  /** Ask the service to return artifacts even past its size cap. */
  overrideSizeCheck?: boolean;
}

/**
 * What the service actually sends.
 *
 * `ok` is a plain boolean here, NOT the literal `true` of `CompileResponse`. Keeping the two shapes as
 * separate types is what makes the failure branch below type-check: with one type, `ok: true` and
 * `ok === false` were mutually exclusive by construction and the branch was unreachable.
 *
 * `metadata` and `bytecode` arrive as **bare hex, no `0x` prefix**, the same way ModuleIDs do. Everything
 * in this app passes hex around `0x`-prefixed, so they are normalised on the way through rather than at
 * each call site.
 */
interface RawCompileResponse {
  ok: boolean;
  code?: number;
  modules?: string[];
  /** Hex of `package-metadata.bcs`. Absent when `artifacts_omitted` is set. */
  metadata?: string;
  /** Hex of each `.mv`, in the same order as `modules`. */
  bytecode?: string[];
  /** True when the artifacts exceeded the service's size limit and were not returned. */
  artifacts_omitted?: boolean;
  /** Size of the built artifacts, in bytes, so the client can warn before hitting the cap. */
  size_bytes?: number;
  /** The service's own note when the package is large or its metadata could be trimmed. */
  hint?: string;
  ms?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface CompileResponse {
  /** Literal `true` so `CompileResult` narrows correctly on `if (!result.ok)`. */
  ok: true;
  code: number;
  modules: string[];
  /**
   * Hex of `package-metadata.bcs`, `0x`-prefixed — the `metadata_serialized` argument of
   * `code::publish_package`. Null when the service omitted the artifacts.
   */
  metadata: string | null;
  /** Hex of each module, `0x`-prefixed, in the same order as `modules` — the `code` argument. */
  bytecode: string[];
  /** True when the service could not return the artifacts within its size limit. */
  artifactsOmitted: boolean;
  /** Artifact size the service reported, when it sends one. */
  sizeBytes?: number;
  /** The service's own note about a large package, surfaced to the user as-is. */
  hint?: string;
  ms: number;
  stdout: string;
  stderr: string;
}

export interface CompileFailure {
  ok: false;
  error: string;
  /**
   * Always present, always empty.
   *
   * A failure has produced no modules either way, but leaving the field out meant callers had to guard
   * `result.modules` before reading it, while the success arm and the browser client both guarantee an
   * array. Uniform shape is worth one redundant field.
   */
  modules: string[];
  /** HTTP status from upstream, when the failure came from a response rather than a transport error. */
  status?: number;
  /** Exit code, present when the service ran the compiler and it rejected the sources. */
  code?: number;
  /** Compiler output. Populated for a compile failure, which is the case that actually explains why. */
  stdout?: string;
  stderr?: string;
  ms?: number;
}

export type CompileResult = CompileResponse | CompileFailure;

/**
 * Path validation, enforced here so an obviously hostile payload never leaves the origin.
 *
 * The upstream also rejects `..`, but only after our server has already forwarded it — the token and a
 * network round trip are spent on a request that could not succeed.
 */
export function validateFiles(files: unknown): { ok: true; files: Record<string, string> } | { ok: false; error: string } {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    return { ok: false, error: "files must be an object mapping path to source" };
  }
  const entries = Object.entries(files as Record<string, unknown>);
  if (entries.length === 0) {
    return { ok: false, error: "files is empty" };
  }
  if (!("Move.toml" in (files as Record<string, unknown>))) {
    return { ok: false, error: "Move.toml is required" };
  }

  const clean: Record<string, string> = {};
  for (const [path, content] of entries) {
    if (typeof content !== "string") {
      return { ok: false, error: `file "${path}" must be a string` };
    }
    if (!path || path.startsWith("/") || path.includes("\\")) {
      return { ok: false, error: `invalid path "${path}"` };
    }
    const parts = path.split("/");
    if (parts.includes("..") || parts.includes(".")) {
      return { ok: false, error: `invalid path "${path}"` };
    }
    clean[path] = content;
  }
  return { ok: true, files: clean };
}

/**
 * Normalises a ModuleID's address so it can be pasted into address inputs.
 *
 * The compile service returns module ids as `<address>::<name>::<friend>` with the address as **bare
 * 64-char hex, no `0x` prefix**. Every address input in this app is `0x`-prefixed and validated with a
 * `/^0x[0-9a-fA-F]{1,64}$/` pattern, so handing the raw value to the Interactor or the audit would
 * produce an address the app cannot read. Verified against a real compile: the raw id came back as
 * `0000...0001::m` with no prefix.
 *
 * Only the address segment is rewritten. The module and friend names are left untouched, so the result
 * still round-trips as a ModuleID.
 */
export function normalizeModuleId(moduleId: string): string {
  const parts = moduleId.split("::");
  const addr = parts[0] ?? "";
  if (!/^[0-9a-fA-F]+$/.test(addr)) return moduleId;
  const normalized = normalizeHexBytes(`0x${addr}`);
  if (!normalized) return moduleId;
  return [normalized, ...parts.slice(1)].join("::");
}

/**
 * Stable content hash, used as the cache key.
 *
 * A naive `JSON.stringify` of the object would depend on key insertion order, so the same sources sent
 * in a different order would miss the cache and burn a compile slot. Sorting the paths makes the key
 * depend only on the content.
 */
export function hashFiles(files: Record<string, string>): string {
  const canonical = Object.keys(files)
    .sort()
    .map((path) => `${path} ${files[path]}`)
    .join("");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonical.length; i++) {
    const c = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/**
 * Calls the compile service.
 *
 * `token` is a parameter rather than read from the environment here, so this module can be imported
 * from anywhere without the secret being reachable from a module that ends up in the client bundle.
 */
/**
 * Runs the package's `#[test]` functions.
 *
 * Same request as a compile and the same endpoint shape, so it shares the transport, the retries and the
 * normalisation. What differs is the verdict: a failing test suite is `ok: false` with the summary in
 * `stdout` (`Test result: FAILED. ...`) while the framework's own warnings stay in `stderr`.
 */
export async function runMoveTests(
  files: Record<string, string>,
  token: string,
  opts: ServiceCallOptions = {}
): Promise<CompileResult> {
  return callService("test", files, token, opts);
}

export async function compileMove(
  files: Record<string, string>,
  token: string,
  opts: ServiceCallOptions = {}
): Promise<CompileResult> {
  return callService("compile", files, token, opts);
}

async function callService(
  endpoint: "compile" | "test",
  files: Record<string, string>,
  token: string,
  opts: ServiceCallOptions = {}
): Promise<CompileResult> {
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? COMPILE_TIMEOUT_MS;
  const totalBudgetMs = opts.totalBudgetMs ?? COMPILE_TOTAL_BUDGET_MS;
  /**
   * The advanced options are sent only when set. Left untouched, the request is `{ files }` and the service
   * compiles exactly as it always did — the normal path. `included_artifacts` (e.g. `none`) trims the on-chain
   * package metadata for a large package, and `override_size_check` asks the service to hand the artifacts
   * over past its size cap. Only the compile carries them; a test run produces no artifacts.
   */
  const body = JSON.stringify(
    endpoint === "compile"
      ? {
          files,
          ...(opts.includedArtifacts ? { included_artifacts: opts.includedArtifacts } : {}),
          ...(opts.overrideSizeCheck ? { override_size_check: true } : {}),
        }
      : { files }
  );
  const startedAt = Date.now();

  let last: CompileFailure = { ok: false, error: "compile failed", modules: [] };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) {
      // Linear backoff with a floor. The host is busy, not recovering — a short pause is enough for the
      // running compile to finish, and a long one would just idle the caller.
      await new Promise((r) => setTimeout(r, 2500 * (attempt - 1)));
    }

    // Checked after the backoff, and against the attempt's own ceiling rather than the elapsed time
    // alone: what matters is whether this attempt can still finish inside the budget, not whether the
    // budget has already passed. Testing the elapsed time let a second full-length attempt start at
    // t=310s under a 330s budget, which would have run to 620s and outlived the handler.
    if (attempt > 1 && Date.now() - startedAt + timeoutMs > totalBudgetMs) {
      return { ...last, error: `${last.error} (retry budget exhausted after ${attempt - 1} attempt(s))` };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onAbort);

    try {
      const res = await fetch(`${COMPILE_BASE_URL}/${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
        cache: "no-store",
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        last = {
          ok: false,
          error: `compile service returned HTTP ${res.status}`,
          modules: [],
          status: res.status,
        };        if (RETRYABLE_STATUS.has(res.status) && attempt < attempts) continue;
        // Keep the upstream text when there is one: for a 400 it explains exactly which line failed.
        if (detail) last.error = `${last.error}: ${detail.slice(0, 500)}`;
        return last;
      }

      const json = (await res.json()) as RawCompileResponse;

      /**
       * The service answers **HTTP 200 with `ok: false`** when the compiler rejects the sources: the
       * request itself succeeded, the code did not. So HTTP status alone cannot tell success from failure
       * here, and branching on it dropped the compiler's own output on the floor — the one thing that
       * says which line is wrong.
       */
      if (json.ok === false) {
        return {
          ok: false,
          error: "the compiler rejected these sources",
          modules: [],
          code: json.code,
          stdout: json.stdout ?? "",
          stderr: json.stderr ?? "",
          ms: json.ms,
        };
      }

      // Normalise here rather than leaving it to callers: forgetting it in one of three consumers would
      // surface as an address the app silently refuses, which is much harder to trace than a shape change.
      // The same applies to the artifact hex, which arrives bare.
      const rawMetadata = json.metadata ? normalizeHexBytes(json.metadata) : null;
      return {
        ok: true,
        code: json.code ?? 0,
        modules: (json.modules ?? []).map(normalizeModuleId),
        metadata: rawMetadata,
        bytecode: (json.bytecode ?? []).map((b) => normalizeHexBytes(b) ?? ""),
        artifactsOmitted: json.artifacts_omitted === true,
        sizeBytes: json.size_bytes,
        hint: json.hint,
        ms: json.ms ?? 0,
        stdout: json.stdout ?? "",
        stderr: json.stderr ?? "",
      };
    } catch (e: any) {
      const aborted = e?.name === "AbortError";
      last = {
        ok: false,
        error: aborted ? `compile timed out after ${timeoutMs}ms` : e?.message || "network error",
        modules: [],
      };
      // A caller-initiated abort must not be retried; that is the user navigating away.
      if (opts.signal?.aborted) return last;
      if (aborted && attempt < attempts) continue;
      return last;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }

  return last;
}