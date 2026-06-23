"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function LegalModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem("legal_accepted_v1");
    if (!accepted) {
      setShow(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("legal_accepted_v1", "true");
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Top accent */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 to-blue-600" />
            
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to Hoglet Tools</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                By clicking "I Accept", you acknowledge that this tool is an open-source, neutral interface provided "As-Is". Hoglet DAO does not verify third-party contracts. You interact at your own risk.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <a 
                href="https://github.com/hoglet-DAO/tools-hoglet-cloudflare/blob/main/DISCLAIMER.md" 
                className="text-xs text-center text-zinc-500 hover:text-white transition-colors underline underline-offset-2 mb-2"
                target="_blank" 
                rel="noopener noreferrer"
              >
                Read Open-Source Terms
              </a>
              <button
                onClick={handleAccept}
                className="w-full bg-white text-black font-semibold py-3 px-4 rounded-xl hover:bg-zinc-200 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 active:scale-[0.98]"
              >
                I Accept
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
