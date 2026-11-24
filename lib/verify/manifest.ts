export interface SanitizedManifest {
  manifest: string;
  localDeps: string[];
  gitDeps: { name: string; git: string; rev: string }[];
}

export type ManifestResult = ({ ok: true } & SanitizedManifest) | { ok: false; error: string };

const PRIVATE_HOST =
  /localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254\.|\b10\.|\b192\.168\.|\b172\.(1[6-9]|2[0-9]|3[0-1])\.|\[::1\]/i;

const DEP_KEYS = new Set(["git", "rev", "subdir", "local", "version"]);

/** Removes a trailing `# comment` that is not inside a quoted value. */
function stripComment(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === "#" && !quoted && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line.trimEnd();
}

function safeRelative(value: string): boolean {
  return (
    Boolean(value) &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !value.split("/").some((part) => part === "..")
  );
}

/**
 * Rewrites the on-chain manifest before it is handed to the compiler.
 *
 * `local` dependencies are never used as written: they become `deps/<name>`,
 * which is where the submitter's dependency tree lives. That removes the path
 * from the build entirely, so a relative `../` is harmless. `git` deps must be
 * `https://github.com/...`; private hosts are refused as well, for a clear
 * error rather than a subtle hostname comparison.
 *
 * The parser fails closed: a shape it does not understand inside a dependency
 * section is an error, not a line that slips through.
 */
export function sanitizeManifest(
  manifest: string,
  opts: { frameworkCommit?: string; providedDeps?: string[] } = {}
): ManifestResult {
  if (opts.frameworkCommit && !/^[0-9a-fA-F]{40}$/.test(opts.frameworkCommit)) {
    return { ok: false, error: "framework commit must be 40 hex characters" };
  }

  const lines = manifest.split("\n");
  const localDeps: string[] = [];
  const gitDeps: { name: string; git: string; rev: string }[] = [];
  let dep: string | null = null;
  let inDev = false;
  let inRootDependencies = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const code = stripComment(line);
    const header = code.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      const section = header[1].trim();
      inDev = section === "dev-dependencies" || section.startsWith("dev-dependencies.");
      inRootDependencies = section === "dependencies";
      const dependency = section.match(/^dependencies\.([A-Za-z_][A-Za-z0-9_]*)$/);
      dep = inDev || inRootDependencies ? null : dependency ? dependency[1] : null;
      continue;
    }
    if (inDev) continue;
    if (inRootDependencies) {
      if (code.trim()) return { ok: false, error: "inline dependency tables are not supported" };
      continue;
    }
    if (!dep) continue;

    const key = code.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (key && !DEP_KEYS.has(key[1])) {
      return { ok: false, error: `unsupported dependency key ${key[1]} in ${dep}` };
    }
    if (code.trim() && !key) {
      return { ok: false, error: `unsupported line in dependency ${dep}` };
    }

    const bundled = opts.providedDeps?.includes(dep) === true;

    const local = code.match(/^(\s*)local\s*=\s*"([^"]*)"\s*$/);
    if (local) {
      const value = local[2];
      if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
        return { ok: false, error: `unsafe local dependency in ${dep}` };
      }
      lines[i] = `${local[1]}local = "deps/${dep}"`;
      if (!localDeps.includes(dep)) localDeps.push(dep);
      continue;
    }
    if (code.trim().startsWith("local")) {
      return { ok: false, error: `malformed local dependency in ${dep}` };
    }

    const git = code.match(/^(\s*)git\s*=\s*"([^"]*)"\s*$/);
    if (git) {
      if (bundled) {
        lines[i] = `${git[1]}local = "deps/${dep}"`;
        if (!localDeps.includes(dep)) localDeps.push(dep);
        continue;
      }
      const value = git[2];
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return { ok: false, error: `invalid git dependency in ${dep}` };
      }
      if (url.protocol !== "https:" || url.hostname !== "github.com" || PRIVATE_HOST.test(value)) {
        return { ok: false, error: `unsafe git dependency in ${dep}: ${value}` };
      }
      const existing = gitDeps.find((d) => d.name === dep);
      if (existing) existing.git = value;
      else gitDeps.push({ name: dep, git: value, rev: "" });
      continue;
    }
    if (code.trim().startsWith("git")) {
      return { ok: false, error: `malformed git dependency in ${dep}` };
    }

    const rev = code.match(/^(\s*)rev\s*=\s*"([^"]*)"\s*$/);
    if (rev) {
      if (bundled) {
        lines[i] = "";
        continue;
      }
      const value = rev[2];
      if (value.startsWith("-") || !/^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/.test(value)) {
        return { ok: false, error: `invalid rev in ${dep}` };
      }
      const existing = gitDeps.find((d) => d.name === dep);
      if (existing) existing.rev = value;
      else gitDeps.push({ name: dep, git: "", rev: value });
      continue;
    }
    if (code.trim().startsWith("rev")) {
      return { ok: false, error: `malformed rev in ${dep}` };
    }

    const subdir = code.match(/^(\s*)subdir\s*=\s*"([^"]*)"\s*$/);
    if (subdir) {
      if (bundled) {
        lines[i] = "";
        continue;
      }
      if (!safeRelative(subdir[2])) {
        return { ok: false, error: `unsafe subdir in ${dep}` };
      }
      continue;
    }
    if (code.trim().startsWith("subdir")) {
      return { ok: false, error: `malformed subdir in ${dep}` };
    }
  }

  if (opts.frameworkCommit) {
    let current: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      const code = stripComment(lines[i]);
      const header = code.match(/^\s*\[([^\]]+)\]\s*$/);
      if (header) {
        current = header[1].startsWith("dependencies.")
          ? header[1].slice("dependencies.".length)
          : null;
        continue;
      }
      if (!current) continue;
      const target = gitDeps.find((d) => d.name === current);
      if (!target || !/github\.com\/Entropy-Foundation\/aptos-core/i.test(target.git)) continue;
      const rev = code.match(/^(\s*)rev\s*=\s*"[^"]*"\s*$/);
      if (rev) {
        lines[i] = `${rev[1]}rev = "${opts.frameworkCommit}"`;
        target.rev = opts.frameworkCommit;
      }
    }
  }

  return { ok: true, manifest: lines.join("\n"), localDeps, gitDeps };
}
