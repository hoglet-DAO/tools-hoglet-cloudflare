const MAX_FILES = 200;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function pathError(path: string): string | null {
  if (!path || path.length > 150) return `invalid path "${path}"`;
  if (!/^[A-Za-z0-9_\-./]+$/.test(path)) return `invalid characters in path "${path}"`;
  if (path.startsWith("/") || path.includes("\\") || path.includes("//")) {
    return `invalid path format "${path}"`;
  }
  const parts = path.split("/");
  if (parts.some((part) => part === "." || part === ".." || part.startsWith("."))) {
    return `invalid path traversal in "${path}"`;
  }
  if (parts.some((part) => part === "__proto__" || part === "constructor" || part === "prototype")) {
    return `invalid path "${path}"`;
  }
  return null;
}

function isAllowed(path: string): boolean {
  if (/^sources\/.+\.move$/.test(path)) return true;
  if (/^scripts\/.+\.move$/.test(path)) return true;
  const dep = path.match(/^deps\/([A-Za-z_][A-Za-z0-9_]*)\/(.+)$/);
  if (!dep) return false;
  if (dep[2] === "Move.toml") return true;
  return /^(sources|scripts)\/.+\.move$/.test(dep[2]);
}

/**
 * Validation for a verification upload.
 *
 * Stricter in one way and looser in another than `validateFiles`: the root
 * manifest is rejected because the chain supplies it, and a `deps/<name>/`
 * tree is allowed because a package with `local` dependencies needs it.
 */
export function validateVerifyFiles(
  files: unknown
): { ok: true; files: Record<string, string> } | { ok: false; error: string } {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    return { ok: false, error: "files must be an object mapping path to source" };
  }
  const entries = Object.entries(files as Record<string, unknown>);
  if (entries.length === 0) return { ok: false, error: "files is empty" };
  if (entries.length > MAX_FILES) {
    return { ok: false, error: `too many files: maximum allowed is ${MAX_FILES}` };
  }

  const clean: Record<string, string> = Object.create(null);
  for (const [path, content] of entries) {
    if (path === "Move.toml") {
      return { ok: false, error: "the root manifest comes from chain" };
    }
    const bad = pathError(path);
    if (bad) return { ok: false, error: bad };
    if (typeof content !== "string") return { ok: false, error: `file "${path}" must be a string` };
    if (content.length > MAX_FILE_BYTES) {
      return { ok: false, error: `file "${path}" exceeds 2MB limit` };
    }
    if (!isAllowed(path)) {
      return {
        ok: false,
        error: `invalid path "${path}": only sources/, scripts/ and deps/<name>/ are allowed`,
      };
    }
    clean[path] = content;
  }

  return { ok: true, files: clean };
}
