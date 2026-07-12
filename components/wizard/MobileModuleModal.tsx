"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { X, Search } from "lucide-react";

interface MobileModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  modules: any[];
  selectedModule: any;
  onSelectModule: (mod: any) => void;
  hasMoreModules?: boolean;
  isLoadingMore?: boolean;
  onLoadMoreModules?: () => Promise<boolean>;
}

export function MobileModuleModal({
  isOpen,
  onClose,
  modules,
  selectedModule,
  onSelectModule,
  hasMoreModules,
  isLoadingMore,
  onLoadMoreModules,
}: MobileModuleModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 24;

  if (typeof window === "undefined") return null;

  const filteredModules = modules.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayedModules = filteredModules.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const isSearchActive = searchQuery.trim().length > 0;
  
  // You can go to next page if there are more filtered modules on the next page, OR if we can load more from API (and not searching)
  const canGoNext = (currentPage * itemsPerPage < filteredModules.length) || (!isSearchActive && hasMoreModules);
  const canGoPrev = currentPage > 1;

  const handleNext = async () => {
    if (isLoadingMore) return;
    if (currentPage * itemsPerPage >= filteredModules.length && hasMoreModules && !isSearchActive) {
      if (onLoadMoreModules) {
        const success = await onLoadMoreModules();
        if (!success) return;
      }
    }
    setCurrentPage(p => p + 1);
  };

  const handlePrev = () => {
    if (currentPage > 1) setCurrentPage(p => p - 1);
  };

  // Reset to page 1 when search query changes
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[85vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col bg-zinc-950"
          >
            {/* Minimalist Header with Search */}
            <div className="flex flex-col gap-3 p-4 border-b border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  Modules <span className="text-zinc-500 text-sm font-normal">({isSearchActive ? filteredModules.length : modules.length + (hasMoreModules ? '+' : '')})</span>
                </h3>
                <button 
                  onClick={onClose}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/20 to-amm-pink/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-cyan-400 transition-colors z-10" />
                <input
                  type="text"
                  placeholder="Search modules..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="relative w-full bg-zinc-900/80 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:bg-black transition-all duration-300"
                />
              </div>
            </div>

            {/* Minimalist Scrollable Body */}
            <div className="p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 flex-1 relative">
              {isLoadingMore && displayedModules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                   <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
                   <p className="text-cyan-400 font-bold animate-pulse text-sm">Fetching next page from blockchain...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {displayedModules.map((m) => (
                    <button
                      key={m.name}
                      onClick={() => {
                        onSelectModule(m);
                        onClose();
                      }}
                      className={`py-2 px-3 text-left rounded-xl border transition-all duration-300 truncate text-sm font-medium hover:scale-[1.02] active:scale-[0.98] ${
                        selectedModule?.name === m.name
                          ? 'bg-gradient-to-r from-amm-red/20 to-amm-pink/20 text-amm-pink border-amm-pink/50 shadow-[0_0_15px_rgba(255,42,133,0.2)]'
                          : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:border-white/30 hover:text-white hover:shadow-lg'
                      }`}
                      title={m.name}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-white/10 flex items-center justify-between bg-zinc-900/50 rounded-b-2xl">
              <button 
                onClick={handlePrev}
                disabled={!canGoPrev || isLoadingMore}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 hover:border-white/30 hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg"
              >
                &larr; Prev
              </button>
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold text-white">
                  Page {currentPage}
                </span>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                  {displayedModules.length} Modules
                </span>
              </div>
              <button 
                onClick={handleNext}
                disabled={!canGoNext || isLoadingMore}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-cyan-500/10 hover:border-cyan-500/50 hover:text-cyan-400 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg flex items-center gap-2 group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-cyan-400/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden"></div>
                <span className="relative z-10">Next &rarr;</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
