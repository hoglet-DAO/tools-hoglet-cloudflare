import { useState, useCallback } from "react";

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

export default function useView<TResult = any[]>(): UseViewReturn<TResult> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RpcViewResponse<TResult> | null>(null);

  const callView = useCallback(async (
    rpcUrl: string,
    moduleAddress: string,
    moduleName: string,
    functionName: string,
    typeArgs: any[],
    args: any[]
  ) => {
    const contractFunctionName = `${moduleAddress}::${moduleName}::${functionName}`;
    const payload = {
      function: contractFunctionName,
      type_arguments: typeArgs,
      arguments: args,
    };

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${rpcUrl}/rpc/v1/view`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`RPC Error: ${errorData.message || response.statusText}`);
      }

      const data: RpcViewResponse<TResult> = await response.json();
      setResult(data);
      return data;
    } catch (err: any) {
      console.error("Error in callView:", err);
      setError(err.message || "Something went wrong.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const resetState = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
  }, []);

  return { result, loading, error, callView, resetState };
}
