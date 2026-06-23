"use client";

import { motion } from "framer-motion";

interface AddressInputProps {
  isConnected: boolean;
  address: string;
  manualAddress: string;
  setManualAddress: (address: string) => void;
  onScan: (addr?: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  glassStyle: string;
}

export function AddressInput({
  isConnected,
  address,
  manualAddress,
  setManualAddress,
  onScan,
  onConnect,
  onDisconnect,
  glassStyle,
}: AddressInputProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 sm:p-6 rounded-2xl mb-4 sm:mb-6 ${glassStyle} flex flex-col gap-4 sm:gap-6`}
    >
      <div className="flex flex-row items-center justify-center gap-4 mb-2">
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-amm-red to-amm-pink text-white flex shrink-0 items-center justify-center font-bold shadow-[0_0_15px_rgba(221,20,56,0.4)]">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-wide">Smart Contract Interactor</h3>
      </div>

      <div className="pl-0 sm:pl-14">
        <div className="relative flex flex-col sm:flex-row items-center w-full gap-3 sm:gap-0">
           <div className="absolute left-4 text-gray-500 hidden sm:block">
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
           </div>
           <input 
             type="text" 
             className="w-full bg-zinc-900/80 border border-white/20 rounded-xl px-4 sm:pl-12 sm:pr-32 py-3 sm:py-4 text-white text-xs sm:text-lg font-mono focus:outline-none focus:border-cyan-400/50 focus:shadow-[0_0_20px_rgba(6,182,212,0.2)] transition-all placeholder-gray-500" 
             placeholder={isConnected && address ? address : "0x..."}
             value={manualAddress}
             onChange={(e) => setManualAddress(e.target.value)}
             onKeyDown={(e) => {
               if (e.key === 'Enter') onScan();
             }}
           />
           <div className="w-full sm:w-auto sm:absolute sm:right-2 mt-2 sm:mt-0 z-10">
             <motion.button 
               whileHover={{ scale: 1.05 }}
               whileTap={{ scale: 0.95 }}
               onClick={() => onScan()} 
               className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-400 to-blue-500 text-white px-8 py-3 sm:py-2.5 rounded-xl font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(6,182,212,0.5)] hover:shadow-[0_0_30px_rgba(6,182,212,0.8)]"
             >
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
               </svg>
               Scan
             </motion.button>
           </div>
        </div>

        {/* Popular Suggestions Pills */}
        <div className="flex gap-2 mt-4 flex-wrap justify-center sm:justify-start items-center">
          <span className="text-gray-500 text-sm font-semibold mr-1">Popular:</span>
          {['0x1', '0x3', '0x4'].map((addr) => (
            <button
              key={addr}
              onClick={() => {
                setManualAddress(addr);
                onScan(addr);
              }}
              className="px-4 py-1.5 bg-black/40 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-400/50 rounded-full text-xs font-mono text-gray-300 hover:text-cyan-300 transition-all shadow-sm hover:shadow-[0_0_10px_rgba(6,182,212,0.3)]"
            >
              {addr}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
