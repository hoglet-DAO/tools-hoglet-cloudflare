export interface SanitizedManifest {
  manifest: string;
  localDeps: string[];
  gitDeps: { name: string; git: string; rev: string }[];
}

export type ManifestResult = ({ ok: true } & SanitizedManifest) | { ok: false; error: string };

const PRIVATE_HOST =
  /localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254\.|\b10\.|\b192\.168\.|\b172\.(1[6-9]|2[0-9]|3[0-1])\.|\[::1\]/i;

/**
 * Rewrites the on-chain manifest before it is handed to the compiler.
 *
 * `local` dependencies are never used as written: they become `deps/<name>`,
 * which is where the submitter's dependency tree lives. That removes the path
 * from the build entirely, so a relative `../` is harmless. `git` deps must be
 * `https://github.com/...`; private hosts are refused as well, for a clear
 * error rather than a subtle hostname comparison.
 */
export function sanitizeManifest(
  manifest: string,
  opts: { frameworkCommit?: string } = {}
): ManifestResult {
  if (opts.frameworkCommit && !/^[0-9a-fA-F]{40}$/.test(opts.frameworkCommit)) {
    return { ok: false, error: "framework commit must be 40 hex characters" };
  }

  const lines = manifest.split("\n");
  const localDeps: string[] = [];
  const gitDeps: { name: string; git: string; rev: string }[] = [];
  let dep: string | null = null;
  let inDev = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      const section = header[1].trim();
      inDev = section === "dev-dependencies" || section.startsWith("dev-dependencies.");
      const dependency = section.match(/^dependencies\.([A-Za-z_][A-Za-z0-9_]*)$/);
      dep = inDev ? null : dependency ? dependency[1] : null;
      continue;
    }
    if (inDev || !dep) continue;

    const local = line.match(/^(\s*)local\s*=\s*"([^"]*)"\s*$/);
    if (local) {
      const value = local[2];
      if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
        return { ok: false, error: `unsafe local dependency in ${dep}` };
      }
      lines[i] = `${local[1]}local = "deps/${dep}"`;
      if (!localDeps.includes(dep)) localDeps.push(dep);
      continue;
    }
    if (line.trim().startsWith("local")) {
      return { ok: false, error: `malformed local dependency in ${dep}` };
    }

    const git = line.match(/^(\s*)git\s*=\s*"([^"]*)"\s*$/);
    if (git) {
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
    if (line.trim().startsWith("git")) {
      return { ok: false, error: `malformed git dependency in ${dep}` };
    }

    const rev = line.match(/^(\s*)rev\s*=\s*"([^"]*)"\s*$/);
    if (rev) {
      const value = rev[2];
      if (!/^[A-Za-z0-9._/-]+$/.test(value)) {
        return { ok: false, error: `invalid rev in ${dep}` };
      }
      const existing = gitDeps.find((d) => d.name === dep);
      if (existing) existing.rev = value;
      else gitDeps.push({ name: dep, git: "", rev: value });
      continue;
    }
    if (line.trim().startsWith("rev")) {
      return { ok: false, error: `malformed rev in ${dep}` };
    }
  }

  if (opts.frameworkCommit) {
    let current: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      const header = lines[i].match(/^\s*\[([^\]]+)\]\s*$/);
      if (header) {
        current = header[1].startsWith("dependencies.")
          ? header[1].slice("dependencies.".length)
          : null;
        continue;
      }
      if (!current) continue;
      const target = gitDeps.find((d) => d.name === current);
      if (!target || !/github\.com\/Entropy-Foundation\/aptos-core/i.test(target.git)) continue;
      const rev = lines[i].match(/^(\s*)rev\s*=\s*"[^"]*"\s*$/);
      if (rev) {
        lines[i] = `${rev[1]}rev = "${opts.frameworkCommit}"`;
        target.rev = opts.frameworkCommit;
      }
    }
  }

  return { ok: true, manifest: lines.join("\n"), localDeps, gitDeps };
}
