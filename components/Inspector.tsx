"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Coins, ShieldAlert, Loader2, ArrowRight, Info, X, ExternalLink, Clock, Copy, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { useTokenInspector } from "@/hooks/features/contracts/useTokenInspector";
import { TechnicalIdentifierBlock } from "./inspector/TechnicalIdentifierBlock";
import { readJson, writeJson, STORAGE_KEYS } from "@/lib/storage";
import { InfoModal } from "./inspector/InfoModal";
import { TokenCard } from "./inspector/TokenCard";
import { CapabilityCard } from "./inspector/CapabilityCard";
import { InspectorSearchBar } from "./inspector/InspectorSearchBar";
import { routing } from "@/i18n/routing";

export default function Inspector() {
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const { isScanning, hasScanned, error, ownedTokens, adminCapabilities, renouncedTokens, scanAccount, network } = useTokenInspector();

  useEffect(() => {
    // Its own key, not the interactor's. The two lists hold different things — tokens here, contracts
    // there — and sharing one key meant each feature offered the other's entries as suggestions.
    setRecentSearches(readJson<string[]>(STORAGE_KEYS.inspectorRecent, []));
    // Auto-scan from URL parameter
    const queryAddress = searchParams.get('address');
    if (queryAddress) {
      setSearchQuery(queryAddress);
      scanAccount(queryAddress);
    }
  }, []); // Run only on mount

  const shortenType = (typeStr: string) => {
    if (typeStr?.includes('::')) {
      const parts = typeStr.split('::');
      const address = parts[0];
      const shortAddress = address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
      return `${shortAddress}::${parts.slice(1).join('::')}`;
    }
    return typeStr.length > 20 ? `${typeStr.slice(0, 8)}...${typeStr.slice(-6)}` : typeStr;
  };

  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedType(text);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const getExplorerLink = (typeString: string, forcedType?: "address" | "fa" | "coin") => {
    const match = typeString.match(/<([^>]+)>/);
    const target = match ? match[1] : typeString;
    
    if (forcedType) {
      return `https://suprascan.io/${forcedType}/${target}`;
    }
    
    if (target.includes("::")) {
      return `https://suprascan.io/coin/${target}`;
    }
    
    // Default for hex addresses without :: is FA
    return `https://suprascan.io/fa/${target}`;
  };

  const handleInspect = (eOrQuery?: React.FormEvent | string) => {
    if (eOrQuery && typeof eOrQuery !== "string" && 'preventDefault' in eOrQuery) {
      eOrQuery.preventDefault();
    }

    let query = typeof eOrQuery === "string" ? eOrQuery.trim() : searchQuery.trim();
    
    // Automatically truncate if it's a full struct path (e.g. 0x...::DAWGZ::DAWGZ)
    if (query.includes("::")) {
      query = query.split("::")[0];
    }
    
    if (!query) {
      return;
    }
    
    setSearchQuery(query);
    scanAccount(query);

    // Update URL without full page reload
    router.replace(`${pathname}?address=${query}`, { scroll: false });

    // Guardar en el historial
    setRecentSearches(prev => {
      const newRecent = [query, ...prev.filter(q => q !== query)].slice(0, 5);
      writeJson(STORAGE_KEYS.inspectorRecent, newRecent);
      return newRecent;
    });
  };

  const handleRecentClick = (query: string) => {
    setSearchQuery(query);
    scanAccount(query);
    
    router.replace(`${pathname}?address=${query}`, { scroll: false });

    setRecentSearches(prev => {
      const newRecent = [query, ...prev.filter(q => q !== query)].slice(0, 5);
      writeJson(STORAGE_KEYS.inspectorRecent, newRecent);
      return newRecent;
    });
  };

  const handleGoToInteractor = (resourcePath: string) => {
    const parts = resourcePath.split("::");
    if (parts.length >= 2) {
      const contractAddress = parts[0];
      const moduleName = parts[1];
      
      const locale = pathname.split('/')[1];
      const prefix = locale && (routing.locales as readonly string[]).includes(locale) ? `/${locale}` : '';
      router.push(`${prefix}/interactor?address=${contractAddress}&module=${moduleName}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pt-8 h-full flex flex-col">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 relative"
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-2 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
              <Search className="w-8 h-8 text-amm-pink" /> Token & Asset Inspector
            </h1>
            <p className="text-sm sm:text-base text-gray-400 max-w-2xl mt-3 sm:mt-0">
              Enter a Token address to inspect its Supply, Metadata, and your Administration Capabilities (Refs).
            </p>
          </div>
          <button 
            onClick={() => setIsInfoModalOpen(true)}
            className="flex items-center gap-2 text-sm text-amm-pink hover:text-white transition-colors bg-amm-pink/10 hover:bg-amm-pink/20 px-4 py-2 rounded-lg border border-amm-pink/20 whitespace-nowrap"
          >
            <Info className="w-4 h-4" /> How it works
          </button>
        </div>
      </motion.div>

      <InspectorSearchBar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        handleInspect={handleInspect}
        isScanning={isScanning}
        recentSearches={recentSearches}
        handleRecentClick={handleRecentClick}
      />

      {/* Error State */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400"
          >
            <ShieldAlert className="w-6 h-6" />
            <p>{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results Area */}
      {!hasScanned && !isScanning && !error ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex-1 rounded-3xl border border-white/5 bg-black/40 flex flex-col items-center justify-center p-8 text-center"
        >
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
            <Coins className="w-10 h-10 text-gray-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-300 mb-2">Awaiting Token Address</h3>
          <p className="text-gray-500 max-w-md">
            Enter an address above to automatically detect if it is a Legacy Coin or a Fungible Asset, and uncover its administration capabilities.
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
          {/* Metadata Cards */}
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-1">
                <Coins className="w-5 h-5 text-cyan-400" /> Token Details & Metadata ({ownedTokens.length})
              </h2>
              <p className="text-sm text-gray-500">
                Detected Token architectures (Legacy Coin or Fungible Asset Object) present at this address. Displays public metadata, supply, and structural identifiers.
              </p>
            </div>
            {ownedTokens.map((token, idx) => (
              <TokenCard 
                key={idx}
                token={token}
                getExplorerLink={getExplorerLink}
                shortenType={shortenType}
                copiedType={copiedType}
                handleCopy={handleCopy}
                isFullyRenounced={renouncedTokens?.includes(token.type)}
                onInspect={handleInspect}
              />
            ))}
            {hasScanned && ownedTokens.length === 0 && (
              <div className="p-6 rounded-2xl border border-dashed border-white/10 text-center text-gray-500">
                No Token Metadata found at this address.
              </div>
            )}
          </div>

          {/* Capabilities Cards */}
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-1">
                <ShieldAlert className="w-5 h-5 text-amm-pink" /> Administrative Powers ({adminCapabilities.length})
              </h2>
              <p className="text-sm text-gray-500">Dangerous privileges found in this address. If detected, the creator still has the power to manipulate the token.</p>
            </div>
            {adminCapabilities.map((cap, idx) => {
              const matchedToken = ownedTokens.find(t => 
                cap.resourcePath?.includes(t.type) || 
                (cap.faAddress && cap.faAddress === t.type)
              );
              return (
                <CapabilityCard 
                  key={idx}
                  cap={cap}
                  matchedToken={matchedToken}
                  getExplorerLink={getExplorerLink}
                  shortenType={shortenType}
                  copiedType={copiedType}
                  handleCopy={handleCopy}
                  handleGoToInteractor={handleGoToInteractor}
                />
              );
            })}
            {hasScanned && adminCapabilities.length === 0 && (
              <div className="p-6 rounded-2xl border border-dashed border-white/10 text-center flex flex-col gap-3 items-center justify-center">
                <span className="text-gray-400">No Admin Refs found in this specific address.</span>
                <span className="text-xs text-gray-500 bg-white/5 px-4 py-2 rounded-lg max-w-sm">
                  ⚠️ <strong>Disclaimer:</strong> This does not guarantee the token is 100% renounced, as the powers could be hidden in a different un-scanned wallet.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info Modal */}
      <InfoModal 
        isOpen={isInfoModalOpen} 
        onClose={() => setIsInfoModalOpen(false)} 
      />
    </div>
  );
}
