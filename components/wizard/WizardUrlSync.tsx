"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface WizardUrlSyncProps {
  manualAddress: string;
  setManualAddress: (addr: string) => void;
  selectedModuleName: string | undefined;
  address: string; // The connected wallet address
  scanModules: (addr: string, rpcUrl: string) => void;
  rpcUrl: string;
  modules: any[];
  onSelectModule: (mod: any) => void;
}

export function WizardUrlSync({
  manualAddress,
  setManualAddress,
  selectedModuleName,
  address,
  scanModules,
  rpcUrl,
  modules,
  onSelectModule,
}: WizardUrlSyncProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [hasInitialized, setHasInitialized] = useState(false);

  // 1. Initialize from URL on mount
  useEffect(() => {
    if (hasInitialized) return;

    const urlAddress = searchParams.get("address");
    
    if (urlAddress) {
      setManualAddress(urlAddress);
      if (rpcUrl) {
        scanModules(urlAddress, rpcUrl);
      }
    } else if (address && !manualAddress) {
      // If no URL address, but wallet is connected, scan the wallet address
      if (rpcUrl) {
        scanModules(address, rpcUrl);
      }
    }
    
    setHasInitialized(true);
  }, [hasInitialized, searchParams, setManualAddress, scanModules, rpcUrl, address, manualAddress]);

  // 2. Sync selected module from URL once modules are loaded
  useEffect(() => {
    if (!hasInitialized || modules.length === 0) return;

    const urlModule = searchParams.get("module");
    if (urlModule && !selectedModuleName) {
      const foundMod = modules.find((m) => m.name === urlModule);
      if (foundMod) {
        onSelectModule(foundMod);
      }
    }
  }, [hasInitialized, modules, searchParams, selectedModuleName, onSelectModule]);

  // 3. Write state changes back to URL
  useEffect(() => {
    if (!hasInitialized) return;

    const currentParams = new URLSearchParams(searchParams.toString());
    let changed = false;

    if (manualAddress && manualAddress !== currentParams.get("address")) {
      currentParams.set("address", manualAddress);
      changed = true;
    } else if (!manualAddress && currentParams.has("address")) {
      currentParams.delete("address");
      changed = true;
    }

    if (selectedModuleName && selectedModuleName !== currentParams.get("module")) {
      currentParams.set("module", selectedModuleName);
      changed = true;
    } else if (!selectedModuleName && currentParams.has("module")) {
      currentParams.delete("module");
      changed = true;
    }

    if (changed) {
      const search = currentParams.toString();
      const query = search ? `?${search}` : "";
      router.replace(`${pathname}${query}`, { scroll: false });
    }
  }, [manualAddress, selectedModuleName, hasInitialized, pathname, router, searchParams]);

  return null;
}
