import { useState, useCallback } from "react";

export function useContractModules() {
  const [modules, setModules] = useState<any[]>([]);
  const [selectedModule, setSelectedModule] = useState<any | null>(null);
  const [functions, setFunctions] = useState<any[]>([]);
  const [selectedFunction, setSelectedFunction] = useState<any | null>(null);
  const [authKey, setAuthKey] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const scanModules = useCallback(async (addr: string, rpcUrl: string) => {
    if (!addr || !rpcUrl) return;
    setIsScanning(true);
    setModules([]);
    setSelectedModule(null);
    setFunctions([]);
    setSelectedFunction(null);
    setAuthKey(null);

    try {
      const isMainnet = rpcUrl.includes("mainnet");
      const proxyPathV3 = isMainnet ? "/api/rpc-v3/mainnet" : "/api/rpc-v3/testnet";
      const proxyPathV1 = isMainnet ? "/api/rpc/mainnet" : "/api/rpc/testnet";

      const [modulesRes, accountRes] = await Promise.all([
        fetch(`${proxyPathV3}/accounts/${addr}/modules?count=20`),
        fetch(`${proxyPathV1}/accounts/${addr}`)
      ]);

      if (accountRes.ok) {
        const accountData = await accountRes.json();
        setAuthKey(accountData?.authentication_key || null);
      }

      if (modulesRes.ok) {
        const data = await modulesRes.json();
        const parsedModules = (data.data || data).map((mod: any, idx: number) => {
          let parsedAbi = null;
          if (mod.abi) {
            try {
              parsedAbi = typeof mod.abi === "string" ? JSON.parse(mod.abi) : mod.abi;
            } catch (e) {
              console.warn("Failed to parse ABI for module", mod.name);
            }
          }
          
          let name = `Module ${idx}`;
          if (parsedAbi && parsedAbi.name) name = parsedAbi.name;
          else if (mod.name) name = mod.name;

          return {
            id: idx,
            name: name,
            bytecode: mod.bytecode,
            abi: parsedAbi
          };
        }).filter((m: any) => m.name && m.name !== 'Unknown');
        setModules(parsedModules);
      } else {
        console.warn("Modules fetch not OK", modulesRes.status);
      }
    } catch (error) {
      console.error("Error scanning modules:", error);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const handleSelectModule = useCallback((mod: any) => {
    setSelectedModule(mod);
    setSelectedFunction(null);
    if (mod?.abi?.exposed_functions) {
      setFunctions(mod.abi.exposed_functions);
    } else {
      setFunctions([]);
    }
  }, []);

  const handleSelectFunction = useCallback((func: any) => {
    setSelectedFunction(func);
  }, []);

  const clearModules = useCallback(() => {
    setModules([]);
    setSelectedModule(null);
    setFunctions([]);
    setSelectedFunction(null);
    setAuthKey(null);
  }, []);

  return {
    modules,
    selectedModule,
    functions,
    selectedFunction,
    authKey,
    isScanning,
    scanModules,
    handleSelectModule,
    handleSelectFunction,
    clearModules,
  };
}
