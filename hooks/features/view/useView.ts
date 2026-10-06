import { useState, useCallback } from "react";
import { trace, traceWarn } from "@/lib/debug";

interface RpcViewResponse<TResult = any[]> {
  result: TResult;
}

interface UseViewReturn<TResult = any[]> {
  result: RpcViewResponse<TResult> | null;
  loading: boolean;
  error: Error | string | null;
  callView: (
    rpcUrl: string,
    moduleAddress: string,
    moduleName: string,
    functionName: string,
    typeArgs: any[],
    args: any[]
  ) => Promise<RpcViewResponse<TResult>>;
  resetState: () => void;
}

/**
 * Stateless view call: resolves the cached RPC proxy for the active network and performs the POST.
 *
 * Exported on its own because a fan-out of views (e.g. the governance audit reads a dozen of them at
 * once) must not thrash the single-result state that `useView` keeps. Sharing this function keeps the
 * proxy-path logic in exactly one place.
 */
export async function callViewRaw<TResult = any[]>(
  rpcUrl: string,
  moduleAddress: string,
  moduleName: string,
  functionName: string,
  typeArgs: any[] = [],
  args: any[] = []
): Promise<RpcViewResponse<TResult>> {
  const isMainnet = rpcUrl?.includes("mainnet");
  const proxyPath = isMainnet ? "/api/rpc/mainnet" : "/api/rpc/testnet";

  const response = await fetch(`${proxyPath}/view`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      function: `${moduleAddress}::${moduleName}::${functionName}`,
      type_arguments: typeArgs,
      arguments: args,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    traceWarn(`[callViewRaw] ${moduleAddress}::${moduleName}::${functionName} -> ${response.status}`, errorData);
    throw new Error(`RPC Error: ${errorData.message || response.statusText}`);
  }

  return (await response.json()) as RpcViewResponse<TResult>;
}

/**
 * Unwraps a `/view` response.
 *
 * The Supra RPC returns the function's return values as an ARRAY, always — verified against mainnet:
 *
 *     get_price -> {"result":["10540000000",18,"1753187408258","1753187408000"]}
 *
 * so a view with a single return value still arrives as `[value]`. Comparing that array directly
 * (e.g. `[true] === true`) is silently false, and feeding it to a scalar normalizer yields undefined.
 * Everything that reads a single-value view must go through here.
 */
export function firstViewResult<T = any>(response: unknown): T | undefined {
  const raw = (response as any)?.result ?? response;
  return (Array.isArray(raw) ? raw[0] : raw) as T | undefined;
}

/**
 * Reads whether an address hosts at least one published module.
 *
 * Supra's `code` module has no `has_code`, so "is this admin a real DAO instead of a plain wallet?"
 * cannot be answered from Move. Resolving it here keeps that impossibility out of the contract while
 * still giving clients a verified signal.
 */
export async function addressHostsModules(rpcUrl: string, address: string): Promise<boolean> {
  if (!rpcUrl || !address || /^0x0+$/i.test(address)) return false;
  const isMainnet = rpcUrl?.includes("mainnet");
  const proxyPath = isMainnet ? "/api/rpc-v3/mainnet" : "/api/rpc-v3/testnet";
  const res = await fetch(`${proxyPath}/accounts/${address}/modules?count=1`);
  if (!res.ok) return false;
  const data = await res.json();
  const mods = Array.isArray(data) ? data : data?.data;
  return Array.isArray(mods) && mods.length > 0;
}

export default function useView<TResult = any[]>(): UseViewReturn<TResult> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RpcViewResponse<TResult> | null>(null);

  const callView = useCallback(
    async (
      rpcUrl: string,
      moduleAddress: string,
      moduleName: string,
      functionName: string,
      typeArgs: any[],
      args: any[]
    ) => {
      setLoading(true);
      setError(null);
      try {
        const data = await callViewRaw<TResult>(rpcUrl, moduleAddress, moduleName, functionName, typeArgs, args);
        setResult(data);
        return data;
      } catch (err: any) {
        console.error("Error in callView:", err);
        setError(err.message || "Something went wrong.");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const resetState = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
  }, []);

  return { result, loading, error, callView, resetState };
}