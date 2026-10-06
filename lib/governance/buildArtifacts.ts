/**
 * Reads Move build artifacts from disk so the lifecycle forms can submit real packages.
 *
 * The compiler lays a build out as:
 *   build/<Name>/package-metadata.bcs        -> `metadata_serialized` (vector<u8>)
 *   build/<Name>/bytecode_modules/*.mv       -> `code` (vector<vector<u8>>)
 *
 * Move RPC expects both as hex strings, so that is what these helpers return.
 */

export async function readFileAsHex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return `0x${out}`;
}

/** True for an empty selection or an empty file, both of which the contract rejects. */
export function isUsableHex(value: string | undefined | null): boolean {
  if (!value) return false;
  const body = value.startsWith("0x") ? value.slice(2) : value;
  return body.length > 0 && body.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(body);
}

/** Keeps only `.bcs` / `.mv` picks so a mis-drop does not silently produce garbage bytecode. */
export function filterBuildFiles(files: FileList | File[], ext: "bcs" | "mv"): File[] {
  return Array.from(files).filter((f) => f.name.toLowerCase().endsWith(`.${ext}`));
}

export function formatBytes(count: number): string {
  if (count < 1024) return `${count} B`;
  if (count < 1024 * 1024) return `${(count / 1024).toFixed(1)} KB`;
  return `${(count / 1024 / 1024).toFixed(2)} MB`;
}