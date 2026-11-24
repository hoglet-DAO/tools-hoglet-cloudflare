# Move Source Verification on Supra — Design

Date: 2026-11-24
Status: draft for review
Scope: a source-verification service and surface for Supra packages, in the
`tools-hoglet-cloudflare` app plus one optional endpoint on the Move compile VPS.

## Intent

Give a developer or a user a way to prove that a Move source tree is the code
behind a deployed package on Supra, including packages published with
`included_artifacts: none`, whose source text is not on chain.

This is the Etherscan/Sourcify "Verify source" flow, adapted to Move. It has two
independent claims:

- **Verified (bytecode):** recompiling the submitted sources with the same
  toolchain and dependencies produces the on-chain module bytecode. This is the
  strong claim.
- **Exact source (digest):** the submitted source tree also hashes to the
  `source_digest` the publisher stored on chain. This says it is the exact tree
  that was published, not merely an equivalent one.

The two claims are shown separately because they fail separately.

## Users and success

- Primary: a dev who deployed a package with `none` and wants to publish its
  source, once, so that everyone else can read it.
- Secondary: a user or auditor opening a deployed package and seeing whether the
  source is proven, merely claimed, or unavailable.

Success: open a package, see its modules and either its proven source or an
explicit "not verified" state, without trusting this app's database. A
third party can download the exact inputs and re-run the verification.

## Goals

1. Read what Supra already stores: every package's `source_digest` and
   `manifest`, and the source text when it was published with `sparse`/`all`.
2. Verify a package by recompiling it and comparing module bytecode against the
   chain. Cover `none`.
3. Store the verified source and its verification inputs so later reads are
   fast and re-executable.
4. Invalidate on upgrade: a verification belongs to a specific
   `upgrade_number`, not to an address.
5. Never let an untrusted source bundle steer the compiler into reading local
   files or fetching arbitrary URLs.
6. Show the difference between "bytecode matches", "digest matches", and
   "we could not reproduce it with the current toolchain".

## Non-goals (v1)

- Decompiling unverified modules (Revela). It is a useful fallback, but it is
  not proof and is not part of this build.
- On-chain attestations or a registry module. The verification result lives in
  D1 and in a downloadable, content-addressed bundle. On-chain attestation can
  come later.
- Claiming a package with a wallet signature. Anyone may verify; the record says
  who submitted it.
- Archiving every historical Supra compiler. v1 records the compiler version
  that ran and reports a mismatch honestly. A compiler matrix is v1.1.
- Verifying Move scripts. Packages only.
- Automatic background re-verification after every upgrade. v1 detects staleness
  on read and lets the user re-run.

## Anti-goals

- A "verified" badge derived from `source_digest` alone. The publisher supplies
  that digest and the chain does not recompute it.
- Using an uploaded `Move.toml` to decide dependencies. The on-chain manifest is
  the reference.
- Public write access to the source bucket.
- Storing a result without the exact inputs and toolchain that produced it.
- Treating "did not reproduce" as "the source is fake". Toolchain drift and
  moving dependency branches produce the same symptom.

## Constraints

- The Move compiler only exists on the VPS (`move-compile.hoglet.xyz`), which is
  serialised (one compile at a time, 300 s upstream timeout). A Worker cannot
  compile.
- The compile service fetches dependencies declared in `Move.toml`. That is both
  how reproducibility happens and the main attack surface.
- Supra RPC v3 serves `bytecode` and `abi` per module, and the package registry
  as a resource at `0x1::code::PackageRegistry`.
- The registry's `manifest` is gzipped `Move.toml`; module `source` is gzipped
  source text; all byte fields arrive as `0x`-prefixed hex in JSON.
- `[dependencies.X] rev` in real manifests is a branch (`dev`, `main`,
  `mainnet`), not a commit. Branch heads move.
- D1: 2 MB per row, 10 GB per database. R2 is for blobs.
- The app has no database today. `lib/storage.ts` is explicit that state lives in
  the browser. This feature introduces the first D1/R2 usage.
- 13 locales, no configured fallback: a missing key renders the key.
- Existing `validateFiles` caps: 60 files, 2 MB per file, 5 MB request body.

## What we verified about Supra (evidence)

These were checked against mainnet, not assumed:

1. Supra inherits Aptos's `0x1::code` package registry. At
   `0x3045d27b5fada1e30897a741fb184e48ef0bff3717aea23918ebc1e5c7153083`:
   - `amm` (13 modules, `upgrade_number` 76) has `source` empty for every module
     — published with `none` — but still has `manifest` and `source_digest`.
   - `RazorLibs` (26 modules) has the full gzipped source for every module.
2. The framework packages at `0x1` (`MoveStdlib` 11, `AptosStdlib` 33,
   `SupraFramework` 72, `SupraStdlib` 9) all carry their source on chain.
3. `source_digest` is reproducible:
   - SHA-256 of each `.move` file under `sources/` and `scripts/`, plus the
     `Move.toml`, as uppercase hex;
   - sort those hashes alphabetically;
   - concatenate and SHA-256 again.
   Recomputing `RazorLibs` from the on-chain sources and manifest produced
   exactly `555FBD6AFEE8300521A8586799FC4CE005BFF548AC0F71E11D309249E7D764C9`,
   matching the on-chain value.
   `tests/` is only included in dev mode, so a normal publish does not hash it.
4. `source_digest` is publisher-supplied. `code::publish_package` validates it as
   UTF-8 but does not recompute it. It is a commitment, not a proof.
5. Real manifests contain `local` dependencies. `amm` has
   `[dependencies.RazorLibs] local = "../amm_libs"`, which is exactly the kind
   of path a verifier must never take from an upload.

## Approaches considered

**A. Read-only: show what the chain already has.**
Fetch the registry, show `manifest`, `source_digest`, and the source text when
present. No compile. Cheap and immediate, but it cannot cover `none` and cannot
prove bytecode.

**B. Recompile and compare bytecode (chosen, with C).**
Submit sources, build with the Supra toolchain, compare each module's `.mv` with
the on-chain bytes. The only path that works for `none` and the only strong
claim.

**C. Registry (chosen, with B).**
Persist the verified bundle, the inputs and the result so reads are instant and
anyone can re-run. Without it, every view pays a compile and `none` sources are
lost as soon as the tab closes.

**D. Decompiler fallback (deferred).**
Useful for unknown modules, not proof. Out of v1.

Decision: B + C as the product, A as the automatic path for `sparse` packages
and as the fallback view. D later.

## Chosen design

### Surfaces

A dedicated page, `/[locale]/verify`, with an address bar:

1. Paste an address or arrive with `?address=`. The page lists the packages in
   that address's registry.
2. Each package row shows: name, `upgrade_number`, module count, verification
   state, and whether the source came from the chain or from a submission.
3. Opening a package shows its modules and a read-only source viewer.
4. If the package is `none` or unverified, the page offers "Submit sources":
   drag a folder / pick files, then verify. The on-chain `Move.toml` is shown
   read-only; the submitter does not provide it.
5. A "Download inputs" action returns the exact bundle and a `verify.json`.

The interactor gets one link per package ("View verified source") pointing at
this page. The interactor wizard is not otherwise changed.

### Data model (D1)

Database: `hoglet-move-verify` (new, dedicated; do not reuse another project's
database).

```sql
CREATE TABLE package_verifications (
  network          TEXT    NOT NULL,  -- 'mainnet' | 'testnet'
  address          TEXT    NOT NULL,  -- lowercase 0x-prefixed
  package_name     TEXT    NOT NULL,
  upgrade_number   INTEGER NOT NULL,
  status           TEXT    NOT NULL,  -- 'pending' | 'verified' | 'failed'
  exact_source     INTEGER NOT NULL DEFAULT 0,
  source_digest    TEXT    NOT NULL,  -- from chain, uppercase
  computed_digest  TEXT,              -- uppercase, null if not computed
  bundle_sha256    TEXT,              -- R2 key, null until verified
  compiler_version TEXT,              -- as reported by the compile service
  framework_rev    TEXT,              -- what the manifest said, plus any pin
  onchain_modules  TEXT,              -- JSON: { name: sha256(bytecode) }
  error            TEXT,              -- compiler or mismatch detail
  submitted_by     TEXT,              -- optional address, null for anonymous
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (network, address, package_name, upgrade_number)
);

CREATE INDEX idx_verifications_address
  ON package_verifications (network, address);
```

Rules:

- One row per package per upgrade. An upgrade invalidates the row by key, not by
  mutation.
- A `verified` row is immutable, with two exceptions:
  - a bundle that matches the on-chain `source_digest` replaces a verified row
    that was only bytecode-equivalent (`exact_source = 0` → `1`);
  - a `failed` row may be replaced by a successful attempt.
- Never overwrite an `exact_source = 1` row with a different bundle.
- `onchain_modules` stores the bytecode hash seen at verification time, so a
  read can tell "the chain changed" from "the row is stale".

### R2 layout

Bucket: `hoglet-move-sources` (new, private).

```
bundles/<bundle_sha256>.json   # canonical input + result, content-addressed
```

`bundle.json`:

```json
{
  "version": 1,
  "network": "mainnet",
  "address": "0x...",
  "package": "amm",
  "upgrade_number": 76,
  "files": { "sources/amm.move": "..." },
  "manifest": "[package]\nname = \"amm\"\n...",
  "verification": {
    "status": "verified",
    "exact_source": true,
    "source_digest": "711C...",
    "computed_digest": "711C...",
    "compiler_version": "unknown",
    "framework_rev": "dev@<resolved-or-null>",
    "onchain_modules": { "amm_controller": "sha256..." }
  }
}
```

The key is the SHA-256 of the canonical JSON (sorted file paths, stable
serialisation). The object is immutable. Downloads go through a route, not a
public bucket, so the bucket cannot be used as free hosting. The download route
can serve the JSON as-is and a `.zip` generated on demand from `files` +
`manifest` using the existing `createZip` writer.

### Provisioning and the dev loop

- Create both resources in the account that already runs this Worker. Commit
  the database id and bucket name in `wrangler.jsonc` as bindings
  (`MOVE_VERIFY_DB`, `MOVE_SOURCES`).
- Migrations live in `migrations/` and are applied with
  `wrangler d1 migrations apply` locally and before deploy. The deploy script
  stays explicit; do not make `next build` mutate a database.
- `pnpm dev` is plain `next dev` and has no bindings. The page must degrade:
  Phase 1 (read-only chain source) works, the verify action shows
  "verification unavailable in dev". `pnpm preview` (OpenNext) is the path for
  exercising D1/R2 end to end. No binding shim and no second database library.
- `pnpm cf-typegen` after adding bindings, so `CloudflareEnv` types the new
  resources.

### Networks

Mainnet and testnet are both allowed. The network only selects the RPC and the
stored key; the compiler gets its framework branch from the package's on-chain
manifest (`rev = "mainnet"` / `"testnet"` / `"dev"`). There is no second
toolchain. The end-to-end fixture is mainnet because that is where the evidence
was collected; a testnet package is best-effort until one is verified.

### Verification pipeline

Input: `network`, `address`, `package_name`, `files` (sources only, optional
dependency sources), optional `framework_commit`.

1. **Resolve the package from chain.** Read
   `GET {rpc}/rpc/v3/accounts/{address}/resources`, find
   `0x1::code::PackageRegistry`, select `package_name`. Read
   `upgrade_number`, `source_digest`, `manifest`, and the module names.
2. **Cache check.** If D1 has a `verified` row for this
   `(network, address, package_name, upgrade_number)` and the on-chain registry
   still reports the same `upgrade_number`, return it. No compile.
3. **Build the input set.**
   - The manifest is the on-chain one, ungzipped. Never the upload.
   - Files are `sources/**` and `scripts/**` from the upload. `tests/**` and
     `doc/**` are accepted but ignored (they do not affect the release digest or
     the bytecode).
   - For `sparse` packages, step 2 can be skipped entirely: the chain already
     has the sources. Fetch them, decompress, and use them as the input.
4. **Digest check.** Compute the digest over the manifest + submitted source
   files with the algorithm above. `exact_source = computed === on-chain`.
5. **Compile.** Call the existing compile proxy path with the manifest and
   files. The manifest is sanitised first (see Security):
   - framework dependencies stay `git` but are pinned to a commit when one is
     known; otherwise the branch `rev` is used and recorded as unpinned;
   - `local` dependencies are rewritten to bundled directories under
     `deps/<name>`; the submitter must include those directories, or the
     on-chain source for that dependency is used when available;
   - `local` paths that escape the bundle are rejected.
6. **Compare.** For every module name in the registry:
   - find the compiled module by `address::name` (the compile service returns
     `address::name` ids and bytecode in the same order);
   - compare lowercase hex against the on-chain module bytecode;
   - all must match. Record the first differing byte offset for the error report.
7. **Store.** On success, write `bundle.json` to R2 under its hash, then upsert
   D1. On failure, write only the D1 `failed` row with the reason; do not store
   the bundle.
8. **Return** the state, the per-module hashes, and a link to the source.

The `source_digest` match and the bytecode match are independent. Cases:

| digest | bytecode | state |
|---|---|---|
| match | match | `verified`, `exact_source = 1` |
| different | match | `verified`, `exact_source = 0` ("equivalent source") |
| match | no match | `exact_source = 1`, not verified — "source matches the publisher's commitment, bytecode not reproduced (toolchain/dependency drift)" |
| different | no match | `failed` |

The third row is the honest one: it does not call a genuine source fake.

### Cache and read path

`GET /api/verify/{network}/{address}`:

1. One RPC read of the registry at the address.
2. One D1 read for the address's packages.
3. Join. A package whose D1 `upgrade_number` is lower than the chain's is marked
   stale. No compile on read.
4. `Cache-Control: no-store` for v1. The middleware geoblocks by country and
   the response is jurisdiction-dependent; a public edge cache would risk
   serving a restricted client from a permitted client's cache entry. Revisit
   only after the geoblock decision is made.

`GET /api/verify/{network}/{address}/{package}` returns the package detail and,
if a bundle exists, the file list plus a source URL. The source body comes from
`GET /api/verify/bundle/{sha256}` so the JSON stays small.

For `sparse` packages with no D1 row, the read path can still show the on-chain
source immediately, labelled "published source (not yet bytecode-verified)".
This is the Phase 1 quick win and needs no compile.

### Reproducibility

The result is only as good as the build inputs. v1:

- Use the on-chain manifest, so named addresses and dependency declarations are
  exactly what was published.
- Record the compiler version reported by the compile service. If the service
  does not report one, add it there; until then record `unknown` and say so in
  the UI.
- Record the dependency `rev` used, and whether it was a commit or a branch.
- Try the current toolchain and the manifest's branch heads. If the build
  matches, verified. If not, do not claim fraud.

Scope on local dependencies, explicitly:

- The verifier needs a **verify-mode** validator, not `validateFiles`. It must
  accept the injected on-chain manifest, ignore an uploaded `Move.toml`, and
  allow `deps/<name>/**` so a rewritten `[dependencies.X] local = "deps/X"`
  resolves. `validateFiles` keeps its current rules for the IDE compile path.
- v1 supports `local` dependencies only when the submitter includes the
  dependency tree in the upload and the compile service writes the file map
  verbatim into the package root. If the service rejects or rewrites `deps/`,
  those packages are reported as "cannot reproduce yet" with the reason, not as
  failures. The evidence package `amm` is in this group.
- Packages whose dependencies are all `git` (framework included) are the
  straightforward v1 case: nothing extra is uploaded, and the manifest's `rev`
  is used and recorded.

v1.1 (explicitly deferred, but the data model supports it):

- Archive compiler versions (container images) and let the verifier try a
  recorded/specified version.
- Resolve a branch to the commit that was current at the package's publish or
  upgrade timestamp, using the transaction time and the framework repository
  history.
- Persist the resolved commit in `framework_rev` and in `bundle.json`.

Automatic dependency closure from chain (a strong future improvement): for each
dependency in the on-chain `deps` list, if that package has source on chain,
download it and use it instead of fetching git. The framework at `0x1` already
qualifies. This makes most builds offline and immune to branch drift; it is not
v1 because it needs the extra compile-service file allowance (125 framework
files exceed the current 60-file cap) and dependency-path rewriting.

### Security model

Threats and controls. The source text is not the dangerous input; the manifest
and the build process are.

| Threat | Control |
|---|---|
| Local file read via `local = "../..."` in an uploaded manifest | Never compile the uploaded manifest. Use the on-chain manifest. Rewrite `local` deps to `deps/<name>` inside the bundle; reject any path that resolves outside it. |
| SSRF / supply-chain via `git = "http://..."` in an uploaded manifest | Same: the manifest comes from chain. Before compiling, allowlist git hosts to the Supra/Hoglet framework repositories, require `https`, reject private/link-local addresses (the existing `validateFiles` already does the protocol and private-IP checks). |
| A malicious on-chain manifest (publisher-supplied) | Treat it as untrusted with the same rules. If it cannot be sanitised, refuse to compile and report why. |
| Zip bomb / path traversal / symlink | Do not accept a zip server-side. Accept the files map that the UI already produces from a folder pick; validate with the existing `validateFiles` path rules; cap total body, files and per-file size. The zip is generated only for download. |
| Compile starvation (VPS concurrency 1) | Separate rate limit for verification (suggest 3 per IP per 10 min), a per-address daily cap, and a global "one verification compile at a time" gate backed by the `pending` row. Keep the existing 503/retry semantics. Never let a verification job block the IDE: the compile service should expose a priority or a second lane, or the verifier must yield. |
| Storage abuse | Store only bundles that verified. Private bucket. Per-address cap. No public listing. |
| Cache poisoning | Immutable verified rows; the exact-source bundle wins; chain re-check before serving; a new bundle cannot replace an exact row. |
| Re-verification DoS of a verified package | The cache check returns before compiling. |
| Token leakage | The compile bearer token stays server-side, as it already does in `/api/move/compile`. |
| Arbitrary content hosting | Serve downloads through a route with `Content-Disposition: attachment`, `application/zip`/`application/json`, and no inline rendering. |

Additional limits: forward the client abort to the upstream compile; cap the
verification to the same 5 MB body as the compile proxy; keep the compile
timeout budget and return `503` when the VPS is busy rather than queueing
forever.

### API

All routes live under the app and use the existing server-side RPC and compile
helpers.

- `GET /api/verify/[network]/[address]` — packages, chain state, D1 state.
- `GET /api/verify/[network]/[address]/[package]` — package detail, modules,
  source file list, bundle hash, diff/error.
- `GET /api/verify/bundle/[sha256]` — immutable bundle (`?format=zip` for a
  zip).
- `POST /api/verify` — body `{ network, address, package, files,
  framework_commit? }`. Synchronous, like the existing compile proxy: the
  request is held for the compile, and `503` is returned when the VPS is busy so
  the client retries. There is no background worker, no Queue and no `202` in
  v1. A `pending` row is written before the upstream call as a crash marker: if
  the client disconnects or the Worker dies, the row stays `pending`; a read
  older than 15 minutes treats it as failed and allows a retry. A queue is a
  later option if concurrency becomes a problem.
- `GET /api/verify/health` — compile service reachable, D1/R2 bound. Useful for
  the page's "verification unavailable" state.

Validation: address format, network enum, package name from the registry (never
free text), file paths/extensions/sizes, no `Move.toml` in the upload (ignore it
if present), no `tests`-only payloads.

### UI

New page `app/[locale]/(dashboard)/verify/page.tsx`, client component:

- Address bar reuses `SubjectBar` in a new `verify` mode, or a minimal input;
  prefer reusing the bar so recents and locale prefix work.
- Package list: name, upgrade, module count, badge, "source on chain" / "source
  submitted" / "not verified".
- Detail: file tree (reuse `WorkspaceFileTree`) and read-only editor (reuse
  CodeMirror + `lib/move/moveLanguage.ts`).
- Submit panel: folder pick (the existing `webkitdirectory` import logic in
  `lib/move/project.ts`), a summary of what will be compiled, the on-chain
  manifest read-only, and a "Verify" button with progress (the compile can take
  minutes).
- Result states: verified, equivalent source, exact-but-not-reproduced, failed
  with the first differing module/offset, and the compiler version used.
- Download inputs (zip) and copy the bundle hash.

No new sidebar item in v1 unless the product wants one; link from the
interactor's module header and from the docs. (Decision left to the builder;
the page is reachable by URL either way.)

### i18n

New `Verify` namespace in `messages/*.json` for all 13 locales. The existing
`check:i18n` script only scans the `Governance` namespace, so add the new keys
manually and keep them in sync. No English fallback is configured.

### Phases

1. **Read-only chain source.** Registry reader, digest helper, GET routes, page
   with packages and source for `sparse`. No D1/R2 yet if the page can fetch
   live; add D1 in phase 2. Visible win: most framework-adjacent packages
   already have source on chain.
2. **Verification core.** D1 + R2, `POST /api/verify`, sanitisation, compile,
   bytecode comparison, cache read path, upload UI.
3. **Re-execution.** Content-addressed bundle, `verify.json`, download route,
   zip generation.
4. **Hardening.** Security tests, rate limits, stale/upgrade handling, failure
   copy, load behaviour when the VPS is busy.

### Testing

- Digest: a small synthetic package with a hardcoded expected digest; plus the
  real `RazorLibs` vector as a fixture or a script (26 files, ~30 KB of source)
  to prove the algorithm against the chain.
- Manifest sanitiser: table tests for `local` escaping, absolute paths,
  non-allowlisted git hosts, `http`, private IPs, branch vs commit `rev`.
- File validation: traversal, absolute, backslashes, `__proto__`, oversize,
  wrong extension, too many files.
- Comparison: hex normalisation, case, a missing module, an extra module, the
  first differing offset.
- Cache rules: verified immutable; exact replaces equivalent; failed replaced by
  success; upgrade invalidates; chain re-check.
- End-to-end script (not CI): verify one known mainnet package with a real
  source tree; assert the badge and the bundle hash. Requires the compile token
  and network.
- UI: manual, plus the existing locale/lint checks.

## Open decisions (product owner)

1. **Geoblock vs. "anyone can download".** `middleware.ts` returns `403` for
   every `/api/*` and every page in `RESTRICTED_REGIONS`. The verify endpoints
   and the bundle download inherit that. Either the promise is scoped to
   permitted jurisdictions, or `/api/verify/*` (and the page) are whitelisted in
   the middleware. This is a legal/product call, and it changes the API surface
   and the copy.
2. **Compile VPS scope.** Does this project own changes to the VPS (a reported
   compiler version, accepting a `deps/` tree, a verification lane)? If not, v1
   is limited to `git`-only dependencies, records `compiler_version: unknown`,
   and cannot verify `amm`-style packages with `local` dependencies.

## Left to the builder

- Whether the verify page gets a sidebar entry or only an interactor link.
- Exact copy and badge wording per locale.
- The compile service's compiler-version field: add it if it is missing; the
  record needs it.
- How the VPS exposes a second compile lane (or a priority flag) so verification
  cannot starve the IDE. This is an operational decision, not an app one.
- Whether to add a `framework_commit` advanced input in v1 or defer it. The
  pipeline supports it either way.
- The R2 bucket's public/private posture and the download route's cache headers.

## Appendix: how the evidence was obtained

- `GET https://rpc-mainnet.supra.com/rpc/v3/accounts/<address>/resources` and
  filter `type == "0x1::code::PackageRegistry"`.
- `GET https://rpc-mainnet.supra.com/rpc/v3/accounts/<address>/modules?count=100`
  for bytecode and ABI.
- `0x3045d27b5fada1e30897a741fb184e48ef0bff3717aea23918ebc1e5c7153083`:
  `amm` (none) and `RazorLibs` (sparse) in one registry.
- `0x1` registry: all four framework packages carry source.
- Digest recomputation matched `RazorLibs` exactly; algorithm source is
  `move-package/src/resolution/digest.rs` (SHA-256 of sorted uppercase per-file
  SHA-256, including `Move.toml`).
- `code::publish_package` checks metadata well-formedness (UTF-8, empty
  extensions) but does not recompute `source_digest`.
