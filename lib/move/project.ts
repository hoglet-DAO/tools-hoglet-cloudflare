/**
 * A Move project: the files that make up one deployable package.
 *
 * One project equals one package equals one deployment. The Resource Account it targets is derived from
 * `(creator, label)`, where the label is the package name — so a creator can deploy many packages, one per
 * name, and each lands on its own account.
 *
 * That is why a project carries an id of its own rather than being keyed by the creator. Keying by creator
 * kept exactly one package, so naming a second one silently dropped the label of the first: the deployment
 * stayed on-chain, but the browser lost the only local record of which label produced which address.
 *
 * `Move.toml` is generated, never authored. It is fully determined by the package name and the target
 * address, and letting the user edit it is the one way to produce a package that compiles against an
 * address the deploy will then reject.
 */

import {
  readStored,
  removeStored,
  writeStored,
  STORAGE_KEYS,
  type StorageFailure,
  type WriteResult,
} from "@/lib/storage";

export interface MoveModule {
  /** Relative path inside the package, e.g. `sources/Pool.move`. */
  path: string;
  source: string;
}

/**
 * Everything the compile and export pipelines need.
 *
 * Separate from `MoveProject` because storage identity has nothing to do with building: a project read from
 * an imported folder has no id yet, and passing one around would suggest it did.
 */
export interface ProjectContent {
  /** `Move.toml` `[package] name`; also the named address the modules live under. */
  name: string;
  /**
   * Optional seed override for the derived address.
   *
   * The deploy label is normally the package name, but the two are separable: the label is the seed the
   * factory hashes with the creator to pick the Resource Account, while the name is only the package's own
   * label. Pinning it lets a project keep the same address across a rename, or reproduce the address
   * already deployed on another network, without renaming the package. Empty means "use `name`".
   */
  seed?: string;
  /** Target Resource Account. Derived from `(creator, seed || name)`, read-only in the UI. */
  address: string;
  modules: MoveModule[];
  /**
   * User-edited manifest, or null to use the generated one.
   *
   * Stored separately rather than overwriting a generated field so changing the package name or the target
   * address can still regenerate a clean manifest, and so "reset" is a single null.
   */
  tomlOverride?: string | null;
}

/** A stored project: its content plus the identity that keeps several of them apart. */
export interface MoveProject extends ProjectContent {
  id: string;
  updatedAt: number;
}

/** What the project selector needs, without loading every package's sources. */
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
}


/** Supra framework dependency block, identical in every generated package. */
export const SUPRA_DEPENDENCY = `[dependencies.SupraFramework]
git = "https://github.com/Entropy-Foundation/aptos-core.git"
rev = "dev"
subdir = "aptos-move/framework/supra-framework"`;

/**
 * Builds the `Move.toml` for a project.
 *
 * The named address must equal the Resource Account the modules are published to: a Move module's self
 * address is fixed into its bytecode at compile time, and `code::publish_package` rejects a module whose
 * self address differs from the publishing account. Getting this wrong produces a package that compiles
 * cleanly and then fails on publish.
 */
export function buildMoveToml(name: string, address: string): string {
  return `[package]
name = "${name}"
version = "0.0.1"

[addresses]
${name} = "${address}"

${SUPRA_DEPENDENCY}
`;
}

/**
 * Turns a project into the `files` map the compile service expects.
 *
 * Paths are validated on the way out as well as on the way in: a module path is user-supplied here (the
 * tree lets them rename a file), and `..` in one would be rejected by the proxy only after the request
 * was already sent.
 */
export function projectToFiles(project: ProjectContent): Record<string, string> {
  const files: Record<string, string> = {
    // The override wins when present, but only after the same path checks as a module: the manifest is
    // user-supplied text now, and it lands in the same request that uploads the sources.
    "Move.toml": project.tomlOverride ?? buildMoveToml(project.name, project.address),
  };
  for (const m of project.modules) {
    const path = m.path.trim();
    if (!path || path.startsWith("/") || path.includes("\\")) continue;
    const parts = path.split("/");
    if (parts.includes("..") || parts.includes(".")) continue;
    files[path] = m.source;
  }
  return files;
}

/** Move identifiers allow this subset; anything else would not compile as a file name. */
export function isValidModulePath(path: string): boolean {
  if (!path || path.length > 120) return false;
  // The dot is load-bearing: without it `.move` was rejected and NO module path could ever be valid,
  // so the tree's "add module" button would refuse every input. That in turn means `.` has to be checked
  // by segment — a plain charset test cannot tell `Pool.move` from `..`.
  if (!/^[A-Za-z0-9_\-./]+$/.test(path)) return false;
  if (!path.startsWith("sources/")) return false;
  if (path.endsWith("/")) return false;
  if (path.split("/").some((seg) => seg === "." || seg === "..")) return false;
  return /\.move$/.test(path);
}

/** Package names become named addresses, so they are restricted to identifier characters. */
export function isValidPackageName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,38}$/.test(name);
}

/** `Pool` -> `sources/Pool.move`. Keeps the tree predictable without asking for an extension. */
export function modulePathFor(identifier: string): string {
  return `sources/${identifier.replace(/\.move$/, "")}.move`;
}

/**
 * Minimal TOML reader for the parts of a manifest that matter here.
 *
 * Deliberately not a full parser: it only needs `[package] name`, the `[addresses]` table and the
 * dependency tables, and those are all top-level `key = value` lines under a bracketed header.
 */
export interface ParsedDependency {
  name: string;
  git?: string;
  rev?: string;
  subdir?: string;
  local?: string;
}

export interface ParsedToml {
  packageName: string;
  addresses: Record<string, string>;
  /** Full dependency tables, not just names: the git URL and rev are what the compiler's allowlist checks. */
  dependencies: ParsedDependency[];
}

/** Strips a trailing comment, respecting quoted values that may legitimately contain `#`. */
function stripComment(line: string): string {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") inQuote = !inQuote;
    if (ch === "#" && !inQuote) return line.slice(0, i);
  }
  return line;
}

export function parseToml(toml: string): ParsedToml {
  const out: ParsedToml = { packageName: "", addresses: {}, dependencies: [] };
  let section = "";
  let currentDep: ParsedDependency | null = null;

  for (const rawLine of toml.split("\n")) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;

    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      section = header[1].trim();
      const dep = section.match(/^dependencies\.(.+)$/);
      if (dep) {
        currentDep = { name: dep[1].trim() };
        out.dependencies.push(currentDep);
      } else {
        currentDep = null;
      }
      continue;
    }

    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.+)$/);
    if (!kv) continue;
    const value = kv[2].trim().replace(/^["']|["']$/g, "");

    if (section === "package" && kv[1] === "name") out.packageName = value;
    else if (section === "addresses") out.addresses[kv[1]] = value;
    else if (currentDep) {
      if (kv[1] === "git") currentDep.git = value;
      else if (kv[1] === "rev") currentDep.rev = value;
      else if (kv[1] === "subdir") currentDep.subdir = value;
      else if (kv[1] === "local") currentDep.local = value;
    }
  }

  return out;
}

/**
 * The named addresses the sources actually declare their modules under.
 *
 * This is the precise thing the compiler cares about. `[package] name` and the keys of `[addresses]` are
 * conventionally the same string but they are different fields, and a check that tied them together
 * reported a broken manifest whenever the user renamed the package without also renaming the address key
 * — a rename that is legal and that the toolchain accepts.
 *
 * A module declared as `module 0x1::foo` uses a literal address, not a named one, so it is not collected:
 * there is no name for the manifest to bind.
 */
export function addressNamesUsedByModules(sources: string[]): string[] {
  const names = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/^\s*module\s+([A-Za-z_][A-Za-z0-9_]*)\s*::/gm)) {
      names.add(m[1]);
    }
  }
  return [...names];
}

/** Escapes a package name for use inside a RegExp. Names are identifiers, but this stays honest. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrites every reference to one package name into another, inside a source file.
 *
 * Covers both forms a self-reference takes: the declaration (`module my_pkg::x`) and an intra-package
 * import (`use my_pkg::other`). Renaming the package without this left the sources declaring a named
 * address that no longer existed, so the package stopped compiling — the rename looked applied in the
 * form and was not applied where it mattered.
 *
 * The leading boundary keeps `my_package::` from matching inside `not_my_package::`.
 */
export function renamePackageInSource(source: string, from: string, to: string): string {
  if (!from || !to || from === to) return source;
  const re = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(from)}::`, "g");
  return source.replace(re, `$1${to}::`);
}

/**
 * Renames the package and its named address inside an edited manifest.
 *
 * Applied to an override only, so the generated manifest — which already derives both from the current
 * name — is never rewritten. Without it, renaming the package left the override binding the old address
 * key and the manifest became inconsistent with the sources it describes.
 */
export function renamePackageInToml(toml: string, from: string, to: string): string {
  if (!from || !to || from === to) return toml;
  let section = "";
  return toml
    .split("\n")
    .map((line) => {
      const header = line.trim().match(/^\[([^\]]+)\]$/);
      if (header) {
        section = header[1].trim();
        return line;
      }
      const kv = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*=\s*)(.*)$/);
      if (!kv) return line;
      const [, indent, key, eq, rest] = kv;
      if (section === "package" && key === "name") return `${indent}name${eq}"${to}"`;
      if (section === "addresses" && key === from) return `${indent}${to}${eq}${rest}`;
      return line;
    })
    .join("\n");
}
export const FRAMEWORK_GIT = "https://github.com/Entropy-Foundation/aptos-core";
export const FRAMEWORK_SUBDIR = "aptos-move/framework/supra-framework";
export const FRAMEWORK_DEP = "SupraFramework";
/** The cached revision. Anything else is uncached: slower, and it burns VPS disk. */
export const FRAMEWORK_REV = "dev";

/**
 * Extracts `owner/repo` from the git URL forms a Move.toml may contain.
 *
 * Handles https, the `git@host:owner/repo` SSH form, a bare `host/owner/repo`, and a trailing `.git`,
 * because the manifest is user-editable and all of these resolve to the same repository.
 *
 * Used to NAME the organisation in a warning. The list of permitted organisations is deliberately not
 * mirrored here: it lives in the compile service, it can change without this file knowing, and a stale
 * copy would either block a dependency that is now allowed or wave through one that is not.
 */
export function parseGitRepo(url: string): { org: string; repo: string } | null {
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const m =
    cleaned.match(/^[a-z]+:\/\/(?:[^@/]+@)?[^/]+\/([^/]+)\/([^/]+)$/i) ||
    cleaned.match(/^git@[^:]+:([^/]+)\/([^/]+)$/i) ||
    cleaned.match(/^(?:[^/]+\.[^/]+)\/([^/]+)\/([^/]+)$/i);
  if (!m) return null;
  return { org: m[1], repo: m[2] };
}

/**
 * Git revisions that move, so a build is not reproducible and the rev cannot be pinned.
 *
 * `main` is deliberately NOT here: it is the branch the team's own dependencies are published on, so
 * flagging it was noise the user could do nothing about. Anything else that moves still warns.
 */
const MUTABLE_REVS = new Set(["master", "head"]);

/** Same repo, with or without the `.git` suffix. The service accepts both. */
function sameRepo(a: string, b: string): boolean {
  const norm = (u: string) => u.trim().toLowerCase().replace(/\.git$/, "").replace(/\/$/, "");
  return norm(a) === norm(b);
}

export interface TomlIssue {
  severity: "error" | "warning";
  message: string;
}

export interface TomlCheck {
  /** True when nothing here would stop the package from deploying. Warnings do not clear it. */
  ok: boolean;
  errors: string[];
  warnings: string[];
  parsed: ParsedToml;
}

/**
 * Checks a manifest against the compile service's rules and the target account.
 *
 * Two separate concerns, reported separately because they fail differently:
 *
 *  - **errors** stop the deploy. The named address must match the account the package is published to,
 *    because a module's self address is baked into its bytecode and `code::publish_package` rejects a
 *    mismatch — after the user has already signed.
 *
 *  - **warnings** are the things the client can actually verify: a dependency with no rev, or one pinned to
 *    a branch that moves under the build. The service's git-dependency allowlist is deliberately NOT
 *    mirrored here. It is the service's to own, a copy would drift, and every drift shows up as a false
 *    alarm on a dependency the service accepts — which is what a mirrored list did.
 */
export function validateToml(
  toml: string,
  expectedAddress: string,
  usedNames: string[] = [],
  expectedName?: string
): TomlCheck {
  const parsed = parseToml(toml);
  const errors: string[] = [];
  const warnings: string[] = [];

  // The package name is what the manifest is filed under, and the app also uses it as the named address
  // key. Missing it, or naming something other than the workspace's package, is a manifest that will not
  // deploy what the screen shows.
  if (!parsed.packageName) errors.push("missing [package] name");
  else if (expectedName && parsed.packageName !== expectedName) {
    errors.push(`[package] name is "${parsed.packageName}", expected "${expectedName}"`);
  }
  if (Object.keys(parsed.addresses).length === 0) errors.push("missing [addresses]");

  const strip = (v: string) => v.toLowerCase().replace(/^0x/, "");
  const target = strip(expectedAddress);

  /**
   * The check is on the names the modules declare, not on `[package] name`.
   *
   * A module is compiled under whatever named address its declaration uses, and that is the one the
   * toolchain stamps into the bytecode. Tying the check to `[package] name` meant a legal rename — package
   * renamed, address key kept, or the reverse — was reported as a manifest that would not deploy.
   *
   * Falling back to the package name when no sources are supplied keeps the check meaningful for a caller
   * that has no source text to hand.
   */
  const names = usedNames.length ? usedNames : parsed.packageName ? [parsed.packageName] : [];
  const unbound: string[] = [];
  const mismatched: string[] = [];

  for (const name of names) {
    const bound = parsed.addresses[name];
    if (!bound) unbound.push(name);
    else if (strip(bound) !== target) mismatched.push(name);
  }

  if (unbound.length) {
    errors.push(`[addresses] does not bind ${unbound.map((n) => `"${n}"`).join(", ")}`);
  }
  if (mismatched.length) {
    errors.push(
      `address mismatch: ${mismatched.map((n) => `"${n}"`).join(", ")} must be ${expectedAddress}`
    );
  }

  const framework = parsed.dependencies.find((d) => d.name === FRAMEWORK_DEP);
  if (!framework) {
    errors.push(`missing [dependencies.${FRAMEWORK_DEP}]`);
  } else {
    if (framework.git && !sameRepo(framework.git, FRAMEWORK_GIT)) {
      warnings.push(`${FRAMEWORK_DEP} points at a fork; only ${FRAMEWORK_GIT} is cached`);
    }
    if (framework.rev && framework.rev !== FRAMEWORK_REV) {
      warnings.push(`${FRAMEWORK_DEP} rev is "${framework.rev}"; the cached one is "${FRAMEWORK_REV}"`);
    }
    if (framework.subdir && framework.subdir !== FRAMEWORK_SUBDIR) {
      warnings.push(`${FRAMEWORK_DEP} subdir should be ${FRAMEWORK_SUBDIR}`);
    }
  }

  for (const dep of parsed.dependencies) {
    if (dep.name === FRAMEWORK_DEP) continue;

    /*
      Nothing is said about the organisation.

      There used to be a warning naming the org and hinting the service "may reject it". It fired for every
      git dependency that was not the framework, which meant it fired for the approved ones too —
      `Entropy-Foundation` and `hoglet-DAO` are both on the service's allowlist, so the warning was simply
      wrong about them. Mirroring the allowlist here is not the answer either: the service owns it, a copy
      would drift, and every drift shows up as a false alarm on a legitimate dependency.

      What the warning was guarding against costs little anyway: a dependency outside the allowlist is
      rejected with `400 git dependency not allowed` before anything is compiled, so the user is told
      precisely, and quickly, by the only party that knows.
    */
    if (dep.rev && MUTABLE_REVS.has(dep.rev.trim().toLowerCase())) {
      warnings.push(
        `"${dep.name}" is pinned to the moving branch "${dep.rev}"; a tag or a commit keeps the build reproducible`
      );
    }
    if (dep.git && !dep.rev) {
      warnings.push(
        `"${dep.name}" has no rev; the service requires one, and without it the build is not reproducible`
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings, parsed };
}

/**
 * Moves the module declaration inside a source file to follow a rename.
 *
 * The toolchain does not care: it compiled `sources/Renamed.move` while the file declared
 * `module pkg::gamma`, so a file rename is cosmetic. That is exactly why it has to be handled here —
 * without it the tree would show `Pool.move` while the module stayed `example`, and the visible name
 * would silently disagree with the published ModuleID.
 *
 * Only the leading declaration is touched, and only when it matches the file's own module. If the file
 * declares several modules, or the header does not match, the source is returned untouched rather than
 * rewritten on a guess.
 */
export function renameModuleDeclaration(source: string, moduleName: string): string {
  const head = source.match(/^\s*module\s+([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)/);
  if (!head) return source;
  const pkg = head[1];
  const name = head[2];
  const at = source.indexOf(head[0]);
  return (
    source.slice(0, at) +
    `module ${pkg}::${moduleName}` +
    source.slice(at + head[0].length)
  );
}

/** Move module names start uppercase by convention and are used verbatim in the declaration. */
export function moduleNameFromPath(path: string): string {
  const base = path.split("/").pop() || "Module";
  const stem = base.replace(/\.move$/, "");
  const cleaned = stem.replace(/[^A-Za-z0-9_]/g, "");
  const safe = cleaned && /^[A-Za-z_]/.test(cleaned) ? cleaned : `M${cleaned}`;
  return safe.charAt(0).toUpperCase() + safe.slice(1);
}

/** A source file whose module name matches its own file name, used when adding a new entry. */
export function newModuleSource(pkg: string, moduleName: string): string {
  return `module ${pkg}::${moduleName} {

}
`;
}

/**
 * A new project id.
 *
 * Random rather than derived from the name, for the same reason the storage key is not the name: a rename
 * must not move a project to a different slot, and an id that depends on the name would make the index and
 * the keys disagree the moment the user edits it.
 */
export function newProjectId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  // Only reachable in environments without Web Crypto. Uniqueness here just has to beat "one project per
  // millisecond from one browser", which a random suffix does.
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function parseProject(raw: string, id: string): MoveProject | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.modules)) return null;
    return {
      id,
      name: typeof parsed.name === "string" ? parsed.name : "package",
      seed: typeof parsed.seed === "string" ? parsed.seed : "",
      address: typeof parsed.address === "string" ? parsed.address : "",
      tomlOverride: typeof parsed.tomlOverride === "string" ? parsed.tomlOverride : null,
      modules: parsed.modules
        .filter((m: any) => m && typeof m.path === "string" && typeof m.source === "string")
        .map((m: any) => ({ path: m.path, source: m.source })),
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    // A corrupted entry should not brick the page; the user just starts a new project.
    return null;
  }
}

function readIndex(creator: string): ProjectSummary[] {
  const raw = readStored(STORAGE_KEYS.projectIndex(creator));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p: any) => p && typeof p.id === "string")
      .map((p: any) => ({
        id: p.id,
        name: typeof p.name === "string" ? p.name : "package",
        updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : 0,
      }));
  } catch {
    return [];
  }
}

function writeIndex(creator: string, list: ProjectSummary[]): WriteResult {
  return writeStored(STORAGE_KEYS.projectIndex(creator), JSON.stringify(list));
}

/**
 * The projects belonging to a creator, most recently edited first.
 *
 * Also where the pre-multi-project layout is adopted. There is exactly one such project per creator, it has
 * no id, and it is the only copy of whatever they were working on — so it is moved into the index under a
 * fresh id rather than left behind, and the old key is cleared so the adoption cannot run twice.
 *
 * Doing this here rather than in a migration pass is deliberate: this is the only way the workspace reaches
 * stored projects, so a pass elsewhere could be skipped by a code path that forgot to call it.
 */
export function listProjects(creator: string): ProjectSummary[] {
  const list = readIndex(creator);
  if (list.length) return list.sort((a, b) => b.updatedAt - a.updatedAt);

  const legacyRaw = readStored(STORAGE_KEYS.legacyProject(creator));
  if (!legacyRaw) return [];
  const id = newProjectId();
  const adopted = parseProject(legacyRaw, id);
  if (!adopted) return [];

  const migrated: ProjectSummary = { id, name: adopted.name, updatedAt: adopted.updatedAt || Date.now() };
  if (!writeStored(STORAGE_KEYS.project(creator, id), JSON.stringify(adopted)).ok) return [];
  removeStored(STORAGE_KEYS.legacyProject(creator));
  if (!writeIndex(creator, [migrated]).ok) return [];
  return [migrated];
}

export function loadProject(creator: string, id: string): MoveProject | null {
  const raw = readStored(STORAGE_KEYS.project(creator, id));
  if (!raw) return null;
  return parseProject(raw, id);
}

/**
 * Persists a project and keeps the index in step.
 *
 * The result is returned rather than swallowed. Autosave failing silently is the worst outcome for an
 * editor: the user keeps writing, believes it is saved, and finds out when the tab closes.
 *
 * The index write is the one that can fail quietly in the caller's eyes — the project itself saves either
 * way — but it is what makes the project reachable from the selector, so its failure is reported too.
 */
export function saveProject(creator: string, project: MoveProject): WriteResult {
  const updatedAt = Date.now();
  const res = writeStored(
    STORAGE_KEYS.project(creator, project.id),
    JSON.stringify({ ...project, updatedAt })
  );
  if (!res.ok) return res;

  const list = readIndex(creator);
  const entry: ProjectSummary = { id: project.id, name: project.name, updatedAt };
  const next = [entry, ...list.filter((p) => p.id !== project.id)];
  return writeIndex(creator, next);
}

export function deleteProject(creator: string, id: string): WriteResult {
  removeStored(STORAGE_KEYS.project(creator, id));
  const list = readIndex(creator).filter((p) => p.id !== id);
  return writeIndex(creator, list);
}

/**
 * A package name not already taken by another project of this creator.
 *
 * Names are the labels the addresses derive from, so two projects sharing one would target the same account
 * — the second deploy would abort, or worse, the user would not notice they had reused a label.
 */
export function nextProjectName(existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has("my_package")) return "my_package";
  for (let i = 2; i < 1000; i++) {
    const candidate = `my_package_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `my_package_${Date.now().toString(36)}`;
}


/** Re-exported so callers of this module do not also have to import from the storage registry. */
export type SaveResult = WriteResult;
export type SaveFailureReason = StorageFailure;

/**
 * A short display label for a compiled module, from its ModuleID.
 *
 * `0xabc...::Pool` becomes `Pool`, falling back to a positional name when the id is malformed. Used for the
 * deploy form's module list, where the address is the same for every entry and carries no information.
 */
export function moduleLabel(moduleId: string | undefined, index: number): string {
  const parts = (moduleId || "").split("::");
  // A ModuleID is `<address>::<module>`. A single segment means this is not one, so its last part is not a
  // module name and must not be shown as though it were — a bogus label next to real bytecode is worse than
  // an obviously positional one.
  const name = parts.length >= 2 ? parts[parts.length - 1] : "";
  return name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `module_${index + 1}`;
}

/** One file as read from a file picker. `relativePath` is present when a whole folder was selected. */
export interface ImportedFile {
  name: string;
  relativePath?: string;
  content: string;
}

export interface ImportResult {
  ok: boolean;
  project?: ProjectContent;
  error?: string;
  /** Sources that were skipped, so the caller can say how many rather than silently dropping them. */
  skipped?: string[];
}

/**
 * Builds a project from files the user picked.
 *
 * Accepts either a whole folder (`webkitdirectory`, which supplies relative paths) or a flat multi-select
 * of a manifest plus some `.move` files, because both are natural ways to hand over a package and neither
 * should require the other.
 *
 * Paths are normalised to live under `sources/`: that is where the workspace keeps modules and where the
 * compiler looks for them, so an imported tree that kept a `tests/` or a differently named directory would
 * not compile even though the files arrived intact. Anything that cannot be placed is reported instead of
 * dropped, because a partial import that looks complete is worse than a refusal.
 *
 * The manifest is imported as an override rather than regenerated. It carries the user's dependencies,
 * which cannot be reconstructed from the name and address, and it is the file the compiler reads.
 */
export function projectFromFiles(files: ImportedFile[], fallbackName?: string): ImportResult {
  if (!files.length) return { ok: false, error: "no files selected" };

  const norm = (p: string) => (p || "").replace(/\\/g, "/");
  const baseName = (p: string) => norm(p).split("/").pop() || p;
  const depth = (p: string) => norm(p).split("/").length;

  /**
   * The manifest, chosen by depth rather than by pick order.
   *
   * A folder can carry more than one `Move.toml` — a vendored dependency, a nested example — and `find`
   * took whichever the browser happened to list first, which is not a stable order and varies between
   * picks of the same folder. The package being imported is the shallowest one, so that is the one taken.
   */
  const manifest = files
    .filter((f) => baseName(f.name || f.relativePath || "") === "Move.toml")
    .sort((a, b) => depth(a.relativePath || a.name || "") - depth(b.relativePath || b.name || ""))[0];

  /**
   * The package root: the directory the manifest sits in.
   *
   * Picking a parent folder used to mix every package under it, because each source was matched by the
   * `sources/` in its own path and nothing said which package it belonged to. The manifest's directory is
   * what tells them apart, and it is also what the incoming paths are made relative to.
   */
  const root = manifest ? norm(manifest.relativePath || manifest.name || "").split("/").slice(0, -1).join("/") : "";

  /**
   * A manifest is preferred but not required.
   *
   * A package gets moved around in pieces — the `sources/` tree on its own, or a handful of `.move` files —
   * and refusing that made the import useless for the case it is most reached for. Without a manifest the
   * package takes the name already in the workspace, and the manifest is generated from it: the same one
   * the export writes, so nothing is lost by not having picked it.
   */
  const name = manifest ? parseToml(manifest.content).packageName : fallbackName || "";
  if (!isValidPackageName(name)) {
    return {
      ok: false,
      error: manifest
        ? "Move.toml has no usable [package] name"
        : "no Move.toml in the selection, and no package name to fall back on",
    };
  }

  const modules: MoveModule[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const raw = norm(file.relativePath || file.name || "");
    if (!raw || baseName(raw) === "Move.toml") continue;
    if (!/\.move$/i.test(raw)) continue;
    // A source belonging to a sibling package is not part of this one. Left out rather than reported: a
    // parent folder full of packages would otherwise produce a wall of "skipped" for files that are fine.
    if (root && !raw.startsWith(root + "/")) continue;

    /*
      Everything ends up under `sources/`, which is the one directory the compiler reads and the layout
      every Move package is expected to have.

      The path relative to the package root is kept, with only a leading `sources/` removed, so however the
      package was nested it lands in the right place: `sources/utils/Pool.move` keeps its subfolder,
      `modules/Pool.move` becomes `sources/modules/Pool.move`, and a loose file at the root becomes
      `sources/Pool.move`. Flattening instead would make two same-named modules in different folders collide
      for no reason — which is a real loss, not a safety check.
    */
    const relative = root ? raw.slice(root.length + 1) : raw;
    // `sources/` is looked for at the front of the relative path, and anywhere in the raw one when there is
    // no root to be relative to — a flat pick of the manifest, or no manifest at all. That is what a package
    // sitting on disk looks like, so it is what the path is read against.
    const already = relative.match(/^sources\/(.+)$/i) || (!root ? raw.match(/sources\/(.+)$/i) : null);
    const path = `sources/${already ? already[1] : relative}`;

    if (!isValidModulePath(path)) {
      skipped.push(raw);
      continue;
    }
    if (seen.has(path)) {
      // Two picked files claiming one path: the second is ambiguous, so it is reported rather than
      // silently overwriting the first.
      skipped.push(raw);
      continue;
    }
    seen.add(path);
    modules.push({ path, source: file.content });
  }

  if (!modules.length) {
    return { ok: false, error: "no .move sources in the selection", skipped };
  }

  return {
    ok: true,
    skipped: skipped.length ? skipped : undefined,
    project: {
      name,
      address: "",
      modules: modules.sort((a, b) => a.path.localeCompare(b.path)),
      // Null rather than a synthesized string when there was no manifest, so the workspace regenerates it
      // and the package name and target address stay the source of truth.
      tomlOverride: manifest ? manifest.content : null,
    },
  };
}

/**
 * Whether localStorage can be written at all.
 *
 * Probed once on mount so the warning appears before the user has typed anything, rather than after the
 * first autosave fails. Private mode and blocked cookies both throw on write, and neither is detectable
 * by feature-checking the object.
 */
export { canPersist } from "@/lib/storage";

/**
 * The files an export should contain: the manifest plus every source.
 *
 * Built from the same function the compiler uses, so an exported archive is byte-identical to what was
 * compiled — an export that quietly differed from the build would be worse than no export at all.
 */
export function projectToExportFiles(project: ProjectContent): { path: string; content: string }[] {
  const files = projectToFiles(project);
  return Object.keys(files)
    .sort((a, b) => (a === "Move.toml" ? -1 : b === "Move.toml" ? 1 : a.localeCompare(b)))
    .map((path) => ({ path, content: files[path] }));
}

export type StarterVariant = "basic" | "full";

/** Which templates a new project can start from, in the order the UI offers them. */
export const STARTER_VARIANTS: StarterVariant[] = ["basic", "full"];

/**
 * The module a new project starts with.
 *
 * Two sizes, because one template cannot suit both readers. `basic` is two functions and one framework
 * import: enough to call something and see a result, small enough to read in one screen. `full` adds the
 * chain clock and an entry that emits an event, which is what someone needs to try a real transaction
 * rather than only a read.
 *
 * ASCII only, and not by preference: the Move compiler rejects any non-ASCII byte in a source file
 * ("Only ASCII printable characters, tabs, lf and crlf are permitted"). A single em dash in a doc comment
 * here would have made every new project fail on its first compile.
 *
 * The file name and the module name match on purpose: `moduleNameFromPath` derives one from the other, and
 * a starter that disagreed with itself would look like a bug the first time someone renamed it.
 */
export function starterModule(pkg: string, variant: StarterVariant = "full"): MoveModule {
  return {
    path: "sources/example.move",
    source: variant === "basic" ? basicStarter(pkg) : fullStarter(pkg),
  };
}

/** Two functions, one import, no events. */
function basicStarter(pkg: string): string {
  return `module ${pkg}::example {
    use supra_framework::account;

    // True when an account has no master key left - the state a renounced account ends in.
    #[view]
    public fun is_keyless(addr: address): bool {
        account::get_authentication_key(addr) == x"0000000000000000000000000000000000000000000000000000000000000000"
    }

    // The smallest thing worth calling: no state, no framework, a result you can check by eye.
    #[view]
    public fun add(a: u64, b: u64): u64 {
        a + b
    }
}
`;
}

/** Adds the chain clock and an entry, so a transaction can be sent and not only a read. */
function fullStarter(pkg: string): string {
  return `module ${pkg}::example {
    use std::signer;
    use supra_framework::account;
    use supra_framework::event;
    use supra_framework::timestamp;

    /// Emitted by \`greet\`. Declared here so the entry below has something to say.
    #[event]
    struct Greeting has drop, store {
        who: address,
        at: u64,
    }

    // True when an account has no master key left - the state a renounced account ends in.
    #[view]
    public fun is_keyless(addr: address): bool {
        account::get_authentication_key(addr) == x"0000000000000000000000000000000000000000000000000000000000000000"
    }

    /// The chain's own clock, in microseconds. Reads live state rather than a local one, so calling it
    /// twice proves the module really is on-chain.
    #[view]
    public fun now_micros(): u64 {
        timestamp::now_microseconds()
    }

    /// The smallest thing worth calling: no state, no framework, a result you can check by eye.
    #[view]
    public fun add(a: u64, b: u64): u64 {
        a + b
    }

    /// An entry, so there is something to send as a transaction and not only something to read.
    ///
    /// Emits an event instead of storing a struct: nothing to initialise, nothing to abort on, and the
    /// result is visible in the explorer straight away. An entry that writes state would need a
    /// \`key\` struct, an \`acquires\` clause and a first-call branch, which is a lot of starter for the
    /// same lesson.
    public entry fun greet(account: &signer) {
        event::emit(Greeting {
            who: signer::address_of(account),
            at: timestamp::now_microseconds(),
        })
    }
}
`;
}