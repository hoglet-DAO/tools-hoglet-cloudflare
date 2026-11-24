# Move Source Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a source-verification service and page for Supra Move packages: read the on-chain registry, recompile submitted sources, compare module bytecode, and cache the verified bundle in D1/R2.

**Architecture:** A new `lib/verify/*` layer holds pure helpers (digest, manifest sanitiser, RPC reader, bytecode comparison, D1/R2 store) and one orchestrator. Route handlers under `app/api/verify/*` are thin. A new `/[locale]/verify` page lists packages, shows chain-held source, and accepts a source bundle for `none` packages. The Move compile VPS stays the only compiler; the app compares its output against Supra RPC bytecode.

**Tech Stack:** Next.js 16 (App Router, route handlers with Promise params), OpenNext on Cloudflare Workers, D1 (`MOVE_VERIFY_DB`), R2 (`MOVE_SOURCES`), WebCrypto, `DecompressionStream`, existing `lib/move/compileService.ts`, existing CodeMirror editor, `wrangler` 4.

**Spec:** `docs/superpowers/specs/2026-11-24-move-source-verification-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` before writing Next-specific code. This Next version differs from training data (repo `AGENTS.md`).
- D1 database `hoglet-move-verify` (`5720953a-3007-4e3a-b3b2-1e08ae1115a0`), binding `MOVE_VERIFY_DB`. R2 bucket `hoglet-move-sources`, binding `MOVE_SOURCES`. Both already in `wrangler.jsonc`.
- The compile bearer token (`MOVE_COMPILE_TOKEN`) never reaches the browser and is never prefixed `NEXT_PUBLIC_`.
- Verification routes are geoblocked by `middleware.ts` like every other `/api/*` and page. Do not add an exception.
- `Cache-Control: no-store` on every verify response until a separate decision changes it.
- 13 locales, no fallback: every new key must exist in all files under `messages/`.
- Request body cap: reuse `COMPILE_MAX_BODY_BYTES` (5 MB). No new body parser.
- No new dependencies. Use `lib/move/zip.ts`, `lib/move/compileService.ts`, `lib/move/rateLimit.ts`, `lib/vault/metadata.ts` helpers.
- Tests are plain Node scripts in `scripts/`, using `scripts/load-module.cjs` (`loadTs`, `makeChecker`, `report`). Run with `node scripts/<name>.cjs`. Run `pnpm install` first (lockfile is fixed; do not update packages).
- The compile service changes (compiler version, `deps/`, verification lane) are external. Code that needs them must degrade with an explicit error, not crash.
- `pnpm` is the package manager. Do not use `npx @latest`.

## Review Focus

These are the spec-implied failure modes the happy-path tests will not catch. Each has a test in the task that owns the code.

1. A package with zero modules, or a module present on chain but absent from the compile output, must fail verification; never verify a subset silently. (Task 5 and Task 7.)
2. An upgrade between the registry read and the store must not leave a "verified" row attached to the old `upgrade_number`. (Task 7.)
3. `0x`/case/whitespace differences in bytecode hex are not a mismatch. (Task 5.)
4. A failed or unknown `bundle_sha256` download must 404, never an empty or `undefined` body. (Task 8.)
5. A malformed or oversized upload must be rejected before the compiler is called. (Task 3 and Task 8.)
6. `unreproduced` (digest matches, bytecode does not) must not be rendered as `failed` or as `verified`. (Task 7 and Task 9.)

---

### Task 1: D1 schema, migration and binding types

**Files:**
- Create: `migrations/0001_package_verifications.sql`
- Modify: `package.json` (scripts)
- Create (generated): `cloudflare-env.d.ts`

**Interfaces:**
- Consumes: `wrangler.jsonc` bindings already committed.
- Produces: table `package_verifications`; npm scripts `db:migrate:local`, `db:migrate:remote`, `test:verify`; typed `CloudflareEnv.MOVE_VERIFY_DB` / `MOVE_SOURCES`.

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE IF NOT EXISTS package_verifications (
  network          TEXT    NOT NULL,
  address          TEXT    NOT NULL,
  package_name     TEXT    NOT NULL,
  upgrade_number   INTEGER NOT NULL,
  status           TEXT    NOT NULL,
  exact_source     INTEGER NOT NULL DEFAULT 0,
  source_digest    TEXT    NOT NULL,
  computed_digest  TEXT,
  bundle_sha256    TEXT,
  compiler_version TEXT,
  framework_rev    TEXT,
  onchain_modules  TEXT    NOT NULL DEFAULT '{}',
  error            TEXT,
  submitted_by     TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (network, address, package_name, upgrade_number)
);

CREATE INDEX IF NOT EXISTS idx_verifications_address
  ON package_verifications (network, address);
```

- [ ] **Step 2: Apply it locally and verify the table exists**

Run:
```bash
wrangler d1 execute hoglet-move-verify --local --file=migrations/0001_package_verifications.sql
wrangler d1 execute hoglet-move-verify --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='package_verifications'"
```
Expected: one row, `package_verifications`.

- [ ] **Step 3: Add scripts to `package.json`**

```json
"db:migrate:local": "wrangler d1 migrations apply hoglet-move-verify --local",
"db:migrate:remote": "wrangler d1 migrations apply hoglet-move-verify --remote",
"test:verify": "node scripts/test-verify-digest.cjs && node scripts/test-verify-manifest.cjs && node scripts/test-verify-rpc.cjs && node scripts/test-verify-compare.cjs && node scripts/test-verify-store.cjs && node scripts/test-verify-service.cjs"
```

- [ ] **Step 4: Apply remotely and generate binding types**

Run:
```bash
pnpm install
pnpm db:migrate:remote
pnpm cf-typegen
```
Expected: `cloudflare-env.d.ts` contains `MOVE_VERIFY_DB: D1Database` and `MOVE_SOURCES: R2Bucket`.

- [ ] **Step 5: Commit**

```bash
git add migrations/0001_package_verifications.sql package.json cloudflare-env.d.ts
git commit -m "feat(verify): add D1 schema and Cloudflare binding types"
```

---

### Task 2: SHA helpers and source digest

**Files:**
- Create: `lib/verify/types.ts`
- Create: `lib/verify/sha.ts`
- Create: `lib/verify/digest.ts`
- Test: `scripts/test-verify-digest.cjs`

**Interfaces:**
- Produces:
  - `sha256Hex(text: string): Promise<string>` (lowercase hex)
  - `sha256HexUpper(text: string): Promise<string>` (uppercase hex)
  - `sourceDigest(manifest: string, files: Record<string, string>): Promise<string>` (uppercase hex)
  - shared types: `VerifyNetwork`, `VerificationStatus`, `OnChainPackage`, `VerificationRecord`, `Bundle`

- [ ] **Step 1: Write the failing test**

`scripts/test-verify-digest.cjs`:

```js
const path = require("path");
const { loadTs, makeChecker, report } = require("./load-module.cjs");
const { sourceDigest } = loadTs(path.join(__dirname, "..", "lib", "verify", "digest.ts"));
const { check, state } = makeChecker();

const manifest = '[package]\nname = "demo"\nversion = "1.0.0"\n\n[addresses]\ndemo = "0x1"\n';
const files = {
  "sources/a.move": "module 0x1::a { public fun f(): u64 { 1 } }\n",
  "sources/b.move": "module 0x1::b { public fun g(): u64 { 2 } }\n",
  "tests/a_test.move": "module 0x1::a_test { #[test] fun t() {} }\n",
  "doc/readme.md": "ignored",
};

(async () => {
  const digest = await sourceDigest(manifest, files);
  check("matches the known vector", digest === "6C4EE5BA33BC223673C5FD1FE766BCF66120F94234A6C993138CD797E5AF18F5", digest);
  const withoutTests = await sourceDigest(manifest, {
    "sources/a.move": files["sources/a.move"],
    "sources/b.move": files["sources/b.move"],
  });
  check("tests and docs do not change the digest", withoutTests === digest, withoutTests);
  const changed = await sourceDigest(manifest, { ...files, "sources/a.move": files["sources/a.move"] + " " });
  check("a source byte changes the digest", changed !== digest, changed);
  report(state);
})();
```

Note: the expected vector was produced from the same algorithm in the spec
(`move-package/src/resolution/digest.rs`). If the values were copied wrong the
test fails for the right reason.

- [ ] **Step 2: Run it and confirm it fails**

Run: `node scripts/test-verify-digest.cjs`
Expected: FAIL, `sourceDigest is not a function`.

- [ ] **Step 3: Teach the test loader relative TS imports**

`scripts/load-module.cjs` resolves `@/` aliases but not `./sha` inside a loaded
module, so `digest.ts` importing `./sha` fails under `loadTs`. In the `req`
function, before `base(spec)`, resolve a relative spec against the module's own
directory:

```js
if (spec.startsWith(".")) {
  const rel = path.resolve(path.dirname(abs), spec);
  for (const ext of [".ts", ".tsx", ".js"]) {
    if (fs.existsSync(rel + ext)) return loadTs(rel + ext, locals);
  }
}
```

- [ ] **Step 4: Define the shared types in `lib/verify/types.ts`**

```ts
export type VerifyNetwork = "mainnet" | "testnet";
export type VerificationStatus = "pending" | "verified" | "unreproduced" | "failed";

export interface OnChainModule {
  name: string;
  source: string | null;
}

export interface OnChainPackage {
  name: string;
  upgradeNumber: number;
  sourceDigest: string;
  manifest: string;
  modules: OnChainModule[];
  deps: { account: string; packageName: string }[];
}

export interface VerificationRecord {
  network: VerifyNetwork;
  address: string;
  packageName: string;
  upgradeNumber: number;
  status: VerificationStatus;
  exactSource: boolean;
  sourceDigest: string;
  computedDigest: string | null;
  bundleSha256: string | null;
  compilerVersion: string | null;
  frameworkRev: string | null;
  onchainModules: Record<string, string>;
  error: string | null;
  submittedBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Bundle {
  version: 1;
  network: VerifyNetwork;
  address: string;
  package: string;
  upgradeNumber: number;
  files: Record<string, string>;
  manifest: string;
  verification: {
    status: VerificationStatus;
    exactSource: boolean;
    sourceDigest: string;
    computedDigest: string;
    compilerVersion: string | null;
    frameworkRev: string | null;
    onchainModules: Record<string, string>;
  };
}
```

- [ ] **Step 5: Implement `lib/verify/sha.ts`**

```ts
/** Lowercase SHA-256 of a UTF-8 string, using the platform WebCrypto. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256HexUpper(text: string): Promise<string> {
  return (await sha256Hex(text)).toUpperCase();
}
```

- [ ] **Step 6: Implement `lib/verify/digest.ts`**

Select only `sources/**` and `scripts/**` `.move` files. Hash each file's text
with `sha256HexUpper`, put the hashes in an array with the manifest hash, sort
the array, concatenate, and return `sha256HexUpper` of the concatenation.

```ts
import { sha256HexUpper } from "./sha";

function isDigestSource(path: string): boolean {
  return /^(sources|scripts)\//.test(path) && path.endsWith(".move");
}

export async function sourceDigest(manifest: string, files: Record<string, string>): Promise<string> {
  const hashes = [await sha256HexUpper(manifest)];
  for (const [path, content] of Object.entries(files)) {
    if (isDigestSource(path)) hashes.push(await sha256HexUpper(content));
  }
  hashes.sort();
  return sha256HexUpper(hashes.join(""));
}
```

- [ ] **Step 7: Run the test and the full digest script**

Run: `node scripts/test-verify-digest.cjs`
Expected: all checks passed.

- [ ] **Step 8: Add a real-chain check (manual, no compiler)**

Create `scripts/verify-mainnet-digest.cjs` that fetches the `RazorLibs` registry
from `https://rpc-mainnet.supra.com/rpc/v3/accounts/0x3045d27b5fada1e30897a741fb184e48ef0bff3717aea23918ebc1e5c7153083/resources`,
finds `0x1::code::PackageRegistry`, gunzips each module's `source` and the
`manifest`, calls `sourceDigest`, and asserts it equals
`555FBD6AFEE8300521A8586799FC4CE005BFF548AC0F71E11D309249E7D764C9`.
This is the proof the algorithm is right against the chain; it is not part of
`test:verify`.

- [ ] **Step 9: Commit**

```bash
git add lib/verify/types.ts lib/verify/sha.ts lib/verify/digest.ts scripts/test-verify-digest.cjs scripts/verify-mainnet-digest.cjs scripts/load-module.cjs
git commit -m "feat(verify): reproduce the on-chain source digest"
```

---

### Task 3: Verify-mode file validation and manifest sanitiser

**Files:**
- Create: `lib/verify/validate.ts`
- Create: `lib/verify/manifest.ts`
- Test: `scripts/test-verify-manifest.cjs`

**Interfaces:**
- Produces:
  - `validateVerifyFiles(files: unknown): { ok: true; files: Record<string, string> } | { ok: false; error: string }`
  - `sanitizeManifest(manifest: string, opts?: { frameworkCommit?: string }): { ok: true; manifest: string; localDeps: string[]; gitDeps: { name: string; git: string; rev: string }[] } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing tests**

Cover, with `check(name, cond, detail)`:

- `sources/a.move` accepted; `deps/RazorLibs/Move.toml` and
  `deps/RazorLibs/sources/a.move` accepted.
- Root `Move.toml` is rejected (`"the root manifest comes from chain"`).
- `../x.move`, `/x.move`, `sources/../../x`, `sources\\x`, `__proto__`, a `.txt`
  file, and a path over 150 chars are rejected.
- 201 files rejected; a file over 2 MB rejected.
- `sanitizeManifest` rewrites `local = "../amm_libs"` under
  `[dependencies.RazorLibs]` to `local = "deps/RazorLibs"` and returns
  `localDeps: ["RazorLibs"]`.
- It rejects `local = "/etc"`, `local = "../x"`, and `local = "..\\x"` (the
  on-chain manifest can contain a path that escapes).
- It accepts `git = "https://github.com/Entropy-Foundation/aptos-core.git"` and
  rejects `git = "http://..."`, `git = "https://192.168.1.1/x"`,
  `git = "https://gitlab.com/x"` (host must be `github.com`).
- `rev = "dev"` accepted; `rev = "dev\nmalicious"` rejected.
- With `frameworkCommit: "<40 hex>"`, every dep whose git host is
  `github.com/Entropy-Foundation/aptos-core` gets `rev = "<40 hex>"`.

Use this manifest as the base:

```js
const manifest = [
  "[package]", 'name = "amm"', 'version = "1.0.0"', "",
  "[addresses]", 'amm = "0x1"', "",
  "[dependencies.SupraFramework]",
  'git = "https://github.com/Entropy-Foundation/aptos-core.git"',
  'rev = "dev"',
  'subdir = "aptos-move/framework/supra-framework"', "",
  "[dependencies.RazorLibs]", 'local = "../amm_libs"', "",
  "[dev-dependencies]", "",
].join("\n");
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node scripts/test-verify-manifest.cjs`
Expected: FAIL, module or function not found.

- [ ] **Step 3: Implement `lib/verify/validate.ts`**

Rules:
- Input is a non-array object; 1..200 entries; each value a string.
- Path: 1..150 chars, `^[A-Za-z0-9_\-./]+$`, no leading `/`, no `\`, no `//`,
  no segment `.`, `..`, or starting with `.`.
- Allowed: `sources/<...>.move`, `scripts/<...>.move`,
  `deps/<name>/Move.toml`, `deps/<name>/sources/<...>.move`,
  `deps/<name>/scripts/<...>.move`.
- Reject a root `Move.toml` with `the root manifest comes from chain`.
- Max 2 MB per file.

- [ ] **Step 4: Implement `lib/verify/manifest.ts`**

Line-based parser, matching the repo's TOML style:
- Track the current `[dependencies.X]` section.
- For `local = "..."`: reject absolute/backslash/`..`; replace the line with
  `local = "deps/<X>"`; record `X`.
- For `git = "..."`: require `https://github.com/`, reject `localhost`,
  `127.0.0.1`, `0.0.0.0`, `169.254.`, `10.`, `192.168.`, `172.16-31.`,
  `[::1]`; record `{ name, git, rev }`.
- For `rev = "..."`: require `^[A-Za-z0-9._/-]+$`.
- Ignore `[dev-dependencies]` blocks (do not rewrite them; the release build
  does not use them).
- If `frameworkCommit` is 40 hex, rewrite `rev` for every
  `github.com/Entropy-Foundation/aptos-core` dep.
- On any invalid value return `{ ok: false, error }`; never throw.

- [ ] **Step 5: Run the tests**

Run: `node scripts/test-verify-manifest.cjs`
Expected: all checks passed.

- [ ] **Step 6: Commit**

```bash
git add lib/verify/validate.ts lib/verify/manifest.ts scripts/test-verify-manifest.cjs
git commit -m "feat(verify): validate verify uploads and sanitize the on-chain manifest"
```

---

### Task 4: On-chain registry and module bytecode reader

**Files:**
- Create: `lib/verify/rpc.ts`
- Test: `scripts/test-verify-rpc.cjs`

**Interfaces:**
- Produces:
  - `fetchRegistry(network: VerifyNetwork, address: string): Promise<OnChainPackage[]>`
  - `fetchModuleBytecode(network: VerifyNetwork, address: string): Promise<Record<string, string>>`
  - `OnChainPackage` from `lib/verify/types.ts`
  - `decodeGzipHex(hex: string): Promise<string>`

- [ ] **Step 1: Write the failing test**

Mock `globalThis.fetch`:
- `/resources` returns one resource with `type: "0x1::code::PackageRegistry"`,
  a manifest gzipped with `zlib.gzipSync`, one module with gzipped source, one
  module with `source: "0x"`, `upgrade_number: "76"`, and `deps`.
- `/modules?count=100` returns two modules and `x-supra-cursor: next`; the
  follow-up call with `start=next` returns one more and no cursor.

Assert:
- `fetchRegistry` decodes the manifest and source.
- `source` of `"0x"` becomes `null`.
- `upgradeNumber` is the number `76`.
- `fetchModuleBytecode` returns all three module names, including the second
  page, and the hex strings are lowercase and `0x`-prefixed.

- [ ] **Step 2: Run it and confirm it fails**

Run: `node scripts/test-verify-rpc.cjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/verify/rpc.ts`**

Use `process.env.NEXT_PUBLIC_RPC_URL_MAINNET/TESTNET` with the same defaults as
`lib/vault/metadata.ts`. Each request: `AbortSignal.timeout(15_000)`,
`cache: "no-store"`.

`fetchRegistry`:
- `GET {base}/rpc/v3/accounts/{address}/resources`.
- Find `type === "0x1::code::PackageRegistry"`; return `[]` when absent.
- Map each package: `name`, `upgradeNumber: Number(upgrade_number)`,
  `sourceDigest: source_digest`, `manifest: await decodeGzipHex(manifest)`,
  `modules: [{ name, source: source === "0x" ? null : await decodeGzipHex(source) }]`,
  `deps: [{ account, packageName }]`.
- Module bytecode is separate; do not fetch it here.

`fetchModuleBytecode`:
- Loop `GET {base}/rpc/v3/accounts/{address}/modules?count=100` and
  `&start=<cursor>` while the response header `x-supra-cursor` is present.
- The body is an array or `{ data: [] }`.
- Name from `abi?.name ?? name`; skip entries without a name.
- Normalize: lowercase, ensure `0x`.

`decodeGzipHex`:
```ts
const bytes = Uint8Array.from(hex.replace(/^0x/, "").match(/../g) ?? [], (h) => parseInt(h, 16));
const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
return new Response(stream).text();
```

- [ ] **Step 4: Run the test**

Run: `node scripts/test-verify-rpc.cjs`
Expected: all checks passed.

- [ ] **Step 5: Commit**

```bash
git add lib/verify/rpc.ts lib/verify/types.ts scripts/test-verify-rpc.cjs
git commit -m "feat(verify): read the Supra package registry and module bytecode"
```

---

### Task 5: Bytecode comparison and result classification

**Files:**
- Create: `lib/verify/compare.ts`
- Test: `scripts/test-verify-compare.cjs`

**Interfaces:**
- Produces:
  - `compareModuleBytecode(compiled: { modules: string[]; bytecode: string[] }, onchain: Record<string, string>): { ok: boolean; modules: { name: string; ok: boolean; firstDiff: number | null }[]; missing: string[]; extra: string[] }`
  - `classify(digestMatch: boolean, bytecodeMatch: boolean): { status: "verified" | "unreproduced" | "failed"; exactSource: boolean }`

- [ ] **Step 1: Write the failing test**

Cases:
- Equal hex with different case and one side missing `0x` → `ok: true`.
- One byte different → `ok: false`, `firstDiff` equals the byte offset.
- A module in `onchain` missing from the compile output → `missing` contains it,
  `ok: false`.
- A compiled module not on chain → `extra` contains it, `ok: false`.
- Empty `onchain` → `ok: false`.
- `classify(true, true)` → `{ status: "verified", exactSource: true }`.
- `classify(false, true)` → `{ status: "verified", exactSource: false }`.
- `classify(true, false)` → `{ status: "unreproduced", exactSource: true }`.
- `classify(false, false)` → `{ status: "failed", exactSource: false }`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `node scripts/test-verify-compare.cjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/verify/compare.ts`**

`moduleNameFromId(id)`: split on `::`, return the second segment (fallback to the
first). Normalize hex by stripping `0x` and lowercasing. Compare the full string;
the first difference is `Math.floor(index / 2)`. If lengths differ, the first
difference is at `Math.floor(Math.min(a.length, b.length) / 2)`.

`classify` is the four-row table from the spec.

- [ ] **Step 4: Run the test**

Run: `node scripts/test-verify-compare.cjs`
Expected: all checks passed.

- [ ] **Step 5: Commit**

```bash
git add lib/verify/compare.ts scripts/test-verify-compare.cjs
git commit -m "feat(verify): compare compiled and on-chain module bytecode"
```

---

### Task 6: D1/R2 store

**Files:**
- Create: `lib/verify/store.ts`
- Create: `lib/verify/env.ts`
- Test: `scripts/test-verify-store.cjs`

**Interfaces:**
- Produces:
  - `VerifyEnv` `{ MOVE_VERIFY_DB: D1Database; MOVE_SOURCES: R2Bucket }`
  - `verifyEnv(): VerifyEnv` (server-only, wraps `getCloudflareContext`)
  - `stableStringify(value: unknown): string`
  - `bundleSha(bundle: Bundle): Promise<string>`
  - `putBundle(env: VerifyEnv, bundle: Bundle): Promise<string>`
  - `getBundle(env: VerifyEnv, sha: string): Promise<Bundle | null>`
  - `shouldReplace(existing: VerificationRecord | null, next: VerificationRecord): boolean`
  - `getVerification(env, key): Promise<VerificationRecord | null>`
  - `listVerifications(env, network, address): Promise<VerificationRecord[]>`
  - `putVerification(env, record): Promise<void>`

- [ ] **Step 1: Write the failing test**

Test the pure parts:
- `stableStringify({ b: 1, a: { d: 2, c: 3 } })` equals
  `{"a":{"c":3,"d":2},"b":1}`.
- `bundleSha` of a fixed bundle is stable across key insertion order.
- `shouldReplace`:
  - null + verified exact → `true`.
  - verified exact + failed → `false`.
  - pending + failed → `true` (a stuck job must be allowed to fail).
  - verified exact + unreproduced exact → `false`.
  - verified non-exact + verified exact → `true`.
  - failed + verified → `true`.
  - unreproduced exact + verified exact → `true`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `node scripts/test-verify-store.cjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/verify/store.ts`**

- `stableStringify`: recursive, sort object keys, JSON.stringify leaves.
- `bundleSha`: `sha256Hex(stableStringify(bundle))`.
- `putBundle`: `await env.MOVE_SOURCES.put("bundles/" + sha + ".json", JSON.stringify(bundle), { httpMetadata: { contentType: "application/json" } })`; return `sha`.
- `getBundle`: `get`, parse JSON, return `null` on miss or parse failure.
- `rowToRecord` / SQL constants for the table. Use snake_case columns and camel
  case in TypeScript.
- `putVerification`: `SELECT` the existing row, `shouldReplace`, then
  `INSERT INTO ... ON CONFLICT(network,address,package_name,upgrade_number) DO UPDATE SET ...`.
  Always update `updated_at`. A `failed` result replaces a `pending` row but
  never a `verified`/`unreproduced` one.
- `submitted_by` is nullable; no wallet in v1.

- [ ] **Step 4: Implement `lib/verify/env.ts`**

```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { VerifyEnv } from "./store";

export function verifyEnv(): VerifyEnv {
  return getCloudflareContext().env as unknown as VerifyEnv;
}
```

This file is imported only by route handlers. `store.ts` must not import it, so
the tests stay Workers-free.

- [ ] **Step 5: Run the test**

Run: `node scripts/test-verify-store.cjs`
Expected: all checks passed.

- [ ] **Step 6: Commit**

```bash
git add lib/verify/store.ts lib/verify/env.ts lib/verify/types.ts scripts/test-verify-store.cjs
git commit -m "feat(verify): persist verifications in D1 and bundles in R2"
```

---

### Task 7: Orchestrator

**Files:**
- Create: `lib/verify/service.ts`
- Test: `scripts/test-verify-service.cjs`

**Interfaces:**
- Consumes: `sourceDigest`, `sanitizeManifest`, `compareModuleBytecode`, `classify`, store functions, `CompileResult`.
- Produces: `verifyPackage(args: VerifyArgs): Promise<VerifyOutcome>` with injected deps.

```ts
export interface VerifyDeps {
  fetchRegistry: typeof fetchRegistry;
  fetchModuleBytecode: typeof fetchModuleBytecode;
  compile: (files: Record<string, string>, token: string, opts: { includedArtifacts?: "none" }) => Promise<CompileResult>;
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
  record?: VerificationRecord;
  comparison?: ReturnType<typeof compareModuleBytecode>;
}
```

- [ ] **Step 1: Write the failing tests**

Use fake deps and a fake env `{} as VerifyEnv` (store functions are fakes).

1. Digest and bytecode match → `status: "verified"`, `exactSource: true`,
   bundle stored, record stored.
2. Digest differs, bytecode matches → `verified`, `exactSource: false`.
3. Digest matches, bytecode differs → `unreproduced`, `exactSource: true`,
   bundle stored.
4. Both differ → `failed`, `exactSource: false`, no bundle.
5. Cache hit (`getVerification` returns a verified record for the same
   `upgradeNumber`) → `compile` is never called.
6. A chain package (every module has `source`) with no upload → compile receives
   files derived from the chain sources.
7. The on-chain package has module `b`, the compile result lacks it → `failed`
   (missing module).
8. Zero modules → `failed` with `"package has no modules"`.
9. `putVerification` receives the same `upgradeNumber` as the registry; if the
   fake registry is re-read with 77 after the first call, the second call stores
   a row for 77, not 76.

- [ ] **Step 2: Run it and confirm it fails**

Run: `node scripts/test-verify-service.cjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/verify/service.ts`**

Order:
1. `const packages = await deps.fetchRegistry(...)`; find by name; `404`-style
   `{ ok: false, errorCode: "not_found", error: "package not found" }` if absent.
   If the package has zero modules, persist `failed` with
   `"package has no modules"` and return `{ ok: false, errorCode: "failed" }`.
2. `const cached = await deps.getVerification(env, key)`; return immediately when
   `cached.status === "verified" && cached.upgradeNumber === pkg.upgradeNumber`.
3. Pick sources:
   - uploaded `sources/**` and `scripts/**` when present;
   - otherwise, if every `pkg.modules[].source` is non-null, build
     `sources/<module>.move`;
   - otherwise `{ ok: false, errorCode: "source_missing", error: "source not supplied" }`.
4. `computedDigest = await sourceDigest(pkg.manifest, sourceFiles)`.
5. `sanitized = sanitizeManifest(pkg.manifest, { frameworkCommit })`; on failure
   return `{ ok: false, errorCode: "failed", error }`.
6. `files = { "Move.toml": sanitized.manifest, ...sourceFiles, ...depFiles }`
   where `depFiles` are the uploaded `deps/**` entries.
7. `compiled = await deps.compile(files, token, { includedArtifacts: "none" })`;
   on `!compiled.ok` persist `failed` with `compiled.error` and return
   `{ ok: false, errorCode: "compile", error: compiled.error, record }`.
8. `onchain = await deps.fetchModuleBytecode(...)`.
9. `comparison = compareModuleBytecode(compiled, onchain)`.
10. `{ status, exactSource } = classify(computedDigest === pkg.sourceDigest, comparison.ok)`.
11. Build `record` with `onchainModules` from `onchain` (sha256 per module), and
    `frameworkRev` from `sanitized.gitDeps`.
12. If `status !== "failed"`, build `Bundle` and `await deps.putBundle`, then set
    `bundleSha256`.
13. `await deps.putVerification`.
14. Return `{ ok: status !== "failed", errorCode: status === "failed" ? "failed" : undefined, record, comparison }`.

`onchainModules`: `sha256Hex` of the normalized bytecode per module (not the
full hex; the row stays small).

- [ ] **Step 4: Run the test**

Run: `node scripts/test-verify-service.cjs`
Expected: all checks passed.

- [ ] **Step 5: Commit**

```bash
git add lib/verify/service.ts scripts/test-verify-service.cjs
git commit -m "feat(verify): orchestrate digest, compile and bytecode comparison"
```

---

### Task 8: API routes

**Files:**
- Create: `app/api/verify/route.ts`
- Create: `app/api/verify/[network]/[address]/route.ts`
- Create: `app/api/verify/[network]/[address]/[package]/route.ts`
- Create: `app/api/verify/[network]/[address]/[package]/source/route.ts`
- Create: `app/api/verify/bundle/[sha256]/route.ts`
- Create: `app/api/verify/health/route.ts`

**Interfaces:**
- Consumes: `verifyEnv`, `verifyPackage`, all lib helpers, `compileMove`, `COMPILE_TOKEN`, `COMPILE_MAX_BODY_BYTES`, `clientKey`, `rateLimited`, `pruneBuckets`, `createZip`.
- Produces: the JSON shapes the page consumes; `Cache-Control: no-store` on all.

- [ ] **Step 1: Implement `POST /api/verify`**

- `export const maxDuration = 600`.
- `if (!COMPILE_TOKEN) 503`.
- `rateLimited(clientKey(request), "verify", 3, 10 * 60_000)` → `429` with
  `Retry-After: 600`.
- Reject `raw.length > COMPILE_MAX_BODY_BYTES` → `413`.
- Parse JSON; validate `network` (`mainnet|testnet`), `address`
  (`isMoveAddress` + `normalizeAddress`), `package`
  (`^[A-Za-z_][A-Za-z0-9_]*$`), `files` (`validateVerifyFiles`).
- `framework_commit`: optional `^[0-9a-fA-F]{40}$`.
- Write a `pending` row first (`getVerification` then `putVerification` with
  `status: "pending"`; use the on-chain `upgradeNumber` from the registry, so
  the registry is read once here or the service returns it). Simplest: call
  `fetchRegistry` once in the route to get `upgradeNumber`, then write
  `pending`, then call `verifyPackage`.
- Call `verifyPackage` with real deps.
- Map errors: `errorCode === "not_found"` → `404`; `errorCode === "compile"` →
  `422` with the sanitized compiler output; `errorCode === "source_missing"` →
  `400`; otherwise `502`. A busy upstream (`status === 503|504`) → `503`.
- Return `{ ok: true, ...outcome }`.

- [ ] **Step 2: Implement `GET /api/verify/[network]/[address]`**

- Validate; `fetchRegistry` + `listVerifications`; join by package name.
- Return `{ ok, network, address, packages: [{ name, upgradeNumber, moduleCount, sourceDigest, hasChainSource, verification }] }`.
- `hasChainSource = pkg.modules.length > 0 && pkg.modules.every((m) => m.source !== null)`.
- `Cache-Control: no-store`.

- [ ] **Step 3: Implement `GET .../[package]`**

- Registry package + `getVerification`.
- Return name, upgrade, module names, manifest, `verification`, `hasSource`
  (`verification?.bundleSha256` or `hasChainSource`).
- `Cache-Control: no-store`.

- [ ] **Step 4: Implement `GET .../[package]/source`**

- If `verification?.bundleSha256`, `getBundle`; return `{ ok, origin: "bundle", files, manifest }`.
- Else build from chain sources (`sources/<name>.move`); return `{ ok, origin: "chain", files, manifest }`.
- Else `404`.
- `Cache-Control: no-store`.

- [ ] **Step 5: Implement `GET /api/verify/bundle/[sha256]`**

- Validate `^[0-9a-f]{64}$`; `getBundle`; `404` on miss.
- `format=zip`: `createZip` over `Move.toml` + `files`; return
  `application/zip` with `Content-Disposition: attachment; filename="<package>-<upgrade>.zip"`.
- Otherwise `application/json`.
- `Cache-Control: no-store`.

- [ ] **Step 6: Implement `GET /api/verify/health`**

- `COMPILE_TOKEN` set? D1 `prepare("SELECT 1").first()`; R2
  `list({ limit: 1 })`.
- `200 { ok: true }` or `503 { ok: false, ... }`.

- [ ] **Step 7: Verify with a running preview**

Run:
```bash
pnpm install
pnpm preview
```
In another shell:
```bash
curl -s http://localhost:8787/api/verify/health
curl -s http://localhost:8787/api/verify/mainnet/0x3045d27b5fada1e30897a741fb184e48ef0bff3717aea23918ebc1e5c7153083
curl -s "http://localhost:8787/api/verify/bundle/0000000000000000000000000000000000000000000000000000000000000000"
```
Expected: health `200` with all three true; the package list includes `amm` and
`RazorLibs`; the zero hash returns `404`.

- [ ] **Step 8: Commit**

```bash
git add app/api/verify
git commit -m "feat(verify): expose verification API routes"
```

---

### Task 9: Verify page and source viewer

**Files:**
- Create: `app/[locale]/(dashboard)/verify/page.tsx`
- Create: `components/verify/VerifyPage.tsx`
- Create: `components/verify/PackageList.tsx`
- Create: `components/verify/SourcePanel.tsx`
- Create: `components/verify/SubmitSources.tsx`
- Create: `components/verify/readFolder.ts`

**Interfaces:**
- Consumes: `useNetwork` from `@/context/NetworkContext`, `MoveEditor` (read-only), `t` from `next-intl`.
- Produces: the page at `/[locale]/verify?address=...`.

- [ ] **Step 1: Create the route page (server component)**

```tsx
export default async function Page({ searchParams }: { searchParams: Promise<{ address?: string }> }) {
  const { address } = await searchParams;
  return <VerifyPage initialAddress={address ?? ""} />;
}
```

- [ ] **Step 2: Implement `readFolder.ts`**

`readFolderFiles(input: HTMLInputElement): Promise<Record<string, string>>`:
- For each `.move`/`.toml` file, use `webkitRelativePath` (fallback `name`),
  normalize `\\` to `/`.
- If every path shares one root segment, strip it.
- If a `.move` path has no `/`, prefix `sources/`.
- Drop the root `Move.toml`: the chain supplies it. Keep
  `deps/<name>/Move.toml` and its sources.
- Preserve `deps/` paths.

- [ ] **Step 3: Implement `VerifyPage.tsx`**

- `useNetwork()`; map `supra-mainnet` → `mainnet`, `supra-testnet` → `testnet`;
  if another network, show the "Supra only" notice and do not fetch.
- Address input + Scan button; `GET /api/verify/{network}/{address}`.
- Empty, loading, error, 403, and no-packages states.
- Select a package → fetch detail and source; render `SourcePanel`.
- `SubmitSources` only when the selected package has no source (or as an
  "replace/verify" action on a `none` package).
- On upload success, refresh the list and select the result.

- [ ] **Step 4: Implement `PackageList.tsx`**

Rows: name, `upgrade #`, module count, badge:
- `verified` + `exactSource` → "Verified · exact source"
- `verified` + not exact → "Verified · equivalent source"
- `unreproduced` → "Exact source · bytecode not reproduced"
- `pending` → "Verifying…"
- `failed` → "Not verified"
- no row, `hasChainSource` → "Source on chain (not bytecode-verified)"
- no row, no source → "No source"

- [ ] **Step 5: Implement `SourcePanel.tsx`**

- File list on the left / top; selected file in `MoveEditor` with
  `readOnly`, `onChange={() => {}}`, `path={selected}`.
- Header shows origin ("on chain" / "submitted"), bundle hash, and a download
  link to `/api/verify/bundle/{sha}?format=zip`.
- Show the manifest as a file too.

- [ ] **Step 6: Implement `SubmitSources.tsx`**

- `<input type="file" webkitdirectory multiple onChange={...} />`.
- Call `readFolderFiles`, show the file count and total bytes.
- `POST /api/verify` with `{ network, address, package, files }`.
- Progress copy: "compiling, this can take minutes"; `503` → "compiler busy,
  retry"; `429` → "too many requests, retry later".
- On success, call `onVerified()`.

- [ ] **Step 7: Manual check**

Run `pnpm preview`, open `/verify?address=0x3045…`:
- `RazorLibs` shows the on-chain source without uploading.
- `amm` shows "No source" and the upload panel.
- A zero/invalid address shows a clear error, not a crash.

- [ ] **Step 8: Commit**

```bash
git add app/[locale]/(dashboard)/verify components/verify
git commit -m "feat(verify): add the verification page and source viewer"
```

---

### Task 10: Discovery, i18n and hardening

**Files:**
- Modify: `components/Sidebar.tsx`
- Modify: `messages/*.json` (13 files)
- Modify: `middleware.ts` only if a cache header is needed (it is not; routes set `no-store`)
- Test: `scripts/test-verify-service.cjs` (extend with the stale-pending rule)

**Interfaces:**
- Produces: `Nav.navVerify` and a `Verify` namespace in every locale; a sidebar
  entry to `/verify`.

- [ ] **Step 1: Add the sidebar entry**

Add `{ id: "verify", href: "/verify", icon: FileCode2, key: "navVerify", color: "text-sky-400" }`
to `menuItems` and import `FileCode2`. No other layout change.

- [ ] **Step 2: Add the i18n keys**

`Nav.navVerify` and the `Verify` namespace with these keys (English values first;
copy the same values into all 13 locale files so no key renders raw — real
translations can follow):

`title, subtitle, addressPlaceholder, scan, onlySupra, packages, noPackages,
upgrade, modules, verifiedExact, verifiedEquivalent, unreproduced, pending,
notVerified, sourceOnChain, noSource, submit, submitHint, chooseFolder, verify,
verifying, verifyHint, retry, busy, rateLimited, downloadInputs, bundleHash,
originChain, originBundle, manifest, failed, invalidAddress, notFound`.

- [ ] **Step 3: Add the stale-pending rule**

In `getVerification` (or the read route), a `pending` row older than 15 minutes
is returned as `failed` with `error: "verification did not finish"`, and the
POST route is allowed to replace it. Test it with a fake row in
`test-verify-store.cjs` (pure helper `isStalePending(record, now)`).

- [ ] **Step 4: Run the checks**

```bash
pnpm test:verify
pnpm lint
pnpm check:i18n
```
Expected: all pass. If `check:i18n` does not cover the new namespace, verify by
grep that every key exists in every `messages/*.json`.

- [ ] **Step 5: Manual end-to-end**

With the VPS changes deployed:
1. Verify a `none` package with its real sources; expect `verified`.
2. Re-open it; expect an instant read from D1/R2 with no compile.
3. Download the bundle zip; confirm `Move.toml` + `sources/` are inside.
4. Tamper with one source byte; expect `failed` with a module/offset.
5. Verify a `sparse` package with no upload; expect `verified` from chain sources.

- [ ] **Step 6: Commit**

```bash
git add components/Sidebar.tsx messages scripts/test-verify-store.cjs
git commit -m "feat(verify): add navigation, locale keys and stale-job handling"
```

---

## Self-Review

- **Spec coverage:** registry read (Task 4), digest (Task 2), sanitisation (Task 3), compile/compare (Task 5, 7), D1/R2 (Task 1, 6), cache/upgrade (Task 7, 10), API (Task 8), UI (Task 9), re-execution bundle (Task 6, 8), security (Task 3, 8), i18n (Task 10). The VPS changes are external and named in the spec.
- **Step scan:** every step names a file or a command and an observable result.
- **Type consistency:** `VerifyNetwork`, `VerificationRecord`, `Bundle`, `VerifyEnv`, `VerifyDeps` are defined once and reused. `bundleSha` is lowercase; `sourceDigest`/`computedDigest` are uppercase (matching the chain).
- **Review Focus:** zero/missing modules (Task 5, 7); upgrade key (Task 7); hex normalisation (Task 5); missing bundle download (Task 8); oversized upload (Task 3, 8); `unreproduced` rendering (Task 7, 9).
