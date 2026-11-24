/**
 * Reads a folder pick into the file map the verify API expects.
 *
 * The browser adds the picked folder's own name to every path, so one common
 * root segment is stripped. A flat `sources/` pick is normalised back under
 * `sources/`, and the root `Move.toml` is dropped because the chain supplies it.
 */
export async function readFolderFiles(input: HTMLInputElement): Promise<Record<string, string>> {
  const raw: Record<string, string> = {};
  for (const file of Array.from(input.files ?? [])) {
    const path = String((file as any).webkitRelativePath || file.name).replace(/\\/g, "/");
    if (!/\.(move|toml)$/i.test(path)) continue;
    raw[path] = await file.text();
  }

  const paths = Object.keys(raw);
  const root = paths[0]?.split("/")[0] ?? "";
  const common = root && paths.every((p) => p.startsWith(`${root}/`));

  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(raw)) {
    const trimmed = common ? path.slice(root.length + 1) : path;
    if (trimmed === "Move.toml") continue;
    if (trimmed.endsWith(".move") && !trimmed.includes("/")) out[`sources/${trimmed}`] = content;
    else out[trimmed] = content;
  }
  return out;
}
