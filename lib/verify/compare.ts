export interface ModuleCheck {
  name: string;
  ok: boolean;
  firstDiff: number | null;
}

export interface Comparison {
  ok: boolean;
  modules: ModuleCheck[];
  missing: string[];
  extra: string[];
}

function normalize(hex: string): string {
  return hex.replace(/\s+/g, "").replace(/^0x/i, "").toLowerCase();
}

function moduleNameFromId(id: string): string {
  const parts = id.split("::");
  return parts[1] ?? parts[0];
}

function firstDiff(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i++;
  return Math.floor(i / 2);
}

/** Compares every module the chain has against the compiler's output. */
export function compareModuleBytecode(
  compiled: { modules: string[]; bytecode: string[] },
  onchain: Record<string, string>
): Comparison {
  const compiledMap = new Map<string, string>();
  compiled.modules.forEach((id, i) => compiledMap.set(moduleNameFromId(id), compiled.bytecode[i] ?? ""));

  const modules: ModuleCheck[] = [];
  const missing: string[] = [];
  const extra: string[] = [];
  let ok = Object.keys(onchain).length > 0;

  for (const [name, expected] of Object.entries(onchain)) {
    const actual = compiledMap.get(name);
    if (actual === undefined) {
      missing.push(name);
      ok = false;
      continue;
    }
    const a = normalize(actual);
    const b = normalize(expected);
    const same = a === b;
    if (!same) ok = false;
    modules.push({ name, ok: same, firstDiff: same ? null : firstDiff(a, b) });
  }

  for (const name of compiledMap.keys()) {
    if (!(name in onchain)) extra.push(name);
  }
  if (extra.length) ok = false;

  return { ok, modules, missing, extra };
}

export function classify(
  digestMatch: boolean,
  bytecodeMatch: boolean
): { status: "verified" | "unreproduced" | "failed"; exactSource: boolean } {
  if (bytecodeMatch) return { status: "verified", exactSource: digestMatch };
  if (digestMatch) return { status: "unreproduced", exactSource: true };
  return { status: "failed", exactSource: false };
}
