"use client";

import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface MobileModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  modules: any[];
  selectedModule: any;
  onSelectModule: (mod: any) => void;
}

export function MobileModuleModal({
  isOpen,
  onClose,
  modules,
  selectedModule,
  onSelectModule,
}: MobileModuleModalProps) {
  if (typeof window === "undefined") return null;

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
            className="w-full max-w-3xl max-h-[80vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col bg-zinc-950"
          >
            {/* Minimalist Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Modules <span className="text-zinc-500 text-sm font-normal">({modules.length})</span>
              </h3>
              <button 
                onClick={onClose}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Minimalist Scrollable Body */}
            <div className="p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {modules.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => {
                      onSelectModule(m);
                      onClose();
                    }}
                    className={`py-2 px-3 text-left rounded-lg border transition-colors truncate text-sm font-medium ${
                      selectedModule?.name === m.name
                        ? 'bg-amm-pink/20 text-amm-pink border-amm-pink/30'
                        : 'bg-black/40 border-white/5 text-zinc-400 hover:bg-white/5 hover:border-white/20 hover:text-zinc-200'
                    }`}
                    title={m.name}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
