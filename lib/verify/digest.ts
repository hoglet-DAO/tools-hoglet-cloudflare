import { sha256HexUpper } from "./sha";

function isDigestSource(path: string): boolean {
  return /^(sources|scripts)\//.test(path) && path.endsWith(".move");
}

/**
 * The package digest Supra stores as `PackageMetadata.source_digest`.
 *
 * SHA-256 of each `.move` under `sources/` and `scripts/` plus the manifest, as
 * uppercase hex, sorted and concatenated, then SHA-256 again. `tests/` is only
 * hashed in dev mode, so a normal publish excludes it.
 */
export async function sourceDigest(manifest: string, files: Record<string, string>): Promise<string> {
  const hashes = [await sha256HexUpper(manifest)];
  for (const [path, content] of Object.entries(files)) {
    if (isDigestSource(path)) hashes.push(await sha256HexUpper(content));
  }
  hashes.sort();
  return sha256HexUpper(hashes.join(""));
}
