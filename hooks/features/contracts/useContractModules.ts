import { useState, useCallback } from "react";

export function useContractModules() {
  const [modules, setModules] = useState<any[]>([]);
  const [selectedModule, setSelectedModule] = useState<any | null>(null);
  const [functions, setFunctions] = useState<any[]>([]);
  const [selectedFunction, setSelectedFunction] = useState<any | null>(null);
  const [authKey, setAuthKey] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  
  // Pagination states
  const [moduleCursor, setModuleCursor] = useState<string | null>(null);
  const [hasMoreModules, setHasMoreModules] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // We store the current URL to use in loadMoreModules
  const [currentRpcUrl, setCurrentRpcUrl] = useState<string>("");
  const [currentAddr, setCurrentAddr] = useState<string>("");

  const scanModules = useCallback(async (addr: string, rpcUrl: string) => {
    if (!addr || !rpcUrl) return;
    setIsScanning(true);
    setModules([]);
    setSelectedModule(null);
    setFunctions([]);
    setSelectedFunction(null);
    setAuthKey(null);
    setModuleCursor(null);
    setHasMoreModules(false);
    setCurrentRpcUrl(rpcUrl);
    setCurrentAddr(addr);

    try {
      const isMainnet = rpcUrl?.includes("mainnet");
      const proxyPathV3 = isMainnet ? "/api/rpc-v3/mainnet" : "/api/rpc-v3/testnet";
      const proxyPathV1 = isMainnet ? "/api/rpc/mainnet" : "/api/rpc/testnet";

      const [modulesRes, accountRes] = await Promise.all([
        fetch(`${proxyPathV3}/accounts/${addr}/modules?count=100`),
        fetch(`${proxyPathV3}/accounts/${addr}`)
      ]);

      if (accountRes.ok) {
        const accountData = await accountRes.json();
        setAuthKey(accountData?.authentication_key || null);
      }

      if (modulesRes.ok) {
        const cursor = modulesRes.headers.get("x-supra-cursor");
        setModuleCursor(cursor);
        setHasMoreModules(!!cursor);

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

  const loadMoreModules = useCallback(async () => {
    if (!currentAddr || !currentRpcUrl || !moduleCursor || isLoadingMore) return false;
    setIsLoadingMore(true);

    try {
      const isMainnet = currentRpcUrl?.includes("mainnet");
      const proxyPathV3 = isMainnet ? "/api/rpc-v3/mainnet" : "/api/rpc-v3/testnet";

      const res = await fetch(`${proxyPathV3}/accounts/${currentAddr}/modules?count=100&start=${moduleCursor}`);
      
      if (res.ok) {
        const cursor = res.headers.get("x-supra-cursor");
        setModuleCursor(cursor);
        setHasMoreModules(!!cursor);

        const data = await res.json();
        const parsedModules = (data.data || data).map((mod: any, idx: number) => {
          let parsedAbi = null;
          if (mod.abi) {
            try {
              parsedAbi = typeof mod.abi === "string" ? JSON.parse(mod.abi) : mod.abi;
            } catch (e) {
              console.warn("Failed to parse ABI for module", mod.name);
            }
          }
          
          let name = `Module ${idx + modules.length}`; // Offset index
          if (parsedAbi && parsedAbi.name) name = parsedAbi.name;
          else if (mod.name) name = mod.name;

          return {
            id: idx + modules.length,
            name: name,
            bytecode: mod.bytecode,
            abi: parsedAbi
          };
        }).filter((m: any) => m.name && m.name !== 'Unknown');
        
        setModules(prev => [...prev, ...parsedModules]);
        return true;
      } else {
        console.warn("loadMoreModules fetch not OK", res.status);
        return false;
      }
    } catch (error) {
      console.error("Error loading more modules:", error);
      return false;
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentAddr, currentRpcUrl, moduleCursor, isLoadingMore, modules.length]);

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
    hasMoreModules,
    isLoadingMore,
    scanModules,
    loadMoreModules,
    handleSelectModule,
    handleSelectFunction,
    clearModules,
  };
}
