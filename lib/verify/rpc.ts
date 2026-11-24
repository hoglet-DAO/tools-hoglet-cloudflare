import type { OnChainPackage, VerifyNetwork } from "./types";

const RPC_BASE: Record<VerifyNetwork, string> = {
  testnet: (process.env.NEXT_PUBLIC_RPC_URL_TESTNET || "https://rpc-testnet.supra.com").replace(/\/+$/, ""),
  mainnet: (process.env.NEXT_PUBLIC_RPC_URL_MAINNET || "https://rpc-mainnet.supra.com").replace(/\/+$/, ""),
};

const TIMEOUT_MS = 15_000;

function normalizeHex(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const body = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
  return body ? `0x${body.toLowerCase()}` : "";
}

/** The registry stores byte fields as `0x`-prefixed gzip; an empty vector is `0x`. */
export async function decodeGzipHex(hex: string): Promise<string> {
  const body = hex.replace(/^0x/, "");
  if (!body) return "";
  const bytes = Uint8Array.from(body.match(/../g) ?? [], (h) => parseInt(h, 16));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function getJson(url: string): Promise<{ json: unknown; headers: Headers }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`RPC returned HTTP ${res.status}`);
  return { json: await res.json(), headers: res.headers };
}

export async function fetchRegistry(network: VerifyNetwork, address: string): Promise<OnChainPackage[]> {
  const { json } = await getJson(`${RPC_BASE[network]}/rpc/v3/accounts/${address}/resources`);
  const resources = Array.isArray(json) ? json : (json as any)?.data ?? [];
  const registry = resources.find((r: any) => r?.type === "0x1::code::PackageRegistry");
  if (!registry) return [];

  const out: OnChainPackage[] = [];
  for (const pkg of registry?.data?.packages ?? []) {
    const modules = [];
    for (const mod of pkg.modules ?? []) {
      const source = typeof mod.source === "string" && mod.source !== "0x" ? await decodeGzipHex(mod.source) : null;
      modules.push({ name: mod.name, source });
    }
    out.push({
      name: pkg.name,
      upgradeNumber: Number(pkg.upgrade_number),
      sourceDigest: String(pkg.source_digest ?? ""),
      manifest: await decodeGzipHex(String(pkg.manifest ?? "0x")),
      modules,
      deps: (pkg.deps ?? []).map((dep: any) => ({
        account: String(dep.account ?? ""),
        packageName: String(dep.package_name ?? ""),
      })),
    });
  }
  return out;
}

export async function fetchModuleBytecode(
  network: VerifyNetwork,
  address: string
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let cursor: string | null = null;
  do {
    const url = new URL(`${RPC_BASE[network]}/rpc/v3/accounts/${address}/modules`);
    url.searchParams.set("count", "100");
    if (cursor) url.searchParams.set("start", cursor);
    const { json, headers } = await getJson(url.toString());
    const rows = Array.isArray(json) ? json : (json as any)?.data ?? [];
    for (const row of rows) {
      const name = row?.abi?.name ?? row?.name;
      if (!name) continue;
      const bytecode = normalizeHex(row?.bytecode);
      if (bytecode) out[name] = bytecode;
    }
    cursor = headers.get("x-supra-cursor");
  } while (cursor);
  return out;
}
